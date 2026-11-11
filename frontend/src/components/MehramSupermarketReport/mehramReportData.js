/**
 * Shared data layer for the Mehram report exports (Excel + PDF) on the reports page.
 * Takes the submissions the reports page currently shows (so its day / promoter / search
 * filters already apply) and flattens them into visits, per-day and per-promoter groups
 * with the route (distance + time between consecutive stores) of every promoter-day.
 */
import { collectMehram } from './MehramAdminSection';
import { getShelfQuestions, getProductGroups, MEHRAM_STORES, normCity } from './mehramData';
import {
  dayStart, dayWeekdayName, fmtDate, isShortage, isUncooperative, isCooperative, noShelfTalker, geoVerdict, buildPersonDay,
} from './mehramVisits';

export const STORE_BY_ID = new Map(MEHRAM_STORES.map((s) => [s.id, s]));

export const EXPORT_ISSUES = {
  '': 'همه‌ی بازدیدها',
  shortage: 'فقط دارای کمبود محصول',
  uncoop: 'فقط فروشگاه‌های ناهمکار',
  coop: 'فقط فروشگاه‌های همکار',
  noTalker: 'فقط شلف تاکر نصب نشده',
  far: 'فقط خارج از محدوده‌ی فروشگاه',
  noGeo: 'فقط بدون موقعیت ثبت‌شده',
};

const norm = (s) => String(s ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim().toLowerCase();

const matchesIssue = (v, issue) => {
  if (!issue) return true;
  if (issue === 'shortage') return Object.values(v.products || {}).some(isShortage);
  if (issue === 'uncoop') return isUncooperative(v);
  if (issue === 'coop') return isCooperative(v);
  if (issue === 'noTalker') return noShelfTalker(v);
  const state = geoVerdict(v.geo, v.store).state;
  if (issue === 'far') return state === 'far';
  if (issue === 'noGeo') return state === 'none';
  return true;
};

/**
 * opts: { field, submissions, getPromoterName, city, issue, dayPlans }
 * dayPlans (admin only): [{ day, storeId, personName, position }] — matched to promoters by name.
 */
export function buildMehramData({ field, submissions, getPromoterName, city = 'all', issue = '', dayPlans = [] }) {
  const questions = getShelfQuestions(field);
  const groups = getProductGroups(field);

  const visits = [];
  submissions.forEach((s) => {
    const { reports, calls } = collectMehram(field, s.data);
    reports.forEach((r) => {
      if (!r.storeId || !r.submittedAt) return;
      const store = STORE_BY_ID.get(String(r.storeId)) || null;
      const v = {
        id: `${s.id}:${r.id || r.storeId}`,
        promoterId: s.promoter_id,
        promoterName: getPromoterName(s),
        storeId: String(r.storeId),
        store,
        storeName: r.storeName || store?.name || r.storeId,
        city: normCity(r.city || store?.city || ''),
        submittedAt: r.submittedAt,
        calledAt: calls[r.storeId]?.at || r.calledAt || null,
        callNumber: calls[r.storeId]?.number || null,
        answers: r.answers || {}, notes: r.notes || {}, products: r.products || {}, geo: r.geo || null,
        storefrontSelfie: r.storefrontSelfie, posterBack: r.posterBack, shelfBefore: r.shelfBefore, shelfAfter: r.shelfAfter, productsPhoto: r.productsPhoto,
        approved: !!s.approved_at,
      };
      if ((city === 'all' || v.city === city) && matchesIssue(v, issue)) visits.push(v);
    });
  });
  visits.sort((a, b) => a.submittedAt - b.submittedAt);

  const plansByDayName = new Map(); // `${day}|${normName}` → [{ storeId, position }]
  dayPlans.forEach((p) => {
    const k = `${p.day}|${norm(p.personName)}`;
    if (!plansByDayName.has(k)) plansByDayName.set(k, []);
    plansByDayName.get(k).push({ storeId: p.storeId, position: p.position });
  });

  const dayMap = new Map();
  visits.forEach((v) => {
    const d = dayStart(v.submittedAt);
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d).push(v);
  });
  // A day that only has a plan (nobody reported yet) still shows up.
  dayPlans.forEach((p) => { if (!dayMap.has(p.day)) dayMap.set(p.day, []); });

  const days = [...dayMap.entries()].sort((a, b) => a[0] - b[0]).map(([day, dv]) => {
    const byPerson = new Map();
    dv.forEach((v) => {
      const k = norm(v.promoterName);
      if (!byPerson.has(k)) byPerson.set(k, { name: v.promoterName, promoterId: v.promoterId, visits: [] });
      byPerson.get(k).visits.push(v);
    });
    // Planned people with no visit yet.
    dayPlans.filter((p) => p.day === day).forEach((p) => {
      const k = norm(p.personName);
      if (!byPerson.has(k)) byPerson.set(k, { name: p.personName, promoterId: null, visits: [] });
    });
    const people = [...byPerson.entries()].map(([k, g]) => {
      const planned = (plansByDayName.get(`${day}|${k}`) || []).sort((a, b) => (a.position || 0) - (b.position || 0));
      return { ...g, planned, route: buildPersonDay(planned, g.visits, STORE_BY_ID) };
    }).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    return {
      day, label: `${dayWeekdayName(day)} ${fmtDate(day)}`, visits: dv, people,
      stores: new Set(dv.map((v) => v.storeId)).size,
      shortageStores: new Set(dv.filter((v) => Object.values(v.products).some(isShortage)).map((v) => v.storeId)).size,
      travelM: people.reduce((n, p) => n + p.route.travelM, 0),
      planned: people.reduce((n, p) => n + p.route.plannedCount, 0),
      done: people.reduce((n, p) => n + p.route.doneCount, 0),
    };
  });

  const promoMap = new Map();
  days.forEach((d) => d.people.forEach((p) => {
    if (!p.visits.length) return;
    const k = norm(p.name);
    const e = promoMap.get(k) || { name: p.name, days: 0, visits: 0, stores: new Set(), travelM: 0, far: 0, noFix: 0, offPlan: 0, planned: 0, done: 0, shortage: 0, first: null, last: null };
    e.days += 1; e.visits += p.visits.length; p.visits.forEach((v) => e.stores.add(v.storeId));
    e.travelM += p.route.travelM; e.far += p.route.far; e.noFix += p.route.noFix; e.offPlan += p.route.offPlan;
    e.planned += p.route.plannedCount; e.done += p.route.doneCount;
    e.shortage += p.visits.filter((v) => Object.values(v.products).some(isShortage)).length;
    e.first = Math.min(e.first ?? Infinity, p.route.startAt); e.last = Math.max(e.last ?? 0, p.route.endAt);
    promoMap.set(k, e);
  }));
  const promoters = [...promoMap.values()].sort((a, b) => b.visits - a.visits);

  const productStats = groups.map((g) => {
    const c = { 'موجود': 0, 'ناکافی': 0, 'موجود نیست': 0 };
    visits.forEach((v) => { if (c[v.products[g.key]] != null) c[v.products[g.key]] += 1; });
    return { ...g, ...c };
  });

  const totals = {
    visits: visits.length,
    stores: new Set(visits.map((v) => v.storeId)).size,
    promoters: promoters.length,
    days: days.filter((d) => d.visits.length).length,
    shortage: visits.filter((v) => Object.values(v.products).some(isShortage)).length,
    uncoop: visits.filter(isUncooperative).length,
    uncoopStores: new Set(visits.filter(isUncooperative).map((v) => v.storeId)).size,
    far: visits.filter((v) => geoVerdict(v.geo, v.store).state === 'far').length,
    called: visits.filter((v) => v.calledAt).length,
    travelM: days.reduce((n, d) => n + d.travelM, 0),
    planned: days.reduce((n, d) => n + d.planned, 0),
    done: days.reduce((n, d) => n + d.done, 0),
    from: visits[0]?.submittedAt || null,
    to: visits[visits.length - 1]?.submittedAt || null,
  };

  return { visits, days, promoters, questions, groups, productStats, totals };
}
