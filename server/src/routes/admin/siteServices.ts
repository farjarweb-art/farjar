import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { randomSuffix, slugify } from '../../lib/ids';
import { prisma } from '../../lib/prisma';
import { memoryUpload, uploadGuard } from '../../middleware/upload';
import { POLICIES, deleteStored, validateAndStore } from '../../services/upload.service';

/**
 * كتالوج الخدمات والمعاينات (لوحة الإدارة): الخدمات، المشكلات، الأجهزة، المناطق، الزيارات المجمعة.
 * كل تغيير في سعر يُسجَّل في سجل الأسعار (من غيّر، ماذا، ومتى). الحجوزات المؤكدة تحفظ أسعارها ولا تتأثر.
 */
export const siteServicesAdminRouter = Router();

const D = (n: number) => new Prisma.Decimal(n);
const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : Number(d));
const money = z.coerce.number({ invalid_type_error: 'أدخل مبلغًا صحيحًا' }).min(0, 'المبلغ لا يكون سالبًا').max(100_000);
const text = (max: number) => z.string().trim().max(max);
const AUDIENCES = ['HOME', 'BUSINESS'] as const;
const REQUEST_TYPES = ['INSPECTION', 'INSPECTION_REPORT', 'DIAGNOSIS', 'REPAIR_QUOTE', 'REPAIR', 'PREVENTIVE', 'CONTRACT'] as const;

/** يسجّل تغييرات الأسعار فقط (قيم قبل/بعد) */
async function logPrices(req: Request, target: string, id: string, name: string, before: Record<string, unknown> | null, after: Record<string, unknown>) {
  const changes: Record<string, { from: number | null; to: number | null }> = {};
  for (const [k, v] of Object.entries(after)) {
    const from = before ? (before[k] == null ? null : Number(before[k])) : null;
    const to = v == null ? null : Number(v);
    if (from !== to) changes[k] = { from, to };
  }
  if (!Object.keys(changes).length) return;
  await audit({ actorType: 'admin', actorId: req.auth!.sub, action: before ? 'price_change' : 'price_set', entity: 'service_price', entityId: id, meta: { target, name, changes, by: req.auth!.name } });
}

/** كل الكتالوج دفعة واحدة لصفحة الإدارة */
siteServicesAdminRouter.get(
  '/catalog',
  asyncHandler(async (_req, res) => {
    const [services, devices, zones, bundles] = await Promise.all([
      prisma.siteService.findMany({
        where: { deletedAt: null },
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          problems: { orderBy: { sortOrder: 'asc' }, include: { devices: { select: { id: true } } } },
          devices: true,
          _count: { select: { bundles: true } },
        },
      }),
      prisma.serviceDevice.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      prisma.serviceZone.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      prisma.serviceBundle.findMany({ orderBy: { createdAt: 'asc' }, include: { services: { where: { deletedAt: null }, select: { id: true, name: true } } } }),
    ]);
    ok(res, {
      services: services.map((s) => ({
        ...s,
        priceInside: num(s.priceInside),
        priceOutside: num(s.priceOutside),
        travelFee: num(s.travelFee),
        priceUrgent: num(s.priceUrgent),
        priceEmergency: num(s.priceEmergency),
        problems: s.problems.map((p) => ({ id: p.id, name: p.name, description: p.description, quoteRequired: p.quoteRequired, isOther: p.isOther, active: p.active, deviceIds: p.devices.map((d) => d.id) })),
        devices: s.devices.map((l) => ({ deviceId: l.deviceId, included: l.included, fee: num(l.fee), autoInclude: l.autoInclude })),
      })),
      devices: devices.map((d) => ({ ...d, fee: num(d.fee) })),
      zones: zones.map((z) => ({ ...z, travelFee: num(z.travelFee) })),
      bundles: bundles.map((b) => ({ ...b, priceInside: num(b.priceInside), priceOutside: num(b.priceOutside) })),
    });
  }),
);

// ───── الخدمات ─────

const serviceInput = z.object({
  name: text(160).min(3, 'اكتب اسم الخدمة'),
  summary: text(400).default(''),
  includes: text(3000).default(''),
  audiences: z.array(z.enum(AUDIENCES)).min(1, 'اختر قسمًا واحدًا على الأقل (منازل أو شركات)'),
  requestTypes: z.array(z.enum(REQUEST_TYPES)).min(1, 'اختر نوع طلب واحدًا على الأقل'),
  priceInside: money,
  priceOutside: money,
  travelFee: money.default(0),
  /** زيارة عاجلة / طارئة (فارغ = غير متاحة) */
  priceUrgent: money.nullable().default(null),
  priceEmergency: money.nullable().default(null),
  discountPercent: z.coerce.number().int().min(0).max(90).default(0),
  durationMinutes: z.coerce.number().int().min(15, 'المدة 15 دقيقة على الأقل').max(24 * 60).default(60),
  visitFeePolicy: z.enum(['DEDUCTIBLE', 'SEPARATE']).default('SEPARATE'),
  terms: text(2000).default(''),
  featured: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
  active: z.boolean().default(true),
  optionsLabel: text(200).default(''),
  priceOnRequest: z.boolean().default(false),
  deliverables: text(3000).default(''),
  formFields: z
    .array(
      z.object({
        key: z.string().trim().regex(/^[a-z0-9_]{1,40}$/i, 'مفتاح الحقل غير صالح'),
        label: text(160).min(2, 'اكتب عنوان الحقل'),
        type: z.enum(['text', 'textarea', 'number', 'select', 'multiselect']),
        options: z.array(text(120).min(1)).max(30).optional(),
        required: z.boolean().default(false),
        hint: text(200).optional(),
        active: z.boolean().default(true),
      }),
    )
    .max(20)
    .superRefine((list, ctx) => {
      const keys = new Set<string>();
      list.forEach((f, i) => {
        if (keys.has(f.key)) ctx.addIssue({ code: 'custom', path: [i, 'key'], message: 'مفتاح الحقل مكرر' });
        keys.add(f.key);
        if ((f.type === 'select' || f.type === 'multiselect') && !f.options?.length) ctx.addIssue({ code: 'custom', path: [i, 'options'], message: `أضف خيارات للحقل "${f.label}"` });
      });
    })
    .default([]),
});

const priceFields = (s: { priceInside: unknown; priceOutside: unknown; priceUrgent: unknown; priceEmergency: unknown; travelFee: unknown; discountPercent: unknown; priceOnRequest: boolean }) => ({
  priceInside: s.priceInside,
  priceOutside: s.priceOutside,
  priceUrgent: s.priceUrgent,
  priceEmergency: s.priceEmergency,
  travelFee: s.travelFee,
  discountPercent: s.discountPercent,
  priceOnRequest: s.priceOnRequest ? 1 : 0,
});

siteServicesAdminRouter.post(
  '/services',
  asyncHandler(async (req, res) => {
    const input = serviceInput.parse(req.body);
    let slug = slugify(input.name);
    if (await prisma.siteService.findUnique({ where: { slug } })) slug = `${slug}-${randomSuffix()}`;
    const s = await prisma.siteService.create({
      data: { ...input, slug, audiences: [...new Set(input.audiences)], requestTypes: [...new Set(input.requestTypes)], priceInside: D(input.priceInside), priceOutside: D(input.priceOutside), travelFee: D(input.travelFee), priceUrgent: input.priceUrgent != null ? D(input.priceUrgent) : null, priceEmergency: input.priceEmergency != null ? D(input.priceEmergency) : null },
    });
    await logPrices(req, 'service', s.id, s.name, null, priceFields(input));
    await audit({ actorType: 'admin', actorId: req.auth!.sub, action: 'create', entity: 'site_service', entityId: s.id });
    ok(res, { id: s.id, slug: s.slug }, 201);
  }),
);

siteServicesAdminRouter.patch(
  '/services/:id',
  asyncHandler(async (req, res) => {
    const input = serviceInput.partial().parse(req.body);
    const before = await prisma.siteService.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw notFound('الخدمة غير موجودة');
    const s = await prisma.siteService.update({
      where: { id: before.id },
      data: {
        ...input,
        audiences: input.audiences ? [...new Set(input.audiences)] : undefined,
        requestTypes: input.requestTypes ? [...new Set(input.requestTypes)] : undefined,
        priceInside: input.priceInside != null ? D(input.priceInside) : undefined,
        priceOutside: input.priceOutside != null ? D(input.priceOutside) : undefined,
        travelFee: input.travelFee != null ? D(input.travelFee) : undefined,
        priceUrgent: input.priceUrgent === undefined ? undefined : input.priceUrgent == null ? null : D(input.priceUrgent),
        priceEmergency: input.priceEmergency === undefined ? undefined : input.priceEmergency == null ? null : D(input.priceEmergency),
      },
    });
    await logPrices(req, 'service', s.id, s.name, priceFields(before), priceFields(s));
    await audit({ actorType: 'admin', actorId: req.auth!.sub, action: 'update', entity: 'site_service', entityId: s.id });
    ok(res, { id: s.id });
  }),
);

siteServicesAdminRouter.delete(
  '/services/:id',
  asyncHandler(async (req, res) => {
    const s = await prisma.siteService.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!s) throw notFound('الخدمة غير موجودة');
    // حذف ناعم: الطلبات السابقة تحتفظ بنسخة من الخدمة، والرابط يتحرر لخدمة جديدة
    await prisma.siteService.update({ where: { id: s.id }, data: { deletedAt: new Date(), active: false, slug: `${s.slug}-deleted-${randomSuffix(6)}`, bundles: { set: [] } } });
    await audit({ actorType: 'admin', actorId: req.auth!.sub, action: 'delete', entity: 'site_service', entityId: s.id, meta: { name: s.name } });
    ok(res, { deleted: true });
  }),
);

/** المشكلات وربطها بالأجهزة (تستبدل القائمة كاملة) */
siteServicesAdminRouter.put(
  '/services/:id/problems',
  asyncHandler(async (req, res) => {
    const list = z
      .array(
        z.object({
          id: z.string().max(40).optional(),
          name: text(160).min(2, 'اكتب اسم الخيار'),
          description: text(3000).default(''),
          quoteRequired: z.boolean().default(false),
          isOther: z.boolean().default(false),
          active: z.boolean().default(true),
          deviceIds: z.array(z.string().max(40)).max(30).default([]),
        }),
      )
      .max(40)
      .parse(req.body);
    const s = await prisma.siteService.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { id: true } });
    if (!s) throw notFound('الخدمة غير موجودة');
    const devices = new Set((await prisma.serviceDevice.findMany({ select: { id: true } })).map((d) => d.id));
    if (list.some((p) => p.deviceIds.some((id) => !devices.has(id)))) throw badRequest('أحد الأجهزة غير موجود');
    await prisma.$transaction(async (tx) => {
      const keep = list.filter((p) => p.id).map((p) => p.id!);
      await tx.serviceProblem.deleteMany({ where: { serviceId: s.id, id: { notIn: keep } } });
      for (const [i, p] of list.entries()) {
        const data = { name: p.name, description: p.description, quoteRequired: p.quoteRequired, isOther: p.isOther, active: p.active, sortOrder: i };
        const devicesSet = p.deviceIds.map((id) => ({ id }));
        const existing = p.id ? await tx.serviceProblem.findFirst({ where: { id: p.id, serviceId: s.id }, select: { id: true } }) : null;
        if (existing) await tx.serviceProblem.update({ where: { id: existing.id }, data: { ...data, devices: { set: devicesSet } } });
        else await tx.serviceProblem.create({ data: { ...data, serviceId: s.id, devices: { connect: devicesSet } } });
      }
    });
    await audit({ actorType: 'admin', actorId: req.auth!.sub, action: 'update_problems', entity: 'site_service', entityId: s.id });
    ok(res, { saved: list.length });
  }),
);

/** الأجهزة المتاحة للخدمة: مشمول بلا رسوم، رسوم خاصة بالخدمة، أو إضافة تلقائية مجانية */
siteServicesAdminRouter.put(
  '/services/:id/devices',
  asyncHandler(async (req, res) => {
    const list = z.array(z.object({ deviceId: z.string().max(40), included: z.boolean().default(false), fee: money.nullable().optional(), autoInclude: z.boolean().default(false) })).max(40).parse(req.body);
    const s = await prisma.siteService.findFirst({ where: { id: req.params.id, deletedAt: null }, include: { devices: true } });
    if (!s) throw notFound('الخدمة غير موجودة');
    const devices = await prisma.serviceDevice.findMany({ where: { id: { in: list.map((l) => l.deviceId) } }, select: { id: true, name: true } });
    if (devices.length !== new Set(list.map((l) => l.deviceId)).size) throw badRequest('أحد الأجهزة غير موجود');
    await prisma.$transaction([
      prisma.serviceDeviceLink.deleteMany({ where: { serviceId: s.id } }),
      prisma.serviceDeviceLink.createMany({ data: list.map((l) => ({ serviceId: s.id, deviceId: l.deviceId, included: l.included || l.autoInclude, autoInclude: l.autoInclude, fee: l.fee != null ? D(l.fee) : null })) }),
    ]);
    for (const l of list) {
      const prev = s.devices.find((x) => x.deviceId === l.deviceId);
      const name = `${s.name} — ${devices.find((d) => d.id === l.deviceId)!.name}`;
      await logPrices(req, 'service_device', `${s.id}:${l.deviceId}`, name, prev ? { fee: prev.fee, included: prev.included ? 1 : 0 } : null, { fee: l.fee ?? null, included: l.included ? 1 : 0 });
    }
    ok(res, { saved: list.length });
  }),
);

// ───── الأجهزة ─────

const deviceInput = z.object({
  name: text(160).min(2, 'اكتب اسم الجهاز'),
  description: text(600).default(''),
  fee: money,
  code: z.string().trim().regex(/^[a-z0-9_]{2,60}$/, 'الرمز: أحرف إنجليزية صغيرة وأرقام و _ فقط').nullable().optional(),
  mechanism: text(1500).default(''),
  /** سطر لكل فائدة */
  benefits: text(2000).default(''),
  scopePriced: z.boolean().default(false),
  /** ملحق مجاني يُضاف مع جهاز أب (مثل خطافات المنظار) */
  parentId: z.string().max(40).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
  active: z.boolean().default(true),
});

async function checkDevice(input: { code?: string | null; parentId?: string | null }, id?: string) {
  if (input.code) {
    const dup = await prisma.serviceDevice.findUnique({ where: { code: input.code }, select: { id: true } });
    if (dup && dup.id !== id) throw badRequest('الرمز مستخدم لجهاز آخر', { field: 'code' });
  }
  if (input.parentId) {
    if (input.parentId === id) throw badRequest('لا يكون الجهاز ملحقًا لنفسه', { field: 'parentId' });
    const parent = await prisma.serviceDevice.findUnique({ where: { id: input.parentId }, select: { parentId: true } });
    if (!parent) throw badRequest('الجهاز الأب غير موجود', { field: 'parentId' });
    if (parent.parentId) throw badRequest('اختر جهازًا رئيسيًا (ليس ملحقًا)', { field: 'parentId' });
  }
}

/** صورة الجهاز (تستبدل الرسم الافتراضي) */
siteServicesAdminRouter.post(
  '/devices/:id/image',
  uploadGuard(10),
  memoryUpload(8, 1).single('file'),
  asyncHandler(async (req, res) => {
    const d = await prisma.serviceDevice.findUnique({ where: { id: req.params.id } });
    if (!d) throw notFound('الجهاز غير موجود');
    if (!req.file) throw badRequest('اختر صورة');
    const [img] = await validateAndStore([req.file], POLICIES.photos, 'services/devices');
    await prisma.serviceDevice.update({ where: { id: d.id }, data: { imageUrl: img.url, imagePublicId: img.publicId } });
    if (d.imagePublicId) await deleteStored(d.imagePublicId);
    ok(res, { imageUrl: img.url });
  }),
);

siteServicesAdminRouter.delete(
  '/devices/:id/image',
  asyncHandler(async (req, res) => {
    const d = await prisma.serviceDevice.findUnique({ where: { id: req.params.id } });
    if (!d) throw notFound('الجهاز غير موجود');
    await prisma.serviceDevice.update({ where: { id: d.id }, data: { imageUrl: null, imagePublicId: null } });
    if (d.imagePublicId) await deleteStored(d.imagePublicId);
    ok(res, { deleted: true });
  }),
);

siteServicesAdminRouter.post(
  '/devices',
  asyncHandler(async (req, res) => {
    const input = deviceInput.parse(req.body);
    await checkDevice(input);
    const d = await prisma.serviceDevice.create({ data: { ...input, fee: D(input.fee) } });
    await logPrices(req, 'device', d.id, d.name, null, { fee: input.fee });
    ok(res, { id: d.id }, 201);
  }),
);

siteServicesAdminRouter.patch(
  '/devices/:id',
  asyncHandler(async (req, res) => {
    const input = deviceInput.partial().parse(req.body);
    const before = await prisma.serviceDevice.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('الجهاز غير موجود');
    await checkDevice(input, before.id);
    const d = await prisma.serviceDevice.update({ where: { id: before.id }, data: { ...input, fee: input.fee != null ? D(input.fee) : undefined } });
    await logPrices(req, 'device', d.id, d.name, { fee: before.fee }, { fee: d.fee });
    ok(res, { id: d.id });
  }),
);

siteServicesAdminRouter.delete(
  '/devices/:id',
  asyncHandler(async (req, res) => {
    const d = await prisma.serviceDevice.findUnique({ where: { id: req.params.id } });
    if (!d) throw notFound('الجهاز غير موجود');
    await prisma.serviceDevice.delete({ where: { id: d.id } });
    await audit({ actorType: 'admin', actorId: req.auth!.sub, action: 'delete', entity: 'service_device', entityId: d.id, meta: { name: d.name } });
    ok(res, { deleted: true });
  }),
);

// ───── المناطق ─────

const zoneInput = z.object({
  name: text(80).min(2, 'اكتب اسم المنطقة'),
  tier: z.enum(['INSIDE_AMMAN', 'OUTSIDE_AMMAN']),
  travelFee: money.default(0),
  requiresApproval: z.boolean().default(false),
  /** المناطق داخل المحافظة */
  regions: z.array(text(80).min(1)).max(200).transform((l) => [...new Set(l)]).default([]),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
  active: z.boolean().default(true),
});

siteServicesAdminRouter.post(
  '/zones',
  asyncHandler(async (req, res) => {
    const input = zoneInput.parse(req.body);
    const z0 = await prisma.serviceZone.create({ data: { ...input, travelFee: D(input.travelFee) } });
    await logPrices(req, 'zone', z0.id, z0.name, null, { travelFee: input.travelFee });
    ok(res, { id: z0.id }, 201);
  }),
);

siteServicesAdminRouter.patch(
  '/zones/:id',
  asyncHandler(async (req, res) => {
    const input = zoneInput.partial().parse(req.body);
    const before = await prisma.serviceZone.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('المنطقة غير موجودة');
    const z0 = await prisma.serviceZone.update({ where: { id: before.id }, data: { ...input, travelFee: input.travelFee != null ? D(input.travelFee) : undefined } });
    await logPrices(req, 'zone', z0.id, z0.name, { travelFee: before.travelFee }, { travelFee: z0.travelFee });
    ok(res, { id: z0.id });
  }),
);

siteServicesAdminRouter.delete(
  '/zones/:id',
  asyncHandler(async (req, res) => {
    const z0 = await prisma.serviceZone.findUnique({ where: { id: req.params.id } });
    if (!z0) throw notFound('المنطقة غير موجودة');
    await prisma.serviceZone.delete({ where: { id: z0.id } });
    await audit({ actorType: 'admin', actorId: req.auth!.sub, action: 'delete', entity: 'service_zone', entityId: z0.id, meta: { name: z0.name } });
    ok(res, { deleted: true });
  }),
);

// ───── الزيارات المجمعة ─────

const bundleInput = z.object({
  name: text(160).min(3, 'اكتب اسم الزيارة المجمعة'),
  priceInside: money,
  priceOutside: money,
  terms: text(2000).default(''),
  active: z.boolean().default(true),
  serviceIds: z.array(z.string().max(40)).min(2, 'اختر خدمتين على الأقل يمكن جمعهما في زيارة واحدة').max(50),
});

async function checkServices(ids: string[]) {
  const n = await prisma.siteService.count({ where: { id: { in: ids }, deletedAt: null } });
  if (n !== new Set(ids).size) throw badRequest('إحدى الخدمات غير موجودة');
}

siteServicesAdminRouter.post(
  '/bundles',
  asyncHandler(async (req, res) => {
    const { serviceIds, ...input } = bundleInput.parse(req.body);
    await checkServices(serviceIds);
    const b = await prisma.serviceBundle.create({ data: { ...input, priceInside: D(input.priceInside), priceOutside: D(input.priceOutside), services: { connect: serviceIds.map((id) => ({ id })) } } });
    await logPrices(req, 'bundle', b.id, b.name, null, { priceInside: input.priceInside, priceOutside: input.priceOutside });
    ok(res, { id: b.id }, 201);
  }),
);

siteServicesAdminRouter.patch(
  '/bundles/:id',
  asyncHandler(async (req, res) => {
    const { serviceIds, ...input } = bundleInput.partial().parse(req.body);
    const before = await prisma.serviceBundle.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('الزيارة المجمعة غير موجودة');
    if (serviceIds) await checkServices(serviceIds);
    const b = await prisma.serviceBundle.update({
      where: { id: before.id },
      data: {
        ...input,
        priceInside: input.priceInside != null ? D(input.priceInside) : undefined,
        priceOutside: input.priceOutside != null ? D(input.priceOutside) : undefined,
        services: serviceIds ? { set: serviceIds.map((id) => ({ id })) } : undefined,
      },
    });
    await logPrices(req, 'bundle', b.id, b.name, { priceInside: before.priceInside, priceOutside: before.priceOutside }, { priceInside: b.priceInside, priceOutside: b.priceOutside });
    ok(res, { id: b.id });
  }),
);

siteServicesAdminRouter.delete(
  '/bundles/:id',
  asyncHandler(async (req, res) => {
    const b = await prisma.serviceBundle.findUnique({ where: { id: req.params.id } });
    if (!b) throw notFound('الزيارة المجمعة غير موجودة');
    await prisma.serviceBundle.delete({ where: { id: b.id } });
    await audit({ actorType: 'admin', actorId: req.auth!.sub, action: 'delete', entity: 'service_bundle', entityId: b.id, meta: { name: b.name } });
    ok(res, { deleted: true });
  }),
);

/** سجل تغييرات الأسعار: من غيّر، ماذا، ومتى */
siteServicesAdminRouter.get(
  '/price-log',
  asyncHandler(async (req, res) => {
    const { page } = z.object({ page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const where = { entity: 'service_price' };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 50, take: 50, include: { actor: { select: { name: true } } } }),
      prisma.auditLog.count({ where }),
    ]);
    ok(res, { items: items.map((l) => ({ id: l.id, action: l.action, createdAt: l.createdAt, actor: l.actor?.name ?? null, meta: l.meta })), total, page, pageSize: 50 });
  }),
);
