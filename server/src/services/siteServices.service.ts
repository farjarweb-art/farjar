import type { ClientType, Prisma, ServiceRequestStatus, ServiceRequestType } from '@prisma/client';
import { prisma } from '../lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

export const REQUEST_TYPE_AR: Record<ServiceRequestType, string> = {
  INSPECTION: 'معاينة فنية فقط',
  INSPECTION_REPORT: 'معاينة مع تقرير فني',
  DIAGNOSIS: 'كشف عن مشكلة محددة',
  REPAIR_QUOTE: 'عرض سعر للإصلاح أو التنفيذ',
  REPAIR: 'صيانة أو إصلاح',
  PREVENTIVE: 'صيانة وقائية',
  CONTRACT: 'عقد صيانة دوري أو سنوي',
};

export const CLIENT_TYPE_AR: Record<ClientType, string> = {
  INDIVIDUAL: 'فرد',
  COMPANY: 'شركة',
  FACTORY: 'مصنع',
  WAREHOUSE: 'مستودع',
  WORKSHOP: 'ورشة',
};

export const SR_STATUS_AR: Record<ServiceRequestStatus, string> = {
  NEW: 'طلب جديد',
  PENDING_CONFIRMATION: 'بانتظار تأكيد الحجز',
  CONFIRMED: 'تم تأكيد الحجز',
  TECH_ASSIGNED: 'تم تعيين الفني',
  VISIT_IN_PROGRESS: 'الزيارة قيد التنفيذ',
  INSPECTED: 'تمت المعاينة',
  REPORT_IN_PROGRESS: 'التقرير الفني قيد الإعداد',
  REPORT_SENT: 'تم إرسال التقرير أو عرض السعر',
  AWAITING_APPROVAL: 'بانتظار موافقة العميل على الإصلاح',
  REPAIR_APPROVED: 'تم اعتماد الإصلاح',
  REPAIR_IN_PROGRESS: 'أعمال الإصلاح قيد التنفيذ',
  WORK_DONE: 'تم إنجاز العمل',
  CLOSED: 'تم إغلاق الطلب',
  CANCELLED: 'ملغي',
};

/** ترتيب المراحل — للتقدّم التلقائي (لا يُرجع الطلب لمرحلة سابقة) */
export const SR_FLOW: ServiceRequestStatus[] = [
  'NEW',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'TECH_ASSIGNED',
  'VISIT_IN_PROGRESS',
  'INSPECTED',
  'REPORT_IN_PROGRESS',
  'REPORT_SENT',
  'AWAITING_APPROVAL',
  'REPAIR_APPROVED',
  'REPAIR_IN_PROGRESS',
  'WORK_DONE',
  'CLOSED',
];

/** حالات تُحتسب فيها رسوم الزيارة كإيراد منجز (تمت المعاينة فما بعد) */
export const VISITED: ServiceRequestStatus[] = SR_FLOW.slice(SR_FLOW.indexOf('INSPECTED'));

/** العميل يستطيع الإلغاء قبل تأكيد الموعد فقط */
export const CUSTOMER_CANCELLABLE: ServiceRequestStatus[] = ['NEW', 'PENDING_CONFIRMATION'];

export const isBefore = (a: ServiceRequestStatus, b: ServiceRequestStatus) => SR_FLOW.indexOf(a) >= 0 && SR_FLOW.indexOf(a) < SR_FLOW.indexOf(b);

export async function logEvent(
  db: Db,
  requestId: string,
  e: { kind: 'created' | 'status' | 'schedule' | 'technician' | 'work' | 'note' | 'report' | 'quote'; from?: ServiceRequestStatus | null; to?: ServiceRequestStatus | null; note?: string | null; actorId?: string | null; actorName?: string | null },
) {
  await db.serviceRequestEvent.create({
    data: { requestId, kind: e.kind, fromStatus: e.from ?? null, toStatus: e.to ?? null, note: e.note ?? null, actorId: e.actorId ?? null, actorName: e.actorName ?? null },
  });
}

/** ينقل الطلب لمرحلة أبعد فقط (لا يرجعه) ويسجل ذلك */
export async function advanceStatus(db: Db, req: { id: string; status: ServiceRequestStatus }, to: ServiceRequestStatus, actor: { id?: string | null; name?: string | null }, note?: string) {
  if (!isBefore(req.status, to)) return req.status;
  await db.serviceRequest.update({ where: { id: req.id }, data: { status: to } });
  await logEvent(db, req.id, { kind: 'status', from: req.status, to, note, actorId: actor.id, actorName: actor.name });
  return to;
}

export const money = (n: number) => `${n.toFixed(3).replace(/\.?0+$/, '') || '0'} د.أ`;

export function serviceRequestMessage(r: {
  number: number;
  ref: string;
  name: string;
  phone: string;
  requestType: ServiceRequestType;
  clientType: ClientType;
  propertyType: string;
  zoneName: string;
  area: string;
  address: string;
  scheduledAt: Date;
  total: number;
  services: { name: string }[];
  problems: { name: string }[];
  devices: { name: string }[];
  needsApproval: boolean;
}) {
  const when = r.scheduledAt.toLocaleString('ar-JO', { timeZone: 'Asia/Amman', dateStyle: 'full', timeStyle: 'short' });
  return [
    `🛠️ طلب معاينة/صيانة جديد #${r.number} (${r.ref})`,
    `الخدمة: ${r.services.map((s) => s.name).join('، ')}`,
    `نوع الطلب: ${REQUEST_TYPE_AR[r.requestType]}`,
    r.problems.length ? `المشكلة: ${r.problems.map((p) => p.name).join('، ')}` : '',
    r.devices.length ? `الأجهزة: ${r.devices.map((d) => d.name).join('، ')}` : '',
    `العميل: ${r.name} — ${r.phone} (${CLIENT_TYPE_AR[r.clientType]} · ${r.propertyType})`,
    `الموقع: ${r.zoneName} — ${r.area} — ${r.address}`,
    `الموعد المطلوب: ${when}`,
    `الإجمالي المعتمد: ${money(r.total)}`,
    r.needsApproval ? '⚠️ المنطقة تحتاج موافقة مسبقة' : '',
  ]
    .filter(Boolean)
    .join('\n');
}
