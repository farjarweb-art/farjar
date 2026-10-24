import { Prisma, type ServiceRequestStatus } from '@prisma/client';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { ammanToUtc } from '../../lib/time';
import { memoryUpload, uploadGuard } from '../../middleware/upload';
import { notify } from '../../services/notifications.service';
import { CLIENT_TYPE_AR, REQUEST_TYPE_AR, SR_FLOW, SR_STATUS_AR, VISITED, advanceStatus, logEvent } from '../../services/siteServices.service';
import { POLICIES, deleteStored, validateAndStore, validateFile } from '../../services/upload.service';
import { dateField, timeField } from '../../validators/common';

/** إدارة طلبات المعاينات والصيانة: الحالة، الفني، الموعد، سجل الأعمال، التقرير الفني، وعروض أسعار الإصلاح */
export const serviceRequestsAdminRouter = Router();

const STATUSES = [...SR_FLOW, 'CANCELLED'] as unknown as [ServiceRequestStatus, ...ServiceRequestStatus[]];
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const actor = (req: Request) => ({ id: req.auth!.sub, name: req.auth!.name });

async function load(id: string) {
  const r = await prisma.serviceRequest.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw notFound('الطلب غير موجود');
  return r;
}

async function tellCustomer(r: { id: string; customerId: string; phone: string; number: number }, title: string, body: string) {
  await notify(prisma, [{ type: 'CUSTOMER', customerId: r.customerId, phone: r.phone }], { title, body, link: `/account/services/${r.id}`, whatsapp: true });
}

const listQuery = z.object({
  status: z.enum(STATUSES).optional().or(z.literal('').transform(() => undefined)),
  q: z.string().trim().max(100).optional(),
  technicianId: z.string().max(40).optional().or(z.literal('').transform(() => undefined)),
  from: dateField.optional().or(z.literal('').transform(() => undefined)),
  to: dateField.optional().or(z.literal('').transform(() => undefined)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

function listWhere(q: z.infer<typeof listQuery>): Prisma.ServiceRequestWhereInput {
  const num = q.q && /^\d+$/.test(q.q) ? Number(q.q) : null;
  return {
    deletedAt: null,
    ...(q.status ? { status: q.status } : {}),
    ...(q.technicianId ? { technicianId: q.technicianId } : {}),
    ...(q.from || q.to ? { scheduledAt: { ...(q.from ? { gte: ammanToUtc(q.from, '00:00') } : {}), ...(q.to ? { lt: new Date(ammanToUtc(q.to, '00:00').getTime() + 86400_000) } : {}) } } : {}),
    ...(q.q
      ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }, { ref: { contains: q.q.toUpperCase() } }, ...(num != null && num < 2 ** 31 ? [{ number: num }] : [])] }
      : {}),
  };
}

serviceRequestsAdminRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const where = listWhere(q);
    const [items, total, counts] = await Promise.all([
      prisma.serviceRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { id: true, number: true, ref: true, status: true, requestType: true, name: true, phone: true, clientType: true, zoneName: true, tier: true, services: true, scheduledAt: true, total: true, needsApproval: true, urgency: true, createdAt: true, technician: { select: { id: true, name: true } } },
      }),
      prisma.serviceRequest.count({ where }),
      prisma.serviceRequest.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
    ]);
    ok(res, {
      items: items.map((r) => ({ ...r, total: Number(r.total), statusLabel: SR_STATUS_AR[r.status], requestTypeLabel: REQUEST_TYPE_AR[r.requestType] })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    });
  }),
);

/** الإيرادات والطلبات: رسوم الزيارات (المحجوزة والمنجزة) وقيمة أعمال الإصلاح المعتمدة */
serviceRequestsAdminRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const q = z.object({ from: dateField.optional(), to: dateField.optional() }).parse(req.query);
    const createdAt = q.from || q.to ? { ...(q.from ? { gte: ammanToUtc(q.from, '00:00') } : {}), ...(q.to ? { lt: new Date(ammanToUtc(q.to, '00:00').getTime() + 86400_000) } : {}) } : undefined;
    const base = { deletedAt: null, ...(createdAt ? { createdAt } : {}) };
    const [booked, visited, cancelled, byStatus, quotes, rows] = await Promise.all([
      prisma.serviceRequest.aggregate({ where: { ...base, status: { not: 'CANCELLED' } }, _sum: { total: true }, _count: true }),
      prisma.serviceRequest.aggregate({ where: { ...base, status: { in: VISITED } }, _sum: { total: true }, _count: true }),
      prisma.serviceRequest.count({ where: { ...base, status: 'CANCELLED' } }),
      prisma.serviceRequest.groupBy({ by: ['status'], where: base, _count: true }),
      prisma.serviceQuote.aggregate({ where: { status: 'ACCEPTED', request: base }, _sum: { total: true }, _count: true }),
      prisma.serviceRequest.findMany({ where: { ...base, status: { not: 'CANCELLED' } }, select: { services: true, total: true } }),
    ]);
    const byService = new Map<string, { name: string; count: number; total: number }>();
    for (const r of rows) {
      const main = (r.services as { id: string; name: string }[])[0];
      if (!main) continue;
      const e = byService.get(main.id) ?? { name: main.name, count: 0, total: 0 };
      e.count += 1;
      e.total = r3(e.total + Number(r.total));
      byService.set(main.id, e);
    }
    ok(res, {
      requests: booked._count,
      bookedFees: Number(booked._sum.total ?? 0),
      visits: visited._count,
      visitFees: Number(visited._sum.total ?? 0),
      cancelled,
      repairsApproved: quotes._count,
      repairsValue: Number(quotes._sum.total ?? 0),
      byStatus: byStatus.map((s) => ({ status: s.status, label: SR_STATUS_AR[s.status], count: s._count })),
      byService: [...byService.values()].sort((a, b) => b.count - a.count),
    });
  }),
);

serviceRequestsAdminRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const r = await prisma.serviceRequest.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        media: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'desc' } },
        report: true,
        quotes: { orderBy: { number: 'asc' } },
        technician: { select: { id: true, name: true, phone: true } },
        customer: { select: { id: true, name: true, phone: true, email: true, companyName: true } },
      },
    });
    if (!r) throw notFound('الطلب غير موجود');
    const [history, technicians] = await Promise.all([
      prisma.serviceRequest.findMany({
        where: { customerId: r.customerId, deletedAt: null, id: { not: r.id } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, number: true, status: true, services: true, total: true, createdAt: true },
      }),
      prisma.technician.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, specialty: true } }),
    ]);
    ok(res, {
      ...r,
      total: Number(r.total),
      statusLabel: SR_STATUS_AR[r.status],
      requestTypeLabel: REQUEST_TYPE_AR[r.requestType],
      clientTypeLabel: CLIENT_TYPE_AR[r.clientType],
      events: r.events.map((e) => ({ ...e, fromStatusLabel: e.fromStatus ? SR_STATUS_AR[e.fromStatus] : null, toStatusLabel: e.toStatus ? SR_STATUS_AR[e.toStatus] : null })),
      quotes: r.quotes.map((q) => ({ ...q, subtotal: Number(q.subtotal), visitFeeDeduction: Number(q.visitFeeDeduction), total: Number(q.total) })),
      history: history.map((h) => ({ ...h, total: Number(h.total), statusLabel: SR_STATUS_AR[h.status] })),
      technicians,
      statuses: STATUSES.map((s) => ({ value: s, label: SR_STATUS_AR[s] })),
    });
  }),
);

const patchInput = z.object({
  status: z.enum(STATUSES).optional(),
  technicianId: z.string().max(40).nullable().optional(),
  date: dateField.optional(),
  time: timeField.optional(),
  adminNotes: z.string().trim().max(3000).nullable().optional(),
  note: z.string().trim().max(1000).optional(),
});

serviceRequestsAdminRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = patchInput.parse(req.body);
    const r = await load(req.params.id);
    if ((input.date && !input.time) || (!input.date && input.time)) throw badRequest('حدد التاريخ والوقت معًا');
    const a = actor(req);
    const messages: string[] = [];
    await prisma.$transaction(async (tx) => {
      let status = r.status;
      if (input.technicianId !== undefined && input.technicianId !== r.technicianId) {
        const tech = input.technicianId ? await tx.technician.findFirst({ where: { id: input.technicianId, active: true } }) : null;
        if (input.technicianId && !tech) throw badRequest('الفني غير موجود أو غير فعال');
        await tx.serviceRequest.update({ where: { id: r.id }, data: { technicianId: tech?.id ?? null } });
        await logEvent(tx, r.id, { kind: 'technician', note: tech ? `تعيين الفني: ${tech.name}` : 'إلغاء تعيين الفني', actorId: a.id, actorName: a.name });
        // تعيين الفني ينقل الطلب لمرحلة "تم تعيين الفني" إن كان قبلها (دون تجاوز اختيار المدير للحالة)
        if (tech && !input.status) status = await advanceStatus(tx, { id: r.id, status }, 'TECH_ASSIGNED', a);
        if (tech) messages.push(`تم تعيين الفني ${tech.name} لزيارتك.`);
      }
      if (input.date && input.time) {
        const at = ammanToUtc(input.date, input.time);
        if (at.getTime() !== r.scheduledAt.getTime()) {
          await tx.serviceRequest.update({ where: { id: r.id }, data: { scheduledAt: at } });
          const when = at.toLocaleString('ar-JO', { timeZone: 'Asia/Amman', dateStyle: 'full', timeStyle: 'short' });
          await logEvent(tx, r.id, { kind: 'schedule', note: `موعد الزيارة: ${when}`, actorId: a.id, actorName: a.name });
          messages.push(`موعد زيارتك: ${when}`);
        }
      }
      if (input.status && input.status !== status) {
        await tx.serviceRequest.update({ where: { id: r.id }, data: { status: input.status } });
        await logEvent(tx, r.id, { kind: 'status', from: status, to: input.status, note: input.note, actorId: a.id, actorName: a.name });
        messages.push(`حالة طلبك: ${SR_STATUS_AR[input.status]}`);
      } else if (input.note) {
        await logEvent(tx, r.id, { kind: 'note', note: input.note, actorId: a.id, actorName: a.name });
      }
      if (input.adminNotes !== undefined) await tx.serviceRequest.update({ where: { id: r.id }, data: { adminNotes: input.adminNotes || null } });
    });
    if (messages.length) await tellCustomer(r, `طلب المعاينة #${r.number}`, messages.join('\n'));
    await audit({ actorType: 'admin', actorId: a.id, action: 'update', entity: 'service_request', entityId: r.id, meta: input as Prisma.InputJsonValue });
    ok(res, { id: r.id });
  }),
);

/** تسجيل أعمال الإصلاح والصيانة المنفذة */
serviceRequestsAdminRouter.post(
  '/:id/work',
  asyncHandler(async (req, res) => {
    const { note } = z.object({ note: z.string().trim().min(3, 'اكتب ما تم تنفيذه').max(2000) }).parse(req.body);
    const r = await load(req.params.id);
    const a = actor(req);
    await prisma.$transaction(async (tx) => {
      await logEvent(tx, r.id, { kind: 'work', note, actorId: a.id, actorName: a.name });
      if (r.status === 'REPAIR_APPROVED') await advanceStatus(tx, r, 'REPAIR_IN_PROGRESS', a);
    });
    ok(res, { saved: true }, 201);
  }),
);

// ───── التقرير الفني ─────

const reportInput = z.object({
  findings: z.string().trim().max(10_000).default(''),
  devicesUsed: z.string().trim().max(2000).default(''),
  recommendations: z.string().trim().max(10_000).default(''),
  repairsNeeded: z.string().trim().max(10_000).default(''),
  /** إحداثيات الموقع من جهاز الفني (تظهر في التقرير النهائي) */
  gpsLat: z.number().min(-90).max(90).nullable().optional(),
  gpsLng: z.number().min(-180).max(180).nullable().optional(),
  gpsAccuracy: z.number().min(0).max(100_000).nullable().optional(),
  gpsAt: z.coerce.date().nullable().optional(),
  publish: z.boolean().optional(),
});

serviceRequestsAdminRouter.put(
  '/:id/report',
  asyncHandler(async (req, res) => {
    const { publish, ...input } = reportInput.parse(req.body);
    const r = await load(req.params.id);
    if (publish && !input.findings) throw badRequest('اكتب النتائج والملاحظات الفنية قبل إرسال التقرير');
    const a = actor(req);
    const report = await prisma.$transaction(async (tx) => {
      const existing = await tx.serviceReport.findUnique({ where: { requestId: r.id } });
      const publishing = !!publish && !existing?.published;
      const saved = await tx.serviceReport.upsert({
        where: { requestId: r.id },
        create: { requestId: r.id, ...input, published: !!publish, publishedAt: publish ? new Date() : null },
        update: { ...input, ...(publish !== undefined ? { published: publish, publishedAt: publish ? existing?.publishedAt ?? new Date() : null } : {}) },
      });
      if (!existing) await advanceStatus(tx, r, 'REPORT_IN_PROGRESS', a);
      if (publishing) {
        await logEvent(tx, r.id, { kind: 'report', note: 'إرسال التقرير الفني للعميل', actorId: a.id, actorName: a.name });
        const current = (await tx.serviceRequest.findUniqueOrThrow({ where: { id: r.id }, select: { status: true } })).status;
        await advanceStatus(tx, { id: r.id, status: current }, 'REPORT_SENT', a);
      }
      return { saved, publishing };
    });
    if (report.publishing) await tellCustomer(r, `التقرير الفني جاهز — طلب #${r.number}`, 'يمكنك الاطلاع على التقرير الفني وتحميله من حسابك.');
    ok(res, report.saved);
  }),
);

const reportUpload = memoryUpload(8, 10).array('photos', 10);

serviceRequestsAdminRouter.post(
  '/:id/media',
  uploadGuard(85),
  reportUpload,
  asyncHandler(async (req, res) => {
    const r = await load(req.params.id);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest('اختر صورة واحدة على الأقل');
    files.forEach((f) => validateFile(f, POLICIES.photos));
    const stored = await validateAndStore(files, POLICIES.photos, 'services/reports');
    await prisma.serviceRequestMedia.createMany({ data: stored.map((f) => ({ requestId: r.id, kind: f.kind, purpose: 'report', url: f.url, publicId: f.publicId, originalName: f.originalName })) });
    ok(res, await prisma.serviceRequestMedia.findMany({ where: { requestId: r.id }, orderBy: { createdAt: 'asc' } }), 201);
  }),
);

/** مستندات المشروع (مخططات، تصاميم، تقارير، جداول كميات) — تظهر للعميل في طلبه */
const docUpload = memoryUpload(20, 6).array('files', 6);

serviceRequestsAdminRouter.post(
  '/:id/documents',
  uploadGuard(100),
  docUpload,
  asyncHandler(async (req, res) => {
    const r = await load(req.params.id);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest('اختر ملفًا واحدًا على الأقل');
    files.forEach((f) => validateFile(f, POLICIES.technical));
    const title = z.string().trim().max(120).optional().parse(req.body?.title || undefined);
    const stored = await validateAndStore(files, POLICIES.technical, 'services/documents');
    const a = actor(req);
    await prisma.$transaction(async (tx) => {
      await tx.serviceRequestMedia.createMany({
        data: stored.map((f) => ({ requestId: r.id, kind: f.kind, purpose: 'document', url: f.url, publicId: f.publicId, originalName: title ? `${title} — ${f.originalName}` : f.originalName })),
      });
      await logEvent(tx, r.id, { kind: 'note', note: `إرفاق مستندات للعميل: ${title ?? stored.map((f) => f.originalName).join('، ')}`, actorId: a.id, actorName: a.name });
    });
    await tellCustomer(r, `مستندات جديدة — طلب #${r.number}`, `أرفقنا ${stored.length} ملف${title ? ` (${title})` : ''} في طلبك. يمكنك تحميلها من حسابك.`);
    ok(res, { saved: stored.length }, 201);
  }),
);

serviceRequestsAdminRouter.delete(
  '/:id/media/:mediaId',
  asyncHandler(async (req, res) => {
    const m = await prisma.serviceRequestMedia.findFirst({ where: { id: req.params.mediaId, requestId: req.params.id, purpose: { in: ['report', 'document'] } } });
    if (!m) throw notFound('الصورة غير موجودة');
    await prisma.serviceRequestMedia.delete({ where: { id: m.id } });
    await deleteStored(m.publicId, m.kind);
    ok(res, { deleted: true });
  }),
);

// ───── عروض أسعار الإصلاح ─────

const quoteInput = z.object({
  /** نوع العرض: دراسة، تصميم، تصنيع وتركيب، إصلاح… */
  title: z.string().trim().max(120).default(''),
  items: z
    .array(z.object({ description: z.string().trim().min(2, 'اكتب وصف البند').max(400), qty: z.coerce.number().positive('الكمية أكبر من صفر').max(100_000), unitPrice: z.coerce.number().min(0).max(1_000_000) }))
    .min(1, 'أضف بندًا واحدًا على الأقل')
    .max(60),
  notes: z.string().trim().max(3000).default(''),
  validUntil: dateField.nullable().optional(),
  /** خصم رسوم الزيارة (الافتراضي حسب سياسة الخدمة المحفوظة في الطلب) */
  deductVisitFee: z.boolean().optional(),
  send: z.boolean().optional(),
});

function quoteTotals(r: { total: Prisma.Decimal; visitFeePolicy: string }, input: z.infer<typeof quoteInput>) {
  const items = input.items.map((i) => ({ ...i, qty: r3(i.qty), unitPrice: r3(i.unitPrice) }));
  const subtotal = r3(items.reduce((n, i) => n + i.qty * i.unitPrice, 0));
  const deduct = input.deductVisitFee ?? r.visitFeePolicy === 'DEDUCTIBLE';
  const visitFeeDeduction = deduct ? Math.min(Number(r.total), subtotal) : 0;
  return { items, subtotal, visitFeeDeduction: r3(visitFeeDeduction), total: r3(subtotal - visitFeeDeduction) };
}

async function sendQuote(req: Request, r: { id: string; status: ServiceRequestStatus; customerId: string; phone: string; number: number }, quote: { id: string; number: number; title: string; total: Prisma.Decimal | number }) {
  const a = actor(req);
  await prisma.$transaction(async (tx) => {
    await tx.serviceQuote.update({ where: { id: quote.id }, data: { status: 'SENT', sentAt: new Date() } });
    await logEvent(tx, r.id, { kind: 'quote', note: `إرسال عرض السعر رقم ${quote.number}${quote.title ? ` (${quote.title})` : ''} — ${Number(quote.total)} د.أ`, actorId: a.id, actorName: a.name });
    await advanceStatus(tx, r, 'AWAITING_APPROVAL', a);
  });
  await tellCustomer(r, `${quote.title || 'عرض سعر'} — طلب #${r.number}`, `أرسلنا لك عرض سعر${quote.title ? ` (${quote.title})` : ''} بقيمة ${Number(quote.total)} د.أ. راجعه ووافق عليه أو ارفضه من حسابك.`);
}

serviceRequestsAdminRouter.post(
  '/:id/quotes',
  asyncHandler(async (req, res) => {
    const input = quoteInput.parse(req.body);
    const r = await load(req.params.id);
    if (r.status === 'CANCELLED') throw badRequest('الطلب ملغي');
    const t = quoteTotals(r, input);
    const quote = await prisma.$transaction(async (tx) => {
      const last = await tx.serviceQuote.findFirst({ where: { requestId: r.id }, orderBy: { number: 'desc' }, select: { number: true } });
      return tx.serviceQuote.create({
        data: { requestId: r.id, number: (last?.number ?? 0) + 1, title: input.title, items: t.items, subtotal: t.subtotal, visitFeeDeduction: t.visitFeeDeduction, total: t.total, notes: input.notes, validUntil: input.validUntil ? ammanToUtc(input.validUntil, '23:59') : null },
      });
    });
    if (input.send) await sendQuote(req, r, quote);
    await audit({ actorType: 'admin', actorId: req.auth!.sub, action: 'create_quote', entity: 'service_request', entityId: r.id, meta: { quote: quote.number, total: t.total } });
    ok(res, { id: quote.id, number: quote.number, ...t }, 201);
  }),
);

serviceRequestsAdminRouter.patch(
  '/:id/quotes/:quoteId',
  asyncHandler(async (req, res) => {
    const input = quoteInput.parse(req.body);
    const r = await load(req.params.id);
    const q = await prisma.serviceQuote.findFirst({ where: { id: req.params.quoteId, requestId: r.id } });
    if (!q) throw notFound('عرض السعر غير موجود');
    if (q.status !== 'DRAFT') throw badRequest('لا يمكن تعديل عرض سعر بعد إرساله — أنشئ عرضًا جديدًا');
    const t = quoteTotals(r, input);
    const saved = await prisma.serviceQuote.update({
      where: { id: q.id },
      data: { title: input.title, items: t.items, subtotal: t.subtotal, visitFeeDeduction: t.visitFeeDeduction, total: t.total, notes: input.notes, validUntil: input.validUntil ? ammanToUtc(input.validUntil, '23:59') : null },
    });
    if (input.send) await sendQuote(req, r, saved);
    ok(res, { id: saved.id, ...t });
  }),
);

serviceRequestsAdminRouter.delete(
  '/:id/quotes/:quoteId',
  asyncHandler(async (req, res) => {
    const q = await prisma.serviceQuote.findFirst({ where: { id: req.params.quoteId, requestId: req.params.id } });
    if (!q) throw notFound('عرض السعر غير موجود');
    if (q.status !== 'DRAFT') throw badRequest('لا يمكن حذف عرض سعر بعد إرساله');
    await prisma.serviceQuote.delete({ where: { id: q.id } });
    ok(res, { deleted: true });
  }),
);
