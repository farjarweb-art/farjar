import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { emitAdmin } from '../../lib/events';
import { asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { requireCustomer } from '../../middleware/auth';
import { CUSTOMER_CANCELLABLE, REQUEST_TYPE_AR, SR_STATUS_AR, logEvent } from '../../services/siteServices.service';

/** طلبات المعاينات والصيانة للعميل: المتابعة، الإلغاء، التقرير، والموافقة على عرض سعر الإصلاح */
export const customerServiceRequestsRouter = Router();
customerServiceRequestsRouter.use(requireCustomer);

const own = async (customerId: string, id: string) => {
  const r = await prisma.serviceRequest.findFirst({ where: { id, customerId, deletedAt: null } });
  if (!r) throw notFound('الطلب غير موجود');
  return r;
};

customerServiceRequestsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await prisma.serviceRequest.findMany({
      where: { customerId: req.auth!.sub, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, number: true, ref: true, status: true, requestType: true, services: true, scheduledAt: true, total: true, zoneName: true, createdAt: true, report: { select: { published: true } }, quotes: { where: { status: 'SENT' }, select: { id: true } } },
    });
    ok(
      res,
      rows.map(({ report, quotes, ...r }) => ({ ...r, total: Number(r.total), statusLabel: SR_STATUS_AR[r.status], requestTypeLabel: REQUEST_TYPE_AR[r.requestType], hasReport: !!report?.published, pendingQuotes: quotes.length })),
    );
  }),
);

customerServiceRequestsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const r = await prisma.serviceRequest.findFirst({
      where: { id: req.params.id, customerId: req.auth!.sub, deletedAt: null },
      include: {
        media: { orderBy: { createdAt: 'asc' } },
        events: { where: { kind: { in: ['created', 'status', 'schedule', 'technician', 'work'] } }, orderBy: { createdAt: 'asc' } },
        report: true,
        quotes: { where: { status: { not: 'DRAFT' } }, orderBy: { number: 'asc' } },
        technician: { select: { name: true } },
      },
    });
    if (!r) throw notFound('الطلب غير موجود');
    const { adminNotes: _a, report, quotes, events, media, ...rest } = r;
    ok(res, {
      ...rest,
      total: Number(r.total),
      statusLabel: SR_STATUS_AR[r.status],
      requestTypeLabel: REQUEST_TYPE_AR[r.requestType],
      canCancel: CUSTOMER_CANCELLABLE.includes(r.status),
      media: media.filter((m) => m.purpose === 'customer' || report?.published),
      // اسم الموظف لا يظهر للعميل
      events: events.map((e) => ({ id: e.id, kind: e.kind, toStatus: e.toStatus, toStatusLabel: e.toStatus ? SR_STATUS_AR[e.toStatus] : null, note: e.kind === 'work' || e.kind === 'schedule' ? e.note : null, createdAt: e.createdAt })),
      report: report?.published ? report : null,
      quotes: quotes.map((q) => ({ ...q, subtotal: Number(q.subtotal), visitFeeDeduction: Number(q.visitFeeDeduction), total: Number(q.total) })),
    });
  }),
);

customerServiceRequestsRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const r = await own(req.auth!.sub, req.params.id);
    if (!CUSTOMER_CANCELLABLE.includes(r.status)) throw badRequest('لا يمكن إلغاء الطلب بعد تأكيد الموعد — تواصل معنا لإلغائه أو تعديله.');
    const { reason } = z.object({ reason: z.string().trim().max(500).optional() }).parse(req.body ?? {});
    await prisma.$transaction(async (tx) => {
      await tx.serviceRequest.update({ where: { id: r.id }, data: { status: 'CANCELLED' } });
      await logEvent(tx, r.id, { kind: 'status', from: r.status, to: 'CANCELLED', note: reason ? `ألغاه العميل: ${reason}` : 'ألغاه العميل', actorName: r.name });
    });
    emitAdmin({ type: 'service_request.updated', id: r.id, title: `ألغى العميل طلب المعاينة #${r.number}` });
    await audit({ actorType: 'customer', actorId: req.auth!.sub, action: 'cancel', entity: 'service_request', entityId: r.id });
    ok(res, { status: 'CANCELLED' });
  }),
);

/** موافقة أو رفض عرض سعر الإصلاح */
customerServiceRequestsRouter.post(
  '/:id/quotes/:quoteId/:decision(accept|reject)',
  asyncHandler(async (req, res) => {
    const r = await own(req.auth!.sub, req.params.id);
    const accept = req.params.decision === 'accept';
    const { note } = z.object({ note: z.string().trim().max(500).optional() }).parse(req.body ?? {});
    const result = await prisma.$transaction(async (tx) => {
      const q = await tx.serviceQuote.findFirst({ where: { id: req.params.quoteId, requestId: r.id } });
      if (!q) throw notFound('عرض السعر غير موجود');
      if (q.status !== 'SENT') throw badRequest('تم الرد على عرض السعر هذا مسبقًا');
      if (q.validUntil && q.validUntil.getTime() < Date.now()) throw badRequest('انتهت صلاحية عرض السعر — تواصل معنا لتحديثه');
      // ذرّي: لا يُقبل عرضان معًا ولا يرد العميل مرتين
      const done = await tx.serviceQuote.updateMany({ where: { id: q.id, status: 'SENT' }, data: { status: accept ? 'ACCEPTED' : 'REJECTED', respondedAt: new Date() } });
      if (!done.count) throw badRequest('تم الرد على عرض السعر هذا مسبقًا');
      let status = r.status;
      if (accept) {
        await tx.serviceQuote.updateMany({ where: { requestId: r.id, status: 'SENT', id: { not: q.id } }, data: { status: 'REJECTED', respondedAt: new Date() } });
        if (r.status !== 'CANCELLED' && r.status !== 'CLOSED') {
          await tx.serviceRequest.update({ where: { id: r.id }, data: { status: 'REPAIR_APPROVED' } });
          status = 'REPAIR_APPROVED';
        }
      }
      await logEvent(tx, r.id, {
        kind: accept ? 'status' : 'quote',
        from: accept ? r.status : null,
        to: accept ? status : null,
        note: `${accept ? 'وافق العميل على' : 'رفض العميل'} عرض سعر الإصلاح رقم ${q.number} (${Number(q.total)} د.أ)${note ? ` — ${note}` : ''}`,
        actorName: r.name,
      });
      return { status, quoteStatus: accept ? 'ACCEPTED' : 'REJECTED' };
    });
    emitAdmin({ type: 'service_request.updated', id: r.id, title: `${accept ? 'موافقة' : 'رفض'} عرض إصلاح — طلب #${r.number}` });
    await audit({ actorType: 'customer', actorId: req.auth!.sub, action: accept ? 'quote_accept' : 'quote_reject', entity: 'service_request', entityId: r.id });
    ok(res, result);
  }),
);
