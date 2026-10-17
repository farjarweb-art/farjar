import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { emitAdmin } from '../../lib/events';
import { HttpError, asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { makeRef } from '../../lib/ids';
import { prisma } from '../../lib/prisma';
import { ammanToUtc } from '../../lib/time';
import { requireCustomer } from '../../middleware/auth';
import { formLimiter } from '../../middleware/rateLimit';
import { memoryUpload, uploadGuard } from '../../middleware/upload';
import { accountCustomer } from '../../services/customer.service';
import { getDaySlots } from '../../services/schedule.service';
import { priceVisit } from '../../services/servicePricing';
import { CLIENT_TYPE_AR, REQUEST_TYPE_AR, logEvent, serviceRequestMessage } from '../../services/siteServices.service';
import { POLICIES, validateAndStore, validateFile } from '../../services/upload.service';
import { notifyAdmin } from '../../services/whatsapp.service';
import { dateField, latField, lngField, nameField, optionalText, phoneField, requiredText, timeField } from '../../validators/common';

export const siteServicesRouter = Router();

const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));

/** الشروط العامة التي يوافق عليها العميل قبل التأكيد */
export const GENERAL_TERMS = [
  'سعر الزيارة ثابت لكل زيارة حسب المنطقة، ولا يُحسب حسب المتر أو عدد الساعات أو مدة الزيارة.',
  'رسوم الزيارة تشمل المعاينة والفحوصات المتفق عليها فقط، ولا تشمل أعمال الإصلاح أو المواد أو التنفيذ.',
  'بعد المعاينة يمكن إعداد تقرير فني وعرض سعر منفصل للإصلاح، ولا يبدأ أي تنفيذ إلا بعد موافقتك على عرض السعر.',
  'السعر الذي توافق عليه الآن يبقى ثابتًا لهذا الحجز حتى لو تغيرت الأسعار لاحقًا.',
  'الموعد المختار مبدئي ويؤكده فريق فرجار جروب بالتواصل معك.',
];

const POLICY_AR = {
  DEDUCTIBLE: 'رسوم الزيارة تُخصم من قيمة أعمال الإصلاح عند موافقتك على تنفيذها مع فرجار جروب.',
  SEPARATE: 'رسوم الزيارة مستقلة عن قيمة أعمال الإصلاح.',
} as const;

/** كتالوج الخدمات للعرض العام */
siteServicesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const services = await prisma.siteService.findMany({
      where: { active: true, deletedAt: null },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, slug: true, summary: true, audiences: true, priceInside: true, priceOutside: true, discountPercent: true, featured: true, _count: { select: { problems: true } } },
    });
    ok(res, {
      services: services.map(({ _count, ...s }) => ({ ...s, priceInside: num(s.priceInside), priceOutside: num(s.priceOutside), hasProblems: _count.problems > 0 })),
    });
  }),
);

/** المواعيد: أيام وساعات العمل (يؤكد الفريق الموعد النهائي) */
siteServicesRouter.get(
  '/slots',
  asyncHandler(async (req, res) => {
    const { date } = z.object({ date: dateField }).parse(req.query);
    const day = await getDaySlots(date);
    ok(res, { ...day, slots: day.slots.map((s) => (s.reason === 'booked' ? { time: s.time, available: true } : s)) });
  }),
);

/** حساب السعر قبل التأكيد */
const quoteInput = z.object({
  serviceIds: z.array(z.string().max(40)).min(1, 'اختر خدمة').max(8),
  zoneId: z.string({ required_error: 'اختر المنطقة' }).max(40),
  problemIds: z.array(z.string().max(40)).max(20).optional(),
  deviceIds: z.array(z.string().max(40)).max(20).optional(),
});

siteServicesRouter.post(
  '/quote',
  asyncHandler(async (req, res) => {
    ok(res, await priceVisit(quoteInput.parse(req.body)));
  }),
);

/** تفاصيل خدمة: المشكلات، الأجهزة، أنواع الطلب، المناطق، والخدمات التي يمكن جمعها معها */
siteServicesRouter.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const s = await prisma.siteService.findFirst({
      where: { slug: req.params.slug, active: true, deletedAt: null },
      include: {
        problems: { where: { active: true }, orderBy: { sortOrder: 'asc' }, include: { devices: { select: { id: true } } } },
        devices: { where: { device: { active: true } }, include: { device: true }, orderBy: { device: { sortOrder: 'asc' } } },
        bundles: { where: { active: true }, include: { services: { where: { active: true, deletedAt: null }, select: { id: true, name: true, slug: true, priceInside: true, priceOutside: true } } } },
      },
    });
    if (!s) throw notFound('الخدمة غير موجودة');
    const zones = await prisma.serviceZone.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, tier: true, travelFee: true, requiresApproval: true } });
    const combinable = new Map<string, { id: string; name: string; slug: string; priceInside: number | null; priceOutside: number | null }>();
    for (const b of s.bundles) for (const x of b.services) if (x.id !== s.id) combinable.set(x.id, { ...x, priceInside: num(x.priceInside), priceOutside: num(x.priceOutside) });
    ok(res, {
      service: {
        id: s.id,
        name: s.name,
        slug: s.slug,
        summary: s.summary,
        includes: s.includes.split('\n').map((l) => l.trim()).filter(Boolean),
        audiences: s.audiences,
        requestTypes: s.requestTypes.map((t) => ({ value: t, label: REQUEST_TYPE_AR[t] })),
        priceInside: num(s.priceInside),
        priceOutside: num(s.priceOutside),
        travelFee: num(s.travelFee),
        discountPercent: s.discountPercent,
        durationMinutes: s.durationMinutes,
        visitFeePolicy: s.visitFeePolicy,
        visitFeePolicyText: POLICY_AR[s.visitFeePolicy],
        terms: s.terms,
        featured: s.featured,
        problems: s.problems.map((p) => ({ id: p.id, name: p.name, isOther: p.isOther, deviceIds: p.devices.map((d) => d.id) })),
        devices: s.devices.map((l) => ({ id: l.deviceId, name: l.device.name, description: l.device.description, fee: l.included ? 0 : Number(l.fee ?? l.device.fee), included: l.included })),
        bundles: s.bundles.map((b) => ({ id: b.id, name: b.name, priceInside: num(b.priceInside), priceOutside: num(b.priceOutside), terms: b.terms })),
      },
      combinable: [...combinable.values()],
      zones: zones.map((z) => ({ ...z, travelFee: num(z.travelFee) })),
      clientTypes: Object.entries(CLIENT_TYPE_AR).map(([value, label]) => ({ value, label })),
      generalTerms: GENERAL_TERMS,
    });
  }),
);

/** حد الطلبات المفتوحة بانتظار التأكيد لكل عميل */
export const MAX_OPEN_SERVICE_REQUESTS = 5;
const MAX_PHOTOS = 6;

const createInput = quoteInput.extend({
  requestType: z.enum(['INSPECTION', 'INSPECTION_REPORT', 'DIAGNOSIS', 'REPAIR_QUOTE', 'REPAIR', 'PREVENTIVE', 'CONTRACT'], { errorMap: () => ({ message: 'اختر نوع الطلب' }) }),
  name: nameField,
  phone: phoneField,
  clientType: z.enum(['INDIVIDUAL', 'COMPANY', 'FACTORY', 'WAREHOUSE', 'WORKSHOP'], { errorMap: () => ({ message: 'اختر نوع العميل' }) }),
  propertyType: requiredText('نوع العقار أو المنشأة', 80),
  area: requiredText('المنطقة', 120),
  address: requiredText('العنوان بالتفصيل', 400),
  lat: latField,
  lng: lngField,
  description: requiredText('وصف المشكلة', 3000),
  problemLocation: optionalText(300),
  notes: optionalText(1500),
  date: dateField,
  time: timeField,
  /** المبلغ الذي رآه العميل — إن تغيّر السعر قبل الإرسال نطلب منه المراجعة */
  expectedTotal: z.coerce.number().min(0),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'يجب الموافقة على الشروط وملخص السعر قبل تأكيد الحجز' }) }),
});

const upload = memoryUpload(40, MAX_PHOTOS + 1).fields([
  { name: 'photos', maxCount: MAX_PHOTOS },
  { name: 'video', maxCount: 1 },
]);

siteServicesRouter.post(
  '/requests',
  requireCustomer,
  formLimiter,
  asyncHandler(async (req, _res, next) => {
    const open = await prisma.serviceRequest.count({ where: { customerId: req.auth!.sub, deletedAt: null, status: { in: ['NEW', 'PENDING_CONFIRMATION'] } } });
    if (open >= MAX_OPEN_SERVICE_REQUESTS) {
      throw new HttpError(429, `لديك ${open} طلبات بانتظار التأكيد. انتظر تأكيدها قبل إضافة طلب جديد، أو تواصل معنا.`, 'TOO_MANY_OPEN');
    }
    next();
  }),
  uploadGuard(90),
  upload,
  asyncHandler(async (req, res) => {
    let raw: unknown = req.body;
    if (req.is('multipart/form-data')) {
      try {
        raw = JSON.parse(String(req.body.data ?? ''));
      } catch {
        throw badRequest('صيغة بيانات الطلب غير صحيحة');
      }
    }
    const input = createInput.parse(raw);
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
    const photos = files.photos ?? [];
    const videos = files.video ?? [];
    photos.forEach((f) => validateFile(f, POLICIES.photos));
    videos.forEach((f) => validateFile(f, { kinds: ['VIDEO'], maxBytes: { VIDEO: 40 * 1024 * 1024 } }));

    const main = await prisma.siteService.findFirst({ where: { id: input.serviceIds[0], active: true, deletedAt: null }, select: { requestTypes: true } });
    if (!main) throw badRequest('الخدمة غير متاحة حاليًا');
    if (!main.requestTypes.includes(input.requestType)) throw badRequest('نوع الطلب غير متاح لهذه الخدمة', { field: 'requestType' });

    const price = await priceVisit(input);
    if (Math.abs(price.total - input.expectedTotal) > 0.0005) {
      throw new HttpError(409, 'تغيّر السعر منذ فتح الصفحة. راجع الملخص الجديد ثم أكّد الحجز.', 'PRICE_CHANGED', { total: price.total });
    }

    // الموعد: ضمن أيام وساعات العمل المعروضة
    const day = await getDaySlots(input.date);
    const slot = day.slots.find((s) => s.time === input.time);
    if (!day.open || !slot || slot.reason === 'past') throw badRequest('اختر يومًا ووقتًا من الأوقات المعروضة', { field: 'time' });
    const scheduledAt = ammanToUtc(input.date, input.time);

    const stored = [...(await validateAndStore(photos, POLICIES.photos, 'services')), ...(await validateAndStore(videos, { kinds: ['VIDEO'], maxBytes: { VIDEO: 40 * 1024 * 1024 } }, 'services'))];

    const created = await prisma.$transaction(async (tx) => {
      const customer = await accountCustomer(tx, req.auth!.sub);
      const r = await tx.serviceRequest.create({
        data: {
          ref: makeRef('S'),
          customerId: customer.id,
          requestType: input.requestType,
          name: input.name,
          phone: input.phone,
          clientType: input.clientType,
          propertyType: input.propertyType,
          zoneId: price.zone.id,
          zoneName: price.zone.name,
          tier: price.tier,
          area: input.area,
          address: input.address,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          description: input.description,
          problemLocation: input.problemLocation ?? null,
          notes: input.notes ?? null,
          scheduledAt,
          services: price.services as Prisma.InputJsonValue,
          problems: price.problems as Prisma.InputJsonValue,
          devices: price.devices as Prisma.InputJsonValue,
          priceLines: price.lines as Prisma.InputJsonValue,
          total: new Prisma.Decimal(price.total),
          visitFeePolicy: price.visitFeePolicy,
          needsApproval: price.zone.requiresApproval,
          termsAcceptedAt: new Date(),
          media: { create: stored.map((f) => ({ kind: f.kind, url: f.url, publicId: f.publicId, originalName: f.originalName })) },
        },
      });
      await logEvent(tx, r.id, { kind: 'created', to: 'NEW', actorName: input.name, note: `حُجز بسعر ${price.total} د.أ` });
      return r;
    });

    const text = serviceRequestMessage({ ...created, total: price.total, services: price.services, problems: price.problems, devices: price.devices });
    const wa = await notifyAdmin(text, { entityType: 'service_request', entityId: created.id });
    emitAdmin({ type: 'service_request.created', id: created.id, title: `طلب معاينة #${created.number} — ${price.services[0].name}` });
    await audit({ actorType: 'customer', actorId: req.auth!.sub, action: 'create', entity: 'service_request', entityId: created.id });

    ok(res, { id: created.id, number: created.number, ref: created.ref, status: created.status, total: price.total, scheduledAt: created.scheduledAt, message: text, whatsapp: { link: wa.link, sent: wa.sent } }, 201);
  }),
);

