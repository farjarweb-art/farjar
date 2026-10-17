import { useParams } from 'react-router-dom';
import { Breadcrumbs, ButtonLink, ErrorState, Icon, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { formatJOD } from '../../lib/format';
import { AUDIENCE_LABEL, type ServiceDetail as Detail } from '../../lib/siteServices';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

/** صفحة الخدمة: ما يشمله سعر الزيارة، الأسعار، المشكلات والأجهزة، ثم الحجز */
export default function ServiceDetail() {
  const { slug = '' } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.get<Detail>(`/site-services/${encodeURIComponent(slug)}`), [slug], `service:${slug}`);
  const s = data?.service;
  useDocumentTitle(s?.name ?? 'الخدمات');

  if (error) {
    return (
      <div className="container py-16">
        <ErrorState message={error.message} onRetry={reload} />
      </div>
    );
  }
  if (loading || !s || !data) {
    return (
      <div className="container space-y-4 py-12">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  const audience = s.audiences.includes('HOME') ? 'HOME' : 'BUSINESS';
  return (
    <>
      <header className="border-b border-line bg-subtle">
        <div className="container py-8 md:py-12">
          <Breadcrumbs items={[{ to: '/services', label: 'الخدمات والمعاينات' }, { to: audience === 'BUSINESS' ? '/services?for=business' : '/services', label: AUDIENCE_LABEL[audience] }, { label: s.name }]} className="mb-4" />
          <h1 className="max-w-4xl text-[1.75rem] leading-snug md:text-[2.375rem]">{s.name}</h1>
          <p className="mt-3 max-w-2xl text-[17px] text-muted">{s.summary}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ButtonLink to={`/services/${s.slug}/book`} size="lg">
              {s.problems.length ? 'اختر المشكلة واحجز الزيارة' : 'احجز الزيارة'} <Icon name="arrowLeft" className="h-4 w-4" />
            </ButtonLink>
            <span className="text-sm text-muted">تعرف السعر النهائي قبل التأكيد</span>
          </div>
        </div>
      </header>

      <div className="container grid gap-8 py-8 md:py-12 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          {s.includes.length > 0 && (
            <section>
              <h2 className="text-xl">ما يشمله سعر الزيارة</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {s.includes.map((x) => (
                  <li key={x} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2.5 text-[15px]">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {x}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {s.problems.length > 0 && (
            <section>
              <h2 className="text-xl">المشكلات التي نكشف عنها</h2>
              <p className="mt-1 text-sm text-muted">تختار مشكلة أو أكثر عند الحجز، وتظهر لك الأجهزة المناسبة لها.</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {s.problems.map((p) => (
                  <li key={p.id} className="rounded-full border border-line-strong px-3 py-1.5 text-sm">
                    {p.name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {s.devices.length > 0 && (
            <section>
              <h2 className="text-xl">الأجهزة والفحوصات الإضافية</h2>
              <p className="mt-1 text-sm text-muted">تُضاف للزيارة نفسها برسومها فقط — بدون زيارة جديدة لكل جهاز.</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {s.devices.map((d) => (
                  <li key={d.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base leading-snug">{d.name}</h3>
                      <span className="shrink-0 rounded-md bg-subtle px-2 py-0.5 text-sm font-semibold">{d.included ? 'مشمول' : `+ ${formatJOD(d.fee)}`}</span>
                    </div>
                    {d.description && <p className="mt-2 text-sm text-muted">{d.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-32 lg:self-start">
          <section className="rounded-xl bg-subtle p-5">
            <h2 className="text-lg">سعر الزيارة</h2>
            <dl className="mt-3 divide-y divide-line text-[15px]">
              <Row label="داخل عمّان" value={formatJOD(s.priceInside)} />
              <Row label="خارج عمّان" value={formatJOD(s.priceOutside)} />
            </dl>
            {s.discountPercent > 0 && <p className="mt-2 text-sm font-semibold text-success">خصم {s.discountPercent}% على سعر الزيارة حاليًا</p>}
            <p className="mt-3 text-sm text-muted">قد تُضاف رسوم انتقال لبعض المناطق البعيدة، وتظهر لك قبل التأكيد.</p>
            <p className="mt-2 text-sm text-muted">{s.visitFeePolicyText}</p>
          </section>
          {data.combinable.length > 0 && (
            <section className="rounded-xl border border-line p-5">
              <h2 className="text-lg">أكثر من خدمة في زيارة واحدة</h2>
              <p className="mt-1 text-sm text-muted">يمكنك إضافة خدمات أخرى لنفس الموقع عند الحجز، ويُحتسب سعر الزيارة المجمعة إن كان أوفر.</p>
            </section>
          )}
          <section className="rounded-xl bg-inverse p-5 text-inverse-fg">
            <h2 className="text-lg text-inverse-fg">الإصلاح منفصل عن المعاينة</h2>
            <p className="mt-1 text-sm text-inverse-fg/70">رسوم الزيارة تشمل المعاينة والفحوصات المتفق عليها فقط. بعد المعاينة نرسل عرض سعر للإصلاح ولا نبدأ إلا بموافقتك.</p>
          </section>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-display font-semibold">{value}</dd>
    </div>
  );
}
