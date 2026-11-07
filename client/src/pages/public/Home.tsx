import { Link } from 'react-router-dom';
import { VisitorCount } from '../../components/layout/VisitorCount';
import { PRODUCT_GRID, ProductCard, ProductGridSkeleton } from '../../components/store/ProductCard';
import { Icon, SectionHeading, type IconName } from '../../components/ui';
import { WorkFigure } from '../../components/work/WorkFigure';
import { useSite } from '../../context/SiteContext';
import { api } from '../../lib/api';
import { BRAND } from '../../lib/brand';
import { displayPhone, waLink } from '../../lib/format';
import { PackagesShowcase, TrustBar } from '../../components/services/Packages';
import { type ServiceCard } from '../../lib/siteServices';
import type { Paged, Product } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';
import { SPECIALTIES, WORKS } from '../../lib/works';

const STEPS: { t: string; d: string; icon: IconName }[] = [
  { t: 'اختر الباقة', d: 'الأساسية أو المتقدمة أو الشاملة', icon: 'grid' },
  { t: 'اعرف السعر', d: 'سعر الباقة واضح قبل التأكيد', icon: 'cash' },
  { t: 'نزورك بالموعد', d: 'فني مختص في اليوم الذي تختاره', icon: 'calendar' },
  { t: 'تقرير وعرض سعر', d: 'ولا ننفذ إلا بموافقتك', icon: 'file' },
];

/** الرئيسية: الباقات الفنية هي المدخل — واجهة، الباقات (رئيسية / إضافية / معلومات)، ثم كيف نعمل والأعمال والسوق */
export default function Home() {
  useDocumentTitle('');
  const services = useAsync(() => api.get<{ services: ServiceCard[] }>('/site-services'), [], 'site-services');
  const list = services.data?.services ?? [];

  return (
    <>
      <PackagesHero />
      <section id="packages" className="scroll-mt-20 bg-[#0f0f0f] pb-10 pt-6 md:pb-14" aria-label="الباقات الفنية">
        <div className="container space-y-5">
          {services.error ? (
            <p className="rounded-xl bg-white/5 p-5 text-white/75">تعذر تحميل الباقات الآن. حدّث الصفحة بعد قليل.</p>
          ) : (
            <PackagesShowcase services={list} loading={services.loading} />
          )}
          <TrustBar />
        </div>
      </section>
      <HowItWorks />
      <Commitments />
      <WorkSection />
      <MarketTeaser />
    </>
  );
}

/** الواجهة: صورة عقار + العنوان */
function PackagesHero() {
  const { settings } = useSite();
  return (
    <section className="relative overflow-hidden bg-[#0f0f0f] text-white">
      <img src="/images/work/villa.webp" alt="" className="absolute inset-y-0 end-0 h-full w-[70%] object-cover object-[92%_center] opacity-90 sm:w-[62%]" loading="eager" decoding="async" />
      <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[#0f0f0f]/70 to-[#0f0f0f] rtl:bg-gradient-to-r" />
      <span className="absolute -bottom-10 end-[30%] h-[140%] w-3 rotate-[24deg] bg-primary/90 shadow-[0_0_40px_rgb(241_164_40/0.5)]" aria-hidden />
      <div className="container relative py-10 sm:py-16 lg:py-24">
        <p className="eyebrow anim-rise !text-white/60">{BRAND.alt} — فحص وصيانة العقارات</p>
        <VisitorCount className="mt-3 border-white/15 bg-white/5 text-white/80" />
        <h1 className="anim-rise mt-3 max-w-xl text-[2rem] font-extrabold leading-[1.35] text-white [animation-delay:60ms] sm:text-[2.6rem] lg:text-[3.25rem]">
          فحص دقيق ..
          <br />
          <span className="text-primary">حلول متكاملة</span>
        </h1>
        <p className="anim-rise mt-3 max-w-md text-[17px] text-white/75 [animation-delay:120ms] sm:text-lg">للعقار بأعلى معايير الجودة</p>
        <div className="anim-rise mt-7 flex flex-wrap gap-3 [animation-delay:180ms]">
          <a href="#packages" className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 font-bold text-primary-fg shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] transition-colors hover:bg-primary-hover">
            اختر باقتك <Icon name="chevronDown" className="h-4 w-4" />
          </a>
          <Link to="/book" className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/25 px-5 font-semibold text-white transition-colors hover:border-white/60">
            <Icon name="calendar" className="h-4 w-4" /> احجز الآن
          </Link>
        </div>
        <p className="anim-rise mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/60 [animation-delay:240ms]">
          <a href={`tel:${settings.phone}`} className="inline-flex min-h-[44px] items-center gap-2 transition-colors hover:text-white">
            <Icon name="phone" className="h-4 w-4 text-primary" />
            <span className="ltr">{settings.phone}</span>
          </a>
          <a href={waLink(settings.whatsappNumber, 'مرحبًا، أريد حجز فحص للعقار')} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-2 transition-colors hover:text-white">
            <Icon name="whatsapp" className="h-4 w-4 text-primary" />
            واتساب <span className="ltr">{displayPhone(settings.whatsappNumber)}</span>
          </a>
        </p>
      </div>
    </section>
  );
}

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
