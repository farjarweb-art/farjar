import { useState } from 'react';
import { Icon } from '../ui';
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
 * بطاقة جهاز احترافية: صورة، اسم، سعر، آلية العمل والفوائد (تتوسع عند الطلب).
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
        {d.mechanism && <p className={cx('mt-1.5 text-sm text-muted', !open && 'line-clamp-2')}>{d.mechanism}</p>}
        {open && d.benefits.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm">
            {d.benefits.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {b}
              </li>
            ))}
          </ul>
        )}
        {note && <p className="mt-3 rounded-md bg-success/10 px-2.5 py-1.5 text-[13px] font-semibold text-success">{note}</p>}
        {(d.mechanism || d.benefits.length > 0) && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen((x) => !x);
            }}
            className="mt-auto inline-flex min-h-[40px] items-center gap-1 self-start pt-2 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
            aria-expanded={open}
          >
            {open ? 'إخفاء التفاصيل' : 'آلية العمل والفوائد'}
            <Icon name="chevronDown" className={cx('h-4 w-4 transition-transform', open && 'rotate-180')} />
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
  if (mode === 'select') {
    return (
      <label className={cls}>
        <input type="checkbox" className="sr-only" checked={selected} onChange={() => onToggle?.()} aria-label={name} />
        {body}
      </label>
    );
  }
  return <article className={cls}>{body}</article>;
}
