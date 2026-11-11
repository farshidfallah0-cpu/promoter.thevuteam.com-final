// «تیم» of the dashboard, day by day: for EVERY day of the event, who is scheduled that day and — once the day has
// come — when each of them checked in, whether they were late, and how much of that day's report they filled in.
import { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { explicitDays, normDay } from './roleHelpers';
import { calcGlobalProgress } from '../../utils/progressUtils';

const TEHRAN_OFFSET_MS = 210 * 60 * 1000;
const LATE_GRACE_MS = 5 * 60 * 1000; // arriving right at (or just after) the official start doesn't count as late
const faDigitsToEn = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const tehranIso = (ms) => (ms ? new Date(ms + TEHRAN_OFFSET_MS).toISOString().slice(0, 10) : '');
const toMs = (ts) => (typeof ts === 'number' ? ts : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(ts)) ? ts : `${ts}Z`).getTime());
const hasValue = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '');
const clock = (ms) => new Date(ms).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tehran' });

/** «1405/08/04» (Jalali) or «2026-11-04» → { iso: 'YYYY-MM-DD' (Gregorian), weekday, label } — null when unreadable. */
export function parseEventDay(raw) {
  try {
    const s = faDigitsToEn(raw).trim();
    const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    let g;
    if (y < 1700) g = new DateObject({ calendar: persian, locale: persian_fa, year: y, month: mo, day: d }).convert(gregorian, gregorian_en);
    else g = new DateObject({ calendar: gregorian, locale: gregorian_en, year: y, month: mo, day: d });
    const iso = g.format('YYYY-MM-DD');
    const p = new DateObject({ date: new Date(`${iso}T12:00:00Z`) }).convert(persian, persian_fa);
    return { iso, weekday: p.format('dddd'), label: p.format('D MMMM') };
  } catch {
    return null;
  }
}

/**
 * Returns [{ raw, iso, weekday, label, dayNum, phase: 'past' | 'today' | 'future', members: [...], summary }] — one entry per
 * event day, in date order. member: { id, name, role, status, message, timeStr, checkoutTimeStr, pct, done, total, missing[] }.
 * status: 'on-time' | 'late' | 'reported' | 'absent' | 'waiting' (today, not yet in) | 'scheduled' (future day).
 */
export function buildDailyTeam({ event, users, submissions }) {
  const rawDays = String(event?.start_date || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!event || !rawDays.length) return [];
  const todayIso = tehranIso(Date.now());
  const nonAdmin = (users || []).filter((u) => !u.is_admin);

  // Submissions → the promoter row of THIS event (a stale duplicate row of the same person is resolved by name).
  const idSet = new Set(nonAdmin.map((u) => u.id));
  const nameKey = (s) => (s || '').trim().toLowerCase();
  const idByName = {};
  nonAdmin.forEach((u) => { const k = nameKey(u.full_name || u.username); if (k && !(k in idByName)) idByName[k] = u.id; });
  const resolveId = (s) => (s.promoter_id && idSet.has(s.promoter_id) ? s.promoter_id : idByName[nameKey(s.promoter_name)] || s.promoter_id || null);

  // iso day → promoter id → merged data of that day's submissions
  const byDay = new Map();
  (submissions || []).forEach((s) => {
    const pid = resolveId(s);
    const ts = s.first_submitted_at || s.submitted_at;
    if (!pid || !ts) return;
    const iso = tehranIso(toMs(ts));
    if (!byDay.has(iso)) byDay.set(iso, new Map());
    const day = byDay.get(iso);
    const cur = day.get(pid);
    if (!cur) day.set(pid, { data: { ...(s.data || {}) }, first: s.first_submitted_at || s.submitted_at, last: s.submitted_at });
    else {
      cur.data = { ...cur.data, ...(s.data || {}) };
      if (s.submitted_at && (!cur.last || s.submitted_at > cur.last)) cur.last = s.submitted_at;
      if (s.first_submitted_at && (!cur.first || s.first_submitted_at < cur.first)) cur.first = s.first_submitted_at;
    }
  });

  const fields = event.fields || [];
  const checkoutField = fields.find((f) => f.type === 'camera_checkout');
  const eventHasCheckin = fields.some((f) => f.type === 'camera_checkin');
  const instant = (iso, hhmm) => {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    if (!iso || !Number.isFinite(h)) return null;
    const [y, mo, d] = iso.split('-').map(Number);
    return Date.UTC(y, mo - 1, d, h, m || 0) - TEHRAN_OFFSET_MS;
  };
  const customFor = (raw) => {
    const ct = event.custom_times || {};
    const k = Object.keys(ct).find((x) => normDay(x) === normDay(raw));
    return k ? ct[k] : null;
  };

  const people = nonAdmin.map((u) => ({ u, ex: explicitDays(u, rawDays) }));
  const parsed = rawDays.map((raw, i) => ({ raw, i, ...(parseEventDay(raw) || { iso: '', weekday: '', label: raw }) }));
  parsed.sort((a, b) => (a.iso && b.iso ? a.iso.localeCompare(b.iso) : a.i - b.i));

  const days = parsed.map((day, idx) => {
    const phase = !day.iso ? 'future' : day.iso < todayIso ? 'past' : day.iso === todayIso ? 'today' : 'future';
    const startStr = customFor(day.raw)?.start || event.start_time;
    const members = people.filter(({ ex }) => ex.days[day.raw]).map(({ u, ex }) => {
      const role = ex.days[day.raw];
      const sub = byDay.get(day.iso)?.get(u.id);
      const base = { id: u.id, userId: u.id, name: u.full_name || u.username, role, avatar: u.profile_picture || null, lastSeen: u.last_seen || null };
      if (phase === 'future' && !sub) return { ...base, status: 'scheduled', message: 'برنامه‌ریزی‌شده', timeStr: '', checkoutTimeStr: null, pct: null, done: 0, total: 0, missing: [] };

      const checkinField = fields.find((f) => f.type === 'camera_checkin')
        || (sub ? fields.find((f) => ['camera', 'image'].includes(f.type) && sub.data && sub.data[f.id]) : null);
      const checkinVal = checkinField && sub ? sub.data[checkinField.id] : null;
      const checkedIn = hasValue(checkinVal);
      const progress = calcGlobalProgress(event, sub?.data, role);
      const out = { ...base, pct: progress.pct, done: progress.done, total: progress.total, missing: (progress.items || []).filter((x) => !x.done).map((x) => x.title), timeStr: '', checkoutTimeStr: null };

      if (checkedIn) {
        const fallback = sub.first ? toMs(sub.first) : null;
        const checkinMs = sub.data[`${checkinField.id}_time`] || fallback;
        out.timeStr = checkinMs ? clock(checkinMs) : '';
        let target = instant(day.iso, startStr);
        if (role === 'setup' && event.setup_time_in && event.setup_time_in !== '00:00') target = instant(day.iso, event.setup_time_in);
        else if (role === 'collection' && event.collection_time_in && event.collection_time_in !== '00:00') target = instant(day.iso, event.collection_time_in);
        if (target && checkinMs && checkinMs - target > LATE_GRACE_MS) {
          const diff = Math.floor((checkinMs - target) / 60000);
          const h = Math.floor(diff / 60);
          out.status = 'late';
          out.lateMin = diff;
          out.message = h > 0 ? `${h} ساعت و ${diff % 60} دقیقه تاخیر` : `${diff} دقیقه تاخیر`;
        } else {
          out.status = 'on-time';
          out.message = 'ورود به موقع';
        }
        if (checkoutField && hasValue(sub.data[checkoutField.id])) {
          const fb = sub.last ? toMs(sub.last) : null;
          const outMs = sub.data[`${checkoutField.id}_time`] || fb;
          if (outMs) out.checkoutTimeStr = clock(outMs);
        }
      } else if (sub && !eventHasCheckin) {
        out.status = 'reported';
        out.message = 'گزارش ثبت شده';
      } else {
        out.status = phase === 'today' ? 'waiting' : 'absent';
        out.message = phase === 'today' ? 'هنوز ورود ثبت نشده' : 'ورود ثبت نشده';
      }
      return out;
    });

    const order = { late: 0, 'on-time': 1, reported: 1, waiting: 2, absent: 3, scheduled: 4 };
    members.sort((a, b) => (order[a.status] - order[b.status]) || a.name.localeCompare(b.name, 'fa'));
    const live = members.filter((m) => m.status !== 'scheduled');
    const present = members.filter((m) => m.status === 'on-time' || m.status === 'late' || m.status === 'reported').length;
    const late = members.filter((m) => m.status === 'late').length;
    const absent = members.filter((m) => m.status === 'absent').length;
    // Average report completion over everyone scheduled that day (someone who never showed up counts 0).
    const avgPct = live.length ? Math.round(live.reduce((n, m) => n + (m.pct || 0), 0) / live.length) : null;
    return {
      raw: day.raw, iso: day.iso, weekday: day.weekday, label: day.label, dayNum: idx + 1, phase, members,
      summary: { total: members.length, present, late, absent, avgPct },
    };
  });

  // People with no event day at all (setup / collection crew saved under a role name instead of a date, …) must not vanish.
  const others = people.filter(({ ex }) => Object.keys(ex.days).length === 0).map(({ u, ex }) => ({
    id: u.id, userId: u.id, name: u.full_name || u.username, role: Object.values(ex.extraRoles)[0] || u.role || 'promoter',
    avatar: u.profile_picture || null, lastSeen: u.last_seen || null,
    status: 'scheduled', message: 'بدون روز مشخص در ایونت', timeStr: '', checkoutTimeStr: null, pct: null, done: 0, total: 0, missing: [],
  }));
  if (others.length) {
    days.push({ raw: '__other', iso: '', weekday: '', label: 'سایر نیروها (ست‌آپ / کالکشن / بدون روز مشخص)', dayNum: null, phase: 'future', members: others,
      summary: { total: others.length, present: 0, late: 0, absent: 0, avgPct: null } });
  }
  return days;
}
