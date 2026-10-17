import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { publicProductWhere } from '../../services/catalog.service';

const BRAND_NAME = 'فرجار جروب — Farjar Group';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** صورة المعاينة: من Cloudinary بمقاس فيسبوك (1200×630) مع خلفية بيضاء حتى يظهر المنتج كاملًا */
export function previewImage(url: string): string {
  const abs = url.startsWith('/') ? `${env.PUBLIC_API_URL.replace(/\/$/, '')}${url}` : url;
  return abs.replace(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)/, '$1c_pad,b_white,w_1200,h_630,f_jpg,q_auto/');
}

const money = (n: number) => `${n.toFixed(3).replace(/\.?0+$/, '')} د.أ`;

/**
 * رابط الترويج للمنتج: https://الموقع/p/{slug}
 * فيسبوك وواتساب لا يشغّلان جافاسكربت، فهذه الصفحة تعطيهما صورة المنتج واسمه وسعره (Open Graph)،
 * والزائر يُحوَّل فورًا لصفحة المنتج.
 */
export async function shareProduct(req: Request, res: Response) {
  const site = env.siteUrl;
  const product = await prisma.product.findFirst({
    where: publicProductWhere({ slug: req.params.slug }),
    select: {
      name: true,
      slug: true,
      description: true,
      finalPrice: true,
      price: true,
      discountPercent: true,
      priceOnRequest: true,
      vendor: { select: { name: true, isHouse: true } },
      media: { where: { kind: 'IMAGE' }, orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
    },
  });
  if (!product) {
    res.redirect(302, `${site}/store`);
    return;
  }
  const target = `${site}/store/${encodeURIComponent(product.slug)}`;
  const shareUrl = `${site}/p/${encodeURIComponent(product.slug)}`;
  const finalPrice = Number(product.finalPrice);
  const priceText = product.priceOnRequest
    ? 'السعر عند الطلب'
    : product.discountPercent > 0
      ? `${money(finalPrice)} بدل ${money(Number(product.price))} — خصم ${product.discountPercent}%`
      : money(finalPrice);
  const title = `${product.name} | ${priceText}`;
  const summary = product.description.replace(/\s+/g, ' ').trim().slice(0, 160);
  const description = [!product.vendor.isHouse ? `من ${product.vendor.name}` : '', summary, `اطلبه الآن من ${BRAND_NAME}`].filter(Boolean).join(' — ');
  const image = product.media[0] ? previewImage(product.media[0].url) : `${site}/images/work/kitchen-luxury.webp`;

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(target)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="${esc(BRAND_NAME)}">
<meta property="og:locale" content="ar_JO">
<meta property="og:url" content="${esc(shareUrl)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(product.name)}">
${product.priceOnRequest ? '' : `<meta property="product:price:amount" content="${finalPrice.toFixed(3)}">\n<meta property="product:price:currency" content="JOD">\n`}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
</head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:40px 16px">
<p>جارٍ فتح المنتج…</p>
<p><a href="${esc(target)}">${esc(product.name)}</a></p>
</body>
</html>`;
  res.set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'public, max-age=600').send(html);
}
