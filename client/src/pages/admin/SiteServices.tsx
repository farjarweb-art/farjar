import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { AdminPage, Panel, Switch } from '../../components/admin/ui';
import { Button, ButtonLink, Checkbox, ErrorState, Icon, Input, Modal, Pagination, Select, SkeletonRows, Tag, Textarea } from '../../components/ui';
import { useAdmin } from '../../context/AdminAuth';
import { hasPerm } from '../../context/Auth';
import { api } from '../../lib/api';
import { cx, formatDate, formatJOD } from '../../lib/format';
import { AUDIENCE_LABEL, REQUEST_TYPE_LABEL, TIER_LABEL, type Audience, type PriceTier, type RequestType, type VisitFeePolicy } from '../../lib/siteServices';
import { useDocumentTitle } from '../../lib/useAsync';

type Service = {
  id: string;
  name: string;
  slug: string;
  summary: string;
  includes: string;
  audiences: Audience[];
  requestTypes: RequestType[];
  priceInside: number;
  priceOutside: number;
  travelFee: number;
  discountPercent: number;
  durationMinutes: number;
  visitFeePolicy: VisitFeePolicy;
  terms: string;
  featured: boolean;
  sortOrder: number;
  active: boolean;
  problems: { id: string; name: string; isOther: boolean; active: boolean; deviceIds: string[] }[];
  devices: { deviceId: string; included: boolean; fee: number | null }[];
};
type Device = { id: string; name: string; description: string; fee: number; sortOrder: number; active: boolean };
type Zone = { id: string; name: string; tier: PriceTier; travelFee: number; requiresApproval: boolean; sortOrder: number; active: boolean };
type Bundle = { id: string; name: string; priceInside: number; priceOutside: number; terms: string; active: boolean; services: { id: string; name: string }[] };
type Catalog = { services: Service[]; devices: Device[]; zones: Zone[]; bundles: Bundle[] };

const TABS = [
  ['services', 'الخدمات'],
  ['devices', 'الأجهزة والفحوصات'],
  ['zones', 'المناطق ورسوم الانتقال'],
  ['bundles', 'الزيارات المجمعة'],
  ['log', 'سجل الأسعار'],
] as const;
type TabKey = (typeof TABS)[number][0];
const REQUEST_TYPES = Object.keys(REQUEST_TYPE_LABEL) as RequestType[];

/** كتالوج الخدمات والمعاينات: كل الأسماء والأسعار والخيارات من لوحة التحكم دون تعديل الكود */
export default function SiteServices() {
  useDocumentTitle('الخدمات والأسعار');
  const { admin } = useAdmin();
  const canEdit = hasPerm(admin, 'services.manage');
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'services') as TabKey;
  const q = useAdminQuery(() => api.get<Catalog>('/admin/site-services/catalog'), [], { keep: true });

  return (
    <AdminPage
      title="الخدمات والمعاينات — الكتالوج والأسعار"
      description="سعر الزيارة ثابت لكل خدمة داخل/خارج عمّان. تعديل الأسعار لا يغيّر الحجوزات المؤكدة، وكل تعديل يُسجَّل في سجل الأسعار."
      actions={
        <ButtonLink to="/admin/service-requests" variant="outline" size="sm">
          الطلبات
        </ButtonLink>
      }
    >
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setParams(k === 'services' ? {} : { tab: k }, { replace: true })}
            className={cx('min-h-[44px] shrink-0 border-b-2 px-3 text-sm font-semibold', tab === k ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}
          >
            {label}
          </button>
        ))}
      </div>
      {!canEdit && <p className="mb-4 rounded-lg bg-subtle px-3 py-2 text-sm text-muted">عرض فقط — تعديل الكتالوج يحتاج صلاحية "كتالوج الخدمات والأسعار".</p>}
      {tab === 'log' ? (
        <PriceLog />
      ) : q.error ? (
        <ErrorState message={q.error.message} onRetry={q.retry} />
      ) : !q.data ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          {tab === 'services' && <ServicesTab c={q.data} canEdit={canEdit} reload={q.reload} />}
          {tab === 'devices' && <DevicesTab c={q.data} canEdit={canEdit} reload={q.reload} />}
          {tab === 'zones' && <ZonesTab c={q.data} canEdit={canEdit} reload={q.reload} />}
          {tab === 'bundles' && <BundlesTab c={q.data} canEdit={canEdit} reload={q.reload} />}
        </>
      )}
    </AdminPage>
  );
}

type TabProps = { c: Catalog; canEdit: boolean; reload: () => void };

function Row({ title, sub, right, onClick, inactive }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; inactive?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={cx('flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-start hover:bg-subtle/60', inactive && 'opacity-55')}>
        <span className="min-w-0">
          <span className="block font-semibold">{title}</span>
          {sub && <span className="mt-0.5 block text-sm text-muted">{sub}</span>}
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-2 text-sm">{right}</span>
      </button>
    </li>
  );
}

// ───── الخدمات ─────

const blankService = (): Omit<Service, 'id' | 'slug' | 'problems' | 'devices'> => ({
  name: '', summary: '', includes: '', audiences: ['HOME'], requestTypes: ['INSPECTION', 'INSPECTION_REPORT', 'DIAGNOSIS', 'REPAIR_QUOTE'],
  priceInside: 0, priceOutside: 0, travelFee: 0, discountPercent: 0, durationMinutes: 60, visitFeePolicy: 'SEPARATE', terms: '', featured: false, sortOrder: 0, active: true,
});

function ServicesTab({ c, canEdit, reload }: TabProps) {
  const [edit, setEdit] = useState<Service | 'new' | null>(null);
  return (
    <Panel
      title={`الخدمات (${c.services.length})`}
      actions={canEdit && <Button size="sm" onClick={() => setEdit('new')}><Icon name="plus" className="h-4 w-4" /> خدمة جديدة</Button>}
      bodyClassName="p-0"
    >
      <ul className="divide-y divide-line">
        {c.services.map((s) => (
          <Row
            key={s.id}
            onClick={() => setEdit(s)}
            inactive={!s.active}
            title={
              <>
                {s.name} {s.featured && <Tag tone="brand">قسم رئيسي</Tag>} {!s.active && <Tag>موقوفة</Tag>}
              </>
            }
            sub={`${s.audiences.map((a) => (a === 'HOME' ? 'منازل' : 'شركات ومصانع')).join(' + ')} · ${s.problems.length} مشكلة · ${s.devices.length} جهاز`}
            right={
              <>
                <span>داخل {formatJOD(s.priceInside)}</span>
                <span className="text-muted">خارج {formatJOD(s.priceOutside)}</span>
                {s.discountPercent > 0 && <Tag tone="sand">خصم {s.discountPercent}%</Tag>}
              </>
            }
          />
        ))}
      </ul>
      {edit && <ServiceModal service={edit} catalog={c} canEdit={canEdit} onClose={() => setEdit(null)} onSaved={reload} />}
    </Panel>
  );
}

function ServiceModal({ service, catalog, canEdit, onClose, onSaved }: { service: Service | 'new'; catalog: Catalog; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const m = useMutation();
  const isNew = service === 'new';
  const [v, setV] = useState(() => (isNew ? blankService() : { ...service }));
  const [problems, setProblems] = useState(() => (isNew ? [] : service.problems.map((p) => ({ ...p }))));
  const [links, setLinks] = useState(() => (isNew ? [] : service.devices.map((l) => ({ ...l }))));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fe = (k: string) => m.fieldErrors[k];
  const setF = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

  async function saveMain() {
    const body = { ...v } as Record<string, unknown>;
    for (const k of ['id', 'slug', 'problems', 'devices']) delete body[k];
    const ok = await m.run('main', () => (isNew ? api.post('/admin/site-services/services', body) : api.patch(`/admin/site-services/services/${(service as Service).id}`, body)), 'تم حفظ الخدمة');
    if (ok) {
      onSaved();
      if (isNew) onClose();
    }
  }
  async function saveProblems() {
    if (await m.run('problems', () => api.put(`/admin/site-services/services/${(service as Service).id}/problems`, problems.filter((p) => p.name.trim())), 'تم حفظ المشكلات وربط الأجهزة')) onSaved();
  }
  async function saveLinks() {
    if (await m.run('links', () => api.put(`/admin/site-services/services/${(service as Service).id}/devices`, links), 'تم حفظ أجهزة الخدمة')) onSaved();
  }
  async function remove() {
    if (await m.run('del', () => api.del(`/admin/site-services/services/${(service as Service).id}`), 'تم حذف الخدمة')) {
      onSaved();
      onClose();
    }
  }

  const linkedDevices = catalog.devices.filter((d) => links.some((l) => l.deviceId === d.id));
  return (
    <Modal open onClose={onClose} title={isNew ? 'خدمة جديدة' : v.name} size="lg">
      <fieldset disabled={!canEdit} className="space-y-4">
        <Input label="اسم الخدمة" value={v.name} maxLength={160} onChange={(e) => setF('name', e.target.value)} error={fe('name')} />
        <Textarea label="وصف مختصر (يظهر في البطاقة)" rows={2} value={v.summary} maxLength={400} onChange={(e) => setF('summary', e.target.value)} />
        <Textarea label="ما يشمله سعر الزيارة (سطر لكل بند)" rows={4} value={v.includes} maxLength={3000} onChange={(e) => setF('includes', e.target.value)} />
        <fieldset>
          <legend className="label">القسم</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
              <Checkbox key={a} label={AUDIENCE_LABEL[a]} checked={v.audiences.includes(a)} onChange={() => setF('audiences', toggle(v.audiences, a))} />
            ))}
          </div>
          {fe('audiences') && <p className="mt-1 text-sm text-danger">{fe('audiences')}</p>}
        </fieldset>
        <fieldset>
          <legend className="label">أنواع الطلب المتاحة</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {REQUEST_TYPES.map((t) => (
              <Checkbox key={t} label={REQUEST_TYPE_LABEL[t]} checked={v.requestTypes.includes(t)} onChange={() => setF('requestTypes', toggle(v.requestTypes, t))} />
            ))}
          </div>
          {fe('requestTypes') && <p className="mt-1 text-sm text-danger">{fe('requestTypes')}</p>}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="سعر الزيارة داخل عمّان" type="number" min={0} step="any" className="ltr text-start" value={v.priceInside} onChange={(e) => setF('priceInside', Number(e.target.value))} error={fe('priceInside')} />
          <Input label="سعر الزيارة خارج عمّان" type="number" min={0} step="any" className="ltr text-start" value={v.priceOutside} onChange={(e) => setF('priceOutside', Number(e.target.value))} error={fe('priceOutside')} />
          <Input label="رسوم انتقال إضافية (خارج عمّان)" type="number" min={0} step="any" className="ltr text-start" value={v.travelFee} onChange={(e) => setF('travelFee', Number(e.target.value))} />
          <Input label="خصم على الزيارة %" type="number" min={0} max={90} className="ltr text-start" value={v.discountPercent} onChange={(e) => setF('discountPercent', Number(e.target.value))} />
          <Input label="المدة التقديرية (دقيقة)" hint="للمواعيد فقط — لا تؤثر على السعر" type="number" min={15} className="ltr text-start" value={v.durationMinutes} onChange={(e) => setF('durationMinutes', Number(e.target.value))} />
          <Input label="الترتيب" type="number" min={0} className="ltr text-start" value={v.sortOrder} onChange={(e) => setF('sortOrder', Number(e.target.value))} />
        </div>
        <Select label="رسوم الزيارة عند الموافقة على الإصلاح" value={v.visitFeePolicy} onChange={(e) => setF('visitFeePolicy', e.target.value as VisitFeePolicy)}>
          <option value="SEPARATE">مستقلة عن قيمة الإصلاح</option>
          <option value="DEDUCTIBLE">تُخصم من قيمة الإصلاح</option>
        </Select>
        <Textarea label="شروط خاصة بالخدمة (تظهر قبل التأكيد)" rows={2} value={v.terms} maxLength={2000} onChange={(e) => setF('terms', e.target.value)} />
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={v.active} onChange={(x) => setF('active', x)} label="فعالة" /> فعالة
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={v.featured} onChange={(x) => setF('featured', x)} label="قسم رئيسي مميز" /> قسم رئيسي مميز
          </label>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button loading={m.pending === 'main'} onClick={saveMain}>
              حفظ الخدمة والأسعار
            </Button>
            {!isNew && !confirmDelete && (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                حذف الخدمة
              </Button>
            )}
            {confirmDelete && (
              <Button variant="danger" loading={m.pending === 'del'} onClick={remove}>
                تأكيد الحذف (الطلبات السابقة لا تتأثر)
              </Button>
            )}
          </div>
        )}

        {!isNew && (
          <>
            <section className="rounded-xl border border-line p-4">
              <h3 className="text-base">الأجهزة والفحوصات المتاحة لهذه الخدمة</h3>
              <p className="mt-1 text-xs text-muted">حدد الأجهزة التي تظهر للعميل، وما إذا كانت مشمولة بلا رسوم، أو برسوم خاصة بهذه الخدمة (فارغ = رسوم الجهاز العامة).</p>
              <ul className="mt-3 space-y-2">
                {catalog.devices.map((d) => {
                  const l = links.find((x) => x.deviceId === d.id);
                  return (
                    <li key={d.id} className="grid items-center gap-2 rounded-lg border border-line px-3 py-2 sm:grid-cols-[1fr_auto_8rem]">
                      <Checkbox label={`${d.name} (${formatJOD(d.fee)})`} checked={!!l} onChange={(on) => setLinks(on ? [...links, { deviceId: d.id, included: false, fee: null }] : links.filter((x) => x.deviceId !== d.id))} />
                      {l && (
                        <>
                          <label className="flex items-center gap-2 text-sm">
                            <Switch checked={l.included} onChange={(x) => setLinks(links.map((y) => (y.deviceId === d.id ? { ...y, included: x } : y)))} label="مشمول" /> مشمول
                          </label>
                          <Input label="رسوم خاصة" type="number" min={0} step="any" className="ltr text-start" disabled={l.included} value={l.fee ?? ''} onChange={(e) => setLinks(links.map((y) => (y.deviceId === d.id ? { ...y, fee: e.target.value === '' ? null : Number(e.target.value) } : y)))} />
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              {canEdit && (
                <Button className="mt-3" size="sm" variant="outline" loading={m.pending === 'links'} onClick={saveLinks}>
                  حفظ الأجهزة
                </Button>
              )}
            </section>

            <section className="rounded-xl border border-line p-4">
              <h3 className="text-base">المشكلات وربطها بالأجهزة</h3>
              <p className="mt-1 text-xs text-muted">يختار العميل المشكلة، فتظهر له الأجهزة المربوطة بها فقط. "مشكلة أخرى" تُظهر كل أجهزة الخدمة. خدمة بلا مشكلات تُظهر كل أجهزتها مباشرة.</p>
              <ul className="mt-3 space-y-3">
                {problems.map((p, i) => (
                  <li key={p.id || `n-${i}`} className="rounded-lg border border-line p-3">
                    <div className="flex items-end gap-2">
                      <Input label="المشكلة" wrapperClassName="flex-1" value={p.name} maxLength={160} onChange={(e) => setProblems(problems.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <button type="button" className="mb-1 grid h-10 w-10 place-items-center rounded-lg text-muted hover:text-danger" onClick={() => setProblems(problems.filter((_, j) => j !== i))} aria-label="حذف المشكلة">
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <label className="flex items-center gap-2">
                        <Switch checked={p.isOther} onChange={(x) => setProblems(problems.map((y, j) => (j === i ? { ...y, isOther: x } : y)))} label="مشكلة أخرى" /> "مشكلة أخرى"
                      </label>
                      <label className="flex items-center gap-2">
                        <Switch checked={p.active} onChange={(x) => setProblems(problems.map((y, j) => (j === i ? { ...y, active: x } : y)))} label="فعالة" /> فعالة
                      </label>
                    </div>
                    {!p.isOther && linkedDevices.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {linkedDevices.map((d) => {
                          const on = p.deviceIds.includes(d.id);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => setProblems(problems.map((y, j) => (j === i ? { ...y, deviceIds: on ? y.deviceIds.filter((z) => z !== d.id) : [...y.deviceIds, d.id] } : y)))}
                              className={cx('min-h-[36px] rounded-full border px-3 text-xs', on ? 'border-ink bg-inverse font-semibold text-inverse-fg' : 'border-line-strong')}
                            >
                              {d.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setProblems([...problems, { id: '', name: '', isOther: false, active: true, deviceIds: [] }])}>
                    <Icon name="plus" className="h-4 w-4" /> مشكلة
                  </Button>
                  <Button size="sm" variant="outline" loading={m.pending === 'problems'} onClick={saveProblems}>
                    حفظ المشكلات
                  </Button>
                </div>
              )}
              <p className="mt-2 text-xs text-muted">احفظ الأجهزة أولًا حتى تظهر هنا للربط.</p>
            </section>
          </>
        )}
      </fieldset>
    </Modal>
  );
}

// ───── الأجهزة ─────

function DevicesTab({ c, canEdit, reload }: TabProps) {
  const [edit, setEdit] = useState<Device | 'new' | null>(null);
  return (
    <Panel title="الأجهزة والفحوصات الإضافية" actions={canEdit && <Button size="sm" onClick={() => setEdit('new')}><Icon name="plus" className="h-4 w-4" /> جهاز جديد</Button>} bodyClassName="p-0">
      <ul className="divide-y divide-line">
        {c.devices.map((d) => (
          <Row key={d.id} onClick={() => setEdit(d)} inactive={!d.active} title={<>{d.name} {!d.active && <Tag>موقوف</Tag>}</>} sub={d.description} right={<b>{formatJOD(d.fee)}</b>} />
        ))}
      </ul>
      {edit && (
        <SimpleModal
          title={edit === 'new' ? 'جهاز جديد' : edit.name}
          canEdit={canEdit}
          initial={edit === 'new' ? { name: '', description: '', fee: 0, sortOrder: 0, active: true } : edit}
          path={edit === 'new' ? null : `/admin/site-services/devices/${edit.id}`}
          create="/admin/site-services/devices"
          onClose={() => setEdit(null)}
          onSaved={reload}
          fields={(v, set, fe) => (
            <>
              <Input label="اسم الجهاز" value={v.name} maxLength={160} onChange={(e) => set('name', e.target.value)} error={fe('name')} />
              <Textarea label="وصف مختصر لفائدته" rows={2} value={v.description} maxLength={600} onChange={(e) => set('description', e.target.value)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="رسوم الإضافة للزيارة" type="number" min={0} step="any" className="ltr text-start" value={v.fee} onChange={(e) => set('fee', Number(e.target.value))} error={fe('fee')} />
                <Input label="الترتيب" type="number" min={0} className="ltr text-start" value={v.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={v.active} onChange={(x) => set('active', x)} label="فعال" /> فعال
              </label>
            </>
          )}
        />
      )}
    </Panel>
  );
}

// ───── المناطق ─────

function ZonesTab({ c, canEdit, reload }: TabProps) {
  const [edit, setEdit] = useState<Zone | 'new' | null>(null);
  return (
    <Panel title="مناطق العمل" actions={canEdit && <Button size="sm" onClick={() => setEdit('new')}><Icon name="plus" className="h-4 w-4" /> منطقة</Button>} bodyClassName="p-0">
      <ul className="divide-y divide-line">
        {c.zones.map((z) => (
          <Row
            key={z.id}
            onClick={() => setEdit(z)}
            inactive={!z.active}
            title={<>{z.name} {!z.active && <Tag>موقوفة</Tag>}</>}
            sub={TIER_LABEL[z.tier]}
            right={
              <>
                {z.travelFee > 0 ? <span>انتقال {formatJOD(z.travelFee)}</span> : <span className="text-muted">بدون رسوم انتقال</span>}
                {z.requiresApproval && <Tag tone="sand">موافقة مسبقة</Tag>}
              </>
            }
          />
        ))}
      </ul>
      {edit && (
        <SimpleModal
          title={edit === 'new' ? 'منطقة جديدة' : edit.name}
          canEdit={canEdit}
          initial={edit === 'new' ? { name: '', tier: 'OUTSIDE_AMMAN' as PriceTier, travelFee: 0, requiresApproval: false, sortOrder: 0, active: true } : edit}
          path={edit === 'new' ? null : `/admin/site-services/zones/${edit.id}`}
          create="/admin/site-services/zones"
          onClose={() => setEdit(null)}
          onSaved={reload}
          fields={(v, set, fe) => (
            <>
              <Input label="اسم المنطقة / المحافظة" value={v.name} maxLength={80} onChange={(e) => set('name', e.target.value)} error={fe('name')} />
              <Select label="فئة السعر" value={v.tier} onChange={(e) => set('tier', e.target.value as PriceTier)}>
                <option value="INSIDE_AMMAN">داخل عمّان</option>
                <option value="OUTSIDE_AMMAN">خارج عمّان</option>
              </Select>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="رسوم الانتقال" type="number" min={0} step="any" className="ltr text-start" value={v.travelFee} onChange={(e) => set('travelFee', Number(e.target.value))} />
                <Input label="الترتيب" type="number" min={0} className="ltr text-start" value={v.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={v.requiresApproval} onChange={(x) => set('requiresApproval', x)} label="تحتاج موافقة مسبقة" /> تحتاج موافقة مسبقة قبل التأكيد
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={v.active} onChange={(x) => set('active', x)} label="فعالة" /> فعالة
              </label>
            </>
          )}
        />
      )}
    </Panel>
  );
}

// ───── الزيارات المجمعة ─────

function BundlesTab({ c, canEdit, reload }: TabProps) {
  const [edit, setEdit] = useState<Bundle | 'new' | null>(null);
  return (
    <Panel title="الزيارات المجمعة (سعر موحد لأكثر من خدمة)" actions={canEdit && <Button size="sm" onClick={() => setEdit('new')}><Icon name="plus" className="h-4 w-4" /> زيارة مجمعة</Button>} bodyClassName="p-0">
      <p className="border-b border-line px-4 py-3 text-sm text-muted">عندما يختار العميل خدمتين أو أكثر من خدمات الباقة في نفس الموقع، يُحتسب السعر الموحد بدل جمع الزيارات — إن كان أوفر له. رسوم الأجهزة تضاف كالمعتاد.</p>
      <ul className="divide-y divide-line">
        {c.bundles.map((b) => (
          <Row
            key={b.id}
            onClick={() => setEdit(b)}
            inactive={!b.active}
            title={<>{b.name} {!b.active && <Tag>موقوفة</Tag>}</>}
            sub={b.services.map((s) => s.name).join('، ')}
            right={
              <>
                <span>داخل {formatJOD(b.priceInside)}</span>
                <span className="text-muted">خارج {formatJOD(b.priceOutside)}</span>
              </>
            }
          />
        ))}
      </ul>
      {edit && (
        <SimpleModal
          title={edit === 'new' ? 'زيارة مجمعة جديدة' : edit.name}
          canEdit={canEdit}
          initial={edit === 'new' ? { name: '', priceInside: 0, priceOutside: 0, terms: '', active: true, serviceIds: [] as string[] } : { ...edit, serviceIds: edit.services.map((s) => s.id) }}
          path={edit === 'new' ? null : `/admin/site-services/bundles/${edit.id}`}
          create="/admin/site-services/bundles"
          omit={['services']}
          onClose={() => setEdit(null)}
          onSaved={reload}
          fields={(v, set, fe) => (
            <>
              <Input label="الاسم" value={v.name} maxLength={160} onChange={(e) => set('name', e.target.value)} error={fe('name')} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="السعر الموحد داخل عمّان" type="number" min={0} step="any" className="ltr text-start" value={v.priceInside} onChange={(e) => set('priceInside', Number(e.target.value))} />
                <Input label="السعر الموحد خارج عمّان" type="number" min={0} step="any" className="ltr text-start" value={v.priceOutside} onChange={(e) => set('priceOutside', Number(e.target.value))} />
              </div>
              <fieldset>
                <legend className="label">الخدمات التي يمكن جمعها في هذه الزيارة</legend>
                <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                  {c.services.map((s) => (
                    <Checkbox key={s.id} label={s.name} checked={v.serviceIds.includes(s.id)} onChange={(on) => set('serviceIds', on ? [...v.serviceIds, s.id] : v.serviceIds.filter((x) => x !== s.id))} />
                  ))}
                </div>
                {fe('serviceIds') && <p className="mt-1 text-sm text-danger">{fe('serviceIds')}</p>}
              </fieldset>
              <Textarea label="الشروط والاستثناءات" rows={2} value={v.terms} maxLength={2000} onChange={(e) => set('terms', e.target.value)} />
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={v.active} onChange={(x) => set('active', x)} label="فعالة" /> فعالة
              </label>
            </>
          )}
        />
      )}
    </Panel>
  );
}

/** نافذة تعديل عامة للأجهزة والمناطق والباقات (إنشاء/تعديل/حذف) */
function SimpleModal<T extends { id?: string } & Record<string, unknown>>({
  title,
  initial,
  path,
  create,
  canEdit,
  omit = [],
  onClose,
  onSaved,
  fields,
}: {
  title: string;
  initial: T;
  path: string | null;
  create: string;
  canEdit: boolean;
  omit?: string[];
  onClose: () => void;
  onSaved: () => void;
  fields: (v: T, set: <K extends keyof T>(k: K, val: T[K]) => void, fe: (k: string) => string | undefined) => ReactNode;
}) {
  const m = useMutation();
  const [v, setV] = useState<T>(initial);
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof T>(k: K, val: T[K]) => setV((x) => ({ ...x, [k]: val }));
  async function save() {
    const body: Record<string, unknown> = { ...v };
    for (const k of ['id', 'createdAt', 'updatedAt', ...omit]) delete body[k];
    if (await m.run('save', () => (path ? api.patch(path, body) : api.post(create, body)), 'تم الحفظ')) {
      onSaved();
      onClose();
    }
  }
  async function remove() {
    if (path && (await m.run('del', () => api.del(path), 'تم الحذف'))) {
      onSaved();
      onClose();
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button loading={m.pending === 'save'} onClick={save}>
              حفظ
            </Button>
            {path && !confirm && (
              <Button variant="ghost" onClick={() => setConfirm(true)}>
                حذف
              </Button>
            )}
            {confirm && (
              <Button variant="danger" loading={m.pending === 'del'} onClick={remove}>
                تأكيد الحذف
              </Button>
            )}
          </div>
        )
      }
    >
      <fieldset disabled={!canEdit} className="space-y-4">
        {fields(v, set, (k) => m.fieldErrors[k])}
      </fieldset>
    </Modal>
  );
}

// ───── سجل الأسعار ─────

const FIELD_LABEL: Record<string, string> = {
  priceInside: 'داخل عمّان',
  priceOutside: 'خارج عمّان',
  travelFee: 'رسوم الانتقال',
  discountPercent: 'الخصم %',
  fee: 'الرسوم',
  included: 'مشمول',
};
const TARGET_LABEL: Record<string, string> = { service: 'خدمة', device: 'جهاز', service_device: 'جهاز خدمة', zone: 'منطقة', bundle: 'زيارة مجمعة' };

type LogItem = { id: string; action: string; createdAt: string; actor: string | null; meta: { target: string; name: string; changes: Record<string, { from: number | null; to: number | null }>; by?: string } };

function PriceLog() {
  const [page, setPage] = useState(1);
  const q = useAdminQuery(() => api.get<{ items: LogItem[]; total: number; pageSize: number }>('/admin/site-services/price-log', { page }), [page], { keep: true });
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.retry} />;
  if (!q.data) return <SkeletonRows rows={6} />;
  return (
    <Panel title="سجل تغييرات الأسعار" bodyClassName="p-0">
      {!q.data.items.length && <p className="p-4 text-sm text-muted">لا توجد تغييرات بعد.</p>}
      <ul className="divide-y divide-line">
        {q.data.items.map((l) => (
          <li key={l.id} className="px-4 py-3 text-[15px]">
            <p>
              <Tag>{TARGET_LABEL[l.meta.target] ?? l.meta.target}</Tag> <b>{l.meta.name}</b>
            </p>
            <p className="mt-1 text-sm">
              {Object.entries(l.meta.changes).map(([k, ch]) => (
                <span key={k} className="me-3 inline-block">
                  {FIELD_LABEL[k] ?? k}: <span className="text-muted">{ch.from ?? '—'}</span> ← <b>{ch.to ?? '—'}</b>
                </span>
              ))}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {formatDate(l.createdAt, true)} · {l.actor ?? l.meta.by ?? '—'} · {l.action === 'price_set' ? 'سعر جديد' : 'تعديل'}
            </p>
          </li>
        ))}
      </ul>
      {q.data.total > q.data.pageSize && (
        <div className="p-4">
          <Pagination page={page} pages={Math.ceil(q.data.total / q.data.pageSize)} onChange={setPage} />
        </div>
      )}
    </Panel>
  );
}
