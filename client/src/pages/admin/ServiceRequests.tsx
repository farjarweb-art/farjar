import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters } from '../../components/admin/hooks';
import { AdminPage, FilterBar, FilterInput, FilterSelect, Panel, SearchInput, StatTile } from '../../components/admin/ui';
import { ButtonLink, Icon, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { displayPhone, formatDate, formatJOD } from '../../lib/format';
import { CLIENT_TYPE_LABEL, STATUS_FLOW, TIER_LABEL, statusTone, type ClientType, type PriceTier, type SrStatus } from '../../lib/siteServices';
import { useDocumentTitle } from '../../lib/useAsync';

type Row = {
  id: string;
  number: number;
  ref: string;
  status: SrStatus;
  statusLabel: string;
  requestTypeLabel: string;
  name: string;
  phone: string;
  clientType: ClientType;
  zoneName: string;
  tier: PriceTier;
  services: { name: string }[];
  scheduledAt: string;
  total: number;
  needsApproval: boolean;
  urgency?: 'NORMAL' | 'URGENT' | 'EMERGENCY';
  technician: { id: string; name: string } | null;
};
type Paged = { items: Row[]; total: number; page: number; pageSize: number; statusCounts: Partial<Record<SrStatus, number>> };
type Stats = {
  requests: number;
  bookedFees: number;
  visits: number;
  visitFees: number;
  cancelled: number;
  repairsApproved: number;
  repairsValue: number;
  byService: { name: string; count: number; total: number }[];
};

const ADMIN_STATUS: Record<SrStatus, string> = {
  NEW: 'طلب جديد',
  PENDING_CONFIRMATION: 'بانتظار تأكيد الحجز',
  CONFIRMED: 'تم تأكيد الحجز',
  TECH_ASSIGNED: 'تم تعيين الفني',
  VISIT_IN_PROGRESS: 'الزيارة قيد التنفيذ',
  INSPECTED: 'تمت المعاينة',
  REPORT_IN_PROGRESS: 'التقرير قيد الإعداد',
  REPORT_SENT: 'تم إرسال التقرير/العرض',
  AWAITING_APPROVAL: 'بانتظار موافقة العميل',
  REPAIR_APPROVED: 'تم اعتماد الإصلاح',
  REPAIR_IN_PROGRESS: 'الإصلاح قيد التنفيذ',
  WORK_DONE: 'تم إنجاز العمل',
  CLOSED: 'مغلق',
  CANCELLED: 'ملغي',
};

/** طلبات المعاينات والفحوصات والصيانة */
export default function ServiceRequests() {
  useDocumentTitle('طلبات المعاينات والصيانة');
  const f = useFilters(['status', 'q', 'from', 'to'] as const);
  const v = f.values;
  const list = useAdminQuery(() => api.get<Paged>('/admin/service-requests', { ...v, page: f.page, pageSize: 25 }), [JSON.stringify(v), f.page], { keep: true, live: true });
  const stats = useAdminQuery(() => api.get<Stats>('/admin/service-requests/stats', { from: v.from, to: v.to }), [v.from, v.to], { keep: true, live: true });
  const counts = list.data?.statusCounts ?? {};
  const st = stats.data;

  const columns: Column<Row>[] = [
    {
      key: 'n',
      header: 'الطلب',
      cell: (r) => (
        <span>
          <span className="font-semibold">{r.services.map((s) => s.name).join('، ')}</span>
          <span className="block text-xs text-muted">
            <span className="ltr">#{r.number}</span> · {r.requestTypeLabel}
          </span>
        </span>
      ),
    },
    {
      key: 'c',
      header: 'العميل',
      cell: (r) => (
        <span>
          {r.name}
          <span className="block text-xs text-muted">
            <span className="ltr">{displayPhone(r.phone)}</span> · {CLIENT_TYPE_LABEL[r.clientType]}
          </span>
        </span>
      ),
    },
    {
      key: 'z',
      header: 'المنطقة',
      cell: (r) => (
        <span>
          {r.zoneName}
          <span className="block text-xs text-muted">{TIER_LABEL[r.tier]}</span>
          {r.needsApproval && <Tag tone="sand">تحتاج موافقة</Tag>}
          {r.urgency === 'URGENT' && <Tag tone="sand">⚡ عاجلة</Tag>}
          {r.urgency === 'EMERGENCY' && <Tag tone="danger">🚨 طارئة</Tag>}
        </span>
      ),
      hideOnMobile: true,
    },
    { key: 'd', header: 'الموعد', cell: (r) => formatDate(r.scheduledAt, true) },
    { key: 't', header: 'الفني', cell: (r) => r.technician?.name ?? <span className="text-muted">—</span>, hideOnMobile: true },
    { key: 'p', header: 'الزيارة', cell: (r) => <b className="tabular-nums">{formatJOD(r.total)}</b> },
    { key: 's', header: 'الحالة', cell: (r) => <Tag tone={statusTone(r.status)}>{ADMIN_STATUS[r.status]}</Tag> },
  ];

  return (
    <AdminPage
      title="طلبات المعاينات والصيانة"
      description="حجوزات الزيارات بأسعارها المعتمدة، الفنيون، التقارير الفنية وعروض أسعار الإصلاح."
      actions={
        <ButtonLink to="/admin/site-services" variant="outline" size="sm">
          <Icon name="sliders" className="h-4 w-4" /> الخدمات والأسعار
        </ButtonLink>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="الطلبات" value={st?.requests ?? 0} sub={`${st?.cancelled ?? 0} ملغي`} loading={stats.loading} />
        <StatTile label="رسوم الزيارات المحجوزة" value={formatJOD(st?.bookedFees ?? 0)} tone="sand" loading={stats.loading} />
        <StatTile label="رسوم الزيارات المنجزة" value={formatJOD(st?.visitFees ?? 0)} sub={`${st?.visits ?? 0} زيارة`} tone="brand" loading={stats.loading} />
        <StatTile label="أعمال إصلاح معتمدة" value={formatJOD(st?.repairsValue ?? 0)} sub={`${st?.repairsApproved ?? 0} عرض مقبول`} tone="warn" loading={stats.loading} />
      </div>

      <div className="mt-6">
        <FilterBar onClear={f.clear} active={f.active}>
          <SearchInput value={v.q} onChange={(x) => f.set({ q: x })} placeholder="اسم، هاتف، رقم الطلب…" />
          <FilterSelect label="الحالة" value={v.status} onChange={(e) => f.set({ status: e.target.value })}>
            <option value="">كل الحالات</option>
            {[...STATUS_FLOW, 'CANCELLED' as const].map((s) => (
              <option key={s} value={s}>
                {ADMIN_STATUS[s]}
                {counts[s] ? ` (${counts[s]})` : ''}
              </option>
            ))}
          </FilterSelect>
          <FilterInput label="من" type="date" className="ltr text-start" value={v.from} onChange={(e) => f.set({ from: e.target.value })} />
          <FilterInput label="إلى" type="date" className="ltr text-start" value={v.to} onChange={(e) => f.set({ to: e.target.value })} />
        </FilterBar>
        <DataTable
          rows={list.data?.items}
          columns={columns}
          rowKey={(r) => r.id}
          rowHref={(r) => `/admin/service-requests/${r.id}`}
          loading={list.loading}
          refreshing={list.refreshing}
          error={list.error}
          onRetry={list.retry}
          empty={{ title: 'لا توجد طلبات مطابقة' }}
          page={f.page}
          pages={list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1}
          onPage={f.setPage}
          total={list.data?.total}
        />
      </div>

      {!!st?.byService.length && (
        <div className="mt-8">
          <Panel title="الطلبات حسب الخدمة">
            <ul className="divide-y divide-line">
              {st.byService.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-3 py-2.5 text-[15px]">
                  <span>{s.name}</span>
                  <span className="text-muted">
                    <b className="text-ink">{s.count}</b> طلب · {formatJOD(s.total)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </AdminPage>
  );
}
