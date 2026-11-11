import { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

export const ROLE_LABELS = {
  promoter: 'پروموتر',
  supervisor: 'کاپیتان',
  setup: 'نیروی ست‌آپ',
  collection: 'نیروی کالکشن',
  transport: 'نیروی حمل و نقل',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || ROLE_LABELS.promoter;
}

// daily_roles can arrive as an object, a plain JSON string, a Python-repr string
// (single quotes), or occasionally double-encoded JSON. Normalize all of that.
export function parseDailyRoles(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const cleaned = raw.replace(/'/g, '"');
    let parsed = JSON.parse(cleaned);
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed.replace(/'/g, '"'));
    }
    return (typeof parsed === 'object' && parsed !== null) ? parsed : {};
  } catch {
    return {};
  }
}

function isoDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Finds which raw event-day string (exactly as stored in assigned_dates /
// daily_roles keys) corresponds to today, handling both Jalali ("YYYY/MM/DD")
// and Gregorian date strings.
export function findTodaysEventDateKey(event) {
  if (!event?.start_date) return null;
  const todayIso = isoDate(new Date());
  const days = String(event.start_date).split(',').map(s => s.trim()).filter(Boolean);
  for (const raw of days) {
    let d;
    if (raw.includes('/')) {
      try {
        d = new DateObject({ date: raw, format: 'YYYY/MM/DD', calendar: persian, locale: persian_fa }).toDate();
      } catch {
        continue;
      }
    } else {
      d = new Date(raw);
    }
    if (d && !isNaN(d.valueOf()) && isoDate(d) === todayIso) return raw;
  }
  return null;
}

// A promoter's actual role on an event is stored per-day (daily_roles), not on
// their base `role` field — that field is set once (almost always 'promoter')
// when they're added through the roster flow and never updated by the per-day
// role picker. Using `user.role` directly is why captains kept seeing the
// promoter checklist/profile label instead of their own. This resolves the
// role that actually applies to them right now.
export function resolveEffectiveRole(user, event) {
  if (!user) return 'promoter';
  const dailyRoles = parseDailyRoles(user.daily_roles);
  const dates = (user.assigned_dates || '').split(',').map(s => s.trim()).filter(Boolean);

  // If no assigned_dates but daily_roles exists, use the most common role in daily_roles
  // (this handles captains added without explicit date assignment)
  if (dates.length === 0) {
    const allRoles = Object.values(dailyRoles).filter(Boolean);
    if (allRoles.length > 0) {
      const roleCounts = {};
      allRoles.forEach(r => { roleCounts[r] = (roleCounts[r] || 0) + 1; });
      const mostCommon = Object.keys(roleCounts).sort((a, b) => roleCounts[b] - roleCounts[a])[0];
      if (mostCommon) return mostCommon;
    }
    return user.role || 'promoter';
  }

  const todayKey = findTodaysEventDateKey(event);
  if (todayKey && dailyRoles[todayKey]) return dailyRoles[todayKey];

  // Single scheduled day (or today couldn't be matched against it) — use it.
  if (dates.length === 1 && dailyRoles[dates[0]]) return dailyRoles[dates[0]];

  // Multiple days and no exact match for today — fall back to whichever role
  // is assigned on most of their days rather than silently downgrading them.
  const roleCounts = {};
  dates.forEach(d => {
    const r = dailyRoles[d];
    if (r) roleCounts[r] = (roleCounts[r] || 0) + 1;
  });
  const mostCommon = Object.keys(roleCounts).sort((a, b) => roleCounts[b] - roleCounts[a])[0];
  return mostCommon || user.role || 'promoter';
}

// A promoter with no assigned_dates at all is on the roster for every day of
// the event (same convention groupedUsersByDay/roleCounts already use
// elsewhere) — otherwise they only actually work the specific days listed.
// Used to keep "today"-scoped views (dashboard team list) from showing
// someone who isn't even scheduled today as a stray "missing" row.
export function isUserScheduledToday(user, event) {
  const dates = (user?.assigned_dates || '').split(',').map(s => s.trim()).filter(Boolean);
  if (dates.length === 0) return true;
  const todayKey = findTodaysEventDateKey(event);
  return todayKey ? dates.includes(todayKey) : false;
}
