import { useState } from 'react';
import { Link } from 'react-router-dom';
import { VisitorCount } from '../../components/layout/VisitorCount';
import { PRODUCT_GRID, ProductCard, ProductGridSkeleton } from '../../components/store/ProductCard';
import { Icon, SectionHeading, Skeleton, type IconName } from '../../components/ui';
import { WorkFigure } from '../../components/work/WorkFigure';
import { useSite } from '../../context/SiteContext';
import { api } from '../../lib/api';
import { BRAND } from '../../lib/brand';
import { cx, displayPhone, formatJOD, waLink } from '../../lib/format';
import { SCOPE_PRICED, type Audience, type ServiceCard } from '../../lib/siteServices';
import type { Paged, Product, SiteSettings } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';
import { SPECIALTIES, WORKS } from '../../lib/works';

/** حجوزات الأعمال (البناء والدهان والصيانة) */
const JOBS: { slug: string; title: string; text: string; icon: IconName; fee?: (s: SiteSettings) => string }[] = [
  { slug: 'inspection', title: 'كشف أعطال بناء', text: 'رطوبة، تشققات، مشاكل تمديدات — نحدد السبب ونكتب ما يلزم.', icon: 'search', fee: (s) => `كشف ${formatJOD(s.inspectionFeeNormal)}` },
  { slug: 'painting', title: 'دهان وديكور', text: 'دهان داخلي وخارجي، تجديد شقق، وديكورات.', icon: 'pen', fee: (s) => `كشف ${formatJOD(s.paintingFeeInside)} داخل عمّان` },
  { slug: 'construction', title: 'بناء وتشطيب', text: 'بناء جديد، إضافات وملاحق، وتشطيب كامل حتى التسليم.', icon: 'home' },
  { slug: 'metalwork', title: 'أعمال معدنية', text: 'أبواب وبوابات ودرابزين ومظلات وحمايات حسب القياس.', icon: 'ruler' },
  { slug: 'general', title: 'صيانة عامة', text: 'تركيب، فك ونقل، وإصلاحات صغيرة.', icon: 'wrench' },
];

const STEPS: { t: string; d: string; icon: IconName }[] = [
  { t: 'اختر الخدمة', d: 'والمشكلة والأجهزة التي تحتاجها', icon: 'grid' },
  { t: 'اعرف السعر', d: 'سعر زيارة ثابت قبل التأكيد', icon: 'cash' },
  { t: 'نزورك بالموعد', d: 'فني مختص في اليوم الذي تختاره', icon: 'calendar' },
  { t: 'تقرير وعرض سعر', d: 'ولا ننفذ إلا بموافقتك', icon: 'file' },
];

/** الرئيسية: الحجوزات أولًا — واجهة حجز سريع، شريط متحرك بالخدمات، كل الحجوزات مرتبة، ثم الأعمال والسوق */
export default function Home() {
  useDocumentTitle('');
  const services = useAsync(() => api.get<{ services: ServiceCard[] }>('/site-services'), [], 'site-services');
  const list = services.data?.services ?? [];

  return (
    <>
      <Hero services={list} loading={services.loading} />
      <ServicesMarquee services={list} />
      <AllBookings services={list} loading={services.loading} error={!!services.error} />
      <HowItWorks />
      <Commitments />
      <WorkSection />
      <MarketTeaser />
    </>
  );
}

const priceText = (s: ServiceCard) => (s.priceOnRequest ? SCOPE_PRICED : `من ${formatJOD(s.priceInside)}`);

function Hero({ services, loading }: { services: ServiceCard[]; loading: boolean }) {
  const { settings } = useSite();
  const [tab, setTab] = useState<Audience>('HOME');
  const shown = services.filter((s) => s.audiences.includes(tab)).slice(0, 5);

  return (
    <section className="relative overflow-hidden bg-inverse text-inverse-fg">
      <svg className="pointer-events-none absolute inset-y-0 end-0 hidden h-full w-1/2 text-inverse-fg opacity-[0.06] lg:block" aria-hidden>
        <defs>
          <pattern id="hero-grid" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M56 0H0V56" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-grid)" />
      </svg>
      <div className="container relative grid gap-10 py-12 md:py-16 lg:grid-cols-12 lg:gap-12 lg:py-20">
        <div className="min-w-0 lg:col-span-6">
          <p className="eyebrow anim-rise !text-inverse-fg/60">{BRAND.alt} — حجوزات المعاينة والصيانة</p>
          <VisitorCount className="mt-4 border-inverse-fg/15 bg-inverse-2 text-inverse-fg/80" />
          <h1 className="anim-rise mt-5 text-[2rem] leading-[1.3] text-inverse-fg [animation-delay:60ms] sm:text-[2.5rem] xl:text-[3.125rem]">
            احجز معاينتك أو صيانتك <span className="text-primary">بسعر زيارة ثابت</span>
          </h1>
          <p className="anim-rise mt-5 max-w-lg text-[17px] leading-relaxed text-inverse-fg/65 [animation-delay:120ms]">
            كشف تسربات ورطوبة، فحص عقارات ومنشآت صناعية، دهان وبناء وأعمال معدنية — اختر الخدمة، اعرف السعر النهائي قبل التأكيد، واختر موعدك بنفسك.
          </p>
          <div className="anim-rise mt-8 flex flex-wrap gap-3 [animation-delay:180ms]">
            <Link to="/book" className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 font-semibold text-primary-fg shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] transition-colors hover:bg-primary-hover active:translate-y-px">
              <Icon name="calendar" className="h-4 w-4" /> احجز الآن
            </Link>
            <a href="#all-bookings" className="inline-flex h-12 items-center gap-2 rounded-lg border border-inverse-fg/20 px-5 font-semibold text-inverse-fg transition-colors hover:border-inverse-fg/50">
              كل الحجوزات <Icon name="chevronDown" className="h-4 w-4" />
            </a>
          </div>
          <p className="anim-rise mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-inverse-fg/60 [animation-delay:240ms]">
            <a href={`tel:${settings.phone}`} className="inline-flex min-h-[44px] items-center gap-2 transition-colors hover:text-inverse-fg">
              <Icon name="phone" className="h-4 w-4 text-primary" />
              <span className="ltr">{settings.phone}</span>
            </a>
            <a href={waLink(settings.whatsappNumber, 'مرحبًا، أريد حجز معاينة')} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-2 transition-colors hover:text-inverse-fg">
              <Icon name="whatsapp" className="h-4 w-4 text-primary" />
              واتساب <span className="ltr">{displayPhone(settings.whatsappNumber)}</span>
            </a>
          </p>
        </div>

        {/* بطاقة الحجز السريع */}
        <div className="anim-rise min-w-0 [animation-delay:120ms] lg:col-span-6">
          <div className="rounded-2xl border border-inverse-fg/10 bg-inverse-2 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">حجز سريع</p>
              <span className="inline-flex items-center gap-2 text-xs text-inverse-fg/60">
                <span className="relative flex h-2 w-2">
                  <span className="soft-ping absolute inline-flex h-full w-full rounded-full bg-success" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                الحجز متاح الآن
              </span>
            </div>
            <div role="tablist" aria-label="نوع العقار" className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-inverse p-1">
              {(
                [
                  ['HOME', 'home', 'منازل وشقق'],
                  ['BUSINESS', 'factory', 'شركات ومصانع'],
                ] as const
              ).map(([k, icon, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={cx('inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors', tab === k ? 'bg-primary text-primary-fg' : 'text-inverse-fg/70 hover:text-inverse-fg')}
                >
                  <Icon name={icon} className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
            <ul key={tab} className="anim-fade mt-3 space-y-2">
              {loading
                ? [0, 1, 2, 3].map((i) => <li key={i} className="h-14 animate-pulse rounded-xl bg-inverse" />)
                : shown.map((s) => (
                    <li key={s.id}>
                      <Link to={`/services/${s.slug}/book`} className="group flex items-center gap-3 rounded-xl bg-inverse p-3 transition-colors hover:bg-inverse/60">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                          <Icon name={s.featured ? 'star' : 'check'} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium">{s.name}</span>
                          <span className="block text-xs text-inverse-fg/55">{priceText(s)}</span>
                        </span>
                        <Icon name="arrowLeft" className="h-4 w-4 shrink-0 text-inverse-fg/40 transition-all group-hover:-translate-x-1 group-hover:text-primary" />
                      </Link>
                    </li>
                  ))}
            </ul>
            <Link to={tab === 'BUSINESS' ? '/services?for=business' : '/services'} className="mt-3 flex min-h-[44px] items-center justify-center gap-1.5 text-sm font-semibold text-primary">
              كل خدمات {tab === 'BUSINESS' ? 'الشركات والمصانع' : 'المنازل'} <Icon name="arrowLeft" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** شريط متحرك بكل الخدمات — حركة هادئة ومستمرة (يتوقف عند المرور) */
function ServicesMarquee({ services }: { services: ServiceCard[] }) {
  const { settings } = useSite();
  const items = [
    ...services.map((s) => ({ to: `/services/${s.slug}`, label: s.name, sub: priceText(s) })),
    ...JOBS.map((j) => ({ to: `/bookings/${j.slug}`, label: j.title, sub: j.fee?.(settings) ?? 'عرض سعر بعد الزيارة' })),
  ];
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-3 pe-3" aria-hidden={hidden || undefined}>
      {items.map((x, i) => (
        <li key={i}>
          <Link to={x.to} tabIndex={hidden ? -1 : undefined} className="flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            <span className="font-medium">{x.label}</span>
            <span className="text-muted">· {x.sub}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label="كل الخدمات" className="border-b border-line bg-subtle py-4">
      <div className="marquee">
        <div className="marquee-track">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </section>
  );
}

/** كل الحجوزات مرتبة: الأقسام الرئيسية، المعاينات، أعمال البناء، والشركات */
function AllBookings({ services, loading, error }: { services: ServiceCard[]; loading: boolean; error: boolean }) {
  const { settings } = useSite();
  const featured = services.filter((s) => s.featured);
  const home = services.filter((s) => !s.featured && s.audiences.includes('HOME'));
  const business = services.filter((s) => !s.featured && !s.audiences.includes('HOME'));

  return (
    <section id="all-bookings" className="section scroll-mt-24" aria-labelledby="bookings-title">
      <div className="container">
        <SectionHeading id="bookings-title" eyebrow="الحجوزات" title="كل الحجوزات في مكان واحد" description="اختر ما تحتاجه — السعر واضح قبل التأكيد، والموعد تختاره بنفسك." />

        {loading && (
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        )}

        {featured.length > 0 && (
          <div className="mt-10 grid gap-4 md:grid-cols-2" data-reveal-group>
            {featured.map((s) => (
              <Link key={s.id} to={`/services/${s.slug}`} className="group relative flex flex-col overflow-hidden rounded-2xl bg-inverse p-6 text-inverse-fg md:p-7">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-fg">
                  <Icon name="star" className="h-3.5 w-3.5" /> {s.audiences.includes('HOME') ? 'للمنازل والمنشآت' : 'للمصانع والمنشآت'}
                </span>
                <h3 className="mt-4 text-xl leading-snug text-inverse-fg md:text-2xl">{s.name}</h3>
                <p className="mt-2 flex-1 text-[15px] leading-relaxed text-inverse-fg/65">{s.summary}</p>
                <div className="mt-6 flex items-center justify-between gap-3">
                  <span className="text-sm text-inverse-fg/70">{priceText(s)}</span>
                  <span className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg transition-transform duration-300 group-hover:-translate-x-1">
                    احجز <Icon name="arrowLeft" className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {home.length > 0 && <Group title="معاينات وفحوصات للمنازل والشقق والفلل" icon="home" link="/services" items={home.map((s) => ({ to: `/services/${s.slug}`, title: s.name, sub: priceText(s) }))} />}
        {business.length > 0 && (
          <Group title="معاينات وصيانة للشركات والمصانع والمستودعات" icon="factory" link="/services?for=business" items={business.map((s) => ({ to: `/services/${s.slug}`, title: s.name, sub: priceText(s) }))} />
        )}
        {error && <p className="mt-8 text-sm text-muted">تعذر تحميل قائمة المعاينات — جرّب تحديث الصفحة.</p>}

        <Group
          title="بناء ودهان وأعمال معدنية وصيانة"
          icon="wrench"
          link="/bookings"
          items={JOBS.map((j) => ({ to: `/bookings/${j.slug}`, title: j.title, sub: j.fee?.(settings) ?? 'عرض سعر بعد الزيارة', text: j.text, icon: j.icon }))}
        />
        <Group
          title="عقود وصيانة عاجلة للشركات"
          icon="briefcase"
          link="/corporate"
          items={[
            { to: '/corporate/annual', title: 'عقد صيانة سنوي', sub: 'زيارات دورية وتقارير مكتوبة', icon: 'gear' },
            { to: '/corporate/urgent', title: 'طلب صيانة عاجل', sub: 'استجابة سريعة عند توقف الإنتاج', icon: 'alert' },
          ]}
        />
      </div>
    </section>
  );
}

function Group({ title, icon, link, items }: { title: string; icon: IconName; link: string; items: { to: string; title: string; sub: string; text?: string; icon?: IconName }[] }) {
  return (
    <div className="mt-12">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
        <h3 className="flex items-center gap-2 text-lg">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <Icon name={icon} className="h-4 w-4" />
          </span>
          {title}
        </h3>
        <Link to={link} className="inline-flex min-h-[44px] shrink-0 items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
          الكل <Icon name="arrowLeft" className="h-4 w-4" />
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-reveal-group>
        {items.map((x) => (
          <li key={x.to}>
            <Link to={x.to} className="card card-hover group flex h-full items-start gap-3 p-4">
              {x.icon && (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-subtle text-ink transition-colors group-hover:bg-primary group-hover:text-primary-fg">
                  <Icon name={x.icon} className="h-5 w-5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug">{x.title}</span>
                {x.text && <span className="mt-1 block text-sm text-muted">{x.text}</span>}
                <span className="mt-1.5 block text-xs font-medium text-ink/70">{x.sub}</span>
              </span>
              <Icon name="arrowLeft" className="mt-1 h-4 w-4 shrink-0 text-muted transition-all group-hover:-translate-x-1 group-hover:text-ink" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** خطوات الحجز مع أسهم تتحرك بينها */
function HowItWorks() {
  return (
    <section className="border-y border-line bg-subtle" aria-labelledby="how-title">
      <div className="container py-14 md:py-20">
        <SectionHeading id="how-title" eyebrow="كيف يتم الحجز" title="أربع خطوات واضحة" />
        <ol className="mt-10 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-center" data-reveal-group>
          {STEPS.flatMap((s, i) => [
            <li key={s.t} className="card flex items-center gap-4 p-5 md:block md:text-center">
              <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-inverse text-primary md:mx-auto">
                <Icon name={s.icon} className="h-5 w-5" />
                <span className="num absolute -end-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-fg">{i + 1}</span>
              </span>
              <span className="block md:mt-4">
                <span className="block font-semibold">{s.t}</span>
                <span className="mt-1 block text-sm text-muted">{s.d}</span>
              </span>
            </li>,
            i < STEPS.length - 1 ? (
              <li key={`a${i}`} className="arrow-flow hidden items-center justify-center gap-0.5 text-primary md:flex" aria-hidden>
                <Icon name="chevronLeft" className="h-4 w-4" />
                <Icon name="chevronLeft" className="h-4 w-4" />
                <Icon name="chevronLeft" className="h-4 w-4" />
              </li>
            ) : null,
          ])}
        </ol>
        <div className="mt-10 text-center">
          <Link to="/book" className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 font-semibold text-primary-fg transition-colors hover:bg-primary-hover">
            ابدأ الحجز <Icon name="arrowLeft" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** ما نلتزم به في كل حجز */
function Commitments() {
  return (
    <section className="section" aria-label="التزامنا">
      <div className="container grid gap-4 md:grid-cols-3" data-reveal-group>
        {(
          [
            ['cash', 'سعر ثابت للزيارة', 'داخل عمّان أو خارجها — لا حساب بالمتر ولا بالساعة، والسعر الذي توافق عليه لا يتغير.'],
            ['file', 'تقرير مكتوب', 'بعد المعاينة تستلم تقريرًا فنيًا وعرض سعر واضحًا على حسابك.'],
            ['shield', 'لا تنفيذ بدون موافقتك', 'الإصلاح بعرض سعر منفصل، ولا نبدأ إلا بعد موافقتك عليه.'],
          ] as const
        ).map(([icon, t, d]) => (
          <div key={t} className="rounded-2xl border border-line p-6">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <Icon name={icon} className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-lg">{t}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkSection() {
  return (
    <section className="section bg-subtle" aria-labelledby="work-title">
      <div className="container">
        <SectionHeading id="work-title" eyebrow="أعمالنا" title="من مشاريعنا المنفّذة" link={{ to: '/work', label: 'كل الأعمال' }} />
        <div className="mt-10 grid gap-x-6 gap-y-10 md:grid-cols-12" data-reveal-group>
          <WorkFigure work={WORKS[2]} ratio="aspect-[4/3] lg:aspect-[5/4]" className="md:col-span-7" showText={false} />
          <div className="grid content-start gap-10 md:col-span-5">
            <WorkFigure work={WORKS[1]} ratio="aspect-[16/10]" showText={false} />
            <WorkFigure work={WORKS[3]} ratio="aspect-[16/10]" showText={false} />
          </div>
        </div>
        <ul className="mt-12 flex flex-wrap gap-2" aria-label="تخصصاتنا" data-reveal>
          {SPECIALTIES.map((t) => (
            <li key={t} className="rounded-full border border-line-strong bg-surface px-4 py-1.5 text-sm text-ink">
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** السوق في آخر الصفحة — مختصر */
function MarketTeaser() {
  const q = useAsync(() => api.get<Paged<Product>>('/store/products', { pageSize: 4 }), [], 'home/products4');
  const items = q.data?.items ?? [];
  if (q.error || (!q.loading && !items.length)) return null;
  return (
    <section className="section" aria-labelledby="store-title">
      <div className="container">
        <SectionHeading id="store-title" eyebrow="السوق" title="منتجات وتجهيزات" link={{ to: '/store', label: 'تصفح السوق' }} />
        <div className="mt-8">
          {q.loading ? (
            <ProductGridSkeleton count={4} className={PRODUCT_GRID} />
          ) : (
            <div className={PRODUCT_GRID} data-reveal-group>
              {items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
