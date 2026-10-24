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
export type Urgency = 'NORMAL' | 'URGENT' | 'EMERGENCY';

/** صفة العميل بالنسبة للعقار (نفس قائمة السيرفر) */
export const OWNERSHIP_OPTIONS = ['مالك العقار', 'مستأجر', 'مشتري محتمل (فحص قبل الشراء أو الاستئجار)', 'وكيل أو مدير عقار', 'مقاول أو مهندس'];

export const URGENCY_LABEL: Record<Urgency, string> = { NORMAL: 'زيارة عادية', URGENT: 'زيارة عاجلة', EMERGENCY: 'زيارة طارئة' };
export const URGENCY_HINT: Record<Urgency, string> = {
  NORMAL: 'موعد حسب جدول الفريق خلال أيام العمل',
  URGENT: 'أولوية في الجدولة لأقرب موعد متاح',
  EMERGENCY: 'حالة خطرة تحتاج تدخلًا فوريًا (تشققات متسارعة، هبوط، تسرب كبير)',
};

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
  priceUrgent?: number | null;
  priceEmergency?: number | null;
  priceOnRequest: boolean;
};

/** حقل إضافي في نموذج الحجز يحدده المدير لكل خدمة */
export type FormField = { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'select' | 'multiselect'; options?: string[]; required?: boolean; hint?: string; active?: boolean };
export type ExtraAnswer = { key: string; label: string; value: string };

export const SCOPE_PRICED = 'يحدد بعد مراجعة نطاق المشروع';
export const AREA_PRICED = 'يحدد حسب المساحة ونطاق العمل';

export type Zone = { id: string; name: string; tier: PriceTier; travelFee: number; requiresApproval: boolean; regions: string[] };

/** جهاز أو فحص إضافي كما يظهر للعميل */
export type ServiceDeviceInfo = {
  id: string;
  name: string;
  description: string;
  fee: number;
  included: boolean;
  imageUrl: string | null;
  mechanism: string;
  benefits: string[];
  /** معدات ثقيلة تُسعّر حسب المساحة */
  scopePriced: boolean;
  /** ملحق مجاني يُضاف مع جهازه الأب */
  parentId: string | null;
  /** يُضاف تلقائيًا مجانًا لكل حجز */
  autoInclude: boolean;
  accessoryIds: string[];
};

/** يزيل وسم "(إضافة مجانية 🎁)" من الاسم لعرضه كشارة منفصلة */
export const cleanDeviceName = (n: string) => n.replace(/\s*\(?إضافة مجانية\s*🎁\)?\s*/g, ' ').trim();

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
    priceUrgent: number | null;
    priceEmergency: number | null;
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
    devices: ServiceDeviceInfo[];
    bundles: { id: string; name: string; priceInside: number; priceOutside: number; terms: string }[];
  };
  combinable: { id: string; name: string; slug: string; priceInside: number; priceOutside: number }[];
  zones: Zone[];
  clientTypes: { value: ClientType; label: string }[];
  ownershipOptions: string[];
  generalTerms: string[];
};

/** quote: بند يُسعَّر لاحقًا بعرض سعر مستقل */
export type PriceLine = { kind: 'visit' | 'bundle' | 'discount' | 'device' | 'travel' | 'quote'; label: string; amount: number };

export type VisitQuote = {
  tier: PriceTier;
  zone: { id: string; name: string; requiresApproval: boolean };
  urgency: Urgency;
  services: { id: string; name: string; slug: string }[];
  problems: { id: string; name: string }[];
  devices: { id: string; name: string; fee: number; included: boolean; auto?: boolean; scopePriced?: boolean }[];
  lines: PriceLine[];
  total: number;
  visitFeePolicy: VisitFeePolicy;
  terms: string[];
  durationMinutes: number;
  hasScopePricing: boolean;
};

export type RequestCreated = { id: string; number: number; ref: string; status: SrStatus; total: number; scheduledAt: string; message: string; whatsapp: WhatsAppResult };

/** الأجهزة التي يختارها العميل حسب المشكلات المختارة (نفس قاعدة السيرفر) — بلا الملحقات والإضافات التلقائية */
export function allowedDevices(service: ServiceDetail['service'], problemIds: string[]) {
  const selectable = service.devices.filter((d) => !d.parentId && !d.autoInclude);
  if (!service.problems.length) return selectable;
  const chosen = service.problems.filter((p) => problemIds.includes(p.id));
  if (chosen.some((p) => p.isOther)) return selectable;
  const ids = new Set(chosen.flatMap((p) => p.deviceIds));
  return selectable.filter((d) => ids.has(d.id));
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
  gpsLat?: number | null;
  gpsLng?: number | null;
  gpsAccuracy?: number | null;
  gpsAt?: string | null;
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
  ownership?: string | null;
  urgency?: Urgency;
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
  /** تعديل الموقع: أجهزة أُضيفت ميدانيًا + خصم يدوي (السعر المعتمد يبقى كما هو) */
  onsiteDevices?: OnsiteDevice[];
  manualDiscount?: number;
  finalTotal?: number | null;
  adjustmentNote?: string | null;
  adjustedAt?: string | null;
  adjustedByName?: string | null;
};

export type OnsiteDevice = { id: string; name: string; fee: number; auto?: boolean };

/** الفاتورة النهائية: بنود الحجز + أجهزة الموقع − الخصم اليدوي */
export function finalPricing(r: Pick<RequestCore, 'priceLines' | 'total' | 'onsiteDevices' | 'manualDiscount' | 'finalTotal'>) {
  const adjusted = r.finalTotal != null;
  const lines: PriceLine[] = [...r.priceLines];
  for (const d of r.onsiteDevices ?? []) lines.push({ kind: 'device', label: d.auto ? `${d.name} — مع الجهاز المضاف` : `أُضيف في الموقع: ${d.name}`, amount: d.fee });
  if (r.manualDiscount) lines.push({ kind: 'discount', label: 'خصم إضافي', amount: -r.manualDiscount });
  return { adjusted, lines, total: r.finalTotal ?? r.total };
}

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
    ownershipOptions: d.ownershipOptions ?? [],
    zones: d.zones.map((z) => ({ ...z, regions: z.regions ?? [] })),
    service: {
      ...s,
      optionsLabel: s.optionsLabel ?? '',
      priceOnRequest: !!s.priceOnRequest,
      deliverables: s.deliverables ?? [],
      formFields: s.formFields ?? [],
      priceUrgent: s.priceUrgent ?? null,
      priceEmergency: s.priceEmergency ?? null,
      devices: s.devices.map((x) => ({ ...x, imageUrl: x.imageUrl ?? null, mechanism: x.mechanism ?? '', benefits: x.benefits ?? [], scopePriced: !!x.scopePriced, parentId: x.parentId ?? null, autoInclude: !!x.autoInclude, accessoryIds: x.accessoryIds ?? [] })),
      problems: s.problems.map((p) => ({ ...p, description: p.description ?? [], quoteRequired: !!p.quoteRequired })),
    },
  };
}

/** رابط خرائط جوجل لإحداثيات */
export const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
