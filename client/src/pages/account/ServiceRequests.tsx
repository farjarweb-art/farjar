import { Link } from 'react-router-dom';
import { ButtonLink, EmptyState, ErrorState, Icon, SkeletonRows, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, formatJOD } from '../../lib/format';
import { statusTone, type SrStatus } from '../../lib/siteServices';
import { useAsync } from '../../lib/useAsync';

type Row = {
  id: string;
  number: number;
  ref: string;
  status: SrStatus;
  statusLabel: string;
  requestTypeLabel: string;
  services: { name: string }[];
  scheduledAt: string;
  total: number;
  zoneName: string;
  hasReport: boolean;
  pendingQuotes: number;
};

/** تبويب طلبات المعاينات والصيانة في حساب العميل */
export function ServiceRequestsTab() {
  const q = useAsync(() => api.get<Row[]>('/account/service-requests'), [], 'account/service-requests');
  if (q.loading && !q.data) return <SkeletonRows rows={3} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.reload} />;
  if (!q.data?.length) {
    return (
      <EmptyState
        title="لا توجد طلبات معاينة أو صيانة"
        description="احجز معاينة فنية أو فحصًا بسعر زيارة ثابت، وتابع هنا حالة الطلب والتقرير وعرض سعر الإصلاح."
        action={<ButtonLink to="/services">تصفح الخدمات</ButtonLink>}
      />
    );
  }
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <ButtonLink to="/services" size="sm">
          <Icon name="plus" className="h-4 w-4" /> طلب جديد
        </ButtonLink>
      </div>
      <ul className="space-y-3">
        {q.data.map((r) => (
          <li key={r.id}>
            <Link to={`/account/services/${r.id}`} className="block rounded-2xl border border-line bg-surface p-4 transition-shadow hover:shadow-lift sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {r.services.map((s) => s.name).join('، ')} <span className="ltr text-muted">#{r.number}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {r.requestTypeLabel} · المرجع <span className="ltr">{r.ref}</span>
                  </p>
                </div>
                <Tag tone={statusTone(r.status)}>{r.statusLabel}</Tag>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                <span>{formatDate(r.scheduledAt, true)}</span>
                <span>{r.zoneName}</span>
                <span>
                  الزيارة <b className="text-ink">{formatJOD(r.total)}</b>
                </span>
                {r.hasReport && <span className="font-semibold text-ink">التقرير الفني جاهز</span>}
                {r.pendingQuotes > 0 && <span className="font-semibold text-warn">عرض سعر بانتظار ردك</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
