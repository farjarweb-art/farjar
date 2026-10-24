import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PriceSummary } from '../../components/services/PriceSummary';
import { Breadcrumbs, Button, ButtonLink, ErrorState, Icon, Modal, Skeleton, Tag, Textarea } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { ApiError, api, fileHref } from '../../lib/api';
import { cx, formatDate, formatJOD } from '../../lib/format';
import { CLIENT_TYPE_LABEL, URGENCY_LABEL, POLICY_TEXT, isDocumentMedia, QUOTE_STATUS_LABEL, STATUS_FLOW, STATUS_LABEL, TIER_LABEL, statusTone, type RequestCore, type SrStatus } from '../../lib/siteServices';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

type Detail = RequestCore & {
  canCancel: boolean;
  events: { id: string; kind: string; toStatus: SrStatus | null; toStatusLabel: string | null; note: string | null; createdAt: string }[];
};

/** متابعة طلب المعاينة/الصيانة: المراحل، التقرير الفني، عرض سعر الإصلاح والموافقة عليه */
export default function ServiceRequestDetail() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const q = useAsync(() => api.get<Detail>(`/account/service-requests/${id}`), [id]);
  const r = q.data;
  useDocumentTitle(r ? `طلب #${r.number}` : 'طلب معاينة');
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reject, setReject] = useState<string | null>(null);
  const [note, setNote] = useState('');

  if (q.error) {
    return (
      <div className="container py-16">
        <ErrorState message={q.error.message} onRetry={q.reload} />
      </div>
    );
  }
  if (!r) {
    return (
      <div className="container space-y-4 py-10">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  async function act(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await fn();
      toast(success, 'success');
      setCancelOpen(false);
      setReject(null);
      await q.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'تعذر تنفيذ العملية', 'error');
    } finally {
      setBusy(null);
    }
  }

  const idx = STATUS_FLOW.indexOf(r.status);
  const customerPhotos = r.media.filter((m) => m.purpose === 'customer');
  const docs = r.media.filter(isDocumentMedia);

  return (
    <div className="container max-w-4xl py-8 md:py-12">
      <Breadcrumbs items={[{ to: '/account?tab=services', label: 'المعاينات والصيانة' }, { label: `#${r.number}` }]} className="mb-4" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.5rem] leading-snug md:text-[2rem]">{r.services.map((s) => s.name).join('، ')}</h1>
          <p className="mt-1 text-sm text-muted">
            {r.requestTypeLabel} · طلب <span className="ltr">#{r.number}</span> · المرجع <span className="ltr">{r.ref}</span>
          </p>
        </div>
        <Tag tone={statusTone(r.status)}>{r.statusLabel}</Tag>
      </div>

      {r.status === 'CANCELLED' ? (
        <p className="mt-6 rounded-lg bg-subtle px-4 py-3 text-sm text-muted">أُلغي هذا الطلب.</p>
      ) : (
        <div className="mt-6" aria-label={`المرحلة: ${STATUS_LABEL[r.status]}`}>
          <ol className="flex gap-1" aria-hidden>
            {STATUS_FLOW.map((s, i) => (
              <li key={s} className={cx('h-1.5 flex-1 rounded-full', i <= idx ? 'bg-primary' : 'bg-subtle')} title={STATUS_LABEL[s]} />
            ))}
          </ol>
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            <span>{STATUS_LABEL.NEW}</span>
            <span className="font-semibold text-ink">{STATUS_LABEL[r.status]}</span>
            <span>{STATUS_LABEL.CLOSED}</span>
          </div>
        </div>
      )}

      {/* عروض أسعار الإصلاح بانتظار الرد */}
      {r.quotes.map((qt) => (
        <section key={qt.id} className={cx('mt-6 rounded-xl border p-5', qt.status === 'SENT' ? 'border-ink' : 'border-line')}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg">
                {qt.title ? `عرض سعر ${qt.title}` : 'عرض سعر الإصلاح'} <span className="text-muted">— رقم {qt.number}</span>
              </h2>
              <p className="text-sm text-muted">
                {qt.sentAt && formatDate(qt.sentAt)}
                {qt.validUntil && ` · ساري حتى ${formatDate(qt.validUntil)}`}
              </p>
            </div>
            <Tag tone={qt.status === 'ACCEPTED' ? 'success' : qt.status === 'REJECTED' ? 'danger' : 'sand'}>{QUOTE_STATUS_LABEL[qt.status]}</Tag>
          </div>
          <ul className="mt-3 divide-y divide-line text-[15px]">
            {qt.items.map((i, n) => (
              <li key={n} className="flex justify-between gap-3 py-2">
                <span>
                  {i.description} <span className="text-muted">× {i.qty}</span>
                </span>
                <span className="shrink-0 tabular-nums">{formatJOD(i.qty * i.unitPrice)}</span>
              </li>
            ))}
          </ul>
          {qt.visitFeeDeduction > 0 && <p className="mt-2 text-sm text-success">خصم رسوم الزيارة: − {formatJOD(qt.visitFeeDeduction)}</p>}
          <p className="mt-2 text-lg font-semibold">الإجمالي: {formatJOD(qt.total)}</p>
          {qt.notes && <p className="mt-2 whitespace-pre-line text-sm text-muted">{qt.notes}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {qt.status === 'SENT' && (
              <>
                <Button loading={busy === `a-${qt.id}`} onClick={() => act(`a-${qt.id}`, () => api.post(`/account/service-requests/${r.id}/quotes/${qt.id}/accept`), 'تمت الموافقة على عرض السعر — سنتواصل معك لبدء العمل')}>
                  <Icon name="check" className="h-4 w-4" /> أوافق على العرض
                </Button>
                <Button variant="outline" onClick={() => setReject(qt.id)}>
                  رفض العرض
                </Button>
              </>
            )}
            <ButtonLink variant="ghost" to={`/account/services/${r.id}/print?doc=quote&q=${qt.id}`}>
              <Icon name="download" className="h-4 w-4" /> PDF
            </ButtonLink>
          </div>
        </section>
      ))}

      {r.report && (
        <section className="mt-6 rounded-xl border border-line p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">التقرير الفني</h2>
            <ButtonLink size="sm" variant="outline" to={`/account/services/${r.id}/print?doc=report`}>
              <Icon name="download" className="h-4 w-4" /> عرض وتحميل PDF
            </ButtonLink>
          </div>
          <p className="mt-3 line-clamp-4 whitespace-pre-line text-[15px] text-muted">{r.report.findings}</p>
        </section>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-line p-5">
          <h2 className="text-lg">تفاصيل الزيارة</h2>
          <dl className="mt-3 space-y-2 text-[15px]">
            <Row label="الموعد" value={formatDate(r.scheduledAt, true)} />
            <Row label="الفني" value={r.technician?.name} />
            <Row label="الموقع" value={`${r.zoneName} (${TIER_LABEL[r.tier]}) — ${r.area}`} />
            <Row label="العنوان" value={r.address} />
            <Row label="نوع العميل" value={`${CLIENT_TYPE_LABEL[r.clientType]} — ${r.propertyType}`} />
            <Row label="صفتك" value={r.ownership ?? undefined} />
            {r.urgency && r.urgency !== 'NORMAL' && <Row label="الأولوية" value={URGENCY_LABEL[r.urgency]} />}
            <Row label="المشكلة" value={r.problems.map((p) => p.name).join('، ')} />
            <Row label="الأجهزة" value={r.devices.map((d) => d.name).join('، ')} />
            {(r.extra ?? []).map((x) => (
              <Row key={x.key} label={x.label} value={x.value} />
            ))}
            <Row label="الوصف" value={r.description} />
          </dl>
          {customerPhotos.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {customerPhotos.map((m) =>
                m.kind === 'VIDEO' ? (
                  <video key={m.id} src={m.url} controls className="col-span-3 w-full rounded-lg" />
                ) : (
                  <a key={m.id} href={fileHref(m.url)} target="_blank" rel="noopener noreferrer">
                    <img src={m.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
                  </a>
                ),
              )}
            </div>
          )}
        </section>
        <div className="space-y-4">
          <PriceSummary lines={r.priceLines} total={r.total} title="السعر المعتمد للزيارة" />
          <p className="text-sm text-muted">السعر ثابت كما وافقت عليه بتاريخ {formatDate(r.termsAcceptedAt)}. {POLICY_TEXT[r.visitFeePolicy]}</p>
        </div>
      </div>

      {docs.length > 0 && (
        <section className="mt-6 rounded-xl border border-line p-5">
          <h2 className="text-lg">المستندات والمخططات</h2>
          <ul className="mt-3 divide-y divide-line">
            {docs.map((m) => (
              <li key={m.id}>
                <a href={fileHref(m.url)} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] items-center justify-between gap-3 py-2 text-[15px] hover:underline">
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon name="file" className="h-4 w-4 shrink-0" />
                    <span className="truncate">{m.originalName ?? 'ملف'}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{m.purpose === 'document' ? 'من فرجار جروب' : 'أرفقته أنت'}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-xl border border-line p-5">
        <h2 className="text-lg">سجل الطلب</h2>
        <ol className="mt-3 space-y-3 border-s border-line ps-4">
          {r.events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
              <p className="text-[15px] font-medium">{e.kind === 'created' ? 'تم استلام الطلب' : e.kind === 'technician' ? 'تم تعيين الفني' : e.kind === 'schedule' ? 'تحديد الموعد' : e.kind === 'work' ? 'أعمال منفذة' : e.toStatusLabel}</p>
              {e.note && <p className="text-sm text-muted">{e.note}</p>}
              <p className="text-xs text-muted">{formatDate(e.createdAt, true)}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        {r.canCancel && (
          <Button variant="outline" onClick={() => setCancelOpen(true)}>
            إلغاء الطلب
          </Button>
        )}
        <Link to="/account?tab=services" className="inline-flex min-h-[44px] items-center px-2 text-sm font-semibold underline-offset-4 hover:underline">
          كل طلباتي
        </Link>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="إلغاء الطلب"
        footer={
          <Button variant="danger" loading={busy === 'cancel'} onClick={() => act('cancel', () => api.post(`/account/service-requests/${r.id}/cancel`, { reason: reason || undefined }), 'تم إلغاء الطلب')}>
            تأكيد الإلغاء
          </Button>
        }
      >
        <Textarea label="سبب الإلغاء (اختياري)" value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} />
      </Modal>
      <Modal
        open={!!reject}
        onClose={() => setReject(null)}
        title="رفض عرض السعر"
        footer={
          <Button variant="danger" loading={busy === 'reject'} onClick={() => act('reject', () => api.post(`/account/service-requests/${r.id}/quotes/${reject}/reject`, { note: note || undefined }), 'تم رفض العرض — يمكننا التواصل معك لتعديله')}>
            رفض العرض
          </Button>
        }
      >
        <Textarea label="ملاحظتك (اختياري)" placeholder="مثال: السعر مرتفع، أو أريد تعديل بعض البنود" value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
