import { useParams, useSearchParams } from 'react-router-dom';
import { useAdminQuery } from '../../components/admin/hooks';
import { DetailSkeleton } from '../../components/admin/ui';
import { ServiceDocument } from '../../components/services/ServiceDocument';
import { ButtonLink, ErrorState, Icon } from '../../components/ui';
import { api } from '../../lib/api';
import type { RequestCore } from '../../lib/siteServices';
import { useDocumentTitle } from '../../lib/useAsync';

/** التقرير الفني / عرض سعر الإصلاح من لوحة الإدارة — للطباعة وحفظ PDF وإرساله للعميل */
export default function ServiceRequestPrint() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const kind = params.get('doc') === 'quote' ? 'quote' : 'report';
  const q = useAdminQuery(() => api.get<RequestCore>(`/admin/service-requests/${id}`), [id]);
  const r = q.data;
  const quote = r?.quotes.find((x) => x.id === params.get('q')) ?? null;
  useDocumentTitle(r ? `${kind === 'report' ? 'تقرير فني' : 'عرض سعر'} — طلب ${r.number}` : 'مستند');

  if (q.error) return <ErrorState message={q.error.message} onRetry={q.retry} />;
  if (!r) return <DetailSkeleton />;
  if ((kind === 'report' && !r.report) || (kind === 'quote' && !quote)) return <ErrorState title="المستند غير موجود" message="لم يُنشأ التقرير أو عرض السعر بعد." />;
  return (
    <ServiceDocument
      request={r}
      kind={kind}
      quote={quote}
      back={
        <ButtonLink variant="ghost" to={`/admin/service-requests/${r.id}`}>
          <Icon name="chevronRight" className="h-4 w-4" /> رجوع للطلب
        </ButtonLink>
      }
    />
  );
}
