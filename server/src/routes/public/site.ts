import { Router } from 'express';
import { asyncHandler, ok } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { visitLimiter } from '../../middleware/rateLimit';
import { getSettings, publicSettings } from '../../services/settings.service';
import { whatsappMode } from '../../services/whatsapp.service';

export const siteRouter = Router();

siteRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const s = await getSettings();
    ok(res, { ...publicSettings(s), whatsappMode: whatsappMode() });
  }),
);

/** عدد زوار الموقع — يبدأ من 666 (القيمة الأولى في الـ migration) */
const VISITORS = 'visitors';
const START = 665;

siteRouter.get(
  '/visitors',
  asyncHandler(async (_req, res) => {
    const c = await prisma.counter.findUnique({ where: { key: VISITORS } });
    ok(res, { count: c?.value ?? START });
  }),
);

/** زيارة جديدة: المتصفح يرسلها مرة واحدة يوميًا، والزيادة ذرية في قاعدة البيانات */
siteRouter.post(
  '/visit',
  visitLimiter,
  asyncHandler(async (_req, res) => {
    const c = await prisma.counter.upsert({
      where: { key: VISITORS },
      create: { key: VISITORS, value: START + 1 },
      update: { value: { increment: 1 } },
    });
    ok(res, { count: c.value });
  }),
);
