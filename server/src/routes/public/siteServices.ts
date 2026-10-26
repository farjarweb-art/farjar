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
import { getServiceDaySlots } from '../../services/schedule.service';
import { resolveMapLink } from '../../services/mapLink';
import { allDevicesQuery, priceVisit } from '../../services/servicePricing';
import { CLIENT_TYPE_AR, OWNERSHIP_OPTIONS, REQUEST_TYPE_AR, logEvent, parseFormFields, resolveExtra, serviceRequestMessage } from '../../services/siteServices.service';
import { POLICIES, validateAndStore, validateFile } from '../../services/upload.service';
import { notifyAdmin } from '../../services/whatsapp.service';
import { dateField, nameField, optionalText, phoneField, requiredText, timeField } from '../../validators/common';

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
      select: { id: true, name: true, slug: true, summary: true, audiences: true, requestTypes: true, priceInside: true, priceOutside: true, priceUrgent: true, priceEmergency: true, discountPercent: true, featured: true, priceOnRequest: true, _count: { select: { problems: true } } },
    });
    const zones = await prisma.serviceZone.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, tier: true, travelFee: true, requiresApproval: true, regions: true } });
    ok(res, {
      zones: zones.map((z) => ({ ...z, travelFee: num(z.travelFee) })),
      ownershipOptions: OWNERSHIP_OPTIONS,
      generalTerms: GENERAL_TERMS,
      services: services.map(({ _count, ...s }) => ({ ...s, priceInside: num(s.priceInside), priceOutside: num(s.priceOutside), priceUrgent: num(s.priceUrgent), priceEmergency: num(s.priceEmergency), hasProblems: _count.problems > 0 })),
    });
  }),
);

/** المواعيد: أيام وساعات العمل (يؤكد الفريق الموعد النهائي) */
siteServicesRouter.get(
  '/slots',
  asyncHandler(async (req, res) => {
    const { date } = z.object({ date: dateField }).parse(req.query);
    ok(res, await getServiceDaySlots(date));
  }),
);

/** رابط خريطة (Google Maps أو غيرها) ← إحداثيات */
siteServicesRouter.get(
  '/map-link',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { u } = z.object({ u: z.string().trim().min(5).max(2000) }).parse(req.query);
    const point = await resolveMapLink(u);
    if (!point) throw badRequest('لم نتعرف على الموقع من هذا الرابط. افتح الموقع في خرائط Google وانسخ رابط المشاركة، أو حدد الموقع من الخريطة.', { field: 'mapLink' });
    ok(res, point);
  }),
);

/** حساب السعر قبل التأكيد */
const quoteInput = z.object({
  serviceIds: z.array(z.string().max(40)).min(1, 'اختر خدمة').max(8),
  zoneId: z.string({ required_error: 'اختر المنطقة' }).max(40),
  problemIds: z.array(z.string().max(40)).max(20).optional(),
  deviceIds: z.array(z.string().max(40)).max(20).optional(),
  urgency: z.enum(['NORMAL', 'URGENT', 'EMERGENCY']).optional(),
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
        devices: { where: { device: { active: true } }, include: { device: { include: { accessories: { where: { active: true }, select: { id: true } } } } }, orderBy: { device: { sortOrder: 'asc' } } },
        bundles: { where: { active: true }, include: { services: { where: { active: true, deletedAt: null }, select: { id: true, name: true, slug: true, priceInside: true, priceOutside: true } } } },
      },
    });
    if (!s) throw notFound('الخدمة غير موجودة');
    const [zones, allDevices] = await Promise.all([
      prisma.serviceZone.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, tier: true, travelFee: true, requiresApproval: true, regions: true } }),
      allDevicesQuery(),
    ]);
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
        priceUrgent: num(s.priceUrgent),
        priceEmergency: num(s.priceEmergency),
        discountPercent: s.discountPercent,
        durationMinutes: s.durationMinutes,
        visitFeePolicy: s.visitFeePolicy,
        visitFeePolicyText: POLICY_AR[s.visitFeePolicy],
        terms: s.terms,
        featured: s.featured,
        optionsLabel: s.optionsLabel,
        priceOnRequest: s.priceOnRequest,
        deliverables: s.deliverables.split('\n').map((l) => l.trim()).filter(Boolean),
        formFields: parseFormFields(s.formFields),
        problems: s.problems.map((p) => ({
          id: p.id,
          name: p.name,
          isOther: p.isOther,
          description: p.description.split('\n').map((l) => l.trim()).filter(Boolean),
          quoteRequired: p.quoteRequired,
          deviceIds: p.devices.map((d) => d.id),
        })),
        // كل الأجهزة المتاحة: المربوطة بالخدمة أولًا (linked) ثم بقية الأجهزة — العميل يختار أي جهاز يريده
        devices: allDevices
          .filter((d) => !d.scopePriced || s.audiences.includes('BUSINESS') || s.devices.some((l) => l.deviceId === d.id))
          .map((d) => {
            const l = s.devices.find((x) => x.deviceId === d.id);
            return {
              id: d.id,
              name: d.name,
              description: d.description,
              fee: l?.included || d.scopePriced ? 0 : Number(l?.fee ?? d.fee),
              included: !!l?.included,
              imageUrl: d.imageUrl,
              mechanism: d.mechanism,
              benefits: d.benefits.split('\n').map((x) => x.trim()).filter(Boolean),
              scopePriced: d.scopePriced,
              coversAll: d.coversAll,
              parentId: d.parentId,
              autoInclude: !!l?.autoInclude,
              accessoryIds: d.accessories.map((x) => x.id),
              linked: !!l,
            };
          })
          .sort((x, y) => Number(y.linked) - Number(x.linked)),
        bundles: s.bundles.map((b) => ({ id: b.id, name: b.name, priceInside: num(b.priceInside), priceOutside: num(b.priceOutside), terms: b.terms })),
      },
      combinable: [...combinable.values()],
      zones: zones.map((z) => ({ ...z, travelFee: num(z.travelFee) })),
      clientTypes: Object.entries(CLIENT_TYPE_AR).map(([value, label]) => ({ value, label })),
      ownershipOptions: OWNERSHIP_OPTIONS,
      generalTerms: GENERAL_TERMS,
    });
  }),
);

/** حد الطلبات المفتوحة بانتظار التأكيد لكل عميل */
export const MAX_OPEN_SERVICE_REQUESTS = 5;
const MAX_PHOTOS = 6;
const MAX_DOCUMENTS = 5;

const createInput = quoteInput.extend({
  requestType: z.enum(['INSPECTION', 'INSPECTION_REPORT', 'DIAGNOSIS', 'REPAIR_QUOTE', 'REPAIR', 'PREVENTIVE', 'CONTRACT'], { errorMap: () => ({ message: 'اختر نوع الطلب' }) }),
  name: nameField,
  phone: phoneField,
  phoneWhatsapp: z.boolean().default(true),
  /** رقم ثانوي إجباري للتواصل */
  phone2: phoneField,
  phone2Whatsapp: z.boolean().default(false),
  clientType: z.enum(['INDIVIDUAL', 'COMPANY', 'FACTORY', 'WAREHOUSE', 'WORKSHOP'], { errorMap: () => ({ message: 'اختر نوع العميل' }) }),
  propertyType: requiredText('نوع العقار أو المنشأة', 80),
  ownership: optionalText(80),
  area: requiredText('المنطقة', 120),
  address: requiredText('العنوان بالتفصيل', 400),
  /** موقع العقار إجباري: GPS، رابط خريطة، أو تحديد يدوي على الخريطة */
  lat: z.coerce.number({ required_error: 'حدد موقع العقار على الخريطة', invalid_type_error: 'حدد موقع العقار على الخريطة' }).min(-90).max(90),
  lng: z.coerce.number({ required_error: 'حدد موقع العقار على الخريطة', invalid_type_error: 'حدد موقع العقار على الخريطة' }).min(-180).max(180),
  description: requiredText('وصف المشكلة', 3000),
  problemLocation: optionalText(300),
  notes: optionalText(1500),
  date: dateField,
  time: timeField,
  /** المبلغ الذي رآه العميل — إن تغيّر السعر قبل الإرسال نطلب منه المراجعة */
  expectedTotal: z.coerce.number().min(0),
  /** إجابات الحقول الإضافية التي يحددها المدير للخدمة */
  extra: z.record(z.union([z.string().max(3000), z.number(), z.array(z.string().max(200)).max(30)])).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'يجب الموافقة على الشروط وملخص السعر قبل تأكيد الحجز' }) }),
});

const upload = memoryUpload(40, MAX_PHOTOS + MAX_DOCUMENTS + 1).fields([
  { name: 'photos', maxCount: MAX_PHOTOS },
  { name: 'video', maxCount: 1 },
  /** مخططات الموقع وملفات PDF/CAD */
  { name: 'documents', maxCount: MAX_DOCUMENTS },
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
    const documents = files.documents ?? [];
    photos.forEach((f) => validateFile(f, POLICIES.photos));
    documents.forEach((f) => validateFile(f, POLICIES.technical));
    videos.forEach((f) => validateFile(f, { kinds: ['VIDEO'], maxBytes: { VIDEO: 40 * 1024 * 1024 } }));

    const main = await prisma.siteService.findFirst({ where: { id: input.serviceIds[0], active: true, deletedAt: null }, select: { requestTypes: true, formFields: true } });
    if (!main) throw badRequest('الخدمة غير متاحة حاليًا');
    if (!main.requestTypes.includes(input.requestType)) throw badRequest('نوع الطلب غير متاح لهذه الخدمة', { field: 'requestType' });
    const extra = resolveExtra(main.formFields, input.extra);

    const price = await priceVisit(input);
    if (Math.abs(price.total - input.expectedTotal) > 0.0005) {
      throw new HttpError(409, 'تغيّر السعر منذ فتح الصفحة. راجع الملخص الجديد ثم أكّد الحجز.', 'PRICE_CHANGED', { total: price.total });
    }

    // الموعد: ضمن أيام وساعات العمل المعروضة
    const day = await getServiceDaySlots(input.date);
    const slot = day.slots.find((s) => s.time === input.time);
    if (!day.open || !slot || slot.reason === 'past') throw badRequest('اختر يومًا ووقتًا من الأوقات المعروضة', { field: 'time' });
    if (slot.reason === 'booked') throw new HttpError(409, 'هذا الموعد اكتمل للتو. اختر موعدًا آخر.', 'SLOT_TAKEN', { field: 'time' });
    if (input.phone2.replace(/\D/g, '').slice(-9) === input.phone.replace(/\D/g, '').slice(-9)) throw badRequest('الرقم الثانوي يجب أن يختلف عن الرقم الأساسي', { field: 'phone2' });
    const scheduledAt = ammanToUtc(input.date, input.time);

    const stored = [
      ...(await validateAndStore(photos, POLICIES.photos, 'services')),
      ...(await validateAndStore(videos, { kinds: ['VIDEO'], maxBytes: { VIDEO: 40 * 1024 * 1024 } }, 'services')),
    ];
    const storedDocs = await validateAndStore(documents, POLICIES.technical, 'services/documents');

    const created = await prisma.$transaction(async (tx) => {
      const customer = await accountCustomer(tx, req.auth!.sub);
      const r = await tx.serviceRequest.create({
        data: {
          ref: makeRef('S'),
          customerId: customer.id,
          requestType: input.requestType,
          name: input.name,
          phone: input.phone,
          phoneWhatsapp: input.phoneWhatsapp,
          phone2: input.phone2,
          phone2Whatsapp: input.phone2Whatsapp,
          clientType: input.clientType,
          propertyType: input.propertyType,
          ownership: input.ownership ?? null,
          urgency: price.urgency,
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
          extra: extra as Prisma.InputJsonValue,
          priceLines: price.lines as Prisma.InputJsonValue,
          total: new Prisma.Decimal(price.total),
          visitFeePolicy: price.visitFeePolicy,
          needsApproval: price.zone.requiresApproval,
          termsAcceptedAt: new Date(),
          media: {
            create: [
              ...stored.map((f) => ({ kind: f.kind, url: f.url, publicId: f.publicId, originalName: f.originalName })),
              ...storedDocs.map((f) => ({ kind: f.kind, purpose: 'customer_document', url: f.url, publicId: f.publicId, originalName: f.originalName })),
            ],
          },
        },
      });
      await logEvent(tx, r.id, { kind: 'created', to: 'NEW', actorName: input.name, note: `حُجز بسعر ${price.total} د.أ` });
      return r;
    });

    const text = serviceRequestMessage({ ...created, total: price.total, services: price.services, problems: price.problems, devices: price.devices.filter((d) => !d.inPackage), extra, scopePriced: price.hasScopePricing, urgency: price.urgency });
    const wa = await notifyAdmin(text, { entityType: 'service_request', entityId: created.id });
    emitAdmin({ type: 'service_request.created', id: created.id, title: `طلب معاينة #${created.number} — ${price.services[0].name}` });
    await audit({ actorType: 'customer', actorId: req.auth!.sub, action: 'create', entity: 'service_request', entityId: created.id });

    ok(res, { id: created.id, number: created.number, ref: created.ref, status: created.status, total: price.total, scheduledAt: created.scheduledAt, message: text, whatsapp: { link: wa.link, sent: wa.sent } }, 201);
  }),
);

