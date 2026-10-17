import { cx } from '../../lib/format';
import { formatCount, useVisitorCount } from '../../lib/visitors';
import { Icon } from '../ui';

/** شارة عدد الزوار: "👥 666 زائر" — تظهر بعد وصول العدد فقط */
export function VisitorCount({ className }: { className?: string }) {
  const count = useVisitorCount();
  if (count == null) return null;
  return (
    <span className={cx('anim-fade inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm', className)} title="عدد زوار الموقع">
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      <Icon name="users" className="h-4 w-4" />
      <span>
        عدد الزوار <b className="num tabular-nums">{formatCount(count)}</b>
      </span>
    </span>
  );
}
