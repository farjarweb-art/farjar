import { cx, formatJOD } from '../../lib/format';
import { hasScope, type PriceLine } from '../../lib/siteServices';

/** ملخص السعر: الزيارة، الأجهزة، الانتقال، الخصم، والإجمالي النهائي */
export function PriceSummary({ lines, total, className, title = 'ملخص السعر' }: { lines: PriceLine[]; total: number; className?: string; title?: string }) {
  return (
    <section className={cx('overflow-hidden rounded-xl border border-line', className)}>
      <h3 className="border-b border-line bg-subtle/60 px-4 py-2.5 text-base">{title}</h3>
      <dl className="divide-y divide-line">
        {lines.map((l, i) => (
          <div key={i} className="flex items-start justify-between gap-4 px-4 py-2.5 text-[15px]">
            <dt className={cx('min-w-0', l.kind === 'discount' ? 'text-success' : 'text-muted')}>{l.label}</dt>
            <dd className={cx('shrink-0 font-semibold tabular-nums', l.kind === 'discount' && 'text-success')}>
              {l.kind === 'quote' ? <span className="font-normal text-muted">يحدد لاحقًا</span> : l.amount === 0 ? 'مشمول' : l.amount < 0 ? `− ${formatJOD(-l.amount)}` : formatJOD(l.amount)}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 bg-inverse px-4 py-3 text-inverse-fg">
          <dt className="font-semibold">الإجمالي النهائي للزيارة</dt>
          <dd className="font-display text-xl font-semibold tabular-nums">{formatJOD(total)}</dd>
        </div>
      </dl>
      {hasScope(lines) && <p className="px-4 py-2.5 text-xs text-muted">البنود المكتوب عليها "يحدد لاحقًا" تُسعَّر بعرض سعر مستقل بعد مراجعة نطاق المشروع، ولا تبدأ إلا بعد موافقتك عليه.</p>}
    </section>
  );
}
