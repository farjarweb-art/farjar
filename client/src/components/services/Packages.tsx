import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, Modal, Skeleton, type IconName } from '../ui';
import { useI18n } from '../../lib/i18n';
import { cx, formatJOD } from '../../lib/format';
import { pickLang, pickLines, type ServiceCard } from '../../lib/siteServices';

/** أيقونات يختار منها المدير لعنوان الباقة */
export const PACKAGE_ICONS: IconName[] = ['home', 'gear', 'shield', 'star', 'search', 'wrench', 'factory', 'store', 'sun', 'users'];

const iconOf = (s: ServiceCard): IconName => (PACKAGE_ICONS.includes(s.icon as IconName) ? (s.icon as IconName) : 'check');

/** "الباقة الأساسية" ← الكلمة الأولى بيضاء والباقي برتقالي (كما في هوية الموقع) */
function Title({ text, className }: { text: string; className?: string }) {
  const [first, ...rest] = text.split(' ');
  return (
    <span className={className}>
      {first} {rest.length > 0 && <span className="text-primary">{rest.join(' ')}</span>}
    </span>
  );
}

const MAX_ON_CARD = 5;

/**
 * بطاقة باقة بتصميم الواجهة: داكنة دائمًا، صورة الأجهزة على الطرف، قائمة ما تشمله، وشارة السعر.
 * select: في صفحة الحجز تختار الباقة بدل الانتقال لها.
 */
export function PackageCard({ pkg, onSelect, selected }: { pkg: ServiceCard; onSelect?: () => void; selected?: boolean }) {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const name = pickLang(lang, pkg.name, pkg.nameEn);
  const items = pickLines(lang, pkg.includes ?? [], pkg.includesEn);
  const choose = () => (onSelect ? onSelect() : navigate(`/services/${pkg.slug}/book`));
  return (
    <>
      <article
        className={cx(
          'relative overflow-hidden rounded-2xl border bg-[#191919] text-white shadow-[0_10px_30px_-12px_rgb(0_0_0/0.6)] transition-all',
          selected ? 'border-primary ring-2 ring-primary/50' : 'border-white/10 hover:border-primary/50',
        )}
      >
        {pkg.featured && (
          <span className="absolute start-4 top-4 z-10 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-fg shadow">الأكثر طلبًا</span>
        )}
        <div className="grid grid-cols-[1fr_minmax(0,38%)] sm:grid-cols-[1fr_minmax(0,36%)]">
          <div className="min-w-0 p-4 pe-10 sm:p-6 sm:pe-14">
            <h3 className={cx('flex items-center gap-2 text-[1.15rem] font-bold leading-snug text-white sm:text-[1.4rem]', pkg.featured && 'mt-6')}>
              <Icon name={iconOf(pkg)} className="h-6 w-6 shrink-0 text-primary" />
              <Title text={name} />
            </h3>
            <ul className="mt-3 space-y-1.5 border-s-2 border-primary/70 ps-3 text-[13px] leading-relaxed text-white/85 sm:text-[15px]">
              {items.slice(0, MAX_ON_CARD).map((x) => (
                <li key={x} className="flex items-start gap-2">
                  <Icon name="check" className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" /> {x}
                </li>
              ))}
              {items.length > MAX_ON_CARD && <li className="text-white/60">{`+ ${items.length - MAX_ON_CARD} بنود أخرى`}</li>}
            </ul>
          </div>
          <div className="relative min-h-full">
            {pkg.imageUrl ? (
              <img src={pkg.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-white/5">
                <Icon name={iconOf(pkg)} className="h-12 w-12 text-white/30" />
              </div>
            )}
            <div className="absolute inset-y-0 start-0 w-10 bg-gradient-to-l from-transparent to-[#191919] rtl:bg-gradient-to-r" />
            {/* شارة السعر على حد الصورة */}
            <div className="absolute start-0 top-1/2 grid min-w-[4.5rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl bg-primary px-2.5 py-2 text-center text-primary-fg shadow-lg rtl:translate-x-1/2 sm:min-w-[5.5rem]">
              <span className="font-display text-2xl font-extrabold leading-none sm:text-[2rem]">{pkg.priceOnRequest ? '—' : Number(pkg.priceInside).toLocaleString('en-US')}</span>
              <span className="mt-1 text-[12px] font-bold">دينار</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3 sm:px-6">
          <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-white/20 px-3.5 text-sm font-semibold text-white transition-colors hover:border-white/50">
            <Icon name="info" className="h-4 w-4" /> عرض التفاصيل
          </button>
          <button
            type="button"
            onClick={choose}
            className={cx(
              'ms-auto inline-flex min-h-[42px] items-center gap-1.5 rounded-lg px-4 text-sm font-bold transition-colors',
              selected ? 'bg-success text-white' : 'bg-primary text-primary-fg hover:bg-primary-hover',
            )}
          >
            {selected ? (
              <>
                <Icon name="check" className="h-4 w-4" /> تم اختيار الباقة
              </>
            ) : (
              <>
                اختيار الباقة <Icon name="arrowLeft" className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </article>
      {open && <PackageDetails pkg={pkg} onClose={() => setOpen(false)} onChoose={choose} />}
    </>
  );
}

/** تفاصيل الباقة كاملة: الصورة، الوصف، كل ما تشمله، السعر، ثم احجز الآن */
export function PackageDetails({ pkg, onClose, onChoose }: { pkg: ServiceCard; onClose: () => void; onChoose: () => void }) {
  const { lang } = useI18n();
  const items = pickLines(lang, pkg.includes ?? [], pkg.includesEn);
  return (
    <Modal
      open
      onClose={onClose}
      title={pickLang(lang, pkg.name, pkg.nameEn)}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="font-display text-2xl font-bold">{pkg.priceOnRequest ? 'يحدد بعد المعاينة' : formatJOD(pkg.priceInside)}</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onChoose();
            }}
            className="inline-flex min-h-[46px] items-center gap-2 rounded-lg bg-primary px-6 font-bold text-primary-fg hover:bg-primary-hover"
          >
            <Icon name="calendar" className="h-4 w-4" /> احجز الآن
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {pkg.imageUrl && <img src={pkg.imageUrl} alt="" className="aspect-[16/9] w-full rounded-xl bg-[#efe8dc] object-cover" />}
        {(pickLang(lang, pkg.summary, pkg.summaryEn) || '') && <p className="text-[15px] leading-relaxed text-muted">{pickLang(lang, pkg.summary, pkg.summaryEn)}</p>}
        <section>
          <h3 className="text-base">ما تشمله الباقة</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {items.map((x) => (
              <li key={x} className="flex items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-sm">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {x}
              </li>
            ))}
          </ul>
        </section>
        <p className="text-[13px] text-muted">السعر لزيارة داخل عمّان وخارجها، وقد تُضاف رسوم انتقال لبعض المحافظات البعيدة وتظهر قبل التأكيد. أعمال الإصلاح بعرض سعر منفصل ولا تبدأ إلا بموافقتك.</p>
      </div>
    </Modal>
  );
}

const TABS = [
  ['main', 'الباقات الرئيسية', 'star'],
  ['extra', 'باقات إضافية', 'plus'],
  ['info', 'معلومات الخدمة', 'info'],
] as const;
type Tab = (typeof TABS)[number][0];

/** الباقات: تبويبات (الرئيسية / الإضافية / معلومات الخدمة) — للصفحة الرئيسية وأول خطوة في الحجز */
export function PackagesShowcase({
  services,
  loading,
  selectedSlug,
  onSelect,
  onBrowseSingles,
}: {
  services: ServiceCard[];
  loading?: boolean;
  selectedSlug?: string;
  onSelect?: (slug: string) => void;
  /** في صفحة الحجز: يفتح قائمة الفحوصات المنفردة بدل الانتقال لصفحتها */
  onBrowseSingles?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('main');
  const byOrder = (a: ServiceCard, b: ServiceCard) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  const main = services.filter((s) => s.kind === 'PACKAGE').sort(byOrder);
  const extra = services.filter((s) => s.kind === 'ADDON').sort(byOrder);
  return (
    <div>
      <div role="tablist" aria-label="الباقات" className="grid grid-cols-3 gap-1.5 rounded-2xl border border-white/10 bg-[#141414] p-1.5">
        {TABS.map(([k, label, icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cx(
              'inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl px-1.5 text-[13px] font-bold transition-colors sm:text-sm',
              tab === k ? 'bg-primary text-primary-fg' : 'text-white/75 hover:text-white',
            )}
          >
            <Icon name={icon} className="hidden h-4 w-4 shrink-0 min-[400px]:block" /> {label}
          </button>
        ))}
      </div>

      <div key={tab} className="anim-fade mt-4">
        {tab === 'main' &&
          (loading ? (
            <div className="grid gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-60 rounded-2xl" />
              ))}
            </div>
          ) : main.length ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {main.map((p) => (
                <PackageCard key={p.id} pkg={p} selected={selectedSlug === p.slug} onSelect={onSelect ? () => onSelect(p.slug) : undefined} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-white/5 p-5 text-white/70">لا توجد باقات منشورة حاليًا.</p>
          ))}

        {tab === 'extra' && (
          <div className="space-y-4">
            {extra.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-3">
                {extra.map((p) => (
                  <PackageCard key={p.id} pkg={p} selected={selectedSlug === p.slug} onSelect={onSelect ? () => onSelect(p.slug) : undefined} />
                ))}
              </div>
            )}
            <div className="rounded-2xl border border-white/10 bg-[#191919] p-5 text-white">
              <h3 className="text-lg font-bold text-white">فحوصات متخصصة منفردة</h3>
              <p className="mt-1 text-sm text-white/70">
                {extra.length ? 'إضافة على الباقات: ' : ''}كشف التسربات، فحص الكهرباء، التشققات، المنشآت الصناعية واللافتات — كل فحص بسعره المستقل، ويمكن إضافة أجهزة فحص لأي باقة عند الحجز.
              </p>
              {onBrowseSingles ? (
                <button type="button" onClick={onBrowseSingles} className="mt-3 inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-primary/60 px-4 text-sm font-bold text-primary hover:bg-primary/10">
                  عرض الفحوصات المتخصصة <Icon name="chevronDown" className="h-4 w-4" />
                </button>
              ) : (
                <Link to="/services" className="mt-3 inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-primary/60 px-4 text-sm font-bold text-primary hover:bg-primary/10">
                  تصفّح الفحوصات المتخصصة <Icon name="arrowLeft" className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        )}

        {tab === 'info' && <ServiceInfo />}
      </div>
    </div>
  );
}

const INFO: { t: string; d: string; icon: IconName }[] = [
  { t: 'اختر الباقة', d: 'قارن بين الباقات واختر ما يناسب عقارك، أو أضف فحوصات متخصصة.', icon: 'grid' },
  { t: 'حدد الموعد والموقع', d: 'تختار اليوم والساعة بنفسك وتحدد موقع العقار على الخريطة.', icon: 'calendar' },
  { t: 'نفحص بالأجهزة المتخصصة', d: 'فريق فرجار يزورك بالأجهزة المشمولة في باقتك ويسجّل إحداثيات الملاحظات.', icon: 'search' },
  { t: 'تقرير فني وعرض سعر', d: 'تستلم التقرير وعرض سعر الإصلاح في حسابك — والتنفيذ اختياري وبموافقتك فقط.', icon: 'file' },
];

function ServiceInfo() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#191919] p-5 text-white sm:p-6">
      <ol className="grid gap-4 sm:grid-cols-2">
        {INFO.map((x, i) => (
          <li key={x.t} className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Icon name={x.icon} className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-bold text-white">
                {i + 1}. {x.t}
              </span>
              <span className="mt-0.5 block text-sm text-white/70">{x.d}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-5 rounded-xl bg-white/5 px-4 py-3 text-sm text-white/75">
        الشفافية أولًا: سعر الباقة واضح قبل التأكيد، ولا نضيف أي رسوم أو فحوصات دون موافقتك.
      </p>
    </div>
  );
}

/** شريط الثقة أسفل الباقات */
export function TrustBar() {
  const items: [IconName, string][] = [
    ['users', 'فريق متخصص ومعدات متطورة'],
    ['shield', 'تقارير فنية مفصّلة وعروض أسعار واضحة'],
    ['star', 'خبرة أكثر من 13 عامًا'],
  ];
  return (
    <div className="grid grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-[#141414] py-3 text-white rtl:divide-x-reverse">
      {items.map(([icon, t]) => (
        <div key={t} className="flex flex-col items-center gap-1.5 px-2 text-center sm:flex-row sm:justify-center sm:gap-2.5 sm:text-start">
          <Icon name={icon} className="h-6 w-6 shrink-0 text-primary" />
          <span className="text-[12px] font-semibold leading-snug text-white/85 sm:text-sm">{t}</span>
        </div>
      ))}
    </div>
  );
}
