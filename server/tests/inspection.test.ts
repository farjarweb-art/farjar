import request from 'supertest';
import { WATER_SLUG, seedServices } from '../prisma/seedServices';
import { app, createAdmin, createCustomer, nextWorkingDate, prisma, resetDb } from './helpers';

type Device = { id: string; name: string; fee: number; imageUrl: string | null; benefits: string[]; mechanism: string; scopePriced: boolean; parentId: string | null; autoInclude: boolean; accessoryIds: string[] };
type Detail = {
  service: { id: string; priceUrgent: number | null; priceEmergency: number | null; problems: { id: string; name: string }[]; devices: Device[] };
  zones: { id: string; name: string; tier: string; regions: string[] }[];
  ownershipOptions: string[];
};

const detail = async (slug: string): Promise<Detail> => (await request(app).get(`/api/v1/site-services/${slug}`)).body.data;
const quote = (body: object) => request(app).post('/api/v1/site-services/quote').send(body);
const pairs = (r: { body: { data: { lines: { kind: string; amount: number }[] } } }) => r.body.data.lines.map((l) => [l.kind, l.amount]);

let cracks: Detail;
let commercial: Detail;
let water: Detail;
let admin: Awaited<ReturnType<typeof createAdmin>>;
let amman: string;
let irbid: string;

beforeAll(async () => {
  await resetDb();
  await seedServices(prisma);
  admin = await createAdmin();
  [cracks, commercial, water] = await Promise.all([detail('cracks-inspection'), detail('commercial-site-visit'), detail(WATER_SLUG)]);
  amman = cracks.zones.find((z) => z.name === 'عمّان')!.id;
  irbid = cracks.zones.find((z) => z.name === 'إربد')!.id;
});
afterAll(() => prisma.$disconnect());

describe('خدمة فحص العقار الاحترافية', () => {
  it('الأجهزة بصورها وآلية عملها وفوائدها، والمحافظات بمناطقها، وخيارات صفة العميل', () => {
    expect(cracks.service.priceUrgent).toBe(50);
    expect(cracks.service.priceEmergency).toBe(70);
    for (const d of commercial.service.devices) {
      expect(d.imageUrl).toMatch(/^\/images\/devices\/.+\.svg$/);
      expect(d.benefits).toHaveLength(4);
      expect(d.mechanism.length).toBeGreaterThan(20);
    }
    expect(commercial.service.devices.filter((d) => d.scopePriced)).toHaveLength(2);
    const gauge = cracks.service.devices.find((d) => d.name.includes('التشققات'))!;
    expect(gauge).toMatchObject({ fee: 0, autoInclude: true });
    const amm = cracks.zones.find((z) => z.id === amman)!;
    expect(amm.regions).toEqual(expect.arrayContaining(['صويلح', 'الجبيهة']));
    expect(cracks.zones.length).toBeGreaterThanOrEqual(12);
    expect(cracks.ownershipOptions).toContain('مستأجر');
  });

  it('الزيارة العاجلة والطارئة بسعرها الثابت، وأداة قياس التشققات تُضاف مجانًا', async () => {
    expect(pairs(await quote({ serviceIds: [cracks.service.id], zoneId: amman }))).toEqual([
      ['visit', 35],
      ['device', 0],
    ]);
    const urgent = await quote({ serviceIds: [cracks.service.id], zoneId: irbid, urgency: 'URGENT' });
    expect(urgent.body.data.urgency).toBe('URGENT');
    expect(urgent.body.data.lines[0]).toMatchObject({ kind: 'visit', amount: 50 });
    expect(urgent.body.data.lines[0].label).toContain('عاجلة');
    const emergency = await quote({ serviceIds: [cracks.service.id], zoneId: amman, urgency: 'EMERGENCY' });
    expect(emergency.body.data.total).toBe(70);
    // خدمة بلا أسعار عاجلة
    const w = await quote({ serviceIds: [water.service.id], zoneId: amman, problemIds: [water.service.problems.find((p) => p.name.includes('أخرى'))!.id], urgency: 'URGENT' });
    expect(w.status).toBe(400);
  });

  it('الملحق المجاني لا يُختار وحده، ويُضاف مع جهازه الأب', async () => {
    const other = water.service.problems.find((p) => p.name.includes('أخرى'))!.id;
    const camera = water.service.devices.find((d) => d.accessoryIds.length)!;
    const hooks = water.service.devices.find((d) => d.parentId === camera.id)!;
    expect((await quote({ serviceIds: [water.service.id], zoneId: amman, problemIds: [other], deviceIds: [hooks.id] })).status).toBe(400);
    const res = await quote({ serviceIds: [water.service.id], zoneId: amman, problemIds: [other], deviceIds: [camera.id] });
    expect(pairs(res)).toEqual([
      ['visit', 20],
      ['device', 40],
      ['device', 0],
    ]);
  });

  it('المعدات الثقيلة للمنشآت التجارية تُسعّر حسب المساحة ونطاق العمل', async () => {
    const heavy = commercial.service.devices.find((d) => d.scopePriced)!;
    const thermal = commercial.service.devices.find((d) => d.name.includes('الحراري'))!;
    const res = await quote({ serviceIds: [commercial.service.id], zoneId: amman, deviceIds: [heavy.id, thermal.id] });
    expect(res.status).toBe(200);
    expect(res.body.data.hasScopePricing).toBe(true);
    expect(pairs(res)).toEqual([
      ['visit', 35],
      ['quote', 0],
      ['device', 20],
    ]);
    expect(res.body.data.lines[1].label).toContain('المساحة');
  });

  it('الحجز يحفظ صفة العميل والأولوية، والفني يسجل إحداثيات الموقع في التقرير', async () => {
    const customer = await createCustomer({ name: 'رامي حداد', phone: '0795554444' });
    const res = await customer.post('/api/v1/site-services/requests').send({
      serviceIds: [cracks.service.id],
      zoneId: amman,
      urgency: 'URGENT',
      ownership: 'مالك العقار',
      requestType: 'INSPECTION_REPORT',
      name: 'رامي حداد',
      phone: '0795554444',
      phone2: '0775554444',
      lat: 31.95,
      lng: 35.88,
      clientType: 'INDIVIDUAL',
      propertyType: 'فيلا',
      area: 'عبدون',
      address: 'شارع القاهرة، فيلا 12',
      description: 'تشققات أفقية في جدار السور الخارجي',
      date: nextWorkingDate(2),
      time: '09:00',
      expectedTotal: 50,
      acceptTerms: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.message).toContain('عاجلة');
    const id = res.body.data.id;
    const r = (await admin.get(`/api/v1/admin/service-requests/${id}`)).body.data;
    expect(r).toMatchObject({ ownership: 'مالك العقار', urgency: 'URGENT', total: 50 });

    const gps = { gpsLat: 31.9539, gpsLng: 35.8813, gpsAccuracy: 8, gpsAt: new Date().toISOString() };
    const saved = await admin.put(`/api/v1/admin/service-requests/${id}/report`).send({ findings: 'تشققات شعرية ناتجة عن تمدد حراري', ...gps, publish: true });
    expect(saved.status).toBe(200);
    const mine = (await customer.get(`/api/v1/account/service-requests/${id}`)).body.data;
    expect(mine.report).toMatchObject({ gpsLat: 31.9539, gpsLng: 35.8813, gpsAccuracy: 8 });
    expect(mine.urgency).toBe('URGENT');
  });

  it('المدير يرفع صورة جهاز، ويحدد ملحقًا وسعرًا عاجلًا ومناطق محافظة', async () => {
    const device = commercial.service.devices.find((d) => d.name.includes('الحراري'))!;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const up = await admin.post(`/api/v1/admin/site-services/devices/${device.id}/image`).attach('file', png, 'thermal.png');
    expect(up.status).toBe(200);
    expect(up.body.data.imageUrl).toBeTruthy();
    // لا يكون الجهاز ملحقًا لنفسه
    expect((await admin.patch(`/api/v1/admin/site-services/devices/${device.id}`).send({ parentId: device.id })).status).toBe(400);
    expect((await admin.patch(`/api/v1/admin/site-services/services/${cracks.service.id}`).send({ priceUrgent: 55 })).status).toBe(200);
    expect((await detail('cracks-inspection')).service.priceUrgent).toBe(55);
    expect((await admin.patch(`/api/v1/admin/site-services/zones/${irbid}`).send({ regions: ['الحصن', 'الحصن', 'الرمثا'] })).status).toBe(200);
    expect((await detail('cracks-inspection')).zones.find((z) => z.id === irbid)!.regions).toEqual(['الحصن', 'الرمثا']);
  });
});

describe('تعديل الطلب في الموقع (أجهزة إضافية وخصم يدوي)', () => {
  it('يضيف الأجهزة بسعرها المعياري ويطبق الخصم دون تغيير السعر المعتمد، ويظهر الإجمالي للعميل', async () => {
    const customer = await createCustomer({ name: 'هبة يوسف', phone: '0786667777' });
    const res = await customer.post('/api/v1/site-services/requests').send({
      serviceIds: [cracks.service.id],
      zoneId: amman,
      ownership: 'مستأجر',
      requestType: 'INSPECTION_REPORT',
      name: 'هبة يوسف',
      phone: '0786667777',
      phone2: '0796667777',
      lat: 32.03,
      lng: 35.84,
      clientType: 'INDIVIDUAL',
      propertyType: 'شقة',
      area: 'صويلح',
      address: 'شارع الجامعة، عمارة 3',
      description: 'تشققات في جدار الصالون',
      date: nextWorkingDate(3),
      time: '11:00',
      expectedTotal: 35,
      acceptTerms: true,
    });
    expect(res.status).toBe(201);
    const id = res.body.data.id;
    const detail = (await admin.get(`/api/v1/admin/service-requests/${id}`)).body.data;
    const opts = detail.onsiteOptions as { id: string; name: string; fee: number; accessoryNames: string[] }[];
    // أداة التشققات محجوزة أصلًا فلا تظهر، والمعدات الثقيلة لا تُضاف هنا
    expect(opts.some((o) => o.name.includes('عرض التشققات'))).toBe(false);
    expect(opts.some((o) => o.name.includes('RIDGID'))).toBe(false);
    const schmidt = opts.find((o) => o.name.includes('شميدت'))!;
    const camera = opts.find((o) => o.accessoryNames.length)!;
    expect(schmidt.fee).toBe(25);

    const bad = await admin.put(`/api/v1/admin/service-requests/${id}/adjustment`).send({ deviceIds: [schmidt.id], manualDiscount: 500 });
    expect(bad.status).toBe(400);
    const adj = await admin.put(`/api/v1/admin/service-requests/${id}/adjustment`).send({ deviceIds: [schmidt.id, camera.id], manualDiscount: 10, note: 'خصم جار' });
    expect(adj.status).toBe(200);
    // 35 + 25 + 40 (+ الخطافات مجانًا) − 10
    expect(adj.body.data).toMatchObject({ base: 35, added: 65, discount: 10, finalTotal: 90 });
    expect(adj.body.data.devices).toHaveLength(3);

    const r = (await admin.get(`/api/v1/admin/service-requests/${id}`)).body.data;
    expect(r).toMatchObject({ total: 35, finalTotal: 90, manualDiscount: 10 });
    expect(r.priceLines.map((l: { amount: number }) => l.amount)).toEqual([35, 0]);
    expect(r.events.some((e: { kind: string }) => e.kind === 'adjustment')).toBe(true);
    const mine = (await customer.get(`/api/v1/account/service-requests/${id}`)).body.data;
    expect(mine).toMatchObject({ total: 35, finalTotal: 90, manualDiscount: 10 });
    expect((await customer.get('/api/v1/account/service-requests')).body.data.find((x: { id: string }) => x.id === id).total).toBe(90);

    // عرض سعر الإصلاح يخصم الإجمالي الفعلي للزيارة (سياسة الخصم من الإصلاح)
    const q = await admin.post(`/api/v1/admin/service-requests/${id}/quotes`).send({ items: [{ description: 'حقن التشققات', qty: 1, unitPrice: 200 }] });
    expect(q.body.data).toMatchObject({ visitFeeDeduction: 90, total: 110 });

    // إلغاء التعديل يعيد السعر المعتمد
    await admin.put(`/api/v1/admin/service-requests/${id}/adjustment`).send({ deviceIds: [], manualDiscount: 0 });
    expect((await admin.get(`/api/v1/admin/service-requests/${id}`)).body.data.finalTotal).toBeNull();
  });
});

describe('الحجز الموحد: الموقع والتواصل والمواعيد', () => {
  const body = (over: object = {}) => ({
    serviceIds: [cracks.service.id], zoneId: amman, requestType: 'INSPECTION_REPORT', name: 'ليث', phone: '0791231231', phone2: '0781231231', phone2Whatsapp: true,
    lat: 31.9, lng: 35.9, clientType: 'INDIVIDUAL', propertyType: 'قصر', area: 'عبدون', address: 'شارع 1', description: 'تشققات في السور',
    date: nextWorkingDate(4), time: '15:00', expectedTotal: 35, acceptTerms: true, ...over,
  });

  it('الموقع والرقم الثانوي إجباريان، ويختلف الثانوي عن الأساسي', async () => {
    const c = await createCustomer({ name: 'ليث', phone: '0791231231' });
    const { lat: _a, lng: _b, ...noLoc } = body();
    expect((await c.post('/api/v1/site-services/requests').send(noLoc)).status).toBe(400);
    const { phone2: _c, ...noPhone2 } = body();
    expect((await c.post('/api/v1/site-services/requests').send(noPhone2)).status).toBe(400);
    expect((await c.post('/api/v1/site-services/requests').send(body({ phone2: '0791231231' }))).status).toBe(400);
    const ok = await c.post('/api/v1/site-services/requests').send(body());
    expect(ok.status).toBe(201);
    const r = (await admin.get(`/api/v1/admin/service-requests/${ok.body.data.id}`)).body.data;
    expect(r).toMatchObject({ phone2: '962781231231', phone2Whatsapp: true, phoneWhatsapp: true, lat: 31.9, lng: 35.9 });
    // الموعد اكتمل (سعة فريق واحد)
    const slots = (await request(app).get('/api/v1/site-services/slots').query({ date: nextWorkingDate(4) })).body.data;
    expect(slots.slots.map((s: { time: string }) => s.time)).toEqual(['09:00', '11:00', '13:00', '15:00', '17:00']);
    expect(slots.slots.find((s: { time: string }) => s.time === '15:00')).toMatchObject({ available: false, reason: 'booked' });
    const again = await c.post('/api/v1/site-services/requests').send(body());
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('SLOT_TAKEN');
    // المدير يزيد المواعيد والسعة
    expect((await admin.put('/api/v1/admin/settings').send({ serviceSlots: ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00'], serviceSlotCapacity: 2 })).status).toBe(200);
    const more = (await request(app).get('/api/v1/site-services/slots').query({ date: nextWorkingDate(4) })).body.data.slots;
    expect(more).toHaveLength(7);
  });

  it('رابط الخريطة يتحول لإحداثيات', async () => {
    const link = await request(app).get('/api/v1/site-services/map-link').query({ u: 'https://www.google.com/maps/place/Amman/@31.9539494,35.910635,13z/data=!3m1!4b1' });
    expect(link.body.data).toEqual({ lat: 31.953949, lng: 35.910635 });
    expect((await request(app).get('/api/v1/site-services/map-link').query({ u: 'https://maps.google.com/?q=32.0123,35.8765' })).body.data).toEqual({ lat: 32.0123, lng: 35.8765 });
    expect((await request(app).get('/api/v1/site-services/map-link').query({ u: 'https://example.com/whatever' })).status).toBe(400);
  });
});
