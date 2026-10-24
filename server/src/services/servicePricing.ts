import type { PriceTier, Urgency, VisitFeePolicy } from '@prisma/client';
import { badRequest } from '../lib/http';
import { prisma } from '../lib/prisma';

/**
 * تسعير زيارات المعاينة والصيانة — سعر ثابت للزيارة الواحدة:
 *  - سعر زيارة لكل خدمة حسب المنطقة (داخل / خارج عمّان)، لا حسب المتر ولا الساعة ولا المدة
 *  - عند اختيار أكثر من خدمة تغطيها "زيارة مجمعة" يُحتسب سعرها الموحد بدل جمع الزيارات
 *  - الأجهزة الإضافية تُضاف برسومها فقط (أو مجانًا إن كانت مشمولة)، بلا زيارة جديدة
 *  - رسوم انتقال المنطقة + رسوم انتقال الخدمة (أعلاها مرة واحدة لأنها زيارة واحدة)
 * المبالغ بالدينار بثلاث خانات (فلس).
 */

/** quote: بند يُسعَّر لاحقًا بعرض سعر مستقل (مبلغه صفر هنا) */
export type PriceLine = { kind: 'visit' | 'bundle' | 'discount' | 'device' | 'travel' | 'quote'; label: string; amount: number };

export const SCOPE_PRICED = 'يحدد بعد مراجعة نطاق المشروع';
/** المعدات الثقيلة (تسليك تجاري، غسيل تدفئة) */
export const AREA_PRICED = 'يحدد حسب المساحة ونطاق العمل';
export const FREE_ADDON = 'إضافة مجانية 🎁';

export const URGENCY_AR: Record<Urgency, string> = { NORMAL: 'زيارة عادية', URGENT: 'زيارة عاجلة', EMERGENCY: 'زيارة طارئة' };

export type PricingInput = {
  serviceIds: string[];
  zoneId: string;
  problemIds?: string[];
  deviceIds?: string[];
  /** أولوية الزيارة — تنطبق على الخدمة الرئيسية إن كان لها سعر عاجل/طارئ */
  urgency?: Urgency;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));

export const TIER_AR: Record<PriceTier, string> = { INSIDE_AMMAN: 'داخل عمّان', OUTSIDE_AMMAN: 'خارج عمّان' };

const serviceInclude = {
  problems: { where: { active: true }, include: { devices: { select: { id: true } } } },
  devices: { include: { device: { include: { accessories: { where: { active: true } } } } } },
  bundles: { where: { active: true }, include: { services: { select: { id: true } } } },
} as const;

/** سعر الزيارة العاجلة/الطارئة للخدمة (null = غير متاح) */
export function urgencyPrice(s: { priceUrgent: unknown; priceEmergency: unknown }, urgency: Urgency) {
  const v = urgency === 'URGENT' ? s.priceUrgent : urgency === 'EMERGENCY' ? s.priceEmergency : null;
  return v == null ? null : Number(String(v));
}

/**
 * الأجهزة التي يختارها العميل للخدمة حسب المشكلات المختارة (المدير يحدد ربط الأجهزة بالمشكلات).
 * الملحقات (لها جهاز أب) والإضافات التلقائية لا تُختار — تُضاف وحدها مجانًا.
 */
export function allowedDeviceIds(
  service: {
    problems: { id: string; isOther: boolean; devices: { id: string }[] }[];
    devices: { deviceId: string; autoInclude?: boolean; device: { active: boolean; parentId?: string | null } }[];
  },
  problemIds: string[],
) {
  const linked = service.devices.filter((l) => l.device.active && !l.device.parentId && !l.autoInclude).map((l) => l.deviceId);
  if (!service.problems.length) return new Set(linked);
  const chosen = service.problems.filter((p) => problemIds.includes(p.id));
  if (chosen.some((p) => p.isOther)) return new Set(linked);
  const fromProblems = new Set(chosen.flatMap((p) => p.devices.map((d) => d.id)));
  return new Set(linked.filter((id) => fromProblems.has(id)));
}

/** يحسب السعر النهائي من الأسعار الحالية — يُستدعى للمعاينة قبل التأكيد وعند إنشاء الطلب */
export async function priceVisit(input: PricingInput) {
  const serviceIds = [...new Set(input.serviceIds)];
  if (!serviceIds.length) throw badRequest('اختر خدمة واحدة على الأقل');
  const [zone, rows] = await Promise.all([
    prisma.serviceZone.findFirst({ where: { id: input.zoneId, active: true } }),
    prisma.siteService.findMany({ where: { id: { in: serviceIds }, active: true, deletedAt: null }, include: serviceInclude }),
  ]);
  if (!zone) throw badRequest('اختر المحافظة / المنطقة من القائمة', { field: 'zoneId' });
  if (rows.length !== serviceIds.length) throw badRequest('إحدى الخدمات المختارة غير متاحة حاليًا');
  // الخدمة الرئيسية أولًا (التي دخل منها العميل) — المشكلات والأجهزة تخصها
  const services = serviceIds.map((id) => rows.find((s) => s.id === id)!);
  const main = services[0];
  const tier = zone.tier;
  const inside = tier === 'INSIDE_AMMAN';

  const problemIds = [...new Set(input.problemIds ?? [])];
  const problems = main.problems.filter((p) => problemIds.includes(p.id));
  if (problems.length !== problemIds.length) throw badRequest('إحدى المشكلات المختارة غير متاحة');
  if (main.problems.length && !problems.length) {
    throw badRequest(main.optionsLabel ? 'اختر خيارًا واحدًا على الأقل من الخدمات المطلوبة' : 'اختر المشكلة التي تواجهها (يمكنك اختيار أكثر من مشكلة)', { field: 'problemIds' });
  }

  const deviceIds = [...new Set(input.deviceIds ?? [])];
  const allowed = allowedDeviceIds(main, problemIds);
  const bad = deviceIds.find((id) => !allowed.has(id));
  if (bad) throw badRequest('أحد الأجهزة المختارة لا يناسب المشكلات المحددة');

  const requested: Urgency = input.urgency ?? 'NORMAL';
  const urgentPrice = urgencyPrice(main, requested);
  const urgency: Urgency = urgentPrice == null || main.priceOnRequest ? 'NORMAL' : requested;
  if (requested !== 'NORMAL' && urgency === 'NORMAL') throw badRequest(`${URGENCY_AR[requested]} غير متاحة لهذه الخدمة`, { field: 'urgency' });

  const lines: PriceLine[] = [];
  const visitPrice = (s: (typeof services)[number]) => num(inside ? s.priceInside : s.priceOutside);

  // أفضل زيارة مجمعة: تغطي خدمتين على الأقل، الأكثر تغطية ثم الأوفر
  let bundled = new Set<string>();
  if (services.length > 1) {
    const candidates = new Map<string, { name: string; price: number; covers: string[] }>();
    for (const s of services) {
      if (urgency !== 'NORMAL' && s.id === main.id) continue; // الزيارة العاجلة بسعرها الثابت
      for (const b of s.bundles) {
        if (candidates.has(b.id)) continue;
        const covers = serviceIds.filter((id) => b.services.some((x) => x.id === id) && !(urgency !== 'NORMAL' && id === main.id));
        if (covers.length >= 2) candidates.set(b.id, { name: b.name, price: num(inside ? b.priceInside : b.priceOutside), covers });
      }
    }
    const best = [...candidates.values()]
      .map((c) => ({ ...c, saving: c.covers.reduce((n, id) => n + visitPrice(services.find((s) => s.id === id)!), 0) - c.price }))
      .filter((c) => c.saving > 0)
      .sort((a, b) => b.covers.length - a.covers.length || b.saving - a.saving)[0];
    if (best) {
      bundled = new Set(best.covers);
      lines.push({ kind: 'bundle', label: `${best.name} (${TIER_AR[tier]}) — تشمل: ${services.filter((s) => bundled.has(s.id)).map((s) => s.name).join('، ')}`, amount: r3(best.price) });
    }
  }
  for (const s of services) {
    if (bundled.has(s.id)) continue;
    if (s.priceOnRequest) {
      lines.push({ kind: 'quote', label: `زيارة: ${s.name} — ${SCOPE_PRICED}`, amount: 0 });
      continue;
    }
    if (s.id === main.id && urgency !== 'NORMAL') {
      lines.push({ kind: 'visit', label: `${URGENCY_AR[urgency]}: ${s.name}`, amount: r3(urgentPrice!) });
      continue;
    }
    const price = visitPrice(s);
    lines.push({ kind: 'visit', label: `زيارة: ${s.name} (${TIER_AR[tier]})`, amount: r3(price) });
    if (s.discountPercent > 0) lines.push({ kind: 'discount', label: `خصم ${s.discountPercent}% على ${s.name}`, amount: -r3((price * s.discountPercent) / 100) });
  }

  type ChosenDevice = { id: string; name: string; fee: number; included: boolean; auto?: boolean; scopePriced?: boolean };
  const devices: ChosenDevice[] = [];
  const addFree = (d: { id: string; name: string }) => {
    if (devices.some((x) => x.id === d.id)) return;
    lines.push({ kind: 'device', label: d.name.includes('🎁') ? d.name : `${d.name} — ${FREE_ADDON}`, amount: 0 });
    devices.push({ id: d.id, name: d.name, fee: 0, included: true, auto: true });
  };
  for (const id of deviceIds) {
    const link = main.devices.find((l) => l.deviceId === id)!;
    const d = link.device;
    if (d.scopePriced) {
      lines.push({ kind: 'quote', label: `${d.name} — ${AREA_PRICED}`, amount: 0 });
      devices.push({ id, name: d.name, fee: 0, included: false, scopePriced: true });
    } else {
      const fee = link.included ? 0 : num(link.fee ?? d.fee);
      lines.push({ kind: 'device', label: link.included ? `${d.name} (مشمول في الزيارة)` : d.name, amount: r3(fee) });
      devices.push({ id, name: d.name, fee: r3(fee), included: link.included });
    }
    for (const acc of d.accessories) addFree(acc);
  }
  // إضافات مجانية مع كل حجز لهذه الخدمة (مثل أداة قياس عرض التشققات)
  for (const l of main.devices.filter((x) => x.autoInclude && x.device.active)) addFree(l.device);

  // خيارات تُسعَّر بعرض سعر مستقل بعد الزيارة (دراسة متكاملة، تصميم وتصنيع…)
  for (const p of problems.filter((x) => x.quoteRequired)) lines.push({ kind: 'quote', label: `${p.name} — ${SCOPE_PRICED} (عرض سعر مستقل)`, amount: 0 });

  const serviceTravel = inside ? 0 : Math.max(0, ...services.map((s) => num(s.travelFee)));
  const travel = r3(num(zone.travelFee) + serviceTravel);
  if (travel > 0) lines.push({ kind: 'travel', label: `رسوم الانتقال (${zone.name})`, amount: travel });

  const total = r3(lines.reduce((n, l) => n + l.amount, 0));
  const policy: VisitFeePolicy = main.visitFeePolicy;
  const terms = [...new Set(services.map((s) => s.terms.trim()).filter(Boolean))];

  return {
    tier,
    zone: { id: zone.id, name: zone.name, requiresApproval: zone.requiresApproval },
    urgency,
    services: services.map((s) => ({ id: s.id, name: s.name, slug: s.slug, durationMinutes: s.durationMinutes })),
    problems: problems.map((p) => ({ id: p.id, name: p.name, quoteRequired: p.quoteRequired })),
    /** فيه بنود تُسعَّر لاحقًا بعرض سعر مستقل */
    hasScopePricing: lines.some((l) => l.kind === 'quote'),
    devices,
    lines,
    total,
    visitFeePolicy: policy,
    terms,
    durationMinutes: services.reduce((n, s) => n + s.durationMinutes, 0),
  };
}

export type VisitPrice = Awaited<ReturnType<typeof priceVisit>>;

// ───── تعديل الطلب في الموقع ─────

export type OnsiteDevice = { id: string; name: string; fee: number; auto?: boolean };

/** الأجهزة التي يمكن للفني إضافتها في الموقع بسعرها المعياري (رسوم الخدمة الخاصة أو رسوم الجهاز العامة) */
export async function onsiteOptions(serviceId: string | undefined, bookedIds: string[]) {
  const [devices, links] = await Promise.all([
    prisma.serviceDevice.findMany({ where: { active: true, scopePriced: false, parentId: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { accessories: { where: { active: true }, select: { id: true, name: true } } } }),
    serviceId ? prisma.serviceDeviceLink.findMany({ where: { serviceId } }) : Promise.resolve([]),
  ]);
  return devices
    .filter((d) => !bookedIds.includes(d.id))
    .map((d) => {
      const l = links.find((x) => x.deviceId === d.id);
      const fee = l ? (l.included ? 0 : num(l.fee ?? d.fee)) : num(d.fee);
      return { id: d.id, name: d.name, imageUrl: d.imageUrl, fee: r3(fee), linked: !!l, accessories: d.accessories };
    });
}

/**
 * الإجمالي النهائي = الإجمالي المعتمد وقت الحجز + أجهزة الموقع − الخصم اليدوي.
 * السعر المعتمد وبنوده لا تتغير — التعديل يُحفظ منفصلًا.
 */
export async function priceOnsite(r: { total: { toString(): string }; services: unknown; devices: unknown }, deviceIds: string[], manualDiscount: number) {
  const serviceId = (r.services as { id: string }[])[0]?.id;
  const booked = (r.devices as { id: string }[]).map((d) => d.id);
  const options = await onsiteOptions(serviceId, booked);
  const devices: OnsiteDevice[] = [];
  for (const id of [...new Set(deviceIds)]) {
    const o = options.find((x) => x.id === id);
    if (!o) throw badRequest('أحد الأجهزة غير متاح أو مضاف مسبقًا في الحجز', { field: 'deviceIds' });
    devices.push({ id: o.id, name: o.name, fee: o.fee });
    for (const a of o.accessories) if (!booked.includes(a.id) && !devices.some((x) => x.id === a.id)) devices.push({ id: a.id, name: a.name, fee: 0, auto: true });
  }
  const base = num(r.total);
  const added = r3(devices.reduce((n, d) => n + d.fee, 0));
  const discount = r3(manualDiscount);
  if (discount > r3(base + added)) throw badRequest('الخصم أكبر من قيمة الزيارة والأجهزة', { field: 'manualDiscount' });
  return { base, devices, added, discount, finalTotal: r3(base + added - discount) };
}

/** الإجمالي الفعلي للطلب (بعد تعديل الموقع إن وجد) */
export const effectiveTotal = (r: { total: { toString(): string }; finalTotal: { toString(): string } | null }) => num(r.finalTotal ?? r.total);
