import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { AdminPage, DefList, DetailSkeleton, Panel } from '../../components/admin/ui';
import { PriceSummary } from '../../components/services/PriceSummary';
import { Button, ButtonLink, Checkbox, ErrorState, Icon, Input, Select, Tag, Textarea } from '../../components/ui';
import { api, fileHref } from '../../lib/api';
import { displayPhone, formatDate, formatDateShort, formatJOD } from '../../lib/format';
import { POLICY_TEXT, QUOTE_STATUS_LABEL, QUOTE_TITLES, URGENCY_LABEL, isDocumentMedia, mapsLink, TIER_LABEL, statusTone, type QuoteItem, type RequestCore, type RequestMedia, type ServiceQuote, type SrStatus } from '../../lib/siteServices';
import { useDocumentTitle } from '../../lib/useAsync';

type Detail = RequestCore & {
  clientTypeLabel: string;
  adminNotes: string | null;
  technicianId: string | null;
  customer: { id: string; name: string; phone: string; email: string | null; companyName: string | null };
  events: { id: string; kind: string; fromStatusLabel: string | null; toStatusLabel: string | null; note: string | null; actorName: string | null; createdAt: string }[];
  history: { id: string; number: number; status: SrStatus; statusLabel: string; services: { name: string }[]; total: number; createdAt: string }[];
  technicians: { id: string; name: string; specialty: string | null }[];
  statuses: { value: SrStatus; label: string }[];
};

const EVENT_LABEL: Record<string, string> = {
  created: 'إنشاء الطلب',
  status: 'تغيير الحالة',
  schedule: 'الموعد',
  technician: 'الفني',
  work: 'أعمال منفذة',
  note: 'ملاحظة',
  report: 'التقرير الفني',
  quote: 'عرض سعر',
};

const amman = (iso: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Amman', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  return { date: formatDateShort(iso), time: parts };
};

/** إدارة طلب معاينة/صيانة */
export default function ServiceRequestDetail() {
  const { id = '' } = useParams();
  const q = useAdminQuery(() => api.get<Detail>(`/admin/service-requests/${id}`), [id], { live: true });
  const r = q.data;
  useDocumentTitle(r ? `طلب معاينة #${r.number}` : 'طلب معاينة');
  const m = useMutation();

  const [status, setStatus] = useState<SrStatus | ''>('');
  const [note, setNote] = useState('');
  const [tech, setTech] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [work, setWork] = useState('');

  useEffect(() => {
    if (!r) return;
    setStatus(r.status);
    setTech(r.technicianId ?? '');
    const t = amman(r.scheduledAt);
    setDate(t.date);
    setTime(t.time);
    setAdminNotes(r.adminNotes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id, r?.status, r?.technicianId, r?.scheduledAt, r?.adminNotes]);

  if (q.error) return <ErrorState message={q.error.message} onRetry={q.retry} />;
  if (!r) return <DetailSkeleton />;

  const orig = amman(r.scheduledAt);
  async function save() {
    if (!r) return;
    const body: Record<string, unknown> = {};
    if (status && status !== r.status) body.status = status;
    if (note.trim()) body.note = note.trim();
    if (tech !== (r.technicianId ?? '')) body.technicianId = tech || null;
    if (date !== orig.date || time !== orig.time) Object.assign(body, { date, time });
    if (adminNotes !== (r.adminNotes ?? '')) body.adminNotes = adminNotes;
    if (!Object.keys(body).length) return;
    if (await m.run('save', () => api.patch(`/admin/service-requests/${r.id}`, body), 'تم حفظ التغييرات')) {
      setNote('');
      q.reload();
    }
  }

  async function addWork() {
    if (!r || !work.trim()) return;
    if (await m.run('work', () => api.post(`/admin/service-requests/${r.id}/work`, { note: work.trim() }), 'تم تسجيل العمل')) {
      setWork('');
      q.reload();
    }
  }

  const customerMedia = r.media.filter((x) => x.purpose === 'customer');
  const mapUrl = r.lat != null && r.lng != null ? `https://www.google.com/maps?q=${r.lat},${r.lng}` : null;
  const wa = `https://wa.me/${r.phone.replace(/\D/g, '')}`;

  return (
    <AdminPage
      back={{ to: '/admin/service-requests', label: 'طلبات المعاينات والصيانة' }}
      title={
        <>
          {r.services.map((s) => s.name).join('، ')} <span className="ltr text-muted">#{r.number}</span>
        </>
      }
      description={`${r.requestTypeLabel} · المرجع ${r.ref} · أُنشئ ${formatDate(r.createdAt, true)}`}
      meta={
        <>
          <Tag tone={statusTone(r.status)}>{r.statusLabel}</Tag>
          {r.needsApproval && <Tag tone="sand">منطقة تحتاج موافقة مسبقة</Tag>}
        </>
      }
      actions={
        r.report ? (
          <ButtonLink to={`/admin/service-requests/${r.id}/print?doc=report`} variant="outline" size="sm">
            <Icon name="printer" className="h-4 w-4" /> التقرير PDF
          </ButtonLink>
        ) : undefined
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="الطلب">
            <DefList
              items={[
                ['الخدمات', r.services.map((s) => s.name).join('، ')],
                ['نوع الطلب', r.requestTypeLabel],
                r.problems.length > 0 && ['المشكلة / الخدمات المطلوبة', r.problems.map((p) => p.name).join('، ')],
                r.devices.length > 0 && ['الأجهزة', r.devices.map((d) => `${d.name}${d.included ? ' (مشمول)' : ''}`).join('، ')],
                ...(r.extra ?? []).map((x): [string, string] => [x.label, x.value]),
                ['الوصف', <span className="whitespace-pre-line">{r.description}</span>],
                r.problemLocation && ['مكان المشكلة', r.problemLocation],
                r.notes && ['ملاحظات العميل', r.notes],
              ]}
            />
            {customerMedia.length > 0 && <MediaGrid items={customerMedia} />}
          </Panel>

          <DocumentsPanel request={r} onChanged={q.reload} />
          <ReportEditor request={r} onSaved={q.reload} />
          <QuotesPanel request={r} onChanged={q.reload} />

          <Panel title="سجل الطلب">
            <ol className="space-y-3 border-s border-line ps-4">
              {r.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
                  <p className="text-[15px] font-medium">
                    {EVENT_LABEL[e.kind] ?? e.kind}
                    {e.kind === 'status' && e.toStatusLabel && (
                      <span className="font-normal text-muted">
                        {' '}
                        — {e.fromStatusLabel ? `${e.fromStatusLabel} ← ` : ''}
                        <b className="text-ink">{e.toStatusLabel}</b>
                      </span>
                    )}
                  </p>
                  {e.note && <p className="whitespace-pre-line text-sm text-muted">{e.note}</p>}
                  <p className="text-xs text-muted">
                    {formatDate(e.createdAt, true)}
                    {e.actorName && ` · ${e.actorName}`}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="إدارة الطلب">
            <div className="space-y-3">
              <Select label="الحالة" value={status} onChange={(e) => setStatus(e.target.value as SrStatus)}>
                {r.statuses.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Input label="ملاحظة مع التغيير (اختياري)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
              <Select label="الفني المسؤول" value={tech} onChange={(e) => setTech(e.target.value)}>
                <option value="">— بدون —</option>
                {r.technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.specialty ? ` — ${t.specialty}` : ''}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input label="تاريخ الزيارة" type="date" className="ltr text-start" value={date} onChange={(e) => setDate(e.target.value)} />
                <Input label="الوقت" type="time" className="ltr text-start" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <Textarea label="ملاحظات داخلية (لا تظهر للعميل)" rows={3} value={adminNotes} maxLength={3000} onChange={(e) => setAdminNotes(e.target.value)} />
              <Button block loading={m.pending === 'save'} onClick={save}>
                حفظ التغييرات
              </Button>
              <p className="text-xs text-muted">يصل العميل إشعار بتغيير الحالة أو الموعد أو تعيين الفني.</p>
            </div>
          </Panel>

          <Panel title="تسجيل أعمال الإصلاح والصيانة">
            <Textarea label="ما الذي تم تنفيذه؟" rows={3} value={work} maxLength={2000} onChange={(e) => setWork(e.target.value)} />
            <Button className="mt-2" variant="outline" block loading={m.pending === 'work'} disabled={!work.trim()} onClick={addWork}>
              <Icon name="plus" className="h-4 w-4" /> إضافة للسجل
            </Button>
          </Panel>

          <Panel title="العميل والموقع">
            <DefList
              cols={1}
              items={[
                ['الاسم', <Link to={`/admin/customers/${r.customer.id}`} className="font-semibold underline-offset-4 hover:underline">{r.name}</Link>],
                [
                  'الهاتف',
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="ltr inline-flex items-center gap-1 underline-offset-4 hover:underline">
                    <Icon name="whatsapp" className="h-4 w-4" /> {displayPhone(r.phone)}
                  </a>,
                ],
                ['نوع العميل', `${r.clientTypeLabel} — ${r.propertyType}`],
                r.ownership && ['صفة العميل', r.ownership],
                r.urgency && r.urgency !== 'NORMAL' && ['الأولوية', <Tag tone={r.urgency === 'EMERGENCY' ? 'danger' : 'sand'}>⚡ {URGENCY_LABEL[r.urgency]}</Tag>],
                ['المنطقة', `${r.zoneName} (${TIER_LABEL[r.tier]}) — ${r.area}`],
                ['العنوان', r.address],
                mapUrl && ['الخريطة', <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">فتح الموقع</a>],
              ]}
            />
          </Panel>

          <PriceSummary lines={r.priceLines} total={r.total} title="السعر المعتمد (وقت الحجز)" />
          <p className="text-xs text-muted">
            وافق العميل على السعر والشروط بتاريخ {formatDate(r.termsAcceptedAt, true)}. {POLICY_TEXT[r.visitFeePolicy]}
          </p>

          {r.history.length > 0 && (
            <Panel title="طلبات سابقة لنفس العميل">
              <ul className="divide-y divide-line">
                {r.history.map((h) => (
                  <li key={h.id}>
                    <Link to={`/admin/service-requests/${h.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:underline">
                      <span>
                        <span className="ltr text-muted">#{h.number}</span> {h.services.map((s) => s.name).join('، ')}
                      </span>
                      <Tag tone={statusTone(h.status)}>{h.statusLabel}</Tag>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </AdminPage>
  );
}

function MediaGrid({ items, onDelete }: { items: RequestMedia[]; onDelete?: (m: RequestMedia) => void }) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map((x) => (
        <div key={x.id} className="relative">
          {x.kind === 'VIDEO' ? (
            <video src={x.url} controls className="aspect-square w-full rounded-lg bg-black object-cover" />
          ) : (
            <a href={fileHref(x.url)} target="_blank" rel="noopener noreferrer">
              <img src={x.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
            </a>
          )}
          {onDelete && (
            <button type="button" onClick={() => onDelete(x)} className="absolute end-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white" aria-label="حذف الصورة">
              <Icon name="trash" className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ReportEditor({ request: r, onSaved }: { request: Detail; onSaved: () => void }) {
  const m = useMutation();
  const [v, setV] = useState({ findings: '', devicesUsed: '', recommendations: '', repairsNeeded: '' });
  const [gps, setGps] = useState<{ gpsLat: number; gpsLng: number; gpsAccuracy: number | null; gpsAt: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  useEffect(() => {
    const g = r.report;
    setGps(g?.gpsLat != null && g.gpsLng != null ? { gpsLat: g.gpsLat, gpsLng: g.gpsLng, gpsAccuracy: g.gpsAccuracy ?? null, gpsAt: g.gpsAt ?? new Date().toISOString() } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id, r.report?.updatedAt]);
  /** الفني في الموقع: يسجل إحداثيات جهازه لتظهر في التقرير النهائي */
  function locate() {
    if (!navigator.geolocation) {
      setGpsError('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    setLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ gpsLat: Number(pos.coords.latitude.toFixed(6)), gpsLng: Number(pos.coords.longitude.toFixed(6)), gpsAccuracy: Math.round(pos.coords.accuracy), gpsAt: new Date().toISOString() });
        setLocating(false);
      },
      (e) => {
        setGpsError(e.code === e.PERMISSION_DENIED ? 'اسمح للمتصفح بالوصول للموقع ثم حاول مرة أخرى' : 'تعذر تحديد الموقع — تأكد من تشغيل GPS');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }
  useEffect(() => {
    setV({
      findings: r.report?.findings ?? '',
      devicesUsed: r.report?.devicesUsed ?? r.devices.map((d) => d.name).join('، '),
      recommendations: r.report?.recommendations ?? '',
      repairsNeeded: r.report?.repairsNeeded ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id, r.report?.updatedAt]);
  const photos = r.media.filter((x) => x.purpose === 'report');

  async function save(publish?: boolean) {
    if (await m.run(publish ? 'publish' : 'draft', () => api.put(`/admin/service-requests/${r.id}/report`, { ...v, ...(gps ?? { gpsLat: null, gpsLng: null, gpsAccuracy: null, gpsAt: null }), ...(publish ? { publish: true } : {}) }), publish ? 'تم إرسال التقرير للعميل' : 'تم حفظ التقرير')) onSaved();
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('photos', f));
    if (await m.run('upload', () => api.post(`/admin/service-requests/${r.id}/media`, fd), 'تم رفع الصور')) onSaved();
  }
  async function remove(x: RequestMedia) {
    if (await m.run(`d-${x.id}`, () => api.del(`/admin/service-requests/${r.id}/media/${x.id}`), 'تم حذف الصورة')) onSaved();
  }

  return (
    <Panel
      title="التقرير الفني"
      actions={r.report?.published ? <Tag tone="success">مُرسل للعميل {r.report.publishedAt && formatDate(r.report.publishedAt)}</Tag> : r.report ? <Tag>مسودة</Tag> : undefined}
    >
      <div className="space-y-3">
        <Textarea label="الملاحظات والنتائج الفنية" rows={5} value={v.findings} maxLength={10000} onChange={(e) => setV({ ...v, findings: e.target.value })} />
        <Input label="الفحوصات والأجهزة المستخدمة" value={v.devicesUsed} maxLength={2000} onChange={(e) => setV({ ...v, devicesUsed: e.target.value })} />
        <Textarea label="التوصيات المقترحة" rows={3} value={v.recommendations} maxLength={10000} onChange={(e) => setV({ ...v, recommendations: e.target.value })} />
        <Textarea label="الأعمال التي تحتاج إلى إصلاح" rows={3} value={v.repairsNeeded} maxLength={10000} onChange={(e) => setV({ ...v, repairsNeeded: e.target.value })} />
        <section className="rounded-xl border border-line p-3">
          <span className="label flex items-center gap-1.5">
            <Icon name="gps" className="h-4 w-4" /> إحداثيات موقع الفحص (تظهر في التقرير النهائي)
          </span>
          {gps ? (
            <p className="text-sm">
              <a href={mapsLink(gps.gpsLat, gps.gpsLng)} target="_blank" rel="noopener noreferrer" className="ltr font-semibold underline-offset-4 hover:underline">
                {gps.gpsLat.toFixed(6)}, {gps.gpsLng.toFixed(6)}
              </a>
              {gps.gpsAccuracy != null && <span className="text-muted"> · دقة ±{gps.gpsAccuracy} م</span>}
              <span className="text-muted"> · {formatDate(gps.gpsAt, true)}</span>
            </p>
          ) : (
            <p className="text-sm text-muted">لم تُسجَّل بعد — سجّلها وأنت في موقع العقار.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={locating} onClick={locate}>
              <Icon name="navigation" className="h-4 w-4" /> {gps ? 'إعادة تسجيل موقعي الآن' : 'تسجيل موقعي الآن (GPS)'}
            </Button>
            {r.lat != null && r.lng != null && (
              <Button size="sm" variant="ghost" onClick={() => setGps({ gpsLat: r.lat!, gpsLng: r.lng!, gpsAccuracy: null, gpsAt: new Date().toISOString() })}>
                استخدام موقع العميل على الخريطة
              </Button>
            )}
            {gps && (
              <Button size="sm" variant="ghost" onClick={() => setGps(null)}>
                مسح
              </Button>
            )}
          </div>
          {gpsError && <p className="mt-1.5 text-sm text-danger">{gpsError}</p>}
          <p className="mt-1.5 text-xs text-muted">احفظ التقرير بعد تسجيل الموقع.</p>
        </section>
        <div>
          <span className="label">صور التقرير</span>
          {photos.length > 0 && <MediaGrid items={photos} onDelete={remove} />}
          <label className="mt-2 flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-3 text-sm font-semibold hover:border-ink/50">
            <Icon name="upload" className="h-4 w-4" /> {m.pending === 'upload' ? 'جارٍ الرفع…' : 'إضافة صور'}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void upload(e.target.files)} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" loading={m.pending === 'draft'} onClick={() => save()}>
            حفظ كمسودة
          </Button>
          <Button loading={m.pending === 'publish'} onClick={() => save(true)}>
            {r.report?.published ? 'حفظ التعديلات' : 'حفظ وإرسال للعميل'}
          </Button>
          {r.report && (
            <ButtonLink variant="ghost" to={`/admin/service-requests/${r.id}/print?doc=report`}>
              <Icon name="printer" className="h-4 w-4" /> معاينة PDF
            </ButtonLink>
          )}
        </div>
      </div>
    </Panel>
  );
}

const emptyItem = (): QuoteItem => ({ description: '', qty: 1, unitPrice: 0 });

function QuotesPanel({ request: r, onChanged }: { request: Detail; onChanged: () => void }) {
  const m = useMutation();
  const [editing, setEditing] = useState<ServiceQuote | 'new' | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([emptyItem()]);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [deduct, setDeduct] = useState(r.visitFeePolicy === 'DEDUCTIBLE');

  function open(qt: ServiceQuote | 'new') {
    setEditing(qt);
    setItems(qt === 'new' ? [emptyItem()] : qt.items.map((i) => ({ ...i })));
    setTitle(qt === 'new' ? '' : qt.title);
    setNotes(qt === 'new' ? '' : qt.notes);
    setValidUntil(qt !== 'new' && qt.validUntil ? formatDateShort(qt.validUntil) : '');
    setDeduct(qt === 'new' ? r.visitFeePolicy === 'DEDUCTIBLE' : qt.visitFeeDeduction > 0);
  }
  const subtotal = items.reduce((n, i) => n + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);
  const deduction = deduct ? Math.min(r.total, subtotal) : 0;

  async function save(send: boolean) {
    const body = { title: title.trim(), items: items.filter((i) => i.description.trim()), notes, validUntil: validUntil || null, deductVisitFee: deduct, send };
    const ok = await m.run(send ? 'send' : 'save', () => (editing === 'new' ? api.post(`/admin/service-requests/${r.id}/quotes`, body) : api.patch(`/admin/service-requests/${r.id}/quotes/${(editing as ServiceQuote).id}`, body)), send ? 'تم إرسال عرض السعر للعميل' : 'تم حفظ عرض السعر');
    if (ok) {
      setEditing(null);
      onChanged();
    }
  }
  async function remove(qt: ServiceQuote) {
    if (await m.run(`del-${qt.id}`, () => api.del(`/admin/service-requests/${r.id}/quotes/${qt.id}`), 'تم حذف المسودة')) onChanged();
  }

  return (
    <Panel
      title="عروض الأسعار (إصلاح، دراسة، تصميم، تصنيع وتركيب)"
      actions={
        !editing && r.status !== 'CANCELLED' ? (
          <Button size="sm" variant="outline" onClick={() => open('new')}>
            <Icon name="plus" className="h-4 w-4" /> عرض سعر جديد
          </Button>
        ) : undefined
      }
    >
      <p className="mb-3 text-xs text-muted">عرض سعر الإصلاح منفصل عن رسوم الزيارة. سياسة هذه الخدمة: {POLICY_TEXT[r.visitFeePolicy]}</p>
      {!r.quotes.length && !editing && <p className="text-sm text-muted">لا توجد عروض أسعار بعد.</p>}
      <ul className="space-y-2">
        {r.quotes.map((qt) => (
          <li key={qt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5">
            <span className="text-[15px]">
              {qt.title ? <b>{qt.title}</b> : 'عرض'} <span className="text-muted">رقم {qt.number}</span> — <b>{formatJOD(qt.total)}</b>
              {qt.visitFeeDeduction > 0 && <span className="text-xs text-muted"> (بعد خصم الزيارة {formatJOD(qt.visitFeeDeduction)})</span>}
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <Tag tone={qt.status === 'ACCEPTED' ? 'success' : qt.status === 'REJECTED' ? 'danger' : qt.status === 'SENT' ? 'sand' : 'neutral'}>{QUOTE_STATUS_LABEL[qt.status]}</Tag>
              {qt.status === 'DRAFT' && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => open(qt)}>
                    تعديل
                  </Button>
                  <Button size="sm" variant="ghost" loading={m.pending === `del-${qt.id}`} onClick={() => remove(qt)}>
                    حذف
                  </Button>
                </>
              )}
              <ButtonLink size="sm" variant="ghost" to={`/admin/service-requests/${r.id}/print?doc=quote&q=${qt.id}`}>
                <Icon name="printer" className="h-4 w-4" /> PDF
              </ButtonLink>
            </span>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="mt-4 space-y-3 rounded-xl border border-ink p-4">
          <h3 className="text-base">{editing === 'new' ? 'عرض سعر جديد' : `تعديل العرض رقم ${editing.number}`}</h3>
          <div>
            <Input label="نوع العرض" placeholder="مثال: الدراسة، التصميم، التصنيع والتركيب" list="quote-titles" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            <datalist id="quote-titles">
              {QUOTE_TITLES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-muted">يمكنك إصدار عروض مستقلة لكل مرحلة (دراسة، تصميم، تصنيع وتركيب) — موافقة العميل على أحدها لا تلغي غيره.</p>
          </div>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_4.5rem_6rem_auto] items-end gap-2">
              <Input label={i === 0 ? 'البند' : ' '} value={it.description} maxLength={400} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <Input label={i === 0 ? 'الكمية' : ' '} type="number" min={0} step="any" className="ltr text-start" value={it.qty} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
              <Input label={i === 0 ? 'سعر الوحدة' : ' '} type="number" min={0} step="any" className="ltr text-start" value={it.unitPrice} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))} />
              <button type="button" className="mb-1 grid h-10 w-10 place-items-center rounded-lg text-muted hover:text-danger disabled:opacity-30" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="حذف البند">
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setItems([...items, emptyItem()])}>
            <Icon name="plus" className="h-4 w-4" /> بند
          </Button>
          <Checkbox label={`خصم رسوم الزيارة (${formatJOD(r.total)}) من قيمة الإصلاح`} checked={deduct} onChange={setDeduct} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="ساري حتى (اختياري)" type="date" className="ltr text-start" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <Textarea label="ملاحظات وشروط العرض" rows={3} value={notes} maxLength={3000} onChange={(e) => setNotes(e.target.value)} />
          <dl className="rounded-lg bg-subtle px-3 py-2 text-sm">
            <div className="flex justify-between">
              <dt>المجموع</dt>
              <dd className="tabular-nums">{formatJOD(subtotal)}</dd>
            </div>
            {deduction > 0 && (
              <div className="flex justify-between text-success">
                <dt>خصم رسوم الزيارة</dt>
                <dd className="tabular-nums">− {formatJOD(deduction)}</dd>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <dt>الإجمالي</dt>
              <dd className="tabular-nums">{formatJOD(subtotal - deduction)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" loading={m.pending === 'save'} onClick={() => save(false)}>
              حفظ كمسودة
            </Button>
            <Button loading={m.pending === 'send'} onClick={() => save(true)}>
              حفظ وإرسال للعميل
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}


/** مستندات المشروع: ملفات العميل، والمخططات والتصاميم والتقارير التي ترسلها الإدارة له */
function DocumentsPanel({ request: r, onChanged }: { request: Detail; onChanged: () => void }) {
  const m = useMutation();
  const [title, setTitle] = useState('');
  const docs = r.media.filter(isDocumentMedia);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    if (title.trim()) fd.append('title', title.trim());
    Array.from(files).forEach((f) => fd.append('files', f));
    if (await m.run('docs', () => api.post(`/admin/service-requests/${r.id}/documents`, fd), 'تم إرفاق المستندات وإشعار العميل')) {
      setTitle('');
      onChanged();
    }
  }
  async function remove(id: string) {
    if (await m.run(`dd-${id}`, () => api.del(`/admin/service-requests/${r.id}/media/${id}`), 'تم حذف الملف')) onChanged();
  }
  return (
    <Panel title="المستندات والمخططات">
      {docs.length > 0 ? (
        <ul className="mb-4 divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-[15px]">
              <a href={fileHref(d.url)} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 hover:underline">
                <Icon name="file" className="h-4 w-4 shrink-0" />
                <span className="truncate">{d.originalName ?? 'ملف'}</span>
              </a>
              <span className="flex shrink-0 items-center gap-2">
                <Tag tone={d.purpose === 'document' ? 'brand' : 'neutral'}>{d.purpose === 'document' ? 'أُرسل للعميل' : 'من العميل'}</Tag>
                {d.purpose === 'document' && (
                  <Button size="sm" variant="ghost" loading={m.pending === `dd-${d.id}`} onClick={() => remove(d.id)}>
                    حذف
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted">لا توجد مستندات بعد.</p>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <Input label="عنوان المستند (اختياري)" placeholder="مثال: مخطط توزيع اللافتات، التصميم المقترح، جدول الكميات" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-4 text-sm font-semibold hover:border-ink/50">
          <Icon name="upload" className="h-4 w-4" /> {m.pending === 'docs' ? 'جارٍ الرفع…' : 'إرفاق ملفات للعميل'}
          <input type="file" multiple accept="image/*,application/pdf,.pdf,.dwg,.dxf" className="sr-only" onChange={(e) => void upload(e.target.files)} />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">PDF أو صور أو ملفات CAD — تظهر للعميل في طلبه ويصله إشعار.</p>
    </Panel>
  );
}
