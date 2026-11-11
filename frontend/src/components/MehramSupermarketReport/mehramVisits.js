/**
 * Helpers for the Mehram stores dashboard (MehramStoresTab + its Excel export).
 * A "visit" is one saved store report, as returned by GET /admin/mehram/visits.
 * Weeks are Persian weeks: Saturday 00:00 → Friday 23:59, Tehran time.
 */
import { getShelfQuestions, getProductGroups } from './mehramData';

const TEHRAN_OFFSET_MS = 210 * 60 * 1000; // Iran has no DST since 2022
const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

/**
 * What a «بازدید» is, everywhere (week selector, coverage card, cards, exports): one store in one week.
 * A second report for the same store in the same week is the same visit, so a store's visit count is the number
 * of DIFFERENT weeks it has reports in — never the number of saved reports.
 */
export const visitWeekCount = (reports) => new Set((reports || []).map((v) => weekStart(v.submittedAt))).size;

/** Epoch ms of the Saturday 00:00 (Tehran) that starts the week containing `ms`. */
export const weekStart = (ms) => {
  const d = new Date(ms + TEHRAN_OFFSET_MS); // UTC fields now read as Tehran wall clock
  const back = (d.getUTCDay() + 1) % 7; // Sat → 0, Sun → 1, … Fri → 6
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back) - TEHRAN_OFFSET_MS;
};

const faDate = (ms, opts) => new Date(ms).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran', ...opts });
export const fmtDate = (ms) => (ms ? faDate(ms, { year: 'numeric', month: '2-digit', day: '2-digit' }) : '');
export const fmtDay = (ms) => (ms ? faDate(ms, { weekday: 'long', day: 'numeric', month: 'long' }) : '');
export const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }) : '');
export const fa = (n) => Number(n || 0).toLocaleString('fa-IR');

export const weekLabel = (start) => `${faDate(start, { day: 'numeric', month: 'long' })} تا ${faDate(start + WEEK_MS - DAY_MS, { day: 'numeric', month: 'long' })}`;

/** Relative name for a week: «این هفته», «هفته‌ی قبل», else the date range. */
export const weekName = (start, now = Date.now()) => {
  const diff = Math.round((weekStart(now) - start) / WEEK_MS);
  if (diff === 0) return 'این هفته';
  if (diff === 1) return 'هفته‌ی قبل';
  return weekLabel(start);
};

/* ── Answer tones (shared with the admin report card) ── */
export const STATUS_TONE = { 'موجود': 'good', 'ناکافی': 'warn', 'موجود نیست': 'bad' };
export const isShortage = (status) => status === 'ناکافی' || status === 'موجود نیست';

export const answerTone = (key, value) => {
  if (key === 'shelfStatus') return { 'مرتب': 'good', 'نامنظم': 'warn', 'خالی': 'bad', 'آیتم‌های غیر مرتبط': 'warn', 'مرتب است': 'good', 'محصول مهرام دارد': 'good', 'شلف تاکر نیست': 'bad', 'شلف تاکر ندارد': 'bad', 'محصول مهرام ندارد': 'bad', 'محصول مهرام کم دارد': 'warn' }[value] || '';
  if (key === 'storeCooperates') return value === 'بله' || value === 'همکاری می‌کند' ? 'good' : 'bad';
  if (key === 'shelfTalkerInstall') return value === 'هست' || value === 'بله' ? 'good' : 'bad';
  if (key === 'shelfTalkerReplace' || key === 'posterReplace') return value === 'بله' ? 'warn' : 'good';
  return '';
};

// Older reports answered «بله/خیر» (cooperation) and «هست» (shelf talker) before the options were reworded;
// exports show one wording so a column never mixes the two.
const LEGACY_ANSWERS = {
  storeCooperates: { 'بله': 'همکاری می‌کند', 'خیر': 'همکاری نمی‌کند' },
  shelfTalkerInstall: { 'هست': 'بله' },
  // «وضعیت شلف تاکر قبلی» was briefly worded differently (the answers saved with those words read the same as the new ones).
  shelfStatus: { 'مرتب است': 'محصول مهرام دارد', 'شلف تاکر نیست': 'شلف تاکر ندارد' },
};
export const answerLabel = (key, value) => LEGACY_ANSWERS[key]?.[value] || value || '';

export const isUncooperative = (v) => answerLabel('storeCooperates', v?.answers?.storeCooperates) === 'همکاری نمی‌کند';
export const isCooperative = (v) => answerLabel('storeCooperates', v?.answers?.storeCooperates) === 'همکاری می‌کند';
export const noShelfTalker = (v) => v?.answers?.shelfTalkerInstall === 'خیر';

export const VISIT_PHOTOS = [
  ['storefrontSelfie', 'سلفی با سردر'],
  ['posterBack', 'عکس پوستر'],
  ['shelfBefore', 'شلف قبل'],
  ['shelfAfter', 'شلف بعد'],
  ['productsPhoto', 'گروه محصولات'],
];

/**
 * Questions and product groups can differ per event (each event's section has its
 * own settings). Merge them in first-seen order so every column/answer has a title.
 */
export const buildCatalog = (events) => {
  const questions = new Map();
  const groups = new Map();
  const byEvent = {};
  (events || []).forEach((e) => {
    const field = (e.fields || [])[0];
    const qs = getShelfQuestions(field);
    const gs = getProductGroups(field);
    byEvent[e.id] = { name: e.name, questions: qs, groups: gs };
    qs.forEach((q) => { if (!questions.has(q.key)) questions.set(q.key, q); });
    gs.forEach((g) => { if (!groups.has(g.key)) groups.set(g.key, g); });
  });
  return { questions: [...questions.values()], groups: [...groups.values()], byEvent };
};

/* ── Location check: was the promoter actually at the store? ── */
// A visit counts as «در محل فروشگاه» within this radius (plus the fix's own
// uncertainty, capped — a 1 km-accurate fix can't vouch for anything).
export const GEO_LIMIT_M = 200;
const MAX_ACC_CREDIT_M = 150;

export const distanceM = (a, b) => {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export const fmtDistance = (m) => (m < 1000 ? `${fa(Math.round(m))} متر` : `${(m / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} کیلومتر`);

const GEO_ERRORS = {
  denied: 'دسترسی موقعیت داده نشد',
  unavailable: 'موقعیت دریافت نشد',
  unsupported: 'گوشی موقعیت را پشتیبانی نمی‌کند',
  low_accuracy: 'دقت GPS پایین بود',
};

/**
 * { state: 'near' | 'far' | 'none' | 'nostore', distance?, label }
 * 'none' = no usable fix was recorded; 'nostore' = the store has no coordinates.
 */
export const geoVerdict = (geo, store) => {
  if (!geo || geo.lat == null) return { state: 'none', label: geo?.error ? GEO_ERRORS[geo.error] || 'موقعیت ثبت نشد' : 'موقعیت ثبت نشد' };
  if (store?.lat == null) return { state: 'nostore', label: 'موقعیت ثبت شد' };
  const d = distanceM(geo, store);
  const near = d <= GEO_LIMIT_M + Math.min(geo.accuracy || 0, MAX_ACC_CREDIT_M);
  return { state: near ? 'near' : 'far', distance: d, label: near ? `در محل فروشگاه (${fmtDistance(d)})` : `${fmtDistance(d)} دورتر از فروشگاه` };
};

/* ── Daily plan + route tracking ── */

/** Epoch ms of 00:00 Tehran of the day containing `ms`. */
export const dayStart = (ms) => {
  const d = new Date(ms + TEHRAN_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - TEHRAN_OFFSET_MS;
};
export const DAY = DAY_MS;
export const weekDays = (start) => Array.from({ length: 7 }, (_, i) => start + i * DAY_MS);
export const dayWeekdayName = (ms) => faDate(ms, { weekday: 'long' });
export const dayShort = (ms) => faDate(ms, { day: 'numeric', month: 'short' });
export const fmtDuration = (ms) => {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'کمتر از یک دقیقه';
  if (min < 60) return `${fa(min)} دقیقه`;
  const h = Math.floor(min / 60);
  return `${fa(h)} ساعت${min % 60 ? ` و ${fa(min % 60)} دقیقه` : ''}`;
};

const storeCoord = (store) => (store?.lat != null && store?.lng != null ? { lat: store.lat, lng: store.lng } : null);

/**
 * One promoter's day: the planned stores (in order) merged with the stores actually
 * reported that day (in time order). The position of every visit is the GPS fix taken
 * with the storefront selfie — falling back to the store's own coordinates — so each
 * leg (store → next store) gets a distance and a duration without any extra tracking.
 *
 * planned: [{ storeId, position }] · visits: this person's visits of that day
 * storeById: Map<id, store>
 * → { stops: [...], legs total, counts }
 */
export const buildPersonDay = (planned, visits, storeById) => {
  const sorted = [...visits].sort((a, b) => a.submittedAt - b.submittedAt);
  const plannedIds = new Set(planned.map((p) => p.storeId));
  const firstVisit = new Map();
  sorted.forEach((v) => { if (!firstVisit.has(v.storeId)) firstVisit.set(v.storeId, v); });

  let prev = null;
  const stops = sorted.map((v) => {
    const store = storeById.get(v.storeId);
    const verdict = geoVerdict(v.geo, store);
    const pos = v.geo?.lat != null ? { lat: v.geo.lat, lng: v.geo.lng } : storeCoord(store);
    let leg = null;
    if (prev) {
      const dist = pos && prev.pos ? distanceM(prev.pos, pos) : null;
      const gap = v.submittedAt - prev.at;
      leg = { distance: dist, gap, from: prev.store, speedKmh: dist != null && gap > 0 ? (dist / 1000) / (gap / 3600000) : null };
    }
    prev = { pos, at: v.submittedAt, store };
    return { visit: v, store, verdict, planned: plannedIds.has(v.storeId), leg };
  });
  const missed = planned.filter((p) => !firstVisit.has(p.storeId)).map((p) => ({ ...p, store: storeById.get(p.storeId) }));
  const travelM = stops.reduce((n, s) => n + (s.leg?.distance || 0), 0);
  return {
    stops,
    missed,
    plannedCount: planned.length,
    doneCount: planned.filter((p) => firstVisit.has(p.storeId)).length,
    offPlan: stops.filter((s) => planned.length > 0 && !s.planned).length,
    far: stops.filter((s) => s.verdict.state === 'far').length,
    noFix: stops.filter((s) => s.verdict.state === 'none').length,
    travelM,
    startAt: sorted[0]?.submittedAt || null,
    endAt: sorted[sorted.length - 1]?.submittedAt || null,
  };
};

/* ── Event dates → days ── */
const faDigits = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

const jalaliToGregorian = (jy, jm, jd) => {
  const y = jy + 1595;
  let days = -355668 + 365 * y + Math.floor(y / 33) * 8 + Math.floor(((y % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    days -= 1;
    gy += 100 * Math.floor(days / 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < 13 && gd > sal[gm]) { gd -= sal[gm]; gm += 1; }
  return [gy, gm, gd];
};

/**
 * The days of an event, from the dates entered on the event («۱۴۰۵/۰۷/۲۵, ۱۴۰۵/۰۷/۲۶, …» in
 * Jalali, or YYYY-MM-DD) → sorted Tehran day starts. Any number of days: 3, 10, a month…
 */
export const eventDayStarts = (startDate) => {
  const out = new Set();
  String(startDate || '').split(/[,،]/).map((p) => faDigits(p).trim()).filter(Boolean).forEach((part) => {
    const m = part.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (!m) return;
    let [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 1700) [y, mo, d] = jalaliToGregorian(y, mo, d);
    out.add(Date.UTC(y, mo - 1, d) - TEHRAN_OFFSET_MS);
  });
  return [...out].sort((a, b) => a - b);
};

/**
 * Photos of one visit as [key, label, url] — the four fixed ones, then the product photos: one per
 * product group (new reports) and/or the general shelf photo (older reports). `url` '' = not taken.
 */
export const visitPhotoList = (visit, ev, clientView = false) => {
  const groups = ev?.groups || [];
  const list = VISIT_PHOTOS.filter(([k]) => k !== 'productsPhoto' && !(clientView && k === 'storefrontSelfie')).map(([k, label]) => [k, label, visit[k] || '']);
  const perGroup = groups.filter((g) => visit.productPhotos?.[g.key]).map((g) => [`pg_${g.key}`, g.title, visit.productPhotos[g.key]]);
  const general = visit.productsPhoto && !perGroup.some(([, , u]) => u === visit.productsPhoto) ? [['productsPhoto', 'گروه محصولات', visit.productsPhoto]] : [];
  if (!perGroup.length && !general.length) return [...list, ['productsPhoto', 'گروه محصولات', '']];
  return [...list, ...general, ...perGroup];
};
