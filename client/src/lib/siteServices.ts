import type { WhatsAppResult } from './types';

/** نظام الخدمات والمعاينات والصيانة — أنواع البيانات والتسميات المشتركة */

export type Audience = 'HOME' | 'BUSINESS';
export type PriceTier = 'INSIDE_AMMAN' | 'OUTSIDE_AMMAN';
export type RequestType = 'INSPECTION' | 'INSPECTION_REPORT' | 'DIAGNOSIS' | 'REPAIR_QUOTE' | 'REPAIR' | 'PREVENTIVE' | 'CONTRACT';
export type ClientType = 'INDIVIDUAL' | 'COMPANY' | 'FACTORY' | 'WAREHOUSE' | 'WORKSHOP';
export type VisitFeePolicy = 'DEDUCTIBLE' | 'SEPARATE';
export type SrStatus =
  | 'NEW'
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'TECH_ASSIGNED'
  | 'VISIT_IN_PROGRESS'
  | 'INSPECTED'
  | 'REPORT_IN_PROGRESS'
  | 'REPORT_SENT'
  | 'AWAITING_APPROVAL'
  | 'REPAIR_APPROVED'
  | 'REPAIR_IN_PROGRESS'
  | 'WORK_DONE'
  | 'CLOSED'
  | 'CANCELLED';
export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';

export const AUDIENCE_LABEL: Record<Audience, string> = {
  HOME: 'المنازل والشقق والفلل',
  BUSINESS: 'الشركات والمصانع والمستودعات والورش',
};

export const TIER_LABEL: Record<PriceTier, string> = { INSIDE_AMMAN: 'داخل عمّان', OUTSIDE_AMMAN: 'خارج عمّان' };

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  INSPECTION: 'معاينة فنية فقط',
  INSPECTION_REPORT: 'معاينة مع تقرير فني',
  DIAGNOSIS: 'كشف عن مشكلة محددة',
  REPAIR_QUOTE: 'عرض سعر للإصلاح أو التنفيذ',
  REPAIR: 'صيانة أو إصلاح',
  PREVENTIVE: 'صيانة وقائية',
  CONTRACT: 'عقد صيانة دوري أو سنوي',
};

export const CLIENT_TYPE_LABEL: Record<ClientType, string> = {
  INDIVIDUAL: 'فرد',
  COMPANY: 'شركة',
  FACTORY: 'مصنع',
  WAREHOUSE: 'مستودع',
  WORKSHOP: 'ورشة',
};

/** أنواع العقار المقترحة حسب نوع العميل */
export const PROPERTY_TYPES: Record<ClientType, string[]> = {
  INDIVIDUAL: ['شقة', 'منزل مستقل', 'فيلا', 'عمارة سكنية', 'محل تجاري'],
  COMPANY: ['مكاتب', 'مبنى إداري', 'محل / معرض', 'مطعم أو مقهى', 'مدرسة أو مركز'],
  FACTORY: ['مصنع', 'خط إنتاج', 'منشأة صناعية'],
  WAREHOUSE: ['مستودع', 'هنجر', 'مخزن مبرد'],
  WORKSHOP: ['ورشة', 'كراج', 'منشأة حرفية'],
};

export const STATUS_LABEL: Record<SrStatus, string> = {
  NEW: 'طلب جديد',
  PENDING_CONFIRMATION: 'بانتظار تأكيد الحجز',
  CONFIRMED: 'تم تأكيد الحجز',
  TECH_ASSIGNED: 'تم تعيين الفني',
  VISIT_IN_PROGRESS: 'الزيارة قيد التنفيذ',
  INSPECTED: 'تمت المعاينة',
  REPORT_IN_PROGRESS: 'التقرير الفني قيد الإعداد',
  REPORT_SENT: 'تم إرسال التقرير أو عرض السعر',
  AWAITING_APPROVAL: 'بانتظار موافقتك على الإصلاح',
  REPAIR_APPROVED: 'تم اعتماد الإصلاح',
  REPAIR_IN_PROGRESS: 'أعمال الإصلاح قيد التنفيذ',
  WORK_DONE: 'تم إنجاز العمل',
  CLOSED: 'تم إغلاق الطلب',
  CANCELLED: 'ملغي',
};

/** مراحل الطلب بالترتيب (لشريط التقدم) */
export const STATUS_FLOW: SrStatus[] = [
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

export function statusTone(s: SrStatus): 'neutral' | 'brand' | 'sand' | 'danger' | 'success' | 'dark' {
  if (s === 'CANCELLED') return 'danger';
  if (s === 'CLOSED' || s === 'WORK_DONE') return 'success';
  if (s === 'NEW' || s === 'PENDING_CONFIRMATION' || s === 'AWAITING_APPROVAL') return 'sand';
  return 'brand';
}

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = { DRAFT: 'مسودة', SENT: 'بانتظار الرد', ACCEPTED: 'مقبول', REJECTED: 'مرفوض' };

export type ServiceCard = {
  id: string;
  name: string;
  slug: string;
  summary: string;
  audiences: Audience[];
  priceInside: number;
  priceOutside: number;
  discountPercent: number;
  featured: boolean;
  hasProblems: boolean;
  priceOnRequest: boolean;
};

/** حقل إضافي في نموذج الحجز يحدده المدير لكل خدمة */
export type FormField = { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'select' | 'multiselect'; options?: string[]; required?: boolean; hint?: string; active?: boolean };
export type ExtraAnswer = { key: string; label: string; value: string };

export const SCOPE_PRICED = 'يحدد بعد مراجعة نطاق المشروع';

export type Zone = { id: string; name: string; tier: PriceTier; travelFee: number; requiresApproval: boolean };

export type ServiceDetail = {
  service: {
    id: string;
    name: string;
    slug: string;
    summary: string;
    includes: string[];
    audiences: Audience[];
    requestTypes: { value: RequestType; label: string }[];
    priceInside: number;
    priceOutside: number;
    travelFee: number;
    discountPercent: number;
    durationMinutes: number;
    visitFeePolicy: VisitFeePolicy;
    visitFeePolicyText: string;
    terms: string;
    featured: boolean;
    optionsLabel: string;
    priceOnRequest: boolean;
    deliverables: string[];
    formFields: FormField[];
    problems: { id: string; name: string; isOther: boolean; description: string[]; quoteRequired: boolean; deviceIds: string[] }[];
    devices: { id: string; name: string; description: string; fee: number; included: boolean }[];
    bundles: { id: string; name: string; priceInside: number; priceOutside: number; terms: string }[];
  };
  combinable: { id: string; name: string; slug: string; priceInside: number; priceOutside: number }[];
  zones: Zone[];
  clientTypes: { value: ClientType; label: string }[];
  generalTerms: string[];
};

/** quote: بند يُسعَّر لاحقًا بعرض سعر مستقل */
export type PriceLine = { kind: 'visit' | 'bundle' | 'discount' | 'device' | 'travel' | 'quote'; label: string; amount: number };

export type VisitQuote = {
  tier: PriceTier;
  zone: { id: string; name: string; requiresApproval: boolean };
  services: { id: string; name: string; slug: string }[];
  problems: { id: string; name: string }[];
  devices: { id: string; name: string; fee: number; included: boolean }[];
  lines: PriceLine[];
  total: number;
  visitFeePolicy: VisitFeePolicy;
  terms: string[];
  durationMinutes: number;
  hasScopePricing: boolean;
};

export type RequestCreated = { id: string; number: number; ref: string; status: SrStatus; total: number; scheduledAt: string; message: string; whatsapp: WhatsAppResult };

/** الأجهزة المناسبة للمشكلات المختارة (نفس قاعدة السيرفر) */
export function allowedDevices(service: ServiceDetail['service'], problemIds: string[]) {
  if (!service.problems.length) return service.devices;
  const chosen = service.problems.filter((p) => problemIds.includes(p.id));
  if (chosen.some((p) => p.isOther)) return service.devices;
  const ids = new Set(chosen.flatMap((p) => p.deviceIds));
  return service.devices.filter((d) => ids.has(d.id));
}

export type QuoteItem = { description: string; qty: number; unitPrice: number };

export type ServiceQuote = {
  id: string;
  number: number;
  title: string;
  items: QuoteItem[];
  subtotal: number;
  visitFeeDeduction: number;
  total: number;
  notes: string;
  validUntil: string | null;
  status: QuoteStatus;
  sentAt: string | null;
  respondedAt: string | null;
  createdAt: string;
};

export type ServiceReport = {
  findings: string;
  devicesUsed: string;
  recommendations: string;
  repairsNeeded: string;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

export type RequestMedia = { id: string; kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; purpose: string; url: string; originalName: string | null };

/** الحقول المشتركة لتفاصيل الطلب (للعميل وللإدارة) */
export type RequestCore = {
  id: string;
  number: number;
  ref: string;
  status: SrStatus;
  statusLabel: string;
  requestType: RequestType;
  requestTypeLabel: string;
  name: string;
  phone: string;
  clientType: ClientType;
  propertyType: string;
  zoneName: string;
  tier: PriceTier;
  area: string;
  address: string;
  lat: number | null;
  lng: number | null;
  description: string;
  problemLocation: string | null;
  notes: string | null;
  scheduledAt: string;
  services: { id: string; name: string; slug: string }[];
  problems: { id: string; name: string }[];
  devices: { id: string; name: string; fee: number; included: boolean }[];
  extra: ExtraAnswer[];
  priceLines: PriceLine[];
  total: number;
  visitFeePolicy: VisitFeePolicy;
  needsApproval: boolean;
  termsAcceptedAt: string;
  createdAt: string;
  media: RequestMedia[];
  report: ServiceReport | null;
  quotes: ServiceQuote[];
  technician: { id?: string; name: string; phone?: string } | null;
};

export const POLICY_TEXT: Record<VisitFeePolicy, string> = {
  DEDUCTIBLE: 'رسوم الزيارة تُخصم من قيمة أعمال الإصلاح عند الموافقة على تنفيذها.',
  SEPARATE: 'رسوم الزيارة مستقلة عن قيمة أعمال الإصلاح.',
};

/** عناوين مقترحة لعروض الأسعار المستقلة */
export const QUOTE_TITLES = ['الإصلاح', 'الدراسة', 'التصميم', 'التصنيع والتركيب', 'التنفيذ', 'عقد صيانة'];

/** هل في السطور بند يُسعَّر لاحقًا؟ */
export const hasScope = (lines: PriceLine[]) => lines.some((l) => l.kind === 'quote');

/** ملفات العميل ومستندات المشروع (مخططات، تصاميم، تقارير) */
export const isDocumentMedia = (m: { purpose: string }) => m.purpose === 'document' || m.purpose === 'customer_document';

/** يملأ الحقول الجديدة بقيم افتراضية (حماية أثناء النشر إن سبقت الواجهةُ تحديثَ السيرفر) */
export function normalizeDetail(d: ServiceDetail): ServiceDetail {
  const s = d.service;
  return {
    ...d,
    service: {
      ...s,
      optionsLabel: s.optionsLabel ?? '',
      priceOnRequest: !!s.priceOnRequest,
      deliverables: s.deliverables ?? [],
      formFields: s.formFields ?? [],
      problems: s.problems.map((p) => ({ ...p, description: p.description ?? [], quoteRequired: !!p.quoteRequired })),
    },
  };
}
