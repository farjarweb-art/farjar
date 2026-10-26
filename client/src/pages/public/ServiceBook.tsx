import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AccountNote, useAccountPrefill } from '../../components/forms/AccountPrefill';
import { FilePicker } from '../../components/forms/FilePicker';
import { ReviewSection, StepActions, StepHeading, SubmissionSuccess } from '../../components/forms/FormBits';
import { LocationPicker } from '../../components/forms/LocationPicker';
import { SlotPicker, longDate } from '../../components/forms/SlotPicker';
import { MB, focusFirstError } from '../../components/forms/formUtils';
import { DeviceCard } from '../../components/services/DeviceCard';
import { PriceSummary } from '../../components/services/PriceSummary';
import { Alert, Breadcrumbs, Button, Checkbox, ChoiceGroup, ErrorState, Icon, Input, Select, Skeleton, Stepper, Textarea } from '../../components/ui';
import { ApiError, api, toFormData } from '../../lib/api';
import { cx, formatDate, formatJOD, formatSlot, isValidPhone } from '../../lib/format';
import {
  REQUEST_TYPE_LABEL,
  SCOPE_PRICED,
  TIER_LABEL,
  URGENCY_HINT,
  URGENCY_LABEL,
  allowedDevices,
  cleanDeviceName,
  mapsLink,
  normalizeDetail,
  type Audience,
  type ClientType,
  type FormField,
  type RequestCreated,
  type RequestType,
  type ServiceCard,
  type ServiceDetail,
  type Urgency,
  type VisitQuote,
  type Zone,
} from '../../lib/siteServices';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';
import { prepareWhatsAppWindow } from '../../lib/whatsapp';

/** نوع العقار يحدد قسم الخدمات (منازل وشقق / شركات ومصانع) */
const PROPERTIES: { label: string; audience: Audience; client: ClientType; icon: 'home' | 'store' | 'briefcase' }[] = [
  { label: 'شقة سكنية', audience: 'HOME', client: 'INDIVIDUAL', icon: 'home' },
  { label: 'منزل مستقل', audience: 'HOME', client: 'INDIVIDUAL', icon: 'home' },
  { label: 'فيلا', audience: 'HOME', client: 'INDIVIDUAL', icon: 'home' },
  { label: 'قصر', audience: 'HOME', client: 'INDIVIDUAL', icon: 'home' },
  { label: 'مجمع تجاري', audience: 'BUSINESS', client: 'COMPANY', icon: 'store' },
  { label: 'شركة', audience: 'BUSINESS', client: 'COMPANY', icon: 'briefcase' },
];

const STEPS = ['الخدمة والفحوصات', 'العقار والموقع', 'التواصل', 'الموعد', 'الصور والتأكيد'];

/** ملاحظة الإضافات التشخيصية كما تظهر للعميل */
const ADDON_NOTE = 'ملاحظة: هذا كشف فني أولي لا يشمل أي فحص مخبري أو أجهزة متقدمة إلا بناءً على الطلب، ويتم تسعير كل إضافة حسب طلب العميل وتشخيص الموقع.';

type Catalog = { services: (ServiceCard & { requestTypes?: RequestType[] })[]; zones: Zone[]; ownershipOptions: string[]; generalTerms: string[] };

type Vals = {
  ownership: string;
  propertyType: string;
  zoneId: string;
  area: string;
  address: string;
  lat: number | null;
  lng: number | null;
  name: string;
  phone: string;
  phoneWhatsapp: boolean;
  phone2: string;
  phone2Whatsapp: boolean;
  date: string;
  time: string;
  slug: string;
  urgency: Urgency;
  requestType: RequestType | '';
  problemIds: string[];
  deviceIds: string[];
  extraIds: string[];
  description: string;
  problemLocation: string;
  notes: string;
  accept: boolean;
};

const EMPTY: Vals = {
  ownership: '', propertyType: '', zoneId: '', area: '', address: '', lat: null, lng: null,
  name: '', phone: '', phoneWhatsapp: true, phone2: '', phone2Whatsapp: false,
  date: '', time: '', slug: '', urgency: 'NORMAL', requestType: '', problemIds: [], deviceIds: [], extraIds: [],
  description: '', problemLocation: '', notes: '', accept: false,
};

/** مفاتيح حقول كل خطوة (للتنقل لأول خطأ) */
const STEP_KEYS = [
  ['slug', 'urgency', 'requestType', 'problemIds', 'deviceIds'],
  ['ownership', 'propertyType', 'zoneId', 'area', 'address', 'lat'],
  ['name', 'phone', 'phone2'],
  ['time'],
  ['description', 'problemLocation', 'photos', 'video', 'notes', 'accept'],
];
const stepOf = (k: string) => {
  if (k === 'date') return 3;
  if (k === 'lng') return 1;
  if (k === 'serviceIds') return 0;
  if (k.startsWith('extra.')) return 0;
  const i = STEP_KEYS.findIndex((ks) => ks.includes(k));
  return i < 0 ? 4 : i;
};

const MAX_VIDEO_MB = 40;
const samePhone = (a: string, b: string) => a.replace(/\D/g, '').slice(-9) === b.replace(/\D/g, '').slice(-9);

/**
 * الحجز الموحد لزيارات المعاينة والفحص والصيانة:
 * العقار والموقع ← التواصل ← الموعد ← الخدمة والفحوصات ← الصور والتأكيد
 */
export default function ServiceBook() {
  const { slug: routeSlug = '' } = useParams();
  const [params] = useSearchParams();
  const catalog = useAsync(() => api.get<Catalog>('/site-services'), [], 'site-services:book');
  const c = catalog.data;

  const [v, setV] = useState<Vals>(() => ({
    ...EMPTY,
    slug: routeSlug || params.get('service') || '',
    ownership: params.get('ownership') ?? '',
    urgency: (['URGENT', 'EMERGENCY'] as const).find((u) => u === params.get('urgency')) ?? 'NORMAL',
  }));
  /** قسم الخدمات كما في الصفحة الرئيسية: منازل وشقق / شركات ومصانع */
  const [tab, setTab] = useState<Audience>(params.get('for') === 'business' ? 'BUSINESS' : 'HOME');
  const [areaOther, setAreaOther] = useState(false);
  /** قائمة الخدمات مفتوحة حتى يختار العميل خدمة، ثم تُطوى لتظهر تفاصيلها مباشرة */
  const [pickOpen, setPickOpen] = useState(() => !(routeSlug || params.get('service')));
  const [mapLink, setMapLink] = useState('');
  const [mapLinkState, setMapLinkState] = useState<{ loading?: boolean; error?: string; ok?: boolean }>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [documents, setDocuments] = useState<File[]>([]);
  const [extra, setExtra] = useState<Record<string, string | string[]>>({});
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<VisitQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);
  const [slotsKey, setSlotsKey] = useState(0);
  const [done, setDone] = useState<RequestCreated | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const detail = useAsync(
    () => (v.slug ? api.get<ServiceDetail>(`/site-services/${encodeURIComponent(v.slug)}`).then(normalizeDetail) : Promise.resolve(null)),
    [v.slug],
    v.slug ? `service:${v.slug}` : undefined,
  );
  const d = v.slug ? detail.data : null;
  const s = d?.service;
  useDocumentTitle(s ? `حجز: ${s.name}` : 'احجز زيارة كشف فني');

  useAccountPrefill((x) => setV((y) => ({ ...y, name: y.name || x.name, phone: y.phone || x.localPhone })));

  const property = PROPERTIES.find((p) => p.label === v.propertyType);
  const audience: Audience = tab;
  const properties = PROPERTIES.filter((p) => p.audience === tab);
  const services = useMemo(() => (c ? c.services.filter((x) => x.audiences.includes(tab)) : []), [c, tab]);
  const zone = c?.zones.find((z) => z.id === v.zoneId);

  // خدمة محددة مسبقًا (من الصفحة الرئيسية أو صفحة الخدمة): نفتح قسمها
  const synced = useRef(false);
  useEffect(() => {
    if (!c || synced.current) return;
    synced.current = true;
    const svc = c.services.find((x) => x.slug === v.slug);
    if (svc && !svc.audiences.includes(tab)) setTab(svc.audiences[0]);
  }, [c, v.slug, tab]);
  // نوع العقار يتبع القسم المختار
  useEffect(() => {
    if (v.propertyType && !PROPERTIES.some((p) => p.label === v.propertyType && p.audience === tab)) setV((x) => ({ ...x, propertyType: '' }));
  }, [tab, v.propertyType]);

  // نوع الطلب الافتراضي = أول نوع متاح (أو الوحيد)
  useEffect(() => {
    if (s && (!v.requestType || !s.requestTypes.some((t) => t.value === v.requestType))) {
      const pref = s.requestTypes.find((t) => t.value === 'INSPECTION_REPORT') ?? s.requestTypes[0];
      setV((x) => ({ ...x, requestType: pref?.value ?? '' }));
    }
  }, [s, v.requestType]);

  const devices = useMemo(() => (s ? allowedDevices(s, v.problemIds) : []), [s, v.problemIds]);
  /** الأجهزة المقترحة للمشكلات المختارة (تظهر أولًا بعلامة "مقترح") */
  const recommended = useMemo(() => {
    if (!s) return new Set<string>();
    return new Set(s.problems.filter((p) => v.problemIds.includes(p.id) && !p.isOther).flatMap((p) => p.deviceIds));
  }, [s, v.problemIds]);
  const sortedDevices = useMemo(() => [...devices].sort((a, b) => Number(recommended.has(b.id)) - Number(recommended.has(a.id))), [devices, recommended]);
  const freeAdds = useMemo(() => {
    if (!s) return [];
    const accIds = new Set(s.devices.filter((x) => v.deviceIds.includes(x.id)).flatMap((x) => x.accessoryIds));
    return s.devices.filter((x) => x.autoInclude || (x.parentId && accIds.has(x.id)));
  }, [s, v.deviceIds]);
  const urgencies = useMemo(
    () => (s ? ([['NORMAL', s.priceInside], ['URGENT', s.priceUrgent], ['EMERGENCY', s.priceEmergency]] as [Urgency, number | null][]).filter(([u, p]) => u === 'NORMAL' || p != null) : []),
    [s],
  );
  useEffect(() => {
    if (s && !urgencies.some(([u]) => u === v.urgency)) setV((x) => ({ ...x, urgency: 'NORMAL' }));
  }, [s, urgencies, v.urgency]);
  // الأجهزة غير المتاحة للخدمة الجديدة تُزال
  useEffect(() => {
    const ok = new Set(devices.map((x) => x.id));
    setV((x) => (x.deviceIds.every((id) => ok.has(id)) ? x : { ...x, deviceIds: x.deviceIds.filter((id) => ok.has(id)) }));
  }, [devices]);

  const serviceIds = useMemo(() => (s ? [s.id, ...v.extraIds] : []), [s, v.extraIds]);
  const needsProblems = !!s?.problems.length;
  const quoteBody = { serviceIds, zoneId: v.zoneId, problemIds: v.problemIds, deviceIds: v.deviceIds, urgency: v.urgency };
  const quoteKey = JSON.stringify(quoteBody);

  // السعر الحي من السيرفر (نفس الحساب الذي يُعتمد عند التأكيد)
  useEffect(() => {
    if (!s || !v.zoneId || (needsProblems && !v.problemIds.length)) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let live = true;
    setQuoting(true);
    const t = window.setTimeout(() => {
      api
        .post<VisitQuote>('/site-services/quote', quoteBody)
        .then((q) => {
          if (!live) return;
          setQuote(q);
          setQuoteError(null);
        })
        .catch((e: unknown) => live && setQuoteError(e instanceof ApiError ? e.message : 'تعذر حساب السعر'))
        .finally(() => live && setQuoting(false));
    }, 200);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  if (catalog.error) {
    return (
      <div className="container py-16">
        <ErrorState message={catalog.error.message} onRetry={catalog.reload} />
      </div>
    );
  }
  if (!c) {
    return (
      <div className="container space-y-4 py-12">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const set = <K extends keyof Vals>(k: K, value: Vals[K]) => {
    setV((x) => ({ ...x, [k]: value }));
    setErrors((e) => (e[k as string] ? { ...e, [k]: '' } : e));
  };
  const toggle = (k: 'problemIds' | 'deviceIds' | 'extraIds', id: string) => set(k, v[k].includes(id) ? v[k].filter((x) => x !== id) : [...v[k], id]);
  const chooseService = (slug: string) => {
    setV((x) => (x.slug === slug ? x : { ...x, slug, problemIds: [], deviceIds: [], extraIds: [], requestType: '' }));
    setPickOpen(false);
    setExtra({});
    setErrors((e) => ({ ...e, slug: '' }));
  };

  async function readMapLink() {
    const u = mapLink.trim();
    if (!u) return;
    setMapLinkState({ loading: true });
    try {
      const p = await api.get<{ lat: number; lng: number }>(`/site-services/map-link?u=${encodeURIComponent(u)}`);
      setV((x) => ({ ...x, lat: p.lat, lng: p.lng }));
      setErrors((e) => ({ ...e, lat: '' }));
      setMapLinkState({ ok: true });
    } catch (e) {
      setMapLinkState({ error: e instanceof ApiError ? e.message : 'تعذر قراءة الرابط' });
    }
  }

  function validate(i: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (i === 1) {
      if (c!.ownershipOptions.length && !v.ownership) e.ownership = 'اختر صفتك بالنسبة للعقار';
      if (!property) e.propertyType = 'اختر نوع العقار';
      if (!v.zoneId) e.zoneId = 'اختر المحافظة';
      if (!v.area.trim()) e.area = 'اختر أو اكتب المنطقة';
      if (v.address.trim().length < 5) e.address = 'اكتب العنوان بالتفصيل';
      if (v.lat == null || v.lng == null) e.lat = 'حدد موقع العقار: بزر GPS، أو بلصق رابط الخريطة، أو من الخريطة';
    }
    if (i === 2) {
      if (v.name.trim().length < 2) e.name = 'اكتب اسمك';
      if (!isValidPhone(v.phone)) e.phone = 'رقم الهاتف غير صحيح (مثال: 0791234567)';
      if (!v.phone2.trim()) e.phone2 = 'الرقم الثانوي مطلوب';
      else if (!isValidPhone(v.phone2)) e.phone2 = 'الرقم الثانوي غير صحيح (مثال: 0781234567)';
      else if (isValidPhone(v.phone) && samePhone(v.phone, v.phone2)) e.phone2 = 'اكتب رقمًا مختلفًا عن الرقم الأساسي';
    }
    if (i === 3 && (!v.date || !v.time)) e.time = 'اختر اليوم والموعد المناسب للزيارة';
    if (i === 0) {
      if (!s) e.slug = 'اختر الخدمة أو نوع المشكلة';
      else {
        if (!v.requestType) e.requestType = 'اختر نوع الطلب';
        if (needsProblems && !v.problemIds.length) e.problemIds = s.optionsLabel ? 'اختر خيارًا واحدًا على الأقل' : 'اختر المشكلة التي تواجهها (يمكنك اختيار أكثر من مشكلة)';
        for (const f of s.formFields) {
          const val = extra[f.key];
          const empty = Array.isArray(val) ? !val.length : !String(val ?? '').trim();
          if (f.required && empty) e[`extra.${f.key}`] = `${f.label} مطلوب`;
          else if (f.type === 'number' && !empty && !/^\d+(\.\d+)?$/.test(String(val).trim())) e[`extra.${f.key}`] = `"${f.label}" يجب أن يكون رقمًا`;
        }
      }
    }
    if (i === 4) {
      if (v.description.trim().length < 5) e.description = 'صف المشكلة أو المطلوب باختصار (5 أحرف على الأقل)';
      if (video && video.size > MAX_VIDEO_MB * MB) e.video = `حجم الفيديو أكبر من ${MAX_VIDEO_MB} ميغابايت`;
      if (!v.accept) e.accept = 'يجب الموافقة على ملخص السعر والشروط لتأكيد الحجز';
    }
    return e;
  }

  function goTo(i: number) {
    setStep(i);
    setSubmitError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function next() {
    const e = validate(step);
    if (Object.keys(e).length) {
      setErrors(e);
      window.setTimeout(() => focusFirstError(formRef.current, STEP_KEYS[step], e), 30);
      return;
    }
    goTo(step + 1);
  }

  async function submit() {
    for (let i = 0; i < STEPS.length; i++) {
      const e = validate(i);
      if (Object.keys(e).length) {
        setErrors(e);
        if (i !== step) goTo(i);
        window.setTimeout(() => focusFirstError(formRef.current, STEP_KEYS[i], e), 60);
        return;
      }
    }
    if (!quote || !s || !property) {
      setSubmitError(quoteError ?? 'انتظر حتى يظهر ملخص السعر');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setPriceChanged(false);
    const wa = prepareWhatsAppWindow();
    try {
      const payload = {
        ...quoteBody,
        ownership: v.ownership || undefined,
        requestType: v.requestType,
        name: v.name.trim(),
        phone: v.phone.trim(),
        phoneWhatsapp: v.phoneWhatsapp,
        phone2: v.phone2.trim(),
        phone2Whatsapp: v.phone2Whatsapp,
        clientType: property.client,
        propertyType: property.label,
        area: v.area.trim(),
        address: v.address.trim(),
        lat: v.lat,
        lng: v.lng,
        description: v.description.trim(),
        problemLocation: v.problemLocation.trim() || undefined,
        notes: v.notes.trim() || undefined,
        date: v.date,
        time: v.time,
        expectedTotal: quote.total,
        acceptTerms: true,
        extra,
      };
      const res = await api.post<RequestCreated>('/site-services/requests', toFormData(payload, { photos, video, documents }));
      if (res.whatsapp.sent) wa.cancel();
      else wa.open(res.whatsapp.link);
      setDone(res);
      window.scrollTo({ top: 0 });
    } catch (e) {
      wa.cancel();
      const err = e instanceof ApiError ? e : new ApiError('تعذر إرسال الطلب، حاول مرة أخرى', 0, 'UNKNOWN');
      if (err.code === 'PRICE_CHANGED') {
        setPriceChanged(true);
        set('accept', false);
        setQuote(null);
        api.post<VisitQuote>('/site-services/quote', quoteBody).then(setQuote).catch(() => undefined);
      } else if (err.code === 'SLOT_TAKEN') {
        setV((x) => ({ ...x, time: '' }));
        setSlotsKey((k) => k + 1);
        setErrors({ time: err.message });
        goTo(3);
      } else {
        const key = err.field ? err.field.replace(/^details\./, '') : null;
        if (key) {
          setErrors({ [key]: err.message });
          const i = stepOf(key);
          if (i !== step) goTo(i);
        }
        setSubmitError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <SubmissionSuccess noun="الطلب" title="تم استلام طلبك" number={done.number} refCode={done.ref} whatsapp={done.whatsapp} message={done.message}>
        <dl className="divide-y divide-line rounded-xl border border-line">
          <Summary label="الخدمة" value={s?.name ?? ''} />
          <Summary label="الموعد المطلوب" value={formatDate(done.scheduledAt, true)} />
          <Summary label="الإجمالي المعتمد" value={formatJOD(done.total)} />
        </dl>
        <p className="text-sm text-muted">سيتواصل معك فريق فرجار جروب لتأكيد الموعد. السعر المعتمد لا يتغير حتى لو تغيّرت الأسعار لاحقًا.</p>
      </SubmissionSuccess>
    );
  }

  const err = (k: string) => errors[k] || undefined;
  const terms = [...c.generalTerms, ...(quote?.terms ?? (s?.terms ? [s.terms] : []))];
  const hasStructural = devices.some((x) => /شميدت|ميول|الليزري|هبوط/.test(x.name));

  return (
    <>
      <header className="border-b border-line bg-subtle">
        <div className="container py-7 md:py-10">
          <Breadcrumbs items={[{ to: '/services', label: 'الخدمات والمعاينات' }, ...(s ? [{ to: `/services/${s.slug}`, label: s.name }] : []), { label: 'الحجز' }]} className="mb-4" />
          <h1 className="max-w-4xl text-[1.625rem] leading-snug md:text-[2.125rem]">{s ? s.name : 'احجز زيارة كشف فني'}</h1>
          <p className="mt-2 max-w-2xl text-muted">زيارة الكشف الفني الأساسي تشمل تقريرًا بحالة الموقع وعرض سعر للأعمال المطلوبة. ترى المبلغ النهائي قبل التأكيد.</p>
        </div>
      </header>

      <div className="container grid grid-cols-1 gap-8 py-8 md:py-12 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <Stepper steps={STEPS} current={step} onStep={(i) => (i < step ? goTo(i) : undefined)} />
          <div ref={formRef} className="card p-4 sm:p-6 md:p-8">
            <div key={step} className="anim-step">
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (step < STEPS.length - 1) next();
                  else void submit();
                }}
              >
                {step === 1 && (
                  <div className="space-y-6">
                    <StepHeading stepKey={step} title="بيانات العقار والموقع" />
                    {c.ownershipOptions.length > 0 && (
                      <div data-field="ownership">
                        <span className="label">صفتك بالنسبة للعقار</span>
                        <Chips options={c.ownershipOptions} value={v.ownership} onChange={(x) => set('ownership', x)} />
                        {err('ownership') && <p className="mt-1.5 text-sm text-danger">{err('ownership')}</p>}
                      </div>
                    )}
                    <fieldset data-field="propertyType">
                      <legend className="label">نوع العقار</legend>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {properties.map((p) => {
                          const on = v.propertyType === p.label;
                          return (
                            <label
                              key={p.label}
                              className={cx(
                                'flex min-h-[3.5rem] cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 font-semibold transition-all',
                                on ? 'border-brand-600 bg-brand-50/60 ring-2 ring-brand-600/25 dark:bg-brand-900/20' : 'border-line-strong hover:border-ink/50',
                              )}
                            >
                              <input type="radio" name="propertyType" className="sr-only" checked={on} onChange={() => set('propertyType', p.label)} />
                              <Icon name={p.icon} className={cx('h-5 w-5 shrink-0', on ? 'text-brand-700 dark:text-brand-300' : 'text-muted')} />
                              <span className="min-w-0">
                                <span className="block leading-tight">{p.label}</span>
                                <span className="block text-[12px] font-normal text-muted">{p.audience === 'HOME' ? 'منازل وشقق' : 'شركات ومنشآت'}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {err('propertyType') && <p className="mt-1.5 text-sm text-danger">{err('propertyType')}</p>}
                    </fieldset>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Select
                        data-field="zoneId"
                        label="المحافظة"
                        value={v.zoneId}
                        onChange={(e) => {
                          set('zoneId', e.target.value);
                          const nz = c.zones.find((z) => z.id === e.target.value);
                          if (nz?.regions.length && !nz.regions.includes(v.area)) set('area', '');
                          setAreaOther(false);
                        }}
                        error={err('zoneId')}
                      >
                        <option value="">اختر…</option>
                        {c.zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name} — {TIER_LABEL[z.tier]}
                            {z.travelFee > 0 ? ` (+ انتقال ${formatJOD(z.travelFee)})` : ''}
                          </option>
                        ))}
                      </Select>
                      {zone?.regions.length && !areaOther ? (
                        <Select
                          data-field="area"
                          label="المنطقة"
                          value={zone.regions.includes(v.area) ? v.area : ''}
                          onChange={(e) => {
                            if (e.target.value === '__other') {
                              setAreaOther(true);
                              set('area', '');
                            } else set('area', e.target.value);
                          }}
                          error={err('area')}
                        >
                          <option value="">اختر المنطقة…</option>
                          {zone.regions.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                          <option value="__other">منطقة أخرى (اكتبها)</option>
                        </Select>
                      ) : (
                        <Input data-field="area" label="المنطقة / الحي" placeholder="مثال: خلدا" value={v.area} maxLength={120} onChange={(e) => set('area', e.target.value)} error={err('area')} />
                      )}
                    </div>
                    {areaOther && (
                      <button type="button" className="-mt-3 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300" onClick={() => setAreaOther(false)}>
                        ← الاختيار من قائمة المناطق
                      </button>
                    )}
                    {zone?.requiresApproval && (
                      <Alert tone="info" title="منطقة تحتاج موافقة مسبقة">
                        هذه المنطقة بعيدة عن نطاق عملنا المعتاد — سنؤكد لك إمكانية الزيارة قبل الموعد.
                      </Alert>
                    )}
                    <Textarea data-field="address" label="العنوان بالتفصيل" placeholder="الشارع، رقم البناية، الطابق، علامة مميزة" value={v.address} maxLength={400} rows={2} onChange={(e) => set('address', e.target.value)} error={err('address')} />

                    <section className="rounded-xl border border-line p-4" data-field="lat">
                      <h3 className="flex items-center gap-2 text-base">
                        <Icon name="pin" className="h-5 w-5 text-brand-700 dark:text-brand-300" /> موقع العقار على الخريطة <span className="text-sm font-normal text-danger">(إجباري)</span>
                      </h3>
                      <p className="mt-1 text-sm text-muted">اختر الطريقة الأسهل لك: تحديد موقعك الحالي بالـ GPS، لصق رابط الموقع من خرائط Google، أو فتح الخريطة وتحديد المكان يدويًا.</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                        <Input
                          label="رابط الموقع من الخريطة"
                          placeholder="https://maps.app.goo.gl/…"
                          className="ltr text-start"
                          inputMode="url"
                          value={mapLink}
                          onChange={(e) => {
                            setMapLink(e.target.value);
                            setMapLinkState({});
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void readMapLink();
                            }
                          }}
                          error={mapLinkState.error}
                        />
                        <Button variant="outline" loading={mapLinkState.loading} disabled={!mapLink.trim()} onClick={() => void readMapLink()}>
                          <Icon name="map" className="h-4 w-4" /> اعتماد الرابط
                        </Button>
                      </div>
                      {mapLinkState.ok && <p className="mt-1.5 text-sm font-semibold text-success">تم تحديد الموقع من الرابط ✓</p>}
                      <div className="mt-4">
                        <LocationPicker
                          lat={v.lat}
                          lng={v.lng}
                          required
                          error={err('lat')}
                          onChange={(lat, lng) => {
                            setV((x) => ({ ...x, lat, lng }));
                            setErrors((e) => ({ ...e, lat: '' }));
                          }}
                          hint="أو استخدم موقعك الحالي (GPS) أو حدد المكان على الخريطة."
                        />
                      </div>
                      {v.lat != null && v.lng != null && (
                        <a href={mapsLink(v.lat, v.lng)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                          <Icon name="external" className="h-4 w-4" /> تأكد من الموقع على خرائط Google
                        </a>
                      )}
                    </section>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6">
                    <StepHeading stepKey={step} title="معلومات التواصل" description="رقمان للتواصل حتى يصل الفني إليك بسهولة يوم الزيارة." />
                    <AccountNote what="الطلب" />
                    <Input data-field="name" label="الاسم" value={v.name} maxLength={100} onChange={(e) => set('name', e.target.value)} error={err('name')} autoComplete="name" />
                    <PhoneRow field="phone" label="رقم الهاتف الأساسي" value={v.phone} onChange={(x) => set('phone', x)} wa={v.phoneWhatsapp} onWa={(x) => set('phoneWhatsapp', x)} error={err('phone')} autoComplete="tel" />
                    <PhoneRow field="phone2" label="رقم هاتف ثانوي" value={v.phone2} onChange={(x) => set('phone2', x)} wa={v.phone2Whatsapp} onWa={(x) => set('phone2Whatsapp', x)} error={err('phone2')} />
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-6">
                    <StepHeading stepKey={step} title="اختر موعد الزيارة" description="اختر اليوم ثم الموعد المناسب لك من المواعيد المتاحة." />
                    <div data-field="time">
                      <SlotPicker
                        endpoint="/site-services/slots"
                        reloadKey={slotsKey}
                        date={v.date}
                        time={v.time}
                        onChange={(date, time) => {
                          setV((x) => ({ ...x, date, time }));
                          setErrors((e) => ({ ...e, time: '' }));
                        }}
                        error={err('time')}
                        note={<span>مواعيد الزيارات محددة بفارق ساعة ونصف إلى ساعتين حتى يصل الفريق في وقته. الموعد المكتمل يظهر معطّلًا، ويتواصل معك الفريق لتأكيده.</span>}
                      />
                    </div>
                  </div>
                )}

                {step === 0 && (
                  <div className="space-y-7">
                    <StepHeading stepKey={step} title="اختر الفحص أو الخدمة" description="مثل فحص الماء والتسربات، فحص العقار قبل الشراء، أو الفحص الشامل — ثم أضف الأجهزة التي تريدها." />
                    <Alert tone="info" title="زيارة الكشف الفني الأساسي">
                      تشمل الزيارة معاينة الموقع وتقريرًا بحالته وتقديم عرض سعر للأعمال المطلوبة. سعر الزيارة يظهر على كل خدمة، والإجمالي النهائي يظهر قبل التأكيد.
                    </Alert>
                    <div role="tablist" aria-label="نوع العقار" className="grid grid-cols-2 gap-1 rounded-xl bg-inverse p-1">
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
                          onClick={() => {
                            setTab(k);
                            const cur = c.services.find((x) => x.slug === v.slug);
                            if (cur && !cur.audiences.includes(k)) setV((x) => ({ ...x, slug: '', problemIds: [], deviceIds: [], extraIds: [], requestType: '' }));
                            setPickOpen(true);
                          }}
                          className={cx('inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors', tab === k ? 'bg-primary text-primary-fg' : 'text-inverse-fg/70 hover:text-inverse-fg')}
                        >
                          <Icon name={icon} className="h-4 w-4" /> {label}
                        </button>
                      ))}
                    </div>
                    <fieldset data-field="slug">
                      <legend className="label">اختر الخدمة — {audience === 'BUSINESS' ? 'شركات ومصانع' : 'منازل وشقق'}</legend>
                      <div key={tab} className="anim-fade grid gap-2 sm:grid-cols-2">
                        {services.filter((x) => pickOpen || !v.slug || x.slug === v.slug).map((x) => {
                          const on = v.slug === x.slug;
                          return (
                            <label
                              key={x.id}
                              className={cx(
                                'flex cursor-pointer flex-col gap-1 rounded-xl border p-3.5 transition-all',
                                on ? 'border-brand-600 bg-brand-50/50 ring-2 ring-brand-600/25 dark:bg-brand-900/20' : 'border-line hover:border-ink/40',
                              )}
                            >
                              <input type="radio" name="service" className="sr-only" checked={on} onChange={() => chooseService(x.slug)} />
                              <span className="flex items-start justify-between gap-2">
                                <span className="flex min-w-0 items-start gap-2.5">
                                  <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', on ? 'bg-primary text-primary-fg' : 'bg-primary/15 text-brand-700 dark:text-primary')}>
                                    <Icon name={x.featured ? 'star' : 'check'} className="h-4 w-4" />
                                  </span>
                                  <span className="font-bold leading-snug">{x.name}</span>
                                </span>
                                <span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong')}>
                                  {on && <Icon name="check" className="h-3 w-3" />}
                                </span>
                              </span>
                              <span className="line-clamp-2 text-[13px] text-muted">{x.summary}</span>
                              <span className="mt-auto pt-1 text-sm font-semibold">
                                {x.priceOnRequest ? SCOPE_PRICED : zone ? `${formatJOD(zone.tier === 'INSIDE_AMMAN' ? x.priceInside : x.priceOutside)} — ${TIER_LABEL[zone.tier]}` : `من ${formatJOD(Math.min(x.priceInside, x.priceOutside))}`}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {!pickOpen && v.slug && (
                        <button type="button" onClick={() => setPickOpen(true)} className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                          <Icon name="refresh" className="h-4 w-4" /> تغيير الخدمة (عرض كل الخدمات)
                        </button>
                      )}
                      {err('slug') && <p className="mt-1.5 text-sm text-danger">{err('slug')}</p>}
                    </fieldset>

                    {v.slug && !s && !detail.error && <Skeleton className="h-48 w-full" />}
                    {detail.error && v.slug && <ErrorState message={detail.error.message} onRetry={detail.reload} />}

                    {s && d && (
                      <>
                        <section className="rounded-xl border border-brand-600/30 bg-brand-50/40 p-4 dark:bg-brand-900/10">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <h3 className="text-base">ما تشمله زيارة «{s.name}»</h3>
                            <a href={`/services/${s.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                              التفاصيل الكاملة <Icon name="external" className="h-3.5 w-3.5" />
                            </a>
                          </div>
                          {s.summary && <p className="mt-1 text-sm text-muted">{s.summary}</p>}
                          {s.includes.length > 0 && (
                            <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
                              {s.includes.map((x) => (
                                <li key={x} className="flex items-start gap-2">
                                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {x}
                                </li>
                              ))}
                            </ul>
                          )}
                          {s.deliverables.length > 0 && <p className="mt-3 text-[13px] text-muted">المخرجات: {s.deliverables.join('، ')}</p>}
                        </section>

                        {s.requestTypes.length > 1 && (
                          <div data-field="requestType">
                            <ChoiceGroup label="نوع الطلب" value={v.requestType || undefined} onChange={(x) => set('requestType', x)} options={s.requestTypes.map((t) => ({ value: t.value, label: t.label }))} error={err('requestType')} />
                          </div>
                        )}

                        {needsProblems && (
                          <fieldset data-field="problemIds">
                            <legend className="label">{s.optionsLabel || 'ما المشكلة التي تواجهها؟ (يمكن اختيار أكثر من مشكلة)'}</legend>
                            <div className={cx('grid gap-2', !s.problems.some((p) => p.description.length) && 'sm:grid-cols-2')}>
                              {s.problems.map((p) => (
                                <Checkbox
                                  key={p.id}
                                  label={p.quoteRequired ? `${p.name} — ${SCOPE_PRICED}` : p.name}
                                  description={p.description.length ? p.description.join(' · ') : undefined}
                                  checked={v.problemIds.includes(p.id)}
                                  onChange={() => toggle('problemIds', p.id)}
                                />
                              ))}
                            </div>
                            {err('problemIds') && <p className="mt-1.5 text-sm text-danger">{err('problemIds')}</p>}
                          </fieldset>
                        )}

                        {urgencies.length > 1 && (
                          <fieldset data-field="urgency">
                            <legend className="label">أولوية الزيارة</legend>
                            <div className="grid gap-2 sm:grid-cols-3">
                              {urgencies.map(([u, price]) => (
                                <label
                                  key={u}
                                  className={cx(
                                    'relative flex cursor-pointer flex-col gap-1 rounded-xl border p-3.5 transition-all',
                                    v.urgency === u ? (u === 'EMERGENCY' ? 'border-danger ring-2 ring-danger/25' : u === 'URGENT' ? 'border-warn ring-2 ring-warn/25' : 'border-brand-600 ring-2 ring-brand-600/25') : 'border-line hover:border-ink/40',
                                  )}
                                >
                                  <input type="radio" name="urgency" className="sr-only" checked={v.urgency === u} onChange={() => set('urgency', u)} />
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5 font-bold">
                                      <span className={cx('h-2.5 w-2.5 rounded-full', u === 'EMERGENCY' ? 'soft-ping bg-danger' : u === 'URGENT' ? 'bg-warn' : 'bg-success')} />
                                      {URGENCY_LABEL[u]}
                                    </span>
                                    <span className="font-display text-[15px] font-bold">{u === 'NORMAL' ? formatJOD(zone?.tier === 'OUTSIDE_AMMAN' ? s.priceOutside : s.priceInside) : formatJOD(price!)}</span>
                                  </span>
                                  <span className="text-[13px] leading-snug text-muted">{URGENCY_HINT[u]}</span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        )}

                        {s.formFields.length > 0 && (
                          <section className="space-y-4 rounded-xl border border-line p-4">
                            <h3 className="text-base">تفاصيل المشروع</h3>
                            {s.formFields.map((f) => (
                              <ExtraField
                                key={f.key}
                                field={f}
                                value={extra[f.key]}
                                error={err(`extra.${f.key}`)}
                                onChange={(x) => {
                                  setExtra((e) => ({ ...e, [f.key]: x }));
                                  setErrors((e) => ({ ...e, [`extra.${f.key}`]: '' }));
                                }}
                              />
                            ))}
                          </section>
                        )}

                        {s.devices.length > 0 && (
                          <fieldset data-field="deviceIds">
                            <legend className="label">أجهزة الفحص الإضافية (اختياري)</legend>
                            <p className="-mt-1 mb-3 text-sm text-muted">اختر أي جهاز تريد أن نفحص لك به — الأجهزة المخصصة لهذه الخدمة أولًا ثم بقية الأجهزة المتاحة. اضغط «التفاصيل» لقراءة آلية عمل الجهاز وفائدته الفنية.</p>
                            {needsProblems && !v.problemIds.length ? (
                              <p className="rounded-lg bg-subtle px-4 py-3 text-sm text-muted">اختر المشكلة أولًا لتظهر لك الأجهزة المناسبة لها.</p>
                            ) : sortedDevices.length ? (
                              <div className="space-y-5">
                                {[
                                  { key: 'mine', title: `أجهزة مخصصة لـ «${s.name}»`, list: sortedDevices.filter((x) => x.linked !== false) },
                                  { key: 'all', title: 'أجهزة أخرى يمكنك إضافتها لنفس الزيارة', list: sortedDevices.filter((x) => x.linked === false) },
                                ]
                                  .filter((g) => g.list.length)
                                  .map((g) => (
                                    <div key={g.key}>
                                      <h4 className="mb-2 flex items-center gap-2 text-sm font-bold">
                                        {g.title} <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted">{g.list.length}</span>
                                      </h4>
                                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        {g.list.map((x) => (
                                          <div key={x.id} className="relative">
                                            {recommended.has(x.id) && <span className="absolute -top-2 end-3 z-10 rounded-full bg-success px-2 py-0.5 text-[11px] font-bold text-white shadow">مقترح لمشكلتك</span>}
                                            <DeviceCard
                                              device={x}
                                              mode="select"
                                              selected={v.deviceIds.includes(x.id)}
                                              onToggle={() => toggle('deviceIds', x.id)}
                                              note={x.accessoryIds.length ? `يشمل مجانًا: ${s.devices.filter((y) => x.accessoryIds.includes(y.id)).map((y) => cleanDeviceName(y.name)).join('، ')} 🎁` : undefined}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="rounded-lg bg-subtle px-4 py-3 text-sm text-muted">لا تحتاج هذه الخدمة أجهزة إضافية — المعاينة الأساسية تكفي.</p>
                            )}
                            <p className={cx('mt-3 rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed', hasStructural ? 'border-warn/40 bg-warn/[0.06] font-semibold' : 'border-line bg-subtle text-muted')}>{ADDON_NOTE}</p>
                          </fieldset>
                        )}

                        {freeAdds.length > 0 && (
                          <section>
                            <h3 className="label">مشمول مجانًا في زيارتك 🎁</h3>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {freeAdds.map((x) => (
                                <DeviceCard key={x.id} device={x} mode="locked" />
                              ))}
                            </div>
                          </section>
                        )}

                        {d.combinable.length > 0 && (
                          <fieldset>
                            <legend className="label">خدمات أخرى في نفس الموقع ونفس الزيارة (اختياري)</legend>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {d.combinable.map((x) => (
                                <Checkbox key={x.id} label={x.name} description={`زيارة منفردة: ${formatJOD(x.priceInside)} داخل عمّان`} checked={v.extraIds.includes(x.id)} onChange={() => toggle('extraIds', x.id)} />
                              ))}
                            </div>
                            <p className="mt-2 text-[13px] text-muted">عند اختيار أكثر من خدمة يُحتسب سعر الزيارة المجمعة الموحد إن كان أوفر لك.</p>
                          </fieldset>
                        )}
                      </>
                    )}
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-6">
                    <StepHeading stepKey={step} title="الصور والتأكيد" description="الصور الواقعية للموقع أو المشكلة ترفع دقة تقرير المعاينة." />
                    <Textarea
                      data-field="description"
                      label={s?.optionsLabel ? 'وصف المشكلة أو الهدف من الطلب' : 'وصف المشكلة'}
                      placeholder="مثال: تشققات في جدار الصالون ظهرت قبل شهر وتزيد مع الوقت."
                      value={v.description}
                      maxLength={3000}
                      rows={3}
                      onChange={(e) => set('description', e.target.value)}
                      error={err('description')}
                    />
                    <Input data-field="problemLocation" label="مكان ظهور المشكلة (اختياري)" placeholder="مثال: الحمام الرئيسي، سقف المطبخ، الطابق الأرضي" value={v.problemLocation} maxLength={300} onChange={(e) => set('problemLocation', e.target.value)} />
                    <div data-field="photos">
                      <FilePicker label="صور الموقع أو المشكلة" files={photos} onChange={setPhotos} max={6} optional hint="حتى 6 صور واقعية — تساعد الفني على التحضير وترفع دقة التقرير." />
                    </div>
                    <div data-field="video">
                      <span className="label">
                        فيديو قصير <span className="font-normal text-muted">(اختياري، حتى {MAX_VIDEO_MB} ميغابايت)</span>
                      </span>
                      {video ? (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <Icon name="play" className="h-4 w-4 shrink-0" />
                            <span className="truncate">{video.name}</span>
                            <span className="shrink-0 text-muted">{(video.size / MB).toFixed(1)} MB</span>
                          </span>
                          <button type="button" className="min-h-[40px] px-2 font-semibold text-danger" onClick={() => setVideo(null)}>
                            حذف
                          </button>
                        </div>
                      ) : (
                        <label className="flex min-h-[3rem] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-3 text-sm font-semibold hover:border-ink/50">
                          <Icon name="upload" className="h-4 w-4" /> اختر فيديو
                          <input type="file" accept="video/*" className="sr-only" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
                        </label>
                      )}
                      {err('video') && <p className="mt-1.5 text-sm text-danger">{err('video')}</p>}
                    </div>
                    <div data-field="documents">
                      <FilePicker label="مخطط الموقع أو ملفات (صور أو PDF)" files={documents} onChange={setDocuments} max={5} allowPdf maxPdfMB={20} optional hint="اختياري — مثل مخطط العقار أو تقرير سابق." />
                    </div>
                    <Textarea data-field="notes" label="ملاحظات إضافية (اختياري)" value={v.notes} maxLength={1500} rows={2} onChange={(e) => set('notes', e.target.value)} />

                    {priceChanged && (
                      <Alert tone="info" title="تغيّر السعر">
                        تم تحديث الأسعار منذ فتحت الصفحة. راجع الملخص الجديد ثم وافق وأكّد الحجز.
                      </Alert>
                    )}
                    {quote ? <PriceSummary lines={quote.lines} total={quote.total} /> : quoteError ? <Alert tone="error">{quoteError}</Alert> : <Skeleton className="h-40 w-full" />}
                    <ReviewSection
                      title="العقار والموقع"
                      onEdit={() => goTo(1)}
                      rows={[
                        ['نوع العقار', v.propertyType],
                        ['صفتك', v.ownership],
                        ['المنطقة', zone ? `${zone.name} (${TIER_LABEL[zone.tier]}) — ${v.area}` : ''],
                        ['العنوان', v.address],
                        ['الموقع', v.lat != null && v.lng != null ? <a href={mapsLink(v.lat, v.lng)} target="_blank" rel="noopener noreferrer" className="ltr underline-offset-4 hover:underline">{v.lat.toFixed(5)}, {v.lng.toFixed(5)}</a> : ''],
                      ]}
                    />
                    <ReviewSection
                      title="التواصل والموعد"
                      onEdit={() => goTo(2)}
                      rows={[
                        ['الاسم', v.name],
                        ['الهاتف', <span className="ltr">{v.phone}{v.phoneWhatsapp ? ' · واتساب' : ''}</span>],
                        ['الرقم الثانوي', <span className="ltr">{v.phone2}{v.phone2Whatsapp ? ' · واتساب' : ''}</span>],
                        ['الموعد', v.date && v.time ? `${longDate(v.date)} — ${formatSlot(v.time)}` : ''],
                      ]}
                    />
                    <ReviewSection
                      title="الخدمة"
                      onEdit={() => goTo(0)}
                      rows={[
                        ['الخدمة', quote?.services.map((x) => x.name).join('، ') ?? s?.name ?? ''],
                        ['نوع الطلب', v.requestType ? REQUEST_TYPE_LABEL[v.requestType] : ''],
                        ['الأولوية', urgencies.length > 1 ? URGENCY_LABEL[v.urgency] : ''],
                        [s?.optionsLabel ? 'الخدمات المطلوبة' : 'المشكلة', s?.problems.filter((p) => v.problemIds.includes(p.id)).map((p) => p.name).join('، ') ?? ''],
                        ['الأجهزة', s?.devices.length ? [...s.devices.filter((x) => v.deviceIds.includes(x.id)), ...freeAdds].map((x) => cleanDeviceName(x.name)).join('، ') || 'بدون أجهزة إضافية' : ''],
                        ...(s?.formFields ?? []).map((f): [string, string] => [f.label, Array.isArray(extra[f.key]) ? (extra[f.key] as string[]).join('، ') : String(extra[f.key] ?? '')]),
                      ]}
                    />
                    <section className="rounded-xl border border-line p-4">
                      <h3 className="text-base">الشروط</h3>
                      <ul className="mt-2 list-disc space-y-1.5 ps-5 text-sm text-muted">
                        {terms.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                        <li>{ADDON_NOTE.replace('ملاحظة: ', '')}</li>
                        {s && <li className="font-semibold text-ink">{quote ? (quote.visitFeePolicy === 'DEDUCTIBLE' ? 'رسوم الزيارة تُخصم من قيمة أعمال الإصلاح عند موافقتك على تنفيذها مع فرجار جروب.' : 'رسوم الزيارة مستقلة عن قيمة أعمال الإصلاح.') : s.visitFeePolicyText}</li>}
                      </ul>
                    </section>
                    <div data-field="accept">
                      <Checkbox label={quote ? `أوافق على ملخص السعر (${formatJOD(quote.total)}) والشروط أعلاه` : 'أوافق على ملخص السعر والشروط أعلاه'} checked={v.accept} onChange={(x) => set('accept', x)} error={err('accept')} />
                    </div>
                    {submitError && <Alert tone="error">{submitError}</Alert>}
                  </div>
                )}

                <StepActions onBack={step > 0 ? () => goTo(step - 1) : undefined} onNext={() => (step < STEPS.length - 1 ? next() : void submit())} nextLabel={step < STEPS.length - 1 ? 'التالي' : 'تأكيد الحجز'} loading={submitting} />
              </form>
            </div>
          </div>
        </div>

        <aside className="min-w-0 lg:col-span-4">
          <div className="space-y-4 lg:sticky lg:top-32">
            {quote && step < 4 ? (
              <PriceSummary lines={quote.lines} total={quote.total} title={quoting ? 'يُحدَّث السعر…' : 'السعر حتى الآن'} />
            ) : (
              step < 4 && (
                <section className="rounded-xl bg-subtle p-5">
                  <h2 className="text-lg">سعر الزيارة</h2>
                  {s ? (
                    s.priceOnRequest ? (
                      <p className="mt-2 font-semibold">{SCOPE_PRICED}</p>
                    ) : (
                      <p className="mt-2 text-[15px] text-muted">
                        داخل عمّان <b className="text-ink">{formatJOD(s.priceInside)}</b> · خارجها <b className="text-ink">{formatJOD(s.priceOutside)}</b>
                      </p>
                    )
                  ) : (
                    <p className="mt-2 text-[15px] text-muted">زيارة الكشف الفني الأساسي تشمل تقريرًا بحالة الموقع وعرض سعر للأعمال المطلوبة.</p>
                  )}
                  <p className="mt-2 text-sm text-muted">يظهر السعر النهائي بعد اختيار الخدمة والمنطقة.</p>
                  {quoteError && <p className="mt-2 text-sm text-danger">{quoteError}</p>}
                </section>
              )
            )}
            <section className="rounded-xl border border-line p-5 text-sm text-muted">
              <h2 className="text-base text-ink">المعاينة منفصلة عن الإصلاح</h2>
              <p className="mt-1">رسوم الزيارة تشمل المعاينة والفحوصات المتفق عليها فقط. الإصلاح بعرض سعر منفصل بعد المعاينة، ولا نبدأ إلا بموافقتك.</p>
            </section>
          </div>
        </aside>
      </div>
    </>
  );
}

/** اختيار واحد على شكل أزرار */
function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cx('min-h-[42px] rounded-full border px-4 text-sm transition-colors', value === o ? 'border-ink bg-inverse font-semibold text-inverse-fg' : 'border-line-strong hover:border-ink/50')}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** رقم هاتف مع خانة "هل يتوفر على الرقم واتساب؟" */
function PhoneRow({ field, label, value, onChange, wa, onWa, error, autoComplete }: { field: string; label: string; value: string; onChange: (v: string) => void; wa: boolean; onWa: (v: boolean) => void; error?: string; autoComplete?: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
      <Input data-field={field} label={label} type="tel" inputMode="tel" className="ltr text-start" placeholder="07XXXXXXXX" value={value} onChange={(e) => onChange(e.target.value)} error={error} autoComplete={autoComplete} />
      <label className={cx('flex min-h-[48px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition-colors sm:mt-[1.85rem]', wa ? 'border-[#25D366] bg-[#25D366]/10 font-semibold' : 'border-line-strong')}>
        <input type="checkbox" className="h-4 w-4 accent-[#25D366]" checked={wa} onChange={(e) => onWa(e.target.checked)} />
        <Icon name="whatsapp" className={cx('h-4 w-4', wa ? 'text-[#1da851]' : 'text-muted')} />
        هل يتوفر على الرقم واتساب؟
      </label>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-[15px]">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

/** حقل إضافي يحدده المدير (نص، رقم، اختيار، أو اختيارات متعددة) */
function ExtraField({ field: f, value, onChange, error }: { field: FormField; value: string | string[] | undefined; onChange: (v: string | string[]) => void; error?: string }) {
  const label = f.required ? f.label : `${f.label} (اختياري)`;
  if (f.type === 'multiselect') {
    const list = Array.isArray(value) ? value : [];
    return (
      <fieldset data-field={`extra.${f.key}`}>
        <legend className="label">{label}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(f.options ?? []).map((o) => (
            <Checkbox key={o} label={o} checked={list.includes(o)} onChange={(on) => onChange(on ? [...list, o] : list.filter((x) => x !== o))} />
          ))}
        </div>
        {error ? <p className="mt-1.5 text-sm text-danger">{error}</p> : f.hint && <p className="mt-1.5 text-[13px] text-muted">{f.hint}</p>}
      </fieldset>
    );
  }
  if (f.type === 'select') {
    return (
      <Select data-field={`extra.${f.key}`} label={label} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} error={error} hint={f.hint}>
        <option value="">اختر…</option>
        {(f.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    );
  }
  if (f.type === 'textarea') {
    return <Textarea data-field={`extra.${f.key}`} label={label} rows={3} maxLength={3000} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} error={error} hint={f.hint} />;
  }
  return (
    <Input
      data-field={`extra.${f.key}`}
      label={label}
      inputMode={f.type === 'number' ? 'decimal' : undefined}
      className={f.type === 'number' ? 'ltr text-start' : undefined}
      maxLength={300}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      hint={f.hint}
    />
  );
}
