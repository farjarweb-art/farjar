import { useEffect, useState } from 'react';
import { api } from './api';

const DAY_KEY = 'vj-visit-day';
let cached: number | null = null;
let pending: Promise<number> | null = null;

/** تاريخ اليوم بتوقيت الجهاز (الزيارة تُحسب مرة واحدة يوميًا لكل متصفح) */
const today = () => new Date().toISOString().slice(0, 10);

function load(): Promise<number> {
  if (pending) return pending;
  let counted = false;
  try {
    counted = localStorage.getItem(DAY_KEY) === today();
  } catch {
    // التخزين غير متاح: نعرض العدد دون احتساب زيارة
    counted = true;
  }
  pending = (counted ? api.get<{ count: number }>('/site/visitors') : api.post<{ count: number }>('/site/visit'))
    .then((r) => {
      if (!counted) {
        try {
          localStorage.setItem(DAY_KEY, today());
        } catch {
          // تجاهل
        }
      }
      cached = r.count;
      return r.count;
    })
    // حد الزيارات (أو أي خطأ): نقرأ العدد فقط
    .catch(() => api.get<{ count: number }>('/site/visitors').then((r) => (cached = r.count)))
    .catch(() => {
      pending = null;
      return cached ?? 0;
    });
  return pending;
}

/** عدد زوار الموقع — طلب واحد للصفحة كلها، ويزيد مرة يوميًا لكل زائر */
export function useVisitorCount() {
  const [count, setCount] = useState<number | null>(cached);
  useEffect(() => {
    let live = true;
    load().then((n) => live && n > 0 && setCount(n));
    return () => {
      live = false;
    };
  }, []);
  return count;
}

export const formatCount = (n: number) => n.toLocaleString('en-US');
