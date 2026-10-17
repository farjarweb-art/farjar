import request from 'supertest';
import { WATER_SLUG, seedServices } from '../prisma/seedServices';
import { app, createAdmin, createCustomer, nextWorkingDate, prisma, resetDb } from './helpers';

type Detail = {
  service: { id: string; problems: { id: string; name: string; isOther: boolean; deviceIds: string[] }[]; devices: { id: string; name: string; fee: number }[] };
  zones: { id: string; name: string; tier: string }[];
  combinable: { id: string }[];
};

let admin: Awaited<ReturnType<typeof createAdmin>>;
let water: Detail;
let amman: string;
let aqaba: string;
const device = (name: string) => water.service.devices.find((d) => d.name.includes(name))!.id;
const problem = (name: string) => water.service.problems.find((p) => p.name.includes(name))!.id;
const slug = async (s: string) => (await prisma.siteService.findUniqueOrThrow({ where: { slug: s } })).id;

beforeAll(async () => {
  await resetDb();
  await seedServices(prisma);
  admin = await createAdmin();
  water = (await request(app).get(`/api/v1/site-services/${WATER_SLUG}`)).body.data;
  amman = water.zones.find((z) => z.name === 'عمّان')!.id;
  aqaba = water.zones.find((z) => z.name === 'العقبة')!.id;
});
afterAll(() => prisma.$disconnect());

const quote = (body: object) => request(app).post('/api/v1/site-services/quote').send(body);

describe('كتالوج الخدمات', () => {
  it('قسم التسربات والرطوبة واحد ومميز، يظهر في القسمين، وفيه المشكلات والأجهزة', async () => {
    const list = (await request(app).get('/api/v1/site-services')).body.data.services;
    expect(list[0].slug).toBe(WATER_SLUG);
    expect(list[0].audiences).toEqual(['HOME', 'BUSINESS']);
    expect(list.filter((s: { audiences: string[] }) => s.audiences.includes('HOME')).length).toBeGreaterThanOrEqual(9);
    expect(list.filter((s: { audiences: string[] }) => s.audiences.includes('BUSINESS')).length).toBeGreaterThanOrEqual(9);
    // لا يوجد جهاز كخدمة رئيسية مستقلة
    expect(list.some((s: { name: string }) => s.name.includes('جهاز'))).toBe(false);
    expect(water.service.problems).toHaveLength(8);
    expect(water.service.devices).toHaveLength(4);
    expect(water.combinable.length).toBeGreaterThan(0);
  });
});

describe('التسعير الثابت للزيارة', () => {
  it('زيارة + أجهزة المشكلة فقط، بلا زيارة لكل جهاز ولا حساب بالمتر أو الساعة', async () => {
    const res = await quote({ serviceIds: [water.service.id], zoneId: amman, problemIds: [problem('ضغط'), problem('الصرف')], deviceIds: [device('ضغط'), device('تنظير')] });
    expect(res.status).toBe(200);
    expect(res.body.data.lines.map((l: { kind: string; amount: number }) => [l.kind, l.amount])).toEqual([
      ['visit', 20],
      ['device', 10],
      ['device', 25],
    ]);
    expect(res.body.data.total).toBe(55);
  });

  it('جهاز لا يناسب المشكلة المختارة مرفوض، و"مشكلة أخرى" تفتح كل الأجهزة', async () => {
    expect((await quote({ serviceIds: [water.service.id], zoneId: amman, problemIds: [problem('ضغط')], deviceIds: [device('الحراري')] })).status).toBe(400);
    expect((await quote({ serviceIds: [water.service.id], zoneId: amman, problemIds: [problem('أخرى')], deviceIds: [device('الحراري')] })).status).toBe(200);
    // المشكلة مطلوبة في قسم التسربات
    expect((await quote({ serviceIds: [water.service.id], zoneId: amman })).status).toBe(400);
  });

  it('خارج عمّان: سعر الخارج + رسوم انتقال المنطقة، ومنطقة بعيدة تحتاج موافقة', async () => {
    const res = await quote({ serviceIds: [water.service.id], zoneId: aqaba, problemIds: [problem('رطوبة الجدران')] });
    expect(res.body.data.tier).toBe('OUTSIDE_AMMAN');
    expect(res.body.data.lines.map((l: { kind: string; amount: number }) => [l.kind, l.amount])).toEqual([
      ['visit', 30],
      ['travel', 25],
    ]);
    expect(res.body.data.zone.requiresApproval).toBe(true);
  });

  it('أكثر من خدمة: سعر الزيارة المجمعة بدل جمع الزيارات، وخدمة خارج الباقة تُضاف وحدها', async () => {
    const [cracks, paint, electrical, machines] = await Promise.all(['cracks-inspection', 'paint-finishing-inspection', 'electrical-inspection', 'machines-lines-inspection'].map(slug));
    const res = await quote({ serviceIds: [cracks, paint, electrical], zoneId: amman });
    expect(res.body.data.lines).toHaveLength(1);
    expect(res.body.data.lines[0]).toMatchObject({ kind: 'bundle', amount: 35 });
    const [general] = await Promise.all(['general-property-inspection'].map(slug));
    const mixed = await quote({ serviceIds: [cracks, general, machines], zoneId: amman });
    expect(mixed.body.data.lines.map((l: { kind: string; amount: number }) => [l.kind, l.amount])).toEqual([
      ['bundle', 35],
      ['visit', 45],
    ]);
    // الباقة لا تُطبق إن كانت أغلى من الزيارات المنفصلة (15 + 15 < 35)
    const cheap = await quote({ serviceIds: [cracks, paint], zoneId: amman });
    expect(cheap.body.data.total).toBe(30);
  });

  it('المدير يحدد جهازًا مشمولًا بلا رسوم، وخصمًا على الزيارة', async () => {
    const links = water.service.devices.map((d) => ({ deviceId: d.id, included: d.id === device('ضغط'), fee: null }));
    expect((await admin.put(`/api/v1/admin/site-services/services/${water.service.id}/devices`).send(links)).status).toBe(200);
    await admin.patch(`/api/v1/admin/site-services/services/${water.service.id}`).send({ discountPercent: 10 });
    const res = await quote({ serviceIds: [water.service.id], zoneId: amman, problemIds: [problem('ضغط')], deviceIds: [device('ضغط')] });
    expect(res.body.data.lines.map((l: { kind: string; amount: number }) => [l.kind, l.amount])).toEqual([
      ['visit', 20],
      ['discount', -2],
      ['device', 0],
    ]);
    expect(res.body.data.total).toBe(18);
    // إرجاع الإعدادات
    await admin.put(`/api/v1/admin/site-services/services/${water.service.id}/devices`).send(water.service.devices.map((d) => ({ deviceId: d.id, included: false, fee: null })));
    await admin.patch(`/api/v1/admin/site-services/services/${water.service.id}`).send({ discountPercent: 0 });
  });
});

describe('رحلة العميل من الحجز حتى الإغلاق', () => {
  let customer: Awaited<ReturnType<typeof createCustomer>>;
  let id: string;
  const date = nextWorkingDate(2);
  const base = () => ({
    serviceIds: [water.service.id],
    zoneId: amman,
    problemIds: [problem('رطوبة الجدران')],
    deviceIds: [device('الحراري')],
    requestType: 'INSPECTION_REPORT',
    name: 'سامر الخطيب',
    phone: '0791112222',
    clientType: 'INDIVIDUAL',
    propertyType: 'شقة',
    area: 'خلدا',
    address: 'شارع وصفي التل، عمارة 5، الطابق الثاني',
    description: 'رطوبة في جدار غرفة النوم بجانب الحمام',
    date,
    time: '10:00',
    expectedTotal: 35,
    acceptTerms: true,
  });

  beforeAll(async () => {
    customer = await createCustomer({ name: 'سامر الخطيب', phone: '0791112222' });
  });

  it('لا يُؤكد الحجز بلا موافقة على الشروط، ولا بسعر مختلف عما رآه العميل', async () => {
    expect((await request(app).post('/api/v1/site-services/requests').send(base())).status).toBe(401);
    expect((await customer.post('/api/v1/site-services/requests').send({ ...base(), acceptTerms: false })).status).toBe(400);
    const changed = await customer.post('/api/v1/site-services/requests').send({ ...base(), expectedTotal: 20 });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe('PRICE_CHANGED');
  });

  it('الحجز يحفظ السعر المعتمد، ولا يتغير بتعديل الأسعار لاحقًا', async () => {
    const res = await customer.post('/api/v1/site-services/requests').send(base());
    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe(35);
    id = res.body.data.id;
    // المدير يرفع السعر، والسجل يحفظ من غيّر
    await admin.patch(`/api/v1/admin/site-services/services/${water.service.id}`).send({ priceInside: 25 });
    const mine = (await customer.get(`/api/v1/account/service-requests/${id}`)).body.data;
    expect(mine.total).toBe(35);
    expect(mine.priceLines.map((l: { amount: number }) => l.amount)).toEqual([20, 15]);
    const log = (await admin.get('/api/v1/admin/site-services/price-log')).body.data.items;
    expect(log[0]).toMatchObject({ action: 'price_change', actor: 'أدمن' });
    expect(log[0].meta.changes.priceInside).toEqual({ from: 20, to: 25 });
    await admin.patch(`/api/v1/admin/site-services/services/${water.service.id}`).send({ priceInside: 20 });
  });

  it('عميل آخر لا يرى الطلب ولا يصل للوحة الإدارة', async () => {
    const other = await createCustomer({ name: 'آخر', phone: '0793334444' });
    expect((await other.get(`/api/v1/account/service-requests/${id}`)).status).toBe(404);
    expect((await other.get('/api/v1/admin/service-requests')).status).toBe(403);
  });

  it('المدير: تعيين الفني، التقرير، عرض سعر الإصلاح مع خصم الزيارة، موافقة العميل، الأعمال، ثم الإغلاق', async () => {
    const tech = await prisma.technician.create({ data: { name: 'أبو أحمد', phone: '0785555555' } });
    await admin.patch(`/api/v1/admin/service-requests/${id}`).send({ technicianId: tech.id, date, time: '12:00' });
    let r = (await admin.get(`/api/v1/admin/service-requests/${id}`)).body.data;
    expect(r.status).toBe('TECH_ASSIGNED');
    expect(r.technician.name).toBe('أبو أحمد');

    await admin.patch(`/api/v1/admin/service-requests/${id}`).send({ status: 'INSPECTED' });
    expect((await admin.put(`/api/v1/admin/service-requests/${id}/report`).send({ findings: 'تسرب من خط المياه خلف الجدار', recommendations: 'استبدال الوصلة', publish: true })).status).toBe(200);
    r = (await admin.get(`/api/v1/admin/service-requests/${id}`)).body.data;
    expect(r.status).toBe('REPORT_SENT');

    // قسم التسربات: رسوم الزيارة تُخصم من الإصلاح
    const q = await admin.post(`/api/v1/admin/service-requests/${id}/quotes`).send({ items: [{ description: 'استبدال وصلة وإعادة القصارة', qty: 1, unitPrice: 100 }], send: true });
    expect(q.status).toBe(201);
    expect(q.body.data).toMatchObject({ subtotal: 100, visitFeeDeduction: 35, total: 65 });
    expect((await admin.get(`/api/v1/admin/service-requests/${id}`)).body.data.status).toBe('AWAITING_APPROVAL');

    const mine = (await customer.get(`/api/v1/account/service-requests/${id}`)).body.data;
    expect(mine.report.findings).toContain('تسرب');
    expect(mine.canCancel).toBe(false);
    expect((await customer.post(`/api/v1/account/service-requests/${id}/cancel`)).status).toBe(400);
    expect((await customer.post(`/api/v1/account/service-requests/${id}/quotes/${q.body.data.id}/accept`)).status).toBe(200);
    expect((await customer.post(`/api/v1/account/service-requests/${id}/quotes/${q.body.data.id}/accept`)).status).toBe(400);

    await admin.post(`/api/v1/admin/service-requests/${id}/work`).send({ note: 'تم استبدال الوصلة' });
    expect((await admin.get(`/api/v1/admin/service-requests/${id}`)).body.data.status).toBe('REPAIR_IN_PROGRESS');
    await admin.patch(`/api/v1/admin/service-requests/${id}`).send({ status: 'CLOSED', note: 'تم التسليم' });
    r = (await admin.get(`/api/v1/admin/service-requests/${id}`)).body.data;
    expect(r.status).toBe('CLOSED');
    const kinds = r.events.map((e: { kind: string }) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['created', 'technician', 'schedule', 'status', 'report', 'quote', 'work']));

    const stats = (await admin.get('/api/v1/admin/service-requests/stats')).body.data;
    expect(stats).toMatchObject({ requests: 1, visits: 1, visitFees: 35, repairsApproved: 1, repairsValue: 65 });
  });

  it('العميل يلغي طلبه قبل التأكيد فقط', async () => {
    const res = await customer.post('/api/v1/site-services/requests').send({ ...base(), time: '14:00' });
    expect((await customer.post(`/api/v1/account/service-requests/${res.body.data.id}/cancel`)).status).toBe(200);
    expect((await customer.get('/api/v1/account/service-requests')).body.data[0].status).toBe('CANCELLED');
  });
});
