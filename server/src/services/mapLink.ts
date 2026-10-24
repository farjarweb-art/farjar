/**
 * يستخرج الإحداثيات من رابط خريطة يلصقه العميل (Google Maps، Apple Maps، OpenStreetMap)
 * أو من نص إحداثيات مباشر مثل "31.95, 35.91".
 * الروابط المختصرة (maps.app.goo.gl) تُتبَع على نطاقات Google فقط — لا يُطلب أي عنوان آخر من السيرفر.
 */
export type MapPoint = { lat: number; lng: number };

const SHORT_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|g\.co)$/i;
const FOLLOW_HOSTS = /^((www\.|maps\.)?google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl|g\.co|consent\.google\.com)$/i;

const valid = (lat: number, lng: number): MapPoint | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
    ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 }
    : null;

const PAIR = /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/;

/** يقرأ الإحداثيات من نص الرابط نفسه دون أي طلب شبكة */
export function parseMapText(text: string): MapPoint | null {
  let s = text.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* نص غير مرمّز */
  }
  // موقع الدبوس في روابط Google: !3d<lat>!4d<lng>
  const pin = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(s);
  if (pin) return valid(Number(pin[1]), Number(pin[2]));
  // q= / query= / ll= / destination= / daddr=
  const param = /[?&](?:q|query|ll|sll|destination|daddr|center)=(?:loc:)?(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/.exec(s);
  if (param) return valid(Number(param[1]), Number(param[2]));
  // /@lat,lng,zoom
  const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(s);
  if (at) return valid(Number(at[1]), Number(at[2]));
  // OpenStreetMap: #map=zoom/lat/lng أو mlat/mlon
  const osm = /#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/.exec(s) ?? /mlat=(-?\d+\.\d+)&mlon=(-?\d+\.\d+)/.exec(s);
  if (osm) return valid(Number(osm[1]), Number(osm[2]));
  // نص إحداثيات مباشر
  const pair = PAIR.exec(s);
  if (pair) return valid(Number(pair[1]), Number(pair[2]));
  return null;
}

export async function resolveMapLink(input: string): Promise<MapPoint | null> {
  const direct = parseMapText(input);
  if (direct) return direct;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !SHORT_HOSTS.test(url.hostname)) return null;
  // تتبع التحويلات يدويًا وعلى نطاقات Google فقط
  for (let hop = 0; hop < 5; hop++) {
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0 FarjarBot' } });
    } catch {
      return null;
    }
    const location = res.headers.get('location');
    if (!location) {
      if (!res.ok) return null;
      const body = (await res.text()).slice(0, 200_000);
      return parseMapText(body.match(/https:\/\/www\.google\.[a-z.]+\/maps[^"'\s<>]+/)?.[0] ?? '') ?? null;
    }
    const next = new URL(location, url);
    const found = parseMapText(next.toString());
    if (found) return found;
    if (next.protocol !== 'https:' || !FOLLOW_HOSTS.test(next.hostname)) return null;
    url = next;
  }
  return null;
}
