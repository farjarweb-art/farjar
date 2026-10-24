import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Icon, Modal } from '../ui';
import { cx, formatJOD } from '../../lib/format';
import { AREA_PRICED, cleanDeviceName, type ServiceDeviceInfo } from '../../lib/siteServices';

/** شارة سعر الجهاز: برسومه، مجاني، أو حسب المساحة */
export function DevicePrice({ device: d, className }: { device: ServiceDeviceInfo; className?: string }) {
  const free = d.fee === 0 && !d.scopePriced;
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-bold leading-none',
        d.scopePriced ? 'bg-inverse text-inverse-fg' : free ? 'bg-success/15 text-success' : 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100',
        className,
      )}
    >
      {d.scopePriced ? AREA_PRICED : free ? (d.included && !d.autoInclude && !d.parentId ? 'مشمول مجانًا' : 'مجاني 🎁') : `+ ${formatJOD(d.fee)}`}
    </span>
  );
}

/**
 * بطاقة جهاز احترافية: صورة، اسم، سعر، وزر "التفاصيل" يفتح نافذة آلية العمل والفوائد.
 * mode: select = يختاره العميل، locked = يُضاف تلقائيًا، view = للعرض فقط
 */
export function DeviceCard({
  device: d,
  mode = 'view',
  selected = false,
  onToggle,
  note,
}: {
  device: ServiceDeviceInfo;
  mode?: 'select' | 'locked' | 'view';
  selected?: boolean;
  onToggle?: () => void;
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const name = cleanDeviceName(d.name);
  const active = mode === 'locked' || selected;
  const body = (
    <>
      <div className="relative aspect-square w-28 shrink-0 self-start overflow-hidden bg-[#efe8dc] min-[400px]:w-32 sm:aspect-[4/3] sm:w-auto sm:self-auto dark:bg-[#2a2723]">
        {d.imageUrl ? (
          <img src={d.imageUrl} alt={name} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <div className="grid h-full place-items-center text-muted">
            <Icon name="gear" className="h-10 w-10" />
          </div>
        )}
        <DevicePrice device={d} className="absolute start-3 top-3 hidden shadow-sm sm:inline-flex" />
        {mode !== 'view' && (
          <span
            aria-hidden
            className={cx(
              'absolute end-2 top-2 grid h-7 w-7 place-items-center sm:end-3 sm:top-3 sm:h-8 sm:w-8 rounded-full border-2 shadow-sm transition-colors',
              active ? 'border-brand-600 bg-brand-600 text-white' : 'border-white bg-white/85 text-transparent',
            )}
          >
            <Icon name="check" className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
        <DevicePrice device={d} className="mb-1.5 self-start sm:hidden" />
        <h3 className="text-[15px] font-bold leading-snug sm:text-base">{name}</h3>
        {d.mechanism && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{d.mechanism}</p>}
        {note && <p className="mt-3 rounded-md bg-success/10 px-2.5 py-1.5 text-[13px] font-semibold text-success">{note}</p>}
        {(d.mechanism || d.benefits.length > 0) && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(true);
            }}
            className="mt-auto inline-flex min-h-[40px] items-center gap-1 self-start pt-2 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            <Icon name="info" className="h-4 w-4" /> التفاصيل
          </button>
        )}
      </div>
    </>
  );
  const cls = cx(
    'group flex h-full flex-row overflow-hidden rounded-2xl sm:flex-col border bg-surface text-start transition-all',
    mode === 'select' && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg',
    active ? 'border-brand-600 ring-2 ring-brand-600/30' : 'border-line',
  );
  // نافذة التفاصيل خارج البطاقة (عنصر label وحركات الخطوات تمنع ظهورها فوق الصفحة)
  const details = open && createPortal(
    <DeviceDetails
      device={d}
      onClose={() => setOpen(false)}
      action={
        mode === 'select' ? (
          <Button
            variant={selected ? 'outline' : 'primary'}
            onClick={() => {
              onToggle?.();
              setOpen(false);
            }}
          >
            {selected ? 'إزالة من الزيارة' : 'إضافة للزيارة'}
          </Button>
        ) : undefined
      }
    />,
    document.body,
  );
  if (mode === 'select') {
    return (
      <>
        <label className={cls}>
          <input type="checkbox" className="sr-only" checked={selected} onChange={() => onToggle?.()} aria-label={name} />
          {body}
        </label>
        {details}
      </>
    );
  }
  return (
    <>
      <article className={cls}>{body}</article>
      {details}
    </>
  );
}

/** نافذة تفاصيل الجهاز: الصورة، آلية العمل، والفائدة الفنية */
export function DeviceDetails({ device: d, onClose, action }: { device: ServiceDeviceInfo; onClose: () => void; action?: ReactNode }) {
  const name = cleanDeviceName(d.name);
  return (
    <Modal open onClose={onClose} title={name} size="lg" footer={action}>
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-xl bg-[#efe8dc] dark:bg-[#2a2723]">
          {d.imageUrl && <img src={d.imageUrl} alt={name} className="mx-auto aspect-[4/3] max-h-[22rem] w-full object-contain" />}
          <DevicePrice device={d} className="absolute start-3 top-3 shadow-sm" />
        </div>
        {d.mechanism && (
          <section>
            <h3 className="text-base">آلية العمل</h3>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">{d.mechanism}</p>
          </section>
        )}
        {d.benefits.length > 0 && (
          <section>
            <h3 className="text-base">الاستفادة الفنية</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {d.benefits.map((b) => (
                <li key={b} className="flex items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-sm">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {b}
                </li>
              ))}
            </ul>
          </section>
        )}
        {d.description && d.description !== d.mechanism && <p className="text-sm text-muted">{d.description}</p>}
      </div>
    </Modal>
  );
}
