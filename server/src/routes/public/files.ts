import { Readable } from 'stream';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import { Router } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { z } from 'zod';
import { env } from '../../config/env';
import { asyncHandler, notFound } from '../../lib/http';

/**
 * فتح ملفات PDF والملفات الفنية المرفوعة على Cloudinary.
 * حسابات Cloudinary المجانية تمنع عرض PDF و ZIP بالرابط العام (خطأ 401)، لذلك نجلب الملف
 * برابط تنزيل موقّع (API) ونمرّره للمتصفح ليُفتح مباشرة.
 */
export const filesRouter = Router();

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  dwg: 'image/vnd.dwg',
  dxf: 'image/vnd.dxf',
  step: 'application/step',
  stp: 'application/step',
  zip: 'application/zip',
};

/** يستخرج public_id لملف raw من رابط Cloudinary الخاص بحسابنا ومجلدنا فقط */
export function cloudinaryRawId(url: string, cloud: string | undefined, folder: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com' || !cloud) return null;
  const parts = u.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  if (parts[0] !== cloud || parts[1] !== 'raw' || parts[2] !== 'upload') return null;
  const rest = parts.slice(3);
  if (/^v\d+$/.test(rest[0] ?? '')) rest.shift();
  const id = rest.join('/');
  if (!id.startsWith(`${folder}/`) || id.includes('..')) return null;
  return id;
}

filesRouter.get(
  '/raw',
  asyncHandler(async (req, res) => {
    const { u, name } = z.object({ u: z.string().max(1000), name: z.string().max(200).optional() }).parse(req.query);
    if (!env.cloudinaryEnabled) throw notFound('الملف غير موجود');
    const id = cloudinaryRawId(u, cloudinary.config().cloud_name, env.CLOUDINARY_FOLDER);
    if (!id) throw notFound('الملف غير موجود');
    const signed = cloudinary.utils.private_download_url(id, '', { resource_type: 'raw', type: 'upload', expires_at: Math.floor(Date.now() / 1000) + 300 });
    const upstream = await fetch(signed);
    if (!upstream.ok || !upstream.body) throw notFound('الملف غير متاح حاليًا');
    const ext = (id.split('.').pop() ?? '').toLowerCase();
    const filename = (name || id.split('/').pop() || 'file').replace(/["\r\n]/g, '');
    res.set('Content-Type', MIME[ext] ?? 'application/octet-stream');
    res.set('Content-Disposition', `${ext === 'pdf' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.set('Cache-Control', 'private, max-age=300');
    res.set('X-Content-Type-Options', 'nosniff');
    Readable.fromWeb(upstream.body as unknown as WebReadableStream).pipe(res);
  }),
);
