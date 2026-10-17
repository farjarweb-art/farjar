import { useToast } from '../../context/ToastContext';
import { Icon, type IconName } from '../ui';

/** رابط الترويج: فيسبوك وواتساب يعرضان صورة المنتج واسمه وسعره بدل صورة الموقع العامة */
export const shareLink = (slug: string) => `${window.location.origin}/p/${encodeURIComponent(slug)}`;

/** أزرار مشاركة المنتج (فيسبوك، واتساب، نسخ الرابط) */
export function ShareProduct({ slug, name }: { slug: string; name: string }) {
  const { toast } = useToast();
  const url = shareLink(slug);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('تم نسخ رابط المنتج — الصقه في منشورك أو الستوري');
    } catch {
      window.prompt('انسخ رابط المنتج:', url);
    }
  };
  const links: { label: string; icon: IconName; href: string }[] = [
    { label: 'فيسبوك', icon: 'facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { label: 'واتساب', icon: 'whatsapp', href: `https://wa.me/?text=${encodeURIComponent(`${name}\n${url}`)}` },
  ];
  const btn = 'inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-medium transition-colors hover:border-ink hover:bg-subtle';
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">شارك المنتج:</span>
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={btn}>
          <Icon name={l.icon} className="h-4 w-4" /> {l.label}
        </a>
      ))}
      <button type="button" onClick={copy} className={btn}>
        <Icon name="copy" className="h-4 w-4" /> نسخ الرابط
      </button>
    </div>
  );
}
