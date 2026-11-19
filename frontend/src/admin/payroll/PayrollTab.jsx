import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
  Wallet, CalendarDays, Users, BarChart3, Receipt, Settings2, ChevronRight, ChevronLeft, RefreshCw,
  Download, Search, Hourglass, CheckCircle2, Banknote, X, CalendarRange,
} from 'lucide-react';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import {
  payrollApi, apiError, ROLES, fa, toman, tomanShort, monthOf, todayKey, keyOf, fromKey, daysBetween, dayLabel, parseAmount, groupDigits,
} from './payrollUtils';
import PeopleView from './PeopleView';
import CalendarView from './CalendarView';
import ChartsView from './ChartsView';
import PaymentsView from './PaymentsView';
import RatesView from './RatesView';
import PayDialog from './PayDialog';
import './payroll.css';

const VIEWS = [
  { key: 'people', label: 'پرسنل و تسویه', Icon: Users },
  { key: 'calendar', label: 'تقویم کاری', Icon: CalendarDays },
  { key: 'charts', label: 'نمودارها', Icon: BarChart3 },
  { key: 'payments', label: 'پرداخت‌ها', Icon: Receipt },
  { key: 'rates', label: 'نرخ دستمزد', Icon: Settings2 },
];
const STATUSES = [
  { key: 'all', label: 'همه' },
  { key: 'unpaid', label: 'پرداخت‌نشده' },
  { key: 'paid', label: 'پرداخت‌شده' },
  { key: 'pending', label: 'در انتظار تایید' },
];

export default function PayrollTab({ token }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [range, setRange] = useState(null); // {start,end} = custom range, null = Jalali month
  const month = useMemo(() => monthOf(todayKey(), monthOffset), [monthOffset]);
  const period = range || { start: month.start, end: month.end };
  const periodTitle = range ? `${dayLabel(range.start, 'D MMMM')} تا ${dayLabel(range.end, 'D MMMM YYYY')}` : month.title;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('people');
  const [filters, setFilters] = useState({ q: '', event: '', client: '', role: '', status: 'all' });
  const [selected, setSelected] = useState(() => new Set());
  const [payOpen, setPayOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await payrollApi.overview(token, period.start, period.end));
    } catch (e) {
      toast.error(apiError(e, 'خطا در دریافت اطلاعات محاسبه عملکرد'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, period.start, period.end]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [period.start, period.end]);

  const setF = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const clients = useMemo(() => [...new Set((data?.events || []).map((e) => e.client_name).filter(Boolean))].sort(), [data]);
  const eventsInData = useMemo(() => {
    const ids = new Set([...(data?.workdays || []), ...(data?.pending || [])].map((w) => w.event_id));
    return (data?.events || []).filter((e) => ids.has(e.id));
  }, [data]);

  const match = useCallback((w) => {
    const q = filters.q.trim();
    return (!filters.event || String(w.event_id) === filters.event)
      && (!filters.client || w.client_name === filters.client)
      && (!filters.role || w.role === filters.role)
      && (!q || `${w.person_name || ''} ${w.phone || ''} ${w.event_name || ''}`.includes(q));
  }, [filters]);

  const workdays = useMemo(() => (data?.workdays || []).filter(match).filter((w) => (
    filters.status === 'all' || (filters.status === 'unpaid' && !w.paid) || (filters.status === 'paid' && w.paid)
  )).filter(() => filters.status !== 'pending'), [data, match, filters.status]);
  const pending = useMemo(() => ((filters.status === 'all' || filters.status === 'pending') ? (data?.pending || []).filter(match) : []), [data, match, filters.status]);

  const kpi = useMemo(() => {
    const all = (data?.workdays || []).filter(match);
    const unpaid = all.filter((w) => !w.paid);
    const paid = all.filter((w) => w.paid);
    return {
      unpaid: unpaid.reduce((n, w) => n + w.amount, 0), unpaidDays: unpaid.length,
      paid: paid.reduce((n, w) => n + w.amount, 0), paidDays: paid.length,
      total: all.reduce((n, w) => n + w.amount, 0), days: all.length,
      people: new Set(all.map((w) => w.person_key)).size,
      pending: (data?.pending || []).filter(match).length,
      noRate: unpaid.filter((w) => !w.rate).length,
    };
  }, [data, match]);

  const byId = useMemo(() => new Map((data?.workdays || []).map((w) => [w.id, w])), [data]);
  const selectedRows = useMemo(() => [...selected].map((id) => byId.get(id)).filter((w) => w && !w.paid), [selected, byId]);
  const selTotal = selectedRows.reduce((n, w) => n + w.amount, 0);
  const selPeople = new Set(selectedRows.map((w) => w.person_key)).size;

  const toggle = useCallback((ids, on) => setSelected((prev) => {
    const next = new Set(prev);
    ids.forEach((id) => { const w = byId.get(id); if (!w || w.paid) return; if (on ?? !next.has(id)) next.add(id); else next.delete(id); });
    return next;
  }), [byId]);

  // Local patch after an edit, so the page does not jump.
  const patchRows = useCallback((rows) => setData((d) => {
    if (!d) return d;
    const m = new Map(rows.map((r) => [r.id, r]));
    return { ...d, workdays: d.workdays.map((w) => m.get(w.id) || w) };
  }), []);

  const approvePending = useCallback(async (items) => {
    try {
      await payrollApi.approve(token, items.map(({ event_id, promoter_id, day, role }) => ({ event_id, promoter_id, day, role })));
      toast.success(`${fa(items.length)} روز کاری تایید شد`);
      load();
    } catch (e) { toast.error(apiError(e, 'خطا در تایید')); }
  }, [token, load]);

  const unapprove = useCallback(async (w) => {
    try {
      await payrollApi.unapprove(token, w.id);
      setSelected((s) => { const n = new Set(s); n.delete(w.id); return n; });
      load();
    } catch (e) { toast.error(apiError(e, 'خطا در لغو تایید')); }
  }, [token, load]);

  const [bulkRate, setBulkRate] = useState('');
  const applyBulkRate = async () => {
    const rate = parseAmount(bulkRate);
    if (!rate) { toast.error('مبلغ دستمزد روزانه را وارد کنید'); return; }
    try {
      patchRows(await payrollApi.bulkRate(token, selectedRows.map((w) => w.id), rate));
      toast.success(`دستمزد ${fa(selectedRows.length)} روز روی ${toman(rate)} گذاشته شد`);
      setBulkRate('');
    } catch (e) { toast.error(apiError(e)); }
  };

  const exportExcel = async () => {
    try {
      const { exportPayrollExcel } = await import('./payrollExcel');
      await exportPayrollExcel({
        title: periodTitle, period, days: range ? daysBetween(range.start, range.end) : month.days,
        workdays: (data?.workdays || []).filter(match), pending: (data?.pending || []).filter(match), payments: data?.payments || [],
      });
    } catch (e) {
      console.error(e);
      toast.error('خطا در ساخت فایل اکسل');
    }
  };

  const filterCount = ['event', 'client', 'role'].filter((k) => filters[k]).length + (filters.q ? 1 : 0) + (filters.status !== 'all' ? 1 : 0);

  return (
    <div className="pr-root">
      {/* ── Hero ── */}
      <div className="pr-hero">
        <div className="pr-hero-title">
          <span className="pr-hero-icon"><Wallet size={22} /></span>
          <div>
            <h1>محاسبه عملکرد</h1>
            <p>روزهای کاری تاییدشده، دستمزد و تسویه‌ی حقوق بچه‌ها</p>
          </div>
        </div>
        <div className="pr-hero-actions">
          <div className="pr-period">
            {!range && <button type="button" className="pr-icon-btn" onClick={() => setMonthOffset((o) => o - 1)} title="ماه قبل"><ChevronRight size={18} /></button>}
            <span className="pr-period-title">{periodTitle}</span>
            {!range && <button type="button" className="pr-icon-btn" onClick={() => setMonthOffset((o) => o + 1)} disabled={monthOffset >= 0} title="ماه بعد"><ChevronLeft size={18} /></button>}
            {(range || monthOffset !== 0) && <button type="button" className="pr-chip-btn" onClick={() => { setRange(null); setMonthOffset(0); }}>ماه جاری</button>}
            <DatePicker
              range
              calendar={persian}
              locale={persian_fa}
              className="bg-dark"
              // The hero card clips its overflow (rounded glow background), so the calendar is rendered into
              // <body> and stacked above everything; otherwise it opened half-hidden under the KPI cards.
              portal
              zIndex={10000}
              calendarPosition="bottom-left"
              value={range ? [fromKey(range.start), fromKey(range.end)] : []}
              onChange={(v) => { if (Array.isArray(v) && v.length === 2) setRange({ start: keyOf(v[0]), end: keyOf(v[1]) }); }}
              render={(value, openCalendar) => (
                <button type="button" className={`pr-chip-btn ${range ? 'on' : ''}`} onClick={openCalendar}><CalendarRange size={15} /> بازه دلخواه</button>
              )}
            />
          </div>
          <button type="button" className="pr-icon-btn" onClick={load} disabled={loading} title="بروزرسانی"><RefreshCw size={17} className={loading ? 'pr-spin' : ''} /></button>
          <button type="button" className="pr-export-btn" onClick={exportExcel} disabled={!data}><Download size={16} /> دانلود شیت پرداخت</button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="pr-kpis">
        <div className="pr-kpi pr-kpi-owed">
          <span className="pr-kpi-label"><Banknote size={15} /> مانده قابل پرداخت</span>
          <b>{tomanShort(kpi.unpaid)}<small> تومان</small></b>
          <span className="pr-kpi-sub">{fa(kpi.unpaidDays)} روز کاری پرداخت‌نشده{kpi.noRate ? ` · ${fa(kpi.noRate)} روز بدون نرخ` : ''}</span>
        </div>
        <div className="pr-kpi pr-kpi-paid">
          <span className="pr-kpi-label"><CheckCircle2 size={15} /> پرداخت‌شده</span>
          <b>{tomanShort(kpi.paid)}<small> تومان</small></b>
          <span className="pr-kpi-sub">{fa(kpi.paidDays)} روز · {kpi.total ? fa(Math.round((kpi.paid / kpi.total) * 100)) : '۰'}٪ تسویه</span>
          <span className="pr-kpi-bar"><i style={{ width: `${kpi.total ? (kpi.paid / kpi.total) * 100 : 0}%` }} /></span>
        </div>
        <div className="pr-kpi">
          <span className="pr-kpi-label"><CalendarDays size={15} /> روز کاری تاییدشده</span>
          <b>{fa(kpi.days)}</b>
          <span className="pr-kpi-sub">{fa(kpi.people)} نفر · جمع {tomanShort(kpi.total)} تومان</span>
        </div>
        <button type="button" className={`pr-kpi pr-kpi-pending ${filters.status === 'pending' ? 'on' : ''}`} onClick={() => setF({ status: filters.status === 'pending' ? 'all' : 'pending' })}>
          <span className="pr-kpi-label"><Hourglass size={15} /> در انتظار تایید</span>
          <b>{fa(kpi.pending)}</b>
          <span className="pr-kpi-sub">روز با گزارش که هنوز تایید نشده</span>
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="pr-filters">
        <label className="pr-search">
          <Search size={16} />
          <input value={filters.q} onChange={(e) => setF({ q: e.target.value })} placeholder="جستجوی نام، موبایل یا ایونت..." />
          {filters.q && <button type="button" onClick={() => setF({ q: '' })}><X size={14} /></button>}
        </label>
        <select value={filters.client} onChange={(e) => setF({ client: e.target.value, event: '' })}>
          <option value="">همه کلاینت‌ها</option>
          {clients.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filters.event} onChange={(e) => setF({ event: e.target.value })}>
          <option value="">همه ایونت‌ها</option>
          {eventsInData.filter((e) => !filters.client || e.client_name === filters.client).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <div className="pr-seg">
          <button type="button" className={!filters.role ? 'on' : ''} onClick={() => setF({ role: '' })}>همه نقش‌ها</button>
          {ROLES.map((r) => (
            <button type="button" key={r.key} className={filters.role === r.key ? 'on' : ''} onClick={() => setF({ role: filters.role === r.key ? '' : r.key })}>
              <i style={{ background: r.color }} />{r.label}
            </button>
          ))}
        </div>
        <div className="pr-seg">
          {STATUSES.map((s) => <button type="button" key={s.key} className={filters.status === s.key ? 'on' : ''} onClick={() => setF({ status: s.key })}>{s.label}</button>)}
        </div>
        {filterCount > 0 && <button type="button" className="pr-chip-btn" onClick={() => setFilters({ q: '', event: '', client: '', role: '', status: 'all' })}><X size={14} /> پاک کردن فیلترها ({fa(filterCount)})</button>}
      </div>

      {/* ── Views ── */}
      <div className="pr-views" role="tablist">
        {VIEWS.map(({ key, label, Icon }) => (
          <button type="button" role="tab" key={key} aria-selected={view === key} className={view === key ? 'on' : ''} onClick={() => setView(key)}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="pr-loading"><RefreshCw size={22} className="pr-spin" /> در حال بارگذاری...</div>
      ) : (
        <div className="pr-view">
          {view === 'people' && (
            <PeopleView token={token} workdays={workdays} pending={pending} selected={selected} onToggle={toggle}
              onPatch={patchRows} onApprovePending={approvePending} onUnapprove={unapprove}
              onPayPerson={(ids) => { setSelected(new Set(ids)); setPayOpen(true); }} />
          )}
          {view === 'calendar' && (
            <CalendarView days={range ? daysBetween(range.start, range.end) : month.days} monthMode={!range} month={month}
              workdays={workdays} pending={pending} selected={selected} onToggle={toggle} />
          )}
          {view === 'charts' && <ChartsView days={range ? daysBetween(range.start, range.end) : month.days} workdays={workdays} pending={pending} />}
          {view === 'payments' && <PaymentsView token={token} payments={data.payments} workdays={data.workdays} onChanged={load} />}
          {view === 'rates' && <RatesView token={token} rates={data.rates} events={data.events} workdays={data.workdays} pending={data.pending} onSaved={(rates) => setData((d) => ({ ...d, rates }))} />}
        </div>
      )}

      {/* ── Selection bar ── */}
      {selectedRows.length > 0 && (
        <div className="pr-selbar">
          <div className="pr-selbar-info">
            <b>{fa(selectedRows.length)}</b> روز از <b>{fa(selPeople)}</b> نفر انتخاب شده
            <span className="pr-selbar-sum">{toman(selTotal)}</span>
          </div>
          <div className="pr-selbar-rate">
            <input inputMode="numeric" value={groupDigits(parseAmount(bulkRate))} onChange={(e) => setBulkRate(e.target.value)} placeholder="دستمزد روزانه (تومان)" />
            <button type="button" className="pr-chip-btn" onClick={applyBulkRate}>اعمال نرخ</button>
          </div>
          <button type="button" className="pr-pay-btn" onClick={() => setPayOpen(true)}><Banknote size={17} /> ثبت پرداخت</button>
          <button type="button" className="pr-icon-btn" onClick={() => setSelected(new Set())} title="لغو انتخاب"><X size={17} /></button>
        </div>
      )}

      {payOpen && selectedRows.length > 0 && (
        <PayDialog token={token} rows={selectedRows} onClose={() => setPayOpen(false)}
          onDone={() => { setPayOpen(false); setSelected(new Set()); load(); }} />
      )}
    </div>
  );
}
