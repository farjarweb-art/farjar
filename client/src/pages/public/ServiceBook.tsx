import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AccountNote, useAccountPrefill } from '../../components/forms/AccountPrefill';
import { FilePicker } from '../../components/forms/FilePicker';
import { ReviewSection, StepActions, StepHeading, SubmissionSuccess } from '../../components/forms/FormBits';
import { LocationPicker } from '../../components/forms/LocationPicker';
import { SlotPicker, longDate } from '../../components/forms/SlotPicker';
import { MB, focusFirstError } from '../../components/forms/formUtils';
import { PriceSummary } from '../../components/services/PriceSummary';
import { Alert, Breadcrumbs, Checkbox, ChoiceGroup, ErrorState, Icon, Input, Select, Skeleton, Stepper, Textarea } from '../../components/ui';
import { ApiError, api, toFormData } from '../../lib/api';
import { cx, formatDate, formatJOD, formatSlot, isValidPhone } from '../../lib/format';
import {
  CLIENT_TYPE_LABEL,
  PROPERTY_TYPES,
  SCOPE_PRICED,
  REQUEST_TYPE_LABEL,
  TIER_LABEL,
  allowedDevices,
  type ClientType,
  type FormField,
  type RequestCreated,
  type RequestType,
  type ServiceDetail,
  type VisitQuote,
  normalizeDetail,
} from '../../lib/siteServices';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';
import { prepareWhatsAppWindow } from '../../lib/whatsapp';

const STEPS = ['الخدمة والمشكلة', 'الموقع', 'التفاصيل والموعد', 'السعر والتأكيد'];

type Vals = {
  requestType: RequestType | '';
  problemIds: string[];
  deviceIds: string[];
  extraIds: string[];
  name: string;
  phone: string;
  clientType: ClientType | '';
  propertyType: string;
  zoneId: string;
  area: string;
  address: string;
  lat: number | null;
  lng: number | null;
  description: string;
  problemLocation: string;
  notes: string;
  date: string;
  time: string;
  accept: boolean;
};

const EMPTY: Vals = {
  requestType: '', problemIds: [], deviceIds: [], extraIds: [], name: '', phone: '', clientType: '', propertyType: '', zoneId: '',
  area: '', address: '', lat: null, lng: null, description: '', problemLocation: '', notes: '', date: '', time: '', accept: false,
};

/** مفاتيح حقول كل خطوة (للتنقل لأول خطأ) */
const STEP_KEYS = [
  ['requestType', 'problemIds', 'deviceIds'],
  ['name', 'phone', 'clientType', 'propertyType', 'zoneId', 'area', 'address', 'lat'],
  ['description', 'problemLocation', 'photos', 'video', 'time', 'notes'],
  ['accept'],
];
const stepOf = (k: string) => {
  if (k === 'date' || k === 'serviceIds') return k === 'date' ? 2 : 0;
  const i = STEP_KEYS.findIndex((ks) => ks.includes(k));
  return i < 0 ? 3 : i;
};

const MAX_VIDEO_MB = 40;

/** حجز زيارة معاينة/صيانة: الخدمة والمشكلة والأجهزة ← الموقع ← التفاصيل والموعد ← السعر والتأكيد */
export default function ServiceBook() {
  const { slug = '' } = useParams();
  const detail = useAsync(() => api.get<ServiceDetail>(`/site-services/${encodeURIComponent(slug)}`).then(normalizeDetail), [slug], `service:${slug}`);
  const d = detail.data;
  const s = d?.service;
  useDocumentTitle(s ? `حجز: ${s.name}` : 'حجز زيارة');

  const [v, setV] = useState<Vals>(EMPTY);
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
  const [done, setDone] = useState<RequestCreated | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useAccountPrefill((c) => setV((x) => ({ ...x, name: x.name || c.name, phone: x.phone || c.localPhone })));

  // نوع الطلب الافتراضي = أول نوع متاح
  useEffect(() => {
    if (s && !v.requestType && s.requestTypes.length === 1) setV((x) => ({ ...x, requestType: s.requestTypes[0].value }));
  }, [s, v.requestType]);

  const devices = useMemo(() => (s ? allowedDevices(s, v.problemIds) : []), [s, v.problemIds]);
  // الأجهزة التي لم تعد مناسبة للمشكلات المختارة تُزال
  useEffect(() => {
    const ok = new Set(devices.map((x) => x.id));
    setV((x) => (x.deviceIds.every((id) => ok.has(id)) ? x : { ...x, deviceIds: x.deviceIds.filter((id) => ok.has(id)) }));
  }, [devices]);

  const zone = d?.zones.find((z) => z.id === v.zoneId);
  const serviceIds = useMemo(() => (s ? [s.id, ...v.extraIds] : []), [s, v.extraIds]);
  const needsProblems = !!s?.problems.length;
  const quoteKey = JSON.stringify([serviceIds, v.zoneId, v.problemIds, v.deviceIds]);

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
        .post<VisitQuote>('/site-services/quote', { serviceIds, zoneId: v.zoneId, problemIds: v.problemIds, deviceIds: v.deviceIds })
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

  if (detail.error) {
    return (
      <div className="container py-16">
        <ErrorState message={detail.error.message} onRetry={detail.reload} />
      </div>
    );
  }
  if (!s || !d) {
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
  const toggle = (k: 'problemIds' | 'deviceIds' | 'extraIds', id: string) =>
    set(k, v[k].includes(id) ? v[k].filter((x) => x !== id) : [...v[k], id]);

  function validate(i: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (i === 0) {
      if (!v.requestType) e.requestType = 'اختر نوع الطلب';
      if (needsProblems && !v.problemIds.length) e.problemIds = s!.optionsLabel ? 'اختر خيارًا واحدًا على الأقل' : 'اختر المشكلة التي تواجهها (يمكنك اختيار أكثر من مشكلة)';
    }
    if (i === 1) {
      if (v.name.trim().length < 2) e.name = 'اكتب اسمك';
      if (!isValidPhone(v.phone)) e.phone = 'رقم الهاتف غير صحيح (مثال: 0791234567)';
      if (!v.clientType) e.clientType = 'اختر نوع العميل';
      if (!v.propertyType.trim()) e.propertyType = 'اختر أو اكتب نوع العقار أو المنشأة';
      if (!v.zoneId) e.zoneId = 'اختر المحافظة / المنطقة';
      if (!v.area.trim()) e.area = 'اكتب المنطقة أو الحي';
      if (v.address.trim().length < 5) e.address = 'اكتب العنوان بالتفصيل';
      for (const f of s!.formFields) {
        const val = extra[f.key];
        const empty = Array.isArray(val) ? !val.length : !String(val ?? '').trim();
        if (f.required && empty) e[`extra.${f.key}`] = `${f.label} مطلوب`;
        else if (f.type === 'number' && !empty && !/^\d+(\.\d+)?$/.test(String(val).trim())) e[`extra.${f.key}`] = `"${f.label}" يجب أن يكون رقمًا`;
      }
    }
    if (i === 2) {
      if (v.description.trim().length < 5) e.description = 'صف المشكلة باختصار (5 أحرف على الأقل)';
      if (!v.date || !v.time) e.time = 'اختر اليوم والوقت المناسب للزيارة';
      if (video && video.size > MAX_VIDEO_MB * MB) e.video = `حجم الفيديو أكبر من ${MAX_VIDEO_MB} ميغابايت`;
    }
    if (i === 3 && !v.accept) e.accept = 'يجب الموافقة على ملخص السعر والشروط لتأكيد الحجز';
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
    // كل الخطوات
    for (let i = 0; i < 4; i++) {
      const e = validate(i);
      if (Object.keys(e).length) {
        setErrors(e);
        goTo(i);
        window.setTimeout(() => focusFirstError(formRef.current, STEP_KEYS[i], e), 60);
        return;
      }
    }
    if (!quote) {
      setSubmitError(quoteError ?? 'انتظر حتى يظهر ملخص السعر');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setPriceChanged(false);
    const wa = prepareWhatsAppWindow();
    try {
      const payload = {
        serviceIds,
        zoneId: v.zoneId,
        problemIds: v.problemIds,
        deviceIds: v.deviceIds,
        requestType: v.requestType,
        name: v.name.trim(),
        phone: v.phone.trim(),
        clientType: v.clientType,
        propertyType: v.propertyType.trim(),
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
        // تغيّر السعر: نعيد حسابه ونطلب الموافقة من جديد
        setPriceChanged(true);
        set('accept', false);
        setQuote(null);
        api.post<VisitQuote>('/site-services/quote', { serviceIds, zoneId: v.zoneId, problemIds: v.problemIds, deviceIds: v.deviceIds }).then(setQuote).catch(() => undefined);
      } else {
        const key = err.field ? err.field.replace(/^details\./, '') : null;
        if (key) {
          setErrors({ [key]: err.message });
          const i = key.startsWith('extra.') ? 1 : stepOf(key);
          if (i < 3) goTo(i);
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
          <Summary label="الخدمة" value={s.name} />
          <Summary label="الموعد المطلوب" value={formatDate(done.scheduledAt, true)} />
          <Summary label="الإجمالي المعتمد" value={formatJOD(done.total)} />
        </dl>
        <p className="text-sm text-muted">سيتواصل معك فريق فرجار جروب لتأكيد الموعد. السعر المعتمد لا يتغير حتى لو تغيّرت الأسعار لاحقًا.</p>
      </SubmissionSuccess>
    );
  }

  const err = (k: string) => errors[k] || undefined;
  // خدمة للمنشآت فقط: لا يظهر خيار "فرد"
  const clientTypes = s.audiences.includes('HOME') ? d.clientTypes : d.clientTypes.filter((c) => c.value !== 'INDIVIDUAL');
  const terms = [...d.generalTerms, ...(quote?.terms ?? (s.terms ? [s.terms] : []))];

  return (
    <>
      <header className="border-b border-line bg-subtle">
        <div className="container py-7 md:py-10">
          <Breadcrumbs items={[{ to: '/services', label: 'الخدمات والمعاينات' }, { to: `/services/${s.slug}`, label: s.name }, { label: 'الحجز' }]} className="mb-4" />
          <h1 className="max-w-4xl text-[1.625rem] leading-snug md:text-[2.125rem]">{s.name}</h1>
          <p className="mt-2 max-w-2xl text-muted">سعر الزيارة ثابت حسب المنطقة، والأجهزة الإضافية برسومها فقط. ترى المبلغ النهائي قبل التأكيد.</p>
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
                  if (step < 3) next();
                  else void submit();
                }}
              >
                {step === 0 && (
                  <div className="space-y-7">
                    <StepHeading stepKey={step} title="ماذا تحتاج؟" />
                    <div data-field="requestType">
                      <ChoiceGroup
                        label="نوع الطلب"
                        value={v.requestType || undefined}
                        onChange={(x) => set('requestType', x)}
                        options={s.requestTypes.map((t) => ({ value: t.value, label: t.label }))}
                        error={err('requestType')}
                      />
                    </div>

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

                    {s.devices.length > 0 && (
                      <fieldset data-field="deviceIds">
                        <legend className="label">الأجهزة والفحوصات الإضافية (اختياري)</legend>
                        {needsProblems && !v.problemIds.length ? (
                          <p className="rounded-lg bg-subtle px-4 py-3 text-sm text-muted">اختر المشكلة أولًا لتظهر لك الأجهزة المناسبة لها.</p>
                        ) : devices.length ? (
                          <div className="grid gap-2">
                            {devices.map((x) => (
                              <Checkbox
                                key={x.id}
                                label={`${x.name} — ${x.included ? 'مشمول في الزيارة' : `+ ${formatJOD(x.fee)}`}`}
                                description={x.description}
                                checked={v.deviceIds.includes(x.id)}
                                onChange={() => toggle('deviceIds', x.id)}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-lg bg-subtle px-4 py-3 text-sm text-muted">لا تحتاج المشكلة المختارة أجهزة إضافية — المعاينة الأساسية تكفي.</p>
                        )}
                        <p className="mt-2 text-[13px] text-muted">إضافة جهاز لا تعني زيارة جديدة — تُضاف رسومه فقط لنفس الزيارة.</p>
                      </fieldset>
                    )}

                    {d.combinable.length > 0 && (
                      <fieldset>
                        <legend className="label">خدمات أخرى في نفس الموقع ونفس الزيارة (اختياري)</legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {d.combinable.map((c) => (
                            <Checkbox key={c.id} label={c.name} description={`زيارة منفردة: ${formatJOD(c.priceInside)} داخل عمّان`} checked={v.extraIds.includes(c.id)} onChange={() => toggle('extraIds', c.id)} />
                          ))}
                        </div>
                        <p className="mt-2 text-[13px] text-muted">عند اختيار أكثر من خدمة يُحتسب سعر الزيارة المجمعة الموحد إن كان أوفر لك.</p>
                      </fieldset>
                    )}
                  </div>
                )}

                {step === 1 && (
                  <div className="space-y-6">
                    <StepHeading stepKey={step} title="بياناتك وموقع المعاينة" />
                    <AccountNote what="الطلب" />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input data-field="name" label="الاسم" value={v.name} maxLength={100} onChange={(e) => set('name', e.target.value)} error={err('name')} autoComplete="name" />
                      <Input data-field="phone" label="رقم الهاتف" type="tel" inputMode="tel" className="ltr text-start" value={v.phone} onChange={(e) => set('phone', e.target.value)} error={err('phone')} autoComplete="tel" />
                    </div>
                    <div data-field="clientType">
                      <ChoiceGroup
                        label="نوع العميل"
                        columns={3}
                        value={v.clientType || undefined}
                        onChange={(x) => {
                          set('clientType', x);
                          if (!PROPERTY_TYPES[x].includes(v.propertyType)) set('propertyType', '');
                        }}
                        options={clientTypes.map((c) => ({ value: c.value, label: c.label }))}
                        error={err('clientType')}
                      />
                    </div>
                    {v.clientType && (
                      <div data-field="propertyType">
                        <span className="label">نوع العقار أو المنشأة</span>
                        <div className="flex flex-wrap gap-2">
                          {PROPERTY_TYPES[v.clientType].map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => set('propertyType', p)}
                              className={cx('min-h-[40px] rounded-full border px-3.5 text-sm', v.propertyType === p ? 'border-ink bg-inverse font-semibold text-inverse-fg' : 'border-line-strong hover:border-ink/50')}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                        <Input label="أو اكتب نوعًا آخر" wrapperClassName="mt-3" value={PROPERTY_TYPES[v.clientType].includes(v.propertyType) ? '' : v.propertyType} maxLength={80} onChange={(e) => set('propertyType', e.target.value)} error={err('propertyType')} />
                      </div>
                    )}
                    {s.formFields.length > 0 && (
                      <section className="space-y-4 rounded-xl border border-line p-4">
                        <h3 className="text-base">تفاصيل المشروع</h3>
                        {s.formFields.map((f) => (
                          <ExtraField key={f.key} field={f} value={extra[f.key]} error={err(`extra.${f.key}`)} onChange={(x) => {
                            setExtra((e) => ({ ...e, [f.key]: x }));
                            setErrors((e) => ({ ...e, [`extra.${f.key}`]: '' }));
                          }} />
                        ))}
                      </section>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Select data-field="zoneId" label="المحافظة / المنطقة" value={v.zoneId} onChange={(e) => set('zoneId', e.target.value)} error={err('zoneId')}>
                        <option value="">اختر…</option>
                        {d.zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name} — {TIER_LABEL[z.tier]}
                            {z.travelFee > 0 ? ` (+ انتقال ${formatJOD(z.travelFee)})` : ''}
                          </option>
                        ))}
                      </Select>
                      <Input data-field="area" label="المنطقة / الحي" placeholder="مثال: خلدا" value={v.area} maxLength={120} onChange={(e) => set('area', e.target.value)} error={err('area')} />
                    </div>
                    {zone?.requiresApproval && (
                      <Alert tone="info" title="منطقة تحتاج موافقة مسبقة">
                        هذه المنطقة بعيدة عن نطاق عملنا المعتاد — سنؤكد لك إمكانية الزيارة قبل الموعد.
                      </Alert>
                    )}
                    <Textarea data-field="address" label="العنوان بالتفصيل" placeholder="الشارع، رقم البناية، الطابق، علامة مميزة" value={v.address} maxLength={400} rows={3} onChange={(e) => set('address', e.target.value)} error={err('address')} />
                    <LocationPicker lat={v.lat} lng={v.lng} onChange={(lat, lng) => setV((x) => ({ ...x, lat, lng }))} hint="تحديد الموقع على الخريطة اختياري، ويساعد الفني على الوصول بسرعة." />
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6">
                    <StepHeading stepKey={step} title="وصف المشكلة والموعد" />
                    <Textarea data-field="description" label={s.optionsLabel ? 'وصف المشكلة أو الهدف من الطلب' : 'وصف المشكلة'} placeholder={s.optionsLabel ? 'مثال: الزوار يضيعون بين المستودعات، ونريد لافتات واضحة لمناطق التحميل والمخارج.' : 'مثال: رطوبة في جدار غرفة النوم بجانب الحمام، ظهرت قبل شهر وتزيد في الشتاء.'} value={v.description} maxLength={3000} rows={4} onChange={(e) => set('description', e.target.value)} error={err('description')} />
                    <Input data-field="problemLocation" label="مكان ظهور المشكلة (اختياري)" placeholder="مثال: الحمام الرئيسي، سقف المطبخ، الطابق الأرضي" value={v.problemLocation} maxLength={300} onChange={(e) => set('problemLocation', e.target.value)} />
                    <div data-field="photos">
                      <FilePicker label="صور المشكلة" files={photos} onChange={setPhotos} max={6} optional hint="حتى 6 صور — تساعد الفني على التحضير." />
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
                      <FilePicker label="مخطط الموقع أو ملفات (صور أو PDF)" files={documents} onChange={setDocuments} max={5} allowPdf maxPdfMB={20} optional hint="مثل مخطط المنشأة، صور اللافتات أو المباني." />
                    </div>
                    <div data-field="time">
                      <span className="label">الموعد المناسب للزيارة</span>
                      <SlotPicker endpoint="/site-services/slots" date={v.date} time={v.time} onChange={(date, time) => setV((x) => ({ ...x, date, time }))} error={err('time')} />
                      <p className="mt-2 text-[13px] text-muted">الموعد مبدئي — يتواصل معك الفريق لتأكيده. المدة التقديرية للزيارة لتنظيم المواعيد فقط ولا تؤثر على السعر.</p>
                    </div>
                    <Textarea data-field="notes" label="ملاحظات إضافية (اختياري)" value={v.notes} maxLength={1500} rows={2} onChange={(e) => set('notes', e.target.value)} />
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-6">
                    <StepHeading stepKey={step} title="راجع السعر وأكّد الحجز" description="لا يُؤكد الحجز قبل موافقتك على ملخص السعر والشروط." />
                    {priceChanged && (
                      <Alert tone="info" title="تغيّر السعر">
                        تم تحديث الأسعار منذ فتحت الصفحة. راجع الملخص الجديد ثم وافق وأكّد الحجز.
                      </Alert>
                    )}
                    {quote ? <PriceSummary lines={quote.lines} total={quote.total} /> : quoteError ? <Alert tone="error">{quoteError}</Alert> : <Skeleton className="h-40 w-full" />}
                    <ReviewSection
                      title="الطلب"
                      onEdit={() => goTo(0)}
                      rows={[
                        ['الخدمة', quote?.services.map((x) => x.name).join('، ') ?? s.name],
                        ['نوع الطلب', v.requestType ? REQUEST_TYPE_LABEL[v.requestType] : ''],
                        [s.optionsLabel ? 'الخدمات المطلوبة' : 'المشكلة', s.problems.filter((p) => v.problemIds.includes(p.id)).map((p) => p.name).join('، ')],
                        ['الأجهزة', s.devices.length ? s.devices.filter((x) => v.deviceIds.includes(x.id)).map((x) => x.name).join('، ') || 'بدون أجهزة إضافية' : ''],
                      ]}
                    />
                    <ReviewSection
                      title="الموقع"
                      onEdit={() => goTo(1)}
                      rows={[
                        ['الاسم', v.name],
                        ['الهاتف', <span className="ltr">{v.phone}</span>],
                        ['نوع العميل', v.clientType ? `${CLIENT_TYPE_LABEL[v.clientType]} — ${v.propertyType}` : ''],
                        ...s.formFields.map((f): [string, string] => [f.label, Array.isArray(extra[f.key]) ? (extra[f.key] as string[]).join('، ') : String(extra[f.key] ?? '')]),
                        ['المنطقة', zone ? `${zone.name} (${TIER_LABEL[zone.tier]}) — ${v.area}` : ''],
                        ['العنوان', v.address],
                      ]}
                    />
                    <ReviewSection
                      title="التفاصيل والموعد"
                      onEdit={() => goTo(2)}
                      rows={[
                        ['الوصف', v.description],
                        ['المكان', v.problemLocation],
                        ['المرفقات', photos.length || video || documents.length ? [photos.length && `${photos.length} صورة`, video && 'فيديو', documents.length && `${documents.length} ملف`].filter(Boolean).join(' + ') : ''],
                        ['الموعد', v.date && v.time ? `${longDate(v.date)} — ${formatSlot(v.time)}` : ''],
                      ]}
                    />
                    <section className="rounded-xl border border-line p-4">
                      <h3 className="text-base">الشروط</h3>
                      <ul className="mt-2 list-disc space-y-1.5 ps-5 text-sm text-muted">
                        {terms.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                        <li className="font-semibold text-ink">{quote ? (quote.visitFeePolicy === 'DEDUCTIBLE' ? 'رسوم الزيارة تُخصم من قيمة أعمال الإصلاح عند موافقتك على تنفيذها مع فرجار جروب.' : 'رسوم الزيارة مستقلة عن قيمة أعمال الإصلاح.') : s.visitFeePolicyText}</li>
                      </ul>
                    </section>
                    <div data-field="accept">
                      <Checkbox
                        label={quote ? `أوافق على ملخص السعر (${formatJOD(quote.total)}) والشروط أعلاه` : 'أوافق على ملخص السعر والشروط أعلاه'}
                        checked={v.accept}
                        onChange={(x) => set('accept', x)}
                        error={err('accept')}
                      />
                    </div>
                    {submitError && <Alert tone="error">{submitError}</Alert>}
                  </div>
                )}

                <StepActions onBack={step > 0 ? () => goTo(step - 1) : undefined} onNext={() => (step < 3 ? next() : void submit())} nextLabel={step < 3 ? 'التالي' : 'تأكيد الحجز'} loading={submitting} />
              </form>
            </div>
          </div>
        </div>

        <aside className="min-w-0 lg:col-span-4">
          <div className="space-y-4 lg:sticky lg:top-32">
            {quote && step < 3 ? (
              <PriceSummary lines={quote.lines} total={quote.total} title={quoting ? 'يُحدَّث السعر…' : 'السعر حتى الآن'} />
            ) : (
              step < 3 && (
                <section className="rounded-xl bg-subtle p-5">
                  <h2 className="text-lg">سعر الزيارة</h2>
                  {s.priceOnRequest ? (
                    <p className="mt-2 font-semibold">{SCOPE_PRICED}</p>
                  ) : (
                    <p className="mt-2 text-[15px] text-muted">
                      داخل عمّان <b className="text-ink">{formatJOD(s.priceInside)}</b> · خارجها <b className="text-ink">{formatJOD(s.priceOutside)}</b>
                    </p>
                  )}
                  <p className="mt-2 text-sm text-muted">{needsProblems && !v.problemIds.length ? (s.optionsLabel ? 'اختر الخدمات ثم المنطقة لترى السعر النهائي.' : 'اختر المشكلة ثم المنطقة لترى السعر النهائي.') : 'اختر المنطقة في الخطوة التالية لترى السعر النهائي.'}</p>
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
