import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { AdminPage, Panel, Switch } from '../../components/admin/ui';
import { PACKAGE_ICONS } from '../../components/services/Packages';
import { Button, ErrorState, Icon, Input, Modal, Select, SkeletonRows, Tag, Textarea } from '../../components/ui';
import { useAdmin } from '../../context/AdminAuth';
import { hasPerm } from '../../context/Auth';
import { api } from '../../lib/api';
import { cx, formatJOD } from '../../lib/format';

type Kind = 'PACKAGE' | 'ADDON';
type Pkg = {
  id: string;
  slug: string;
  kind: 'SERVICE' | Kind;
  name: string;
  nameEn: string;
  summary: string;
  summaryEn: string;
  includes: string;
  includesEn: string;
  priceInside: number;
  priceOutside: number;
  durationMinutes: number;
  terms: string;
  featured: boolean;
  active: boolean;
  sortOrder: number;
  icon: string | null;
  imageUrl: string | null;
  devices: unknown[];
  problems: unknown[];
};

const ICON_LABEL: Record<string, string> = {
  home: 'منزل', gear: 'ترس', shield: 'درع', star: 'نجمة', search: 'بحث', wrench: 'مفتاح', factory: 'مصنع', store: 'متجر', sun: 'شمس', users: 'فريق',
};
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

/** إدارة الباقات: كل محتوى الباقات وأسعارها وترتيبها من لوحة التحكم دون الرجوع للمبرمج */
export default function PackagesAdmin() {
  const { admin } = useAdmin();
  const canEdit = hasPerm(admin, 'services.manage');
  const q = useAdminQuery(() => api.get<{ services: Pkg[] }>('/admin/site-services/catalog'), [], { keep: true });
  const m = useMutation();
  const [edit, setEdit] = useState<Pkg | { new: Kind } | null>(null);

  const all = q.data?.services ?? [];
  const byKind = (k: Kind) => all.filter((s) => s.kind === k).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  async function patch(p: Pkg, body: Partial<Pkg>, msg: string) {
    if (await m.run(`p-${p.id}`, () => api.patch(`/admin/site-services/services/${p.id}`, body), msg)) q.reload();
  }
  /** تحريك الباقة لأعلى/لأسفل: نعيد ترقيم الكل بالتسلسل لتجنّب تساوي الترتيب */
  async function move(list: Pkg[], i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    const ok = await m.run('order', async () => {
      for (let k = 0; k < next.length; k++) {
        if (next[k].sortOrder !== k + 1) await api.patch(`/admin/site-services/services/${next[k].id}`, { sortOrder: k + 1 });
      }
    }, 'تم تحديث الترتيب');
    if (ok !== undefined) q.reload();
  }
  async function duplicate(p: Pkg) {
    if (await m.run(`d-${p.id}`, () => api.post(`/admin/site-services/services/${p.id}/duplicate`, {}), 'تم إنشاء نسخة موقوفة — عدّلها ثم فعّلها')) q.reload();
  }

  const section = (k: Kind, title: string, hint: string) => {
    const list = byKind(k);
    return (
      <Panel
        title={`${title} (${list.length})`}
        actions={canEdit && <Button size="sm" onClick={() => setEdit({ new: k })}><Icon name="plus" className="h-4 w-4" /> {k === 'PACKAGE' ? 'باقة جديدة' : 'باقة إضافية جديدة'}</Button>}
        bodyClassName="p-0"
      >
        <p className="border-b border-line px-4 py-2 text-[13px] text-muted">{hint}</p>
        {list.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">لا توجد عناصر بعد.</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((p, i) => (
              <li key={p.id} className={cx('flex flex-wrap items-center gap-3 px-4 py-3', !p.active && 'opacity-60')}>
                <span className="grid h-14 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#191919]">
                  {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" /> : <Icon name="image" className="h-6 w-6 text-white/50" />}
                </span>
                <button type="button" onClick={() => setEdit(p)} className="min-w-0 flex-1 text-start">
                  <span className="block font-semibold">
                    {p.name} {p.featured && <Tag tone="brand">مميّزة</Tag>} {!p.active && <Tag>موقوفة</Tag>}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {p.nameEn || '— بدون اسم إنجليزي'} · {lines(p.includes).length} بند مشمول
                  </span>
                </button>
                <span className="text-sm font-bold">{formatJOD(p.priceInside)}</span>
                {canEdit && (
                  <span className="flex items-center gap-1">
                    <Switch checked={p.active} label="تفعيل" disabled={m.busy} onChange={(v) => patch(p, { active: v }, v ? 'تم تفعيل الباقة' : 'تم إيقاف الباقة')} />
                    <Button size="sm" variant="ghost" aria-label="لأعلى" disabled={i === 0 || m.busy} onClick={() => move(list, i, -1)}><Icon name="chevronDown" className="h-4 w-4 rotate-180" /></Button>
                    <Button size="sm" variant="ghost" aria-label="لأسفل" disabled={i === list.length - 1 || m.busy} onClick={() => move(list, i, 1)}><Icon name="chevronDown" className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => duplicate(p)} disabled={m.busy}>نسخ</Button>
                    <Button size="sm" variant="outline" onClick={() => setEdit(p)}>تعديل</Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    );
  };

  return (
    <AdminPage
      title="إدارة الباقات"
      description="الباقات المعروضة في الصفحة الرئيسية وصفحة الحجز. أي تعديل هنا يظهر للعملاء مباشرة، وسعر الحجوزات السابقة يبقى كما هو."
      actions={<Link to="/admin/site-services" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">الخدمات المنفردة والأجهزة ←</Link>}
    >
      {q.error ? (
        <ErrorState message="تعذّر تحميل الباقات" onRetry={q.reload} />
      ) : !q.data ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="space-y-6">
          {section('PACKAGE', 'الباقات الرئيسية', 'تظهر كبطاقات في الصفحة الرئيسية وأول خطوة في الحجز. الباقة «المميّزة» تحمل شارة «الأكثر طلبًا».')}
          {section('ADDON', 'الباقات الإضافية', 'فحوصات متخصصة بسعر مستقل تظهر في تبويب «باقات إضافية».')}
        </div>
      )}
      {edit && <PackageModal pkg={edit} canEdit={canEdit} nextOrder={all.length + 1} onClose={() => setEdit(null)} onSaved={q.reload} />}
    </AdminPage>
  );
}

/** محرر قائمة بنود (المشمولات): إضافة / تعديل / حذف / ترتيب */
function LinesEditor({ label, value, onChange, dir, disabled }: { label: string; value: string[]; onChange: (v: string[]) => void; dir?: 'ltr' | 'rtl'; disabled?: boolean }) {
  const set = (i: number, t: string) => onChange(value.map((x, k) => (k === i ? t : x)));
  const swap = (i: number, j: number) => {
    const n = [...value];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-semibold">{label}</legend>
      {value.map((l, i) => (
        <div key={i} className="flex items-center gap-1">
          <input className="input flex-1" dir={dir} value={l} disabled={disabled} onChange={(e) => set(i, e.target.value)} aria-label={`${label} ${i + 1}`} />
          <Button size="sm" variant="ghost" aria-label="لأعلى" disabled={disabled || i === 0} onClick={() => swap(i, i - 1)}><Icon name="chevronDown" className="h-4 w-4 rotate-180" /></Button>
          <Button size="sm" variant="ghost" aria-label="حذف البند" disabled={disabled} onClick={() => onChange(value.filter((_, k) => k !== i))}><Icon name="trash" className="h-4 w-4" /></Button>
        </div>
      ))}
      {!disabled && (
        <Button size="sm" variant="outline" onClick={() => onChange([...value, ''])}><Icon name="plus" className="h-4 w-4" /> إضافة بند</Button>
      )}
    </fieldset>
  );
}

function PackageModal({ pkg, canEdit, nextOrder, onClose, onSaved }: { pkg: Pkg | { new: Kind }; canEdit: boolean; nextOrder: number; onClose: () => void; onSaved: () => void }) {
  const m = useMutation();
  const isNew = 'new' in pkg;
  const src = isNew ? null : pkg;
  const [v, setV] = useState(() => ({
    kind: (isNew ? pkg.new : (pkg.kind as Kind)) as Kind,
    name: src?.name ?? '',
    nameEn: src?.nameEn ?? '',
    summary: src?.summary ?? '',
    summaryEn: src?.summaryEn ?? '',
    priceInside: src?.priceInside ?? 0,
    priceOutside: src?.priceOutside ?? 0,
    durationMinutes: src?.durationMinutes ?? 90,
    terms: src?.terms ?? '',
    featured: src?.featured ?? false,
    active: src?.active ?? true,
    icon: src?.icon ?? 'check',
  }));
  const [inc, setInc] = useState(() => lines(src?.includes ?? ''));
  const [incEn, setIncEn] = useState(() => lines(src?.includesEn ?? ''));
  const [img, setImg] = useState(src?.imageUrl ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fe = (k: string) => m.fieldErrors[k];
  const setF = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));

  async function save() {
    const body: Record<string, unknown> = {
      ...v,
      icon: v.icon === 'check' ? null : v.icon,
      includes: inc.map((l) => l.trim()).filter(Boolean).join('\n'),
      includesEn: incEn.map((l) => l.trim()).filter(Boolean).join('\n'),
    };
    if (isNew) {
      Object.assign(body, {
        audiences: ['HOME', 'BUSINESS'],
        requestTypes: ['INSPECTION_REPORT'],
        sortOrder: nextOrder,
        visitFeePolicy: 'SEPARATE',
        optionsLabel: 'سبب طلب الفحص (يمكن اختيار أكثر من سبب)',
      });
    }
    const r = await m.run('save', () => (isNew ? api.post('/admin/site-services/services', body) : api.patch(`/admin/site-services/services/${(pkg as Pkg).id}`, body)), 'تم حفظ الباقة');
    if (r !== undefined) {
      onSaved();
      onClose();
    }
  }
  async function upload(file: File) {
    if (isNew) return;
    const fd = new FormData();
    fd.append('file', file);
    await m.run('img', async () => {
      const r = await api.post<{ imageUrl: string }>(`/admin/site-services/services/${(pkg as Pkg).id}/image`, fd);
      setImg(r.imageUrl);
      onSaved();
    }, 'تم رفع الصورة');
  }
  async function removeImg() {
    if (await m.run('rmimg', () => api.del(`/admin/site-services/services/${(pkg as Pkg).id}/image`), 'تم حذف الصورة')) {
      setImg(null);
      onSaved();
    }
  }
  async function remove() {
    if (await m.run('del', () => api.del(`/admin/site-services/services/${(pkg as Pkg).id}`), 'تم حذف الباقة')) {
      onSaved();
      onClose();
    }
  }

  const ro = !canEdit;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? (v.kind === 'PACKAGE' ? 'باقة جديدة' : 'باقة إضافية جديدة') : `تعديل: ${src!.name}`}
      footer={
        canEdit && (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {!isNew && (confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                متأكد؟ (الحجوزات السابقة لا تتأثر)
                <Button size="sm" variant="danger" loading={m.pending === 'del'} onClick={remove}>نعم، احذف</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>إلغاء</Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}>حذف الباقة</Button>
            ))}
            <span className="ms-auto flex gap-2">
              <Button variant="outline" onClick={onClose}>إلغاء</Button>
              <Button loading={m.pending === 'save'} onClick={save}>حفظ</Button>
            </span>
          </div>
        )
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="النوع" value={v.kind} disabled={ro} onChange={(e) => setF('kind', e.target.value as Kind)}>
            <option value="PACKAGE">باقة رئيسية</option>
            <option value="ADDON">باقة إضافية (فحص متخصص)</option>
          </Select>
          <Select label="الأيقونة" value={v.icon} disabled={ro} onChange={(e) => setF('icon', e.target.value)}>
            <option value="check">✓ افتراضية</option>
            {PACKAGE_ICONS.map((i) => <option key={i} value={i}>{ICON_LABEL[i] ?? i}</option>)}
          </Select>
          <Input label="اسم الباقة (عربي)" value={v.name} disabled={ro} error={fe('name')} onChange={(e) => setF('name', e.target.value)} placeholder="الباقة الأساسية" />
          <Input label="Package name (English)" dir="ltr" value={v.nameEn} disabled={ro} error={fe('nameEn')} onChange={(e) => setF('nameEn', e.target.value)} placeholder="Basic Package" optional />
          <Textarea label="وصف مختصر (عربي)" rows={2} value={v.summary} disabled={ro} error={fe('summary')} onChange={(e) => setF('summary', e.target.value)} />
          <Textarea label="Short description (English)" dir="ltr" rows={2} value={v.summaryEn} disabled={ro} error={fe('summaryEn')} onChange={(e) => setF('summaryEn', e.target.value)} optional />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="السعر داخل عمّان (دينار)" type="number" min={0} step="0.5" value={v.priceInside} disabled={ro} error={fe('priceInside')} onChange={(e) => setF('priceInside', Number(e.target.value))} />
          <Input label="السعر خارج عمّان (دينار)" type="number" min={0} step="0.5" value={v.priceOutside} disabled={ro} error={fe('priceOutside')} onChange={(e) => setF('priceOutside', Number(e.target.value))} hint="رسوم الانتقال للمناطق تُضاف حسب المنطقة" />
          <Input label="مدة الزيارة (دقيقة)" type="number" min={15} value={v.durationMinutes} disabled={ro} error={fe('durationMinutes')} onChange={(e) => setF('durationMinutes', Number(e.target.value))} />
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm font-semibold"><Switch checked={v.active} label="مفعّلة" disabled={ro} onChange={(x) => setF('active', x)} /> مفعّلة (ظاهرة للعملاء)</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><Switch checked={v.featured} label="مميّزة" disabled={ro} onChange={(x) => setF('featured', x)} /> مميّزة «الأكثر طلبًا»</label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <LinesEditor label="ما تشمله الباقة (عربي)" value={inc} onChange={setInc} disabled={ro} />
          <LinesEditor label="Included items (English)" dir="ltr" value={incEn} onChange={setIncEn} disabled={ro} />
        </div>

        <Textarea label="شروط وملاحظات" rows={2} value={v.terms} disabled={ro} error={fe('terms')} onChange={(e) => setF('terms', e.target.value)} optional />

        <section className="rounded-xl border border-line p-3">
          <h3 className="mb-2 text-sm font-semibold">صورة الباقة</h3>
          {isNew ? (
            <p className="text-sm text-muted">احفظ الباقة أولًا ثم افتحها لرفع صورة.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid aspect-[4/3] w-36 place-items-center overflow-hidden rounded-lg bg-[#191919]">
                {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <Icon name="image" className="h-7 w-7 text-white/50" />}
              </span>
              {canEdit && (
                <div className="space-y-2 text-sm">
                  <label className="inline-flex cursor-pointer items-center gap-1 font-semibold text-brand-700 hover:underline dark:text-brand-300">
                    <Icon name="upload" className="h-4 w-4" /> {m.pending === 'img' ? 'جارٍ الرفع…' : 'رفع صورة'}
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                  </label>
                  {img && !img.startsWith('/images/') && <button type="button" className="block text-danger hover:underline" onClick={removeImg}>حذف الصورة</button>}
                  <p className="text-muted">JPG أو PNG أو WebP حتى 8 ميغابايت.</p>
                </div>
              )}
            </div>
          )}
        </section>

        {!isNew && (
          <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-muted">
            الأجهزة المستخدمة وأسباب الفحص وحقول النموذج تُدار من محرر الخدمة المتقدم:{' '}
            <Link className="font-semibold text-brand-700 hover:underline dark:text-brand-300" to={`/admin/site-services?tab=services&edit=${(pkg as Pkg).id}`}>فتح المحرر المتقدم</Link>
            {' '}({(pkg as Pkg).devices.length} جهاز · {(pkg as Pkg).problems.length} سبب)
          </p>
        )}
      </div>
    </Modal>
  );
}
