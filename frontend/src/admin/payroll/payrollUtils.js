import axios from 'axios';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// ── API ──────────────────────────────────────────────────────────────────
export const payrollApi = {
  eventWorkdays: (token, eventId) => axios.get(`${API_URL}/admin/payroll/workdays`, { ...auth(token), params: { event_id: eventId } }).then((r) => r.data),
  approve: (token, items) => axios.post(`${API_URL}/admin/payroll/workdays/approve`, { items }, auth(token)).then((r) => r.data),
  unapprove: (token, id) => axios.delete(`${API_URL}/admin/payroll/workdays/${id}`, auth(token)).then((r) => r.data),
  update: (token, id, patch) => axios.patch(`${API_URL}/admin/payroll/workdays/${id}`, patch, auth(token)).then((r) => r.data),
  bulkRate: (token, ids, rate) => axios.post(`${API_URL}/admin/payroll/workdays/bulk-rate`, { ids, rate }, auth(token)).then((r) => r.data),
  overview: (token, start, end) => axios.get(`${API_URL}/admin/payroll/overview`, { ...auth(token), params: { start, end } }).then((r) => r.data),
  pay: (token, body) => axios.post(`${API_URL}/admin/payroll/payments`, body, auth(token)).then((r) => r.data),
  cancelPayment: (token, id) => axios.delete(`${API_URL}/admin/payroll/payments/${id}`, auth(token)).then((r) => r.data),
  saveRates: (token, rates) => axios.put(`${API_URL}/admin/payroll/rates`, rates, auth(token)).then((r) => r.data),
};

export const apiError = (e, fallback = 'خطا در ارتباط با سرور') => e?.response?.data?.detail || fallback;

// ── Roles ────────────────────────────────────────────────────────────────
export const ROLES = [
  { key: 'promoter', label: 'پروموتر', color: '#818cf8' },
  { key: 'supervisor', label: 'کاپیتان', color: '#f59e0b' },
  { key: 'setup', label: 'ست‌آپ', color: '#22d3ee' },
  { key: 'collection', label: 'کالکشن', color: '#f472b6' },
  { key: 'transport', label: 'حمل و نقل', color: '#a3e635' },
];
export const ROLE_BY_KEY = Object.fromEntries(ROLES.map((r) => [r.key, r]));
export const roleName = (k) => ROLE_BY_KEY[k]?.label || 'پروموتر';

// ── Numbers / money (toman) ────────────────────────────────────────────────
export const fa = (n) => Number(n || 0).toLocaleString('fa-IR');
export const toman = (n) => `${fa(n)} تومان`;
// Short form for charts / tight cells: ۱٫۲ م = 1.2 million toman.
export const tomanShort = (n) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} میلیارد`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} م`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} هزار`;
  return fa(v);
};
// Accepts Persian/Arabic digits and separators typed into an amount box.
export const parseAmount = (s) => {
  const t = String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const neg = /^\s*-/.test(t);
  const n = Number(t.replace(/[^\d]/g, '')) || 0;
  return neg ? -n : n;
};
export const groupDigits = (n) => (n ? Number(n).toLocaleString('en-US') : '');

// ── Dates: keys are Gregorian 'YYYY-MM-DD' (Tehran day), the UI is Jalali ──
export const jalali = (date) => new DateObject({ date, calendar: persian, locale: persian_fa });
export const keyOf = (dObj) => new DateObject(dObj).convert(gregorian, gregorian_en).format('YYYY-MM-DD');
export const fromKey = (key) => new DateObject({ date: key, format: 'YYYY-MM-DD', calendar: gregorian, locale: gregorian_en }).convert(persian, persian_fa);
export const todayKey = () => new Date(Date.now() + 210 * 60 * 1000).toISOString().slice(0, 10);
export const dayLabel = (key, fmt = 'dddd D MMMM') => (key ? fromKey(key).format(fmt) : '');
export const shortDay = (key) => (key ? fromKey(key).format('D MMMM') : '');

/** The Jalali month containing `key` (or `offset` months away): { start, end, title, days: [key...] }. */
export const monthOf = (key, offset = 0) => {
  const base = fromKey(key);
  const first = new DateObject(base).toFirstOfMonth();
  if (offset) first.add(offset, 'month');
  first.toFirstOfMonth();
  const last = new DateObject(first).toLastOfMonth();
  const days = [];
  const cur = new DateObject(first);
  for (let i = 0; i < last.day; i += 1) { days.push(keyOf(cur)); cur.add(1, 'day'); }
  return { start: keyOf(first), end: keyOf(last), title: first.format('MMMM YYYY'), days, firstWeekDay: first.weekDay.index };
};

export const daysBetween = (start, end) => {
  const out = [];
  const cur = new Date(`${start}T12:00:00Z`);
  const stop = new Date(`${end}T12:00:00Z`);
  while (cur <= stop && out.length < 400) { out.push(cur.toISOString().slice(0, 10)); cur.setUTCDate(cur.getUTCDate() + 1); }
  return out;
};

export const PAY_METHODS = ['کارت به کارت', 'پایا / ساتنا', 'نقدی', 'سایر'];
