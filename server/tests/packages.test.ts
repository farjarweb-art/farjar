import request from 'supertest';
import { seedServices } from '../prisma/seedServices';
import { app, createAdmin, createCustomer, nextWorkingDate, prisma, resetDb } from './helpers';

type Card = { id: string; slug: string; kind: string; name: string; nameEn: string; priceInside: number; includes: string[]; includesEn: string[]; imageUrl: string | null; featured: boolean };

let admin: Awaited<ReturnType<typeof createAdmin>>;
const catalog = async () => (await request(app).get('/api/v1/site-services')).body.data as { services: Card[]; zones: { id: string; name: string }[] };

beforeAll(async () => {
  await resetDb();
  await seedServices(prisma);
  admin = await createAdmin();
});
afterAll(() => prisma.$disconnect());

describe('الباقات الفنية', () => {
  it('الباقات الثلاث منشورة بأسعارها ومحتواها بالعربية والإنجليزية', async () => {
    const c = await catalog();
    const pk = c.services.filter((s) => s.kind === 'PACKAGE').sort((a, b) => a.priceInside - b.priceInside);
    expect(pk.map((p) => [p.name, p.priceInside])).toEqual([
      ['الباقة الأساسية', 50],
      ['باقة الفحص المتقدم', 100],
      ['الباقة الشاملة', 150],
    ]);
    expect(pk[0].includes).toContain('قياس مستوى الرطوبة داخل الجدران');
    expect(pk[1].includesEn.length).toBe(pk[1].includes.length);
    expect(pk[2].includes).toHaveLength(11);
    expect(pk.every((p) => p.imageUrl)).toBe(true);
  });

  it('الحجز بالباقة يحفظ اسمها وسعرها وما تشمله وقت الحجز، ولا يتغير بتعديلها لاحقًا', async () => {
    const c = await catalog();
    const basic = c.services.find((s) => s.slug === 'basic-package')!;
    const detail = (await request(app).get('/api/v1/site-services/basic-package')).body.data;
    const reason = detail.service.problems.find((p: { name: string }) => p.name.includes('رطوبة')).id;
    const thermal = detail.service.devices.find((d: { name: string }) => d.name.includes('الحراري'));
    expect(thermal).toMatchObject({ fee: 0, included: true, linked: true });
    // خيار "جميع الأجهزة" لا يظهر في باقة لم يُحدَّد له سعر فيها
    expect(detail.service.devices.some((d: { coversAll?: boolean }) => d.coversAll)).toBe(false);
    const amman = c.zones.find((z) => z.name === 'عمّان')!.id;
    const customer = await createCustomer({ name: 'نور', phone: '0791010101' });
    const res = await customer.post('/api/v1/site-services/requests').send({
      serviceIds: [basic.id], zoneId: amman, problemIds: [reason], deviceIds: [thermal.id], requestType: 'INSPECTION_REPORT',
      name: 'نور', phone: '0791010101', phone2: '0781010101', lat: 31.95, lng: 35.9, clientType: 'INDIVIDUAL', propertyType: 'شقة سكنية',
      area: 'صويلح', address: 'شارع الجامعة 10', description: 'رطوبة في السقف', date: nextWorkingDate(2), time: '09:00', expectedTotal: 50, acceptTerms: true,
    });
    expect(res.status).toBe(201);
    // المدير يرفع السعر ويغيّر المحتوى
    const edit = await admin.patch(`/api/v1/admin/site-services/services/${basic.id}`).send({ priceInside: 60, priceOutside: 60, includes: 'بند جديد' });
    expect(edit.status).toBe(200);
    const r = (await admin.get(`/api/v1/admin/service-requests/${res.body.data.id}`)).body.data;
    expect(r.total).toBe(50);
    expect(r.services[0]).toMatchObject({ name: 'الباقة الأساسية', kind: 'PACKAGE' });
    expect(r.services[0].includes).toContain('قياس مستوى الرطوبة داخل الجدران');
    expect((await catalog()).services.find((s) => s.slug === 'basic-package')!.priceInside).toBe(60);
  });

  it('المدير ينشئ باقة إضافية جديدة، ينسخ باقة، ويوقفها — دون تعديل الكود', async () => {
    const created = await admin.post('/api/v1/admin/site-services/services').send({
      name: 'فحص العزل الحراري', nameEn: 'Thermal insulation check', kind: 'ADDON', audiences: ['HOME', 'BUSINESS'], requestTypes: ['INSPECTION_REPORT'],
      priceInside: 30, priceOutside: 30, includes: 'تصوير حراري للواجهات\nتقرير مختصر', includesEn: 'Facade thermal imaging\nShort report', icon: 'sun',
    });
    expect(created.status).toBe(201);
    let c = await catalog();
    expect(c.services.find((s) => s.id === created.body.data.id)).toMatchObject({ kind: 'ADDON', priceInside: 30, includes: ['تصوير حراري للواجهات', 'تقرير مختصر'] });
    const adv = c.services.find((s) => s.slug === 'advanced-package')!;
    const dup = await admin.post(`/api/v1/admin/site-services/services/${adv.id}/duplicate`);
    expect(dup.status).toBe(201);
    // النسخة موقوفة حتى تُنشر
    expect(c.services.some((s) => s.id === dup.body.data.id)).toBe(false);
    const copy = await prisma.siteService.findUniqueOrThrow({ where: { id: dup.body.data.id }, include: { problems: true, devices: true } });
    expect(copy).toMatchObject({ kind: 'PACKAGE', active: false });
    expect(copy.problems.length).toBeGreaterThan(5);
    expect(copy.devices.length).toBeGreaterThan(3);
    await admin.patch(`/api/v1/admin/site-services/services/${dup.body.data.id}`).send({ active: true, name: 'باقة الشركات' });
    await admin.patch(`/api/v1/admin/site-services/services/${created.body.data.id}`).send({ active: false });
    c = await catalog();
    expect(c.services.find((s) => s.id === dup.body.data.id)!.name).toBe('باقة الشركات');
    expect(c.services.some((s) => s.id === created.body.data.id)).toBe(false);
  });
});
