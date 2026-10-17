import type { PriceTier, VisitFeePolicy } from '@prisma/client';
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

export type PriceLine = { kind: 'visit' | 'bundle' | 'discount' | 'device' | 'travel'; label: string; amount: number };

export type PricingInput = {
  serviceIds: string[];
  zoneId: string;
  problemIds?: string[];
  deviceIds?: string[];
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const num = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Number(d.toString()));

export const TIER_AR: Record<PriceTier, string> = { INSIDE_AMMAN: 'داخل عمّان', OUTSIDE_AMMAN: 'خارج عمّان' };

const serviceInclude = {
  problems: { where: { active: true }, include: { devices: { select: { id: true } } } },
  devices: { include: { device: true } },
  bundles: { where: { active: true }, include: { services: { select: { id: true } } } },
} as const;

/** الأجهزة المتاحة للخدمة حسب المشكلات المختارة (المدير يحدد ربط الأجهزة بالمشكلات) */
export function allowedDeviceIds(
  service: { problems: { id: string; isOther: boolean; devices: { id: string }[] }[]; devices: { deviceId: string; device: { active: boolean } }[] },
  problemIds: string[],
) {
  const linked = service.devices.filter((l) => l.device.active).map((l) => l.deviceId);
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
  if (main.problems.length && !problems.length) throw badRequest('اختر المشكلة التي تواجهها (يمكنك اختيار أكثر من مشكلة)', { field: 'problemIds' });

  const deviceIds = [...new Set(input.deviceIds ?? [])];
  const allowed = allowedDeviceIds(main, problemIds);
  const bad = deviceIds.find((id) => !allowed.has(id));
  if (bad) throw badRequest('أحد الأجهزة المختارة لا يناسب المشكلات المحددة');

  const lines: PriceLine[] = [];
  const visitPrice = (s: (typeof services)[number]) => num(inside ? s.priceInside : s.priceOutside);

  // أفضل زيارة مجمعة: تغطي خدمتين على الأقل، الأكثر تغطية ثم الأوفر
  let bundled = new Set<string>();
  if (services.length > 1) {
    const candidates = new Map<string, { name: string; price: number; covers: string[] }>();
    for (const s of services) {
      for (const b of s.bundles) {
        if (candidates.has(b.id)) continue;
        const covers = serviceIds.filter((id) => b.services.some((x) => x.id === id));
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
    const price = visitPrice(s);
    lines.push({ kind: 'visit', label: `زيارة: ${s.name} (${TIER_AR[tier]})`, amount: r3(price) });
    if (s.discountPercent > 0) lines.push({ kind: 'discount', label: `خصم ${s.discountPercent}% على ${s.name}`, amount: -r3((price * s.discountPercent) / 100) });
  }

  const devices = deviceIds.map((id) => {
    const link = main.devices.find((l) => l.deviceId === id)!;
    const fee = link.included ? 0 : num(link.fee ?? link.device.fee);
    lines.push({ kind: 'device', label: link.included ? `${link.device.name} (مشمول في الزيارة)` : link.device.name, amount: r3(fee) });
    return { id, name: link.device.name, fee: r3(fee), included: link.included };
  });

  const serviceTravel = inside ? 0 : Math.max(0, ...services.map((s) => num(s.travelFee)));
  const travel = r3(num(zone.travelFee) + serviceTravel);
  if (travel > 0) lines.push({ kind: 'travel', label: `رسوم الانتقال (${zone.name})`, amount: travel });

  const total = r3(lines.reduce((n, l) => n + l.amount, 0));
  const policy: VisitFeePolicy = main.visitFeePolicy;
  const terms = [...new Set(services.map((s) => s.terms.trim()).filter(Boolean))];

  return {
    tier,
    zone: { id: zone.id, name: zone.name, requiresApproval: zone.requiresApproval },
    services: services.map((s) => ({ id: s.id, name: s.name, slug: s.slug, durationMinutes: s.durationMinutes })),
    problems: problems.map((p) => ({ id: p.id, name: p.name })),
    devices,
    lines,
    total,
    visitFeePolicy: policy,
    terms,
    durationMinutes: services.reduce((n, s) => n + s.durationMinutes, 0),
  };
}

export type VisitPrice = Awaited<ReturnType<typeof priceVisit>>;
