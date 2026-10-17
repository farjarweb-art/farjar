import { Link, useSearchParams } from 'react-router-dom';
import { ErrorState, Icon, PageHeader, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { cx, formatJOD } from '../../lib/format';
import { AUDIENCE_LABEL, type Audience, type ServiceCard } from '../../lib/siteServices';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

const TABS: { value: Audience; label: string; icon: 'home' | 'factory' }[] = [
  { value: 'HOME', label: 'المنازل والشقق والفلل', icon: 'home' },
  { value: 'BUSINESS', label: 'الشركات والمصانع والمستودعات والورش', icon: 'factory' },
];

/** الخدمات والمعاينات والصيانة: قسم سكني وقسم للمنشآت، بسعر زيارة ثابت */
export default function Services() {
  useDocumentTitle('الخدمات والمعاينات والصيانة');
  const [params, setParams] = useSearchParams();
  const tab: Audience = params.get('for') === 'business' ? 'BUSINESS' : 'HOME';
  const { data, error, loading, reload } = useAsync(() => api.get<{ services: ServiceCard[] }>('/site-services'), [], 'site-services');
  const list = (data?.services ?? []).filter((s) => s.audiences.includes(tab));
  const featured = list.filter((s) => s.featured);
  const rest = list.filter((s) => !s.featured);

  return (
    <>
      <PageHeader
        eyebrow="الخدمات والمعاينات"
        title="معاينات فنية وفحوصات وصيانة — بسعر زيارة ثابت"
        description="اختر الخدمة والمشكلة، حدد موقعك، وأضف الأجهزة التي تحتاجها. تعرف السعر النهائي للزيارة قبل أن تؤكد الحجز — لا حساب بالمتر ولا بالساعة."
      />

      <div className="container py-8 md:py-12">
        <div role="tablist" aria-label="نوع العقار" className="grid gap-2 sm:grid-cols-2">
          {TABS.map((t) => {
            const active = t.value === tab;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setParams(t.value === 'BUSINESS' ? { for: 'business' } : {}, { replace: true })}
                className={cx(
                  'flex min-h-[3.5rem] items-center gap-3 rounded-xl border px-4 py-3 text-start font-semibold transition-colors',
                  active ? 'border-ink bg-inverse text-inverse-fg' : 'border-line-strong bg-surface hover:border-ink/50',
                )}
              >
                <Icon name={t.icon} className="h-5 w-5 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="mt-8">
            <ErrorState message={error.message} onRetry={reload} />
          </div>
        ) : loading ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {featured.map((s) => (
              <Link key={s.id} to={`/services/${s.slug}`} className="group mt-8 block overflow-hidden rounded-xl bg-inverse p-6 text-inverse-fg md:p-8">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-fg">
                  <Icon name="star" className="h-3.5 w-3.5" /> قسم رئيسي
                </span>
                <h2 className="mt-4 max-w-3xl text-2xl leading-snug text-inverse-fg md:text-[2rem]">{s.name}</h2>
                <p className="mt-3 max-w-2xl text-inverse-fg/70">{s.summary}</p>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                  <PriceTag s={s} dark />
                  <span className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-fg transition-transform group-hover:-translate-x-1">
                    اختر المشكلة واحجز <Icon name="arrowLeft" className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}

            <h2 className="mb-4 mt-10 text-xl">{AUDIENCE_LABEL[tab]}</h2>
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {rest.map((s) => (
                <li key={s.id}>
                  <Link to={`/services/${s.slug}`} className="card card-hover group flex h-full flex-col p-5">
                    <h3 className="text-lg leading-snug">{s.name}</h3>
                    <p className="mt-2 flex-1 text-[15px] leading-relaxed text-muted">{s.summary}</p>
                    <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-4">
                      <PriceTag s={s} />
                      <Icon name="arrowLeft" className="h-5 w-5 text-muted transition-colors group-hover:text-ink" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {!list.length && <p className="mt-8 text-muted">لا توجد خدمات في هذا القسم حاليًا.</p>}
          </>
        )}

        <section className="mt-12 grid gap-4 rounded-xl border border-line p-5 md:grid-cols-3 md:p-7">
          {[
            ['سعر ثابت للزيارة', 'داخل عمّان أو خارجها — لا يتغير حسب المساحة أو مدة العمل.'],
            ['الأجهزة حسب حاجتك', 'تضيف الأجهزة المناسبة لمشكلتك برسومها فقط، ضمن نفس الزيارة.'],
            ['الإصلاح بعرض سعر منفصل', 'بعد المعاينة نرسل لك تقريرًا وعرض سعر، ولا نبدأ إلا بموافقتك.'],
          ].map(([t, d]) => (
            <div key={t}>
              <h3 className="text-base">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function PriceTag({ s, dark }: { s: ServiceCard; dark?: boolean }) {
  if (s.priceOnRequest) return <p className={cx('text-sm font-semibold', dark ? 'text-inverse-fg/80' : 'text-ink')}>سعر الزيارة: يحدد بعد مراجعة نطاق المشروع</p>;
  return (
    <p className={cx('text-sm', dark ? 'text-inverse-fg/70' : 'text-muted')}>
      زيارة داخل عمّان <b className={cx('font-display text-lg', dark ? 'text-inverse-fg' : 'text-ink')}>{formatJOD(s.priceInside)}</b>
      <span className="mx-1.5" aria-hidden>
        ·
      </span>
      خارجها {formatJOD(s.priceOutside)}
      {s.discountPercent > 0 && <span className="ms-2 rounded bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-fg">خصم {s.discountPercent}%</span>}
    </p>
  );
}
