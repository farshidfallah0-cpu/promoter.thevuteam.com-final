// Filtering of the promoter archive, shared by the archive tab and the «add promoter to the event» modal.
import { normCityName } from '../../utils/iranCities';

export const EMPTY_ROSTER_FILTERS = { q: '', gender: 'all', title: 'all', city: '', badgeIds: [], badgeMode: 'all', presence: 'all' };

const nameKey = (s) => String(s ?? '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim().toLowerCase();

export const rosterFilterCount = (f) => (f.q.trim() ? 1 : 0) + (f.gender !== 'all' ? 1 : 0) + (f.title !== 'all' ? 1 : 0)
  + (f.city ? 1 : 0) + (f.badgeIds.length ? 1 : 0) + (f.presence !== 'all' ? 1 : 0);

/**
 * f: see EMPTY_ROSTER_FILTERS. `inEvent(r)` (optional) says whether a person already works on the event being edited —
 * only used by the «در ایونت هست / نیست» filter.
 */
export function applyRosterFilters(list, f, inEvent = null) {
  const q = nameKey(f.q);
  const phoneQ = f.q.replace(/\D/g, '');
  const city = f.city ? normCityName(f.city) : '';
  return list.filter((r) => {
    if (q && !(nameKey(r.full_name).includes(q) || nameKey(r.city).includes(q) || nameKey(r.username).includes(q) || (phoneQ && (r.phone_number || '').includes(phoneQ)))) return false;
    if (f.gender !== 'all' && (f.gender === 'unset' ? !!r.gender : r.gender !== f.gender)) return false;
    if (f.title !== 'all' && r.gamification?.title !== f.title) return false;
    if (city && normCityName(r.city) !== city) return false;
    if (f.badgeIds.length) {
      const have = new Set(r.badge_ids || []);
      const ok = f.badgeMode === 'any' ? f.badgeIds.some((id) => have.has(id)) : f.badgeIds.every((id) => have.has(id));
      if (!ok) return false;
    }
    if (inEvent && f.presence !== 'all') {
      const here = inEvent(r);
      if (f.presence === 'in' ? !here : here) return false;
    }
    return true;
  });
}

/** Cities that appear in the archive, with how many people live in each (most people first). */
export function rosterCities(list) {
  const m = new Map();
  list.forEach((r) => { const c = (r.city || '').trim(); if (c) m.set(c, (m.get(c) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa'));
}
