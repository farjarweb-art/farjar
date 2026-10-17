import { useParams, useSearchParams } from 'react-router-dom';
import { ServiceDocument } from '../../components/services/ServiceDocument';
import { ButtonLink, ErrorState, Icon, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import type { RequestCore } from '../../lib/siteServices';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

/** التقرير الفني / عرض سعر الإصلاح للعميل بصيغة قابلة للطباعة وحفظ PDF */
export default function ServiceRequestPrint() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const kind = params.get('doc') === 'quote' ? 'quote' : 'report';
  const q = useAsync(() => api.get<RequestCore>(`/account/service-requests/${id}`), [id]);
  const r = q.data;
  const quote = r?.quotes.find((x) => x.id === params.get('q')) ?? null;
  useDocumentTitle(r ? `${kind === 'report' ? 'تقرير فني' : 'عرض سعر'} — طلب ${r.number}` : 'مستند');

  if (q.error) return <div className="container py-16"><ErrorState message={q.error.message} onRetry={q.reload} /></div>;
  if (!r) return <div className="container py-10"><Skeleton className="h-96 w-full" /></div>;
  if ((kind === 'report' && !r.report) || (kind === 'quote' && !quote)) {
    return <div className="container py-16"><ErrorState title="المستند غير متاح" message="لم يُرسل هذا المستند بعد." /></div>;
  }
  return (
    <ServiceDocument
      request={r}
      kind={kind}
      quote={quote}
      back={
        <ButtonLink variant="ghost" to={`/account/services/${r.id}`}>
          <Icon name="chevronRight" className="h-4 w-4" /> رجوع للطلب
        </ButtonLink>
      }
    />
  );
}
