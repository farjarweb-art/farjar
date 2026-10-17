import type { ReactNode } from 'react';
import { useSite } from '../../context/SiteContext';
import { BRAND } from '../../lib/brand';
import { displayPhone, formatDate, formatJOD } from '../../lib/format';
import { CLIENT_TYPE_LABEL, TIER_LABEL, type RequestCore, type ServiceQuote } from '../../lib/siteServices';
import { LogoMark } from '../layout/Logo';
import { Button, Icon } from '../ui';

/**
 * التقرير الفني أو عرض سعر الإصلاح بصيغة قابلة للطباعة — زر "تحميل PDF" يفتح نافذة الطباعة
 * (اختر "حفظ كـ PDF"). نفس المستند للعميل وللإدارة.
 */
export function ServiceDocument({ request: r, kind, quote, back }: { request: RequestCore; kind: 'report' | 'quote'; quote?: ServiceQuote | null; back?: ReactNode }) {
  const { settings } = useSite();
  const report = r.report;
  const title = kind === 'report' ? 'تقرير فني' : `عرض سعر إصلاح رقم ${quote?.number ?? ''}`;
  const photos = r.media.filter((m) => m.purpose === 'report' && m.kind === 'IMAGE');

  return (
    <div className="print-doc mx-auto max-w-3xl bg-white px-4 py-6 text-black sm:px-8 print:max-w-none print:p-0">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-2">
        {back}
        <Button onClick={() => window.print()}>
          <Icon name="download" className="h-4 w-4" /> تحميل PDF / طباعة
        </Button>
      </div>
      <p className="no-print mb-4 rounded-lg bg-subtle px-3 py-2 text-sm text-muted">لحفظ المستند كملف PDF: اضغط الزر أعلاه ثم اختر "حفظ كـ PDF" من نافذة الطباعة.</p>

      <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-4">
        <div>
          <LogoMark className="h-10 w-auto" />
          <p className="mt-1 text-xs">
            {BRAND.alt} — {BRAND.en}
          </p>
        </div>
        <div className="text-end">
          <h1 className="text-2xl">{title}</h1>
          <p className="mt-1 text-sm">
            الطلب <span className="ltr font-semibold">#{r.number}</span> · <span className="ltr">{r.ref}</span>
          </p>
          <p className="text-sm">التاريخ: {formatDate(kind === 'quote' && quote ? quote.sentAt ?? quote.createdAt : report?.publishedAt ?? report?.updatedAt ?? r.createdAt)}</p>
        </div>
      </header>

      <Section title="بيانات العميل وموقع المعاينة">
        <Grid
          rows={[
            ['العميل', r.name],
            ['الهاتف', <span className="ltr">{displayPhone(r.phone)}</span>],
            ['نوع العميل', `${CLIENT_TYPE_LABEL[r.clientType]} — ${r.propertyType}`],
            ['المنطقة', `${r.zoneName} (${TIER_LABEL[r.tier]}) — ${r.area}`],
            ['العنوان', r.address],
            ['موعد الزيارة', formatDate(r.scheduledAt, true)],
          ]}
        />
      </Section>

      <Section title="الخدمة والمشكلة">
        <Grid
          rows={[
            ['الخدمة', r.services.map((s) => s.name).join('، ')],
            ['نوع الطلب', r.requestTypeLabel],
            ['المشكلة', r.problems.map((p) => p.name).join('، ') || r.description],
            ['مكان المشكلة', r.problemLocation],
            ['الفحوصات والأجهزة', (kind === 'report' && report?.devicesUsed) || r.devices.map((d) => d.name).join('، ') || 'المعاينة الأساسية'],
            ['الفني', r.technician?.name],
          ]}
        />
      </Section>

      {kind === 'report' && report && (
        <>
          <TextSection title="الملاحظات والنتائج الفنية" text={report.findings} />
          <TextSection title="التوصيات المقترحة" text={report.recommendations} />
          <TextSection title="الأعمال التي تحتاج إلى إصلاح" text={report.repairsNeeded} />
          {photos.length > 0 && (
            <Section title="الصور المرفقة">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {photos.map((m) => (
                  <img key={m.id} src={m.url} alt="" className="aspect-[4/3] w-full rounded border border-black/20 object-cover" />
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {kind === 'quote' && quote && (
        <Section title="بنود أعمال الإصلاح">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black text-start">
                <th className="py-2 text-start">البند</th>
                <th className="w-16 py-2 text-center">الكمية</th>
                <th className="w-24 py-2 text-end">سعر الوحدة</th>
                <th className="w-24 py-2 text-end">المجموع</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((i, n) => (
                <tr key={n} className="border-b border-black/20">
                  <td className="py-2">{i.description}</td>
                  <td className="py-2 text-center tabular-nums">{i.qty}</td>
                  <td className="py-2 text-end tabular-nums">{formatJOD(i.unitPrice)}</td>
                  <td className="py-2 text-end tabular-nums">{formatJOD(i.qty * i.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-3 text-end">المجموع</td>
                <td className="pt-3 text-end tabular-nums">{formatJOD(quote.subtotal)}</td>
              </tr>
              {quote.visitFeeDeduction > 0 && (
                <tr>
                  <td colSpan={3} className="text-end">خصم رسوم الزيارة</td>
                  <td className="text-end tabular-nums">− {formatJOD(quote.visitFeeDeduction)}</td>
                </tr>
              )}
              <tr className="text-base font-bold">
                <td colSpan={3} className="pt-2 text-end">الإجمالي</td>
                <td className="pt-2 text-end tabular-nums">{formatJOD(quote.total)}</td>
              </tr>
            </tfoot>
          </table>
          {quote.validUntil && <p className="mt-3 text-sm">العرض ساري حتى {formatDate(quote.validUntil)}.</p>}
          {quote.notes && <p className="mt-2 whitespace-pre-line text-sm">{quote.notes}</p>}
          <p className="mt-3 text-xs">
            هذا العرض لأعمال الإصلاح والمواد فقط، ومنفصل عن رسوم زيارة المعاينة ({formatJOD(r.total)}){quote.visitFeeDeduction > 0 ? ' التي خُصمت منه كما هو موضح' : ''}. لا يبدأ التنفيذ إلا بعد موافقة العميل.
          </p>
        </Section>
      )}

      <footer className="mt-8 border-t border-black/30 pt-3 text-center text-xs">
        {BRAND.ar} · {settings.phone} · {settings.email} · {settings.address}
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 border-b border-black/30 pb-1 text-base">{title}</h2>
      {children}
    </section>
  );
}

function TextSection({ title, text }: { title: string; text: string }) {
  if (!text?.trim()) return null;
  return (
    <Section title={title}>
      <p className="whitespace-pre-line text-sm leading-relaxed">{text}</p>
    </Section>
  );
}

function Grid({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="shrink-0 font-semibold">{k}:</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
    </dl>
  );
}
