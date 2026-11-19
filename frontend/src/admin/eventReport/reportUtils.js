import { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

export const toEn = (s) => String(s ?? '')
  .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
export const toFa = (s) => String(s ?? '').replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

// '' = not entered; otherwise a non-negative integer.
export const parseCount = (raw) => {
  const digits = toEn(raw).replace(/[^0-9]/g, '');
  return digits === '' ? '' : Number(digits);
};
export const fmtCount = (v) => (v === '' || v === null || v === undefined) ? '' : toFa(Number(v).toLocaleString('en-US')).replace(/,/g, '٬');

/** '1405/08/22' → { day: '۲۲ آبان', full: '۲۲ آبان ۱۴۰۵', weekday: 'پنج‌شنبه' } */
export const fmtJalali = (date) => {
  try {
    const d = new DateObject({ date: toEn(date), format: 'YYYY/MM/DD', calendar: persian, locale: persian_fa });
    if (!d.isValid) throw new Error('bad');
    return { day: d.format('D MMMM'), full: d.format('D MMMM YYYY'), weekday: d.format('dddd') };
  } catch {
    return { day: toFa(date), full: toFa(date), weekday: '' };
  }
};

export const RATINGS = [
  { key: 'excellent', label: 'عالی', color: '#10b981' },
  { key: 'good', label: 'خوب', color: '#3b82f6' },
  { key: 'weak', label: 'ضعیف', color: '#f59e0b' },
  { key: 'very_weak', label: 'خیلی ضعیف', color: '#ef4444' },
];
export const ratingOf = (key) => RATINGS.find(r => r.key === key) || null;

export const ROLE_LABEL = { supervisor: 'سوپروایزر', promoter: 'پروموتر' };

export const fmtTimeRange = (start, end) => {
  if (!start && !end) return '';
  return toFa(`${start || '—'} تا ${end || '—'}`);
};

export const ageRangeText = (from, to) => {
  if (from === '' && to === '') return '';
  if (from !== '' && to !== '') return toFa(`${from} تا ${to} سال`);
  if (from !== '') return toFa(`بالای ${from} سال`);
  return toFa(`زیر ${to} سال`);
};

/** Builds the editable form from the auto data (+ whatever was saved before). */
export const buildForm = (auto, saved) => {
  const base = {
    name: auto?.name || '',
    client_name: auto?.client_name || '',
    location: auto?.location || '',
    days: (auto?.days || []).map(d => ({ date: d.date, start: d.start || '', end: d.end || '' })),
    promoters: Object.fromEntries((auto?.promoters || []).map(p => [p.date, p.people.map(x => ({ name: x.name, role: x.role || 'promoter' }))])),
    products_sent: '',
    sampled: auto?.sampled ?? '',
    returned_items: [],
    cars_send: auto?.transport_count ? auto.transport_count : '',
    cars_return: '',
    rating: '',
    age_from: '',
    age_to: '',
    audience_estimate: '',
    audience_fit: '',
    problems: '',
    incidents: '',
    summary: '',
  };
  if (!saved) return base;
  return { ...base, ...saved, promoters: saved.promoters || base.promoters, days: saved.days || base.days };
};

/** Days listed in the form, each with its promoters (sorted: supervisors first). */
export const daysWithPeople = (form) => form.days.map(d => ({
  ...d,
  people: [...(form.promoters[d.date] || [])].filter(p => p.name.trim())
    .sort((a, b) => (a.role === 'supervisor' ? 0 : 1) - (b.role === 'supervisor' ? 0 : 1)),
}));

export const uniquePeople = (form) => {
  const set = new Set();
  daysWithPeople(form).forEach(d => d.people.forEach(p => set.add(p.name.trim())));
  return set.size;
};

export const safeFileName = (s) => (String(s || 'event').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'event');
