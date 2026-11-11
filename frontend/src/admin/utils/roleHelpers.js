// Shared helpers for per-day promoter roles (used by PromotersTab & RosterPickerModal)

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

export function getRoleOptions({ requiresSupervisor, requiresSetup, requiresCollection, requiresTransport } = {}) {
  const options = [{ value: 'promoter', label: ROLE_LABELS.promoter }];
  if (requiresSupervisor) options.push({ value: 'supervisor', label: ROLE_LABELS.supervisor });
  if (requiresSetup) options.push({ value: 'setup', label: ROLE_LABELS.setup });
  if (requiresCollection) options.push({ value: 'collection', label: ROLE_LABELS.collection });
  if (requiresTransport) options.push({ value: 'transport', label: ROLE_LABELS.transport });
  return options;
}

// `role` on a promoter row is only a base/fallback value; the real per-day roles
// live in daily_roles. Derives it from whichever role appears on most days.
// Ties resolve in favour of the FIRST role added (object key order), so a
// person added as setup and then collection keeps 'setup' as their base role.
export function deriveBaseRole(dailyRoles) {
  const roles = Object.values(dailyRoles || {}).filter(Boolean);
  if (roles.length === 0) return 'promoter';
  const counts = {};
  roles.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
}

// Every distinct role a person holds on this event (a single person can be
// both setup and collection, plus promoter on regular days).
export function getUserRoles(user) {
  const roles = new Set(Object.values(parseDailyRoles(user?.daily_roles)).filter(Boolean));
  if (roles.size === 0 && user?.role) roles.add(user.role);
  return [...roles];
}

/* ── Per-day editing ── */
const SPECIAL_ROLES = new Set(['setup', 'collection']);
export const isSpecialRole = (r) => SPECIAL_ROLES.has(r);

// Compare event days / daily_roles keys / assigned_dates regardless of digit script, zero padding or «-» vs «/».
export function normDay(s) {
  const t = String(s ?? '').trim()
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const m = t.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  return m ? `${m[1]}/${Number(m[2])}/${Number(m[3])}` : t;
}

/**
 * One person's row on an event, spelled out day by day.
 *  days  — { <event day string>: role } for every event day they work (an empty assigned_dates means
 *          «the whole event», so every day is listed with their base role);
 *  extraDates / extraRoles — entries that are not event days (setup / collection keys such as
 *          «1405/08/12~setup» or the role name itself); they are carried through untouched.
 */
export function explicitDays(user, eventDays) {
  const roles = parseDailyRoles(user?.daily_roles);
  const listed = (user?.assigned_dates || '').split(',').map((x) => x.trim()).filter(Boolean);
  const base = user?.role || 'promoter';
  const byNorm = {};
  Object.entries(roles).forEach(([k, v]) => { byNorm[normDay(k)] = v; });
  const days = {};
  if (listed.length === 0) {
    if (!SPECIAL_ROLES.has(base)) eventDays.forEach((d) => { days[d] = byNorm[normDay(d)] || base; });
  } else {
    const set = new Set(listed.map(normDay));
    eventDays.forEach((d) => { const n = normDay(d); if (set.has(n)) days[d] = byNorm[n] || base; });
  }
  const dayNorms = new Set(eventDays.map(normDay));
  const extraDates = listed.filter((x) => !dayNorms.has(normDay(x)));
  const extraRoles = {};
  Object.entries(roles).forEach(([k, v]) => { if (!dayNorms.has(normDay(k))) extraRoles[k] = v; });
  return { days, extraDates, extraRoles };
}

// Inverse of explicitDays → the payload fields (event order, extras last).
export function composeDays({ days, extraDates, extraRoles }, eventDays) {
  const dates = [...eventDays.filter((d) => days[d]), ...extraDates];
  const roles = { ...extraRoles };
  eventDays.forEach((d) => { if (days[d]) roles[d] = days[d]; });
  return { assigned_dates: dates.join(','), daily_roles: roles, role: deriveBaseRole(roles), count: dates.length };
}
