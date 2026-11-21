// Event days are stored as one comma-separated string in the order the user
// clicked them in the date picker — NOT chronologically. Anything that wants
// «the first day» must sort first (a 35-day event picked newest-first showed
// its last day as the start date in the events list).

const toLatin = (s) => String(s)
  .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0)
  .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660);

// "۱۴۰۵/۰۸/۲۹" | "2026-11-20" → sortable number (YYYYMMDD); NaN when unparsable.
export const dayKey = (raw) => {
  const parts = toLatin(String(raw).trim()).split(/[/-]/).map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return NaN;
  return parts[0] * 10000 + parts[1] * 100 + parts[2];
};

// Days of an event, chronological, de-duplicated, original strings preserved.
export const sortedEventDays = (startDate) => {
  const seen = new Set();
  return String(startDate || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
    .filter((s) => { const k = toLatin(s); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => {
      const ka = dayKey(a), kb = dayKey(b);
      if (Number.isNaN(ka) || Number.isNaN(kb)) return 0;
      return ka - kb;
    });
};

export const eventFirstDay = (ev) => sortedEventDays(ev?.start_date)[0] || null;
export const eventLastDay = (ev) => { const d = sortedEventDays(ev?.start_date); return d[d.length - 1] || null; };
export const eventDayCount = (ev) => sortedEventDays(ev?.start_date).length;
