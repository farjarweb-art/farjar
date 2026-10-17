import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { publicProductWhere } from '../../services/catalog.service';

/** الصفحات العامة الثابتة (أولوية أعلى للرئيسية والسوق) */
const STATIC_PAGES: [string, number][] = [
  ['/', 1],
  ['/store', 0.9],
  ['/services', 0.9],
  ['/store/suppliers', 0.8],
  ['/bookings', 0.8],
  ['/corporate', 0.8],
  ['/work', 0.6],
  ['/about', 0.6],
  ['/contact', 0.6],
  ['/suppliers/join', 0.5],
  ['/policies', 0.3],
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * خريطة الموقع لمحركات البحث: الصفحات العامة + كل منتج ومورد معتمد.
 * على الدومين الأساسي: /sitemap.xml فهرس ثابت في الواجهة يشير إلى /sitemap-pages.xml (ثابت)
 * و /sitemap-products.xml (هذا، عبر rewrite).
 */
export async function sitemap(_req: Request, res: Response, opts: { includePages?: boolean } = { includePages: true }) {
  const [products, vendors, services] = await Promise.all([
    prisma.product.findMany({ where: publicProductWhere(), select: { slug: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 5000 }),
    prisma.vendor.findMany({ where: { active: true, status: 'APPROVED', isHouse: false }, select: { slug: true, updatedAt: true }, take: 2000 }),
    prisma.siteService.findMany({ where: { active: true, deletedAt: null }, select: { slug: true, updatedAt: true } }),
  ]);
  const base = env.siteUrl;
  const url = (path: string, priority: number, lastmod?: Date) =>
    `<url><loc>${esc(base + path)}</loc>${lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}<priority>${priority}</priority></url>`;
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...(opts.includePages ? STATIC_PAGES.map(([p, pr]) => url(p, pr)) : []),
    ...products.map((p) => url(`/store/${encodeURIComponent(p.slug)}`, 0.7, p.updatedAt)),
    ...vendors.map((v) => url(`/store/vendor/${encodeURIComponent(v.slug)}`, 0.6, v.updatedAt)),
    ...services.map((x) => url(`/services/${encodeURIComponent(x.slug)}`, 0.8, x.updatedAt)),
    '</urlset>',
  ].join('\n');
  res.set('Content-Type', 'application/xml; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(xml);
}
