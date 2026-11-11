import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  ComposedChart, Bar, Line, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { DateObject } from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import { parseDailyRoles, roleLabel } from '../../utils/roleHelpers';
import { TehranClock } from '../../components/TehranClock';
import './dashboard.css';

/* ── Icon set ── */
const ICONS = {
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>,
  clipboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 3.75h6M10.5 3.75h3a1.5 1.5 0 011.5 1.5v.75H9v-.75a1.5 1.5 0 011.5-1.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6h10.5a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5v-12a1.5 1.5 0 011.5-1.5z" /></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
  chartBar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  currency: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  camera: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.174C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>,
  pin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 4.556-3.94 8.25-8.5 9.75l-.5.166-.5-.166C6.94 20.25 3 16.556 3 12V5.443a1.5 1.5 0 01.947-1.393l7.5-3a1.5 1.5 0 011.106 0l7.5 3A1.5 1.5 0 0121 5.443V12z" /></svg>,
  archiveBox: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>,
  wrench: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" /></svg>,
  cube: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>,
};

/* ── Custom Tooltip ── */
const CustomTooltip = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;
  const displayLabel = payload[0]?.payload?.fullDay || label;
  return (
    <div className="db-tooltip">
      {displayLabel && <p className="db-tooltip-label">{displayLabel}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name}: <strong>{formatter ? formatter(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

/* ── Trend badge (this week vs last week) ── */
function TrendBadge({ pct }) {
  if (!Number.isFinite(pct) || pct === 0) return null;
  const up = pct > 0;
  return (
    <span className={`db-trend-badge ${up ? 'up' : 'down'}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {up ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
      {Math.abs(pct)}٪ نسبت به هفته قبل
    </span>
  );
}

/* ── Unified Team card: online presence, position, check-in status/delay & report count ── */
const STATUS_COLOR = { late: '#ef4444', 'on-time': '#10b981', missing: '#4b5563' };

function TeamCard({ members }) {
  if (members.length === 0) return <div className="db-empty">پروموتری ثبت نشده</div>;
  return (
    <div className="db-team-list">
      {members.map(m => (
        <div key={m.id} className="db-team-row" style={{ borderColor: `${STATUS_COLOR[m.status] || STATUS_COLOR.missing}4d` }}>
          <div className="db-online-ava">
            {m.avatar ? <img src={m.avatar} alt="" /> : (m.name || '؟')[0]}
            <span className={`db-dot ${m.onlineStatus}`} />
          </div>
          <div className="db-team-info">
            <div className="db-team-top">
              <span className="db-team-name">{m.name}</span>
              <span className="db-team-role">{roleLabel(m.role)}</span>
            </div>
            <div className="db-team-bottom">
              <span className="db-team-status" style={{ color: STATUS_COLOR[m.status] || STATUS_COLOR.missing }}>{m.message}</span>
              {m.timeStr && m.timeStr !== '—' && <span className="db-team-time">ورود {m.timeStr}</span>}
              {m.checkoutTimeStr && <span className="db-team-time">🏁 {m.checkoutTimeStr}</span>}
            </div>
          </div>
          {m.progressTotal > 0 && (
            <div className="db-team-progress" title={`${m.progressDone}/${m.progressTotal} کار امروز انجام شده`}>
              <div className="db-team-progress-track">
                <div
                  className={`db-team-progress-fill${m.progressPct >= 100 ? ' complete' : ''}`}
                  style={{ width: `${m.progressPct}%` }}
                />
              </div>
              <span className="db-team-progress-pct">{m.progressPct}٪</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Team, day by day: who works each day, check-in / lateness and how much of the day's report they filled in ── */
const DAY_STATUS = {
  late: { color: '#ef4444', label: 'تاخیر' },
  'on-time': { color: '#10b981', label: 'به موقع' },
  reported: { color: '#10b981', label: 'گزارش' },
  waiting: { color: '#f59e0b', label: 'هنوز نیامده' },
  absent: { color: '#ef4444', label: 'غایب' },
  scheduled: { color: '#64748b', label: 'برنامه‌ریزی' },
};
const PHASE_LABEL = { past: 'گذشته', today: 'امروز', future: 'پیش رو' };
const fa = (n) => Number(n || 0).toLocaleString('fa-IR');

function DailyTeamCard({ days }) {
  const startOpen = () => {
    const real = days.filter(d => d.dayNum != null);
    if (!real.length) return new Set();
    const today = real.find(d => d.phase === 'today');
    if (today) return new Set([today.raw]);
    const next = real.find(d => d.phase === 'future');
    if (next && !real.some(d => d.phase === 'past')) return new Set([next.raw]);
    return new Set([real[real.length - 1].raw]);
  };
  const [open, setOpen] = useState(startOpen);
  const allOpen = open.size === days.length;
  const toggle = (raw) => setOpen(prev => { const n = new Set(prev); if (n.has(raw)) n.delete(raw); else n.add(raw); return n; });
  const now = Date.now();
  return (
    <div className="db-days">
      <div className="db-days-tools">
        <button type="button" className="db-days-btn" onClick={() => setOpen(allOpen ? new Set() : new Set(days.map(d => d.raw)))}>{allOpen ? 'بستن همه‌ی روزها' : 'باز کردن همه‌ی روزها'}</button>
      </div>
      {days.map(day => {
        const isOpen = open.has(day.raw);
        const s = day.summary;
        return (
          <section key={day.raw} className={`db-day ${day.phase}`}>
            <button type="button" className="db-day-head" onClick={() => toggle(day.raw)} aria-expanded={isOpen}>
              <span className="db-day-title">
                {day.dayNum != null && <b>روز {fa(day.dayNum)}</b>}
                <span>{day.weekday ? `${day.weekday} ` : ''}{day.label}</span>
                {day.dayNum != null && <i className={`db-day-phase ${day.phase}`}>{PHASE_LABEL[day.phase]}</i>}
              </span>
              <span className="db-day-stats">
                <span className="db-day-chip">{fa(s.total)} نفر</span>
                {day.phase !== 'future' && s.total > 0 && <>
                  <span className="db-day-chip good">حاضر {fa(s.present)}</span>
                  {s.late > 0 && <span className="db-day-chip bad">تاخیر {fa(s.late)}</span>}
                  {s.absent > 0 && <span className="db-day-chip bad">غایب {fa(s.absent)}</span>}
                  {s.avgPct != null && <span className="db-day-chip pct" title="میانگین درصد تکمیل گزارش همه‌ی افراد این روز (کسی که نیامده ۰ حساب می‌شود)">گزارش {fa(s.avgPct)}٪</span>}
                </>}
                <svg className={`db-day-chev ${isOpen ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
              </span>
            </button>
            {isOpen && (
              day.members.length === 0 ? <div className="db-empty">برای این روز پروموتری ثبت نشده</div> : (
                <div className="db-team-list">
                  {day.members.map(m => {
                    const st = DAY_STATUS[m.status] || DAY_STATUS.scheduled;
                    const seen = m.lastSeen ? new Date(m.lastSeen.endsWith('Z') ? m.lastSeen : `${m.lastSeen}Z`).getTime() : 0;
                    const online = day.phase === 'today' && seen ? (seen > now - 5 * 60 * 1000 ? 'online' : seen > now - 30 * 60 * 1000 ? 'away' : 'offline') : null;
                    return (
                      <div key={m.id} className="db-team-row" style={{ borderColor: `${st.color}4d` }}>
                        <div className="db-online-ava">
                          {m.avatar ? <img src={m.avatar} alt="" /> : (m.name || '؟')[0]}
                          {online && <span className={`db-dot ${online}`} />}
                        </div>
                        <div className="db-team-info">
                          <div className="db-team-top">
                            <span className="db-team-name">{m.name}</span>
                            <span className="db-team-role">{roleLabel(m.role)}</span>
                          </div>
                          <div className="db-team-bottom">
                            <span className="db-team-status" style={{ color: st.color }}>{m.message}</span>
                            {m.timeStr && <span className="db-team-time">ورود {m.timeStr}</span>}
                            {m.checkoutTimeStr && <span className="db-team-time">🏁 {m.checkoutTimeStr}</span>}
                          </div>
                        </div>
                        {m.pct != null && m.total > 0 && (
                          <div className="db-team-progress" title={m.missing.length ? `${fa(m.done)}/${fa(m.total)} — مانده: ${m.missing.join('، ')}` : `${fa(m.done)}/${fa(m.total)} کار انجام شده`}>
                            <div className="db-team-progress-track">
                              <div className={`db-team-progress-fill${m.pct >= 100 ? ' complete' : ''}`} style={{ width: `${m.pct}%` }} />
                            </div>
                            <span className="db-team-progress-pct">{fa(m.pct)}٪</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ── KPI Card ── */
function KpiCard({ icon, label, value, sub, color }) {
  return (
    <div className="db-kpi" style={{ '--accent': color }}>
      <div className="db-kpi-glow" />
      <div className="db-kpi-icon-badge" style={{ background: `${color}1f`, color }}>{icon}</div>
      <div className="db-kpi-body">
        <span className="db-kpi-val">{value}</span>
        <span className="db-kpi-label">{label}</span>
        {sub && <span className="db-kpi-sub">{sub}</span>}
      </div>
      <div className="db-kpi-accent" style={{ background: color }} />
    </div>
  );
}

/* ── Per-event field insight cards ── */
function DistributionCard({ insight }) {
  const total = insight.data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="db-card db-insight-card">
      <div className="db-card-header">
        <h3 className="db-card-title">{insight.field.label}</h3>
        <span className="db-badge">{total} پاسخ</span>
      </div>
      <div className="db-bar-list">
        {insight.data.slice(0, 6).map((d, i) => (
          <div key={i} className="db-bar-list-row">
            <div className="db-bar-list-top">
              <span className="db-bar-list-name">{d.name}</span>
              <span className="db-bar-list-val">{d.value} ({Math.round((d.value / total) * 100)}%)</span>
            </div>
            <div className="db-bar-list-track">
              <div className="db-bar-list-fill" style={{ width: `${(d.value / total) * 100}%`, background: d.fill }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RatingCard({ insight }) {
  const rounded = Math.round(insight.avg);
  return (
    <div className="db-card db-insight-card">
      <div className="db-card-header">
        <h3 className="db-card-title">{insight.field.label}</h3>
        <span className="db-badge">{insight.count} امتیاز</span>
      </div>
      <div className="db-rating-display">
        <span className="db-rating-num">{insight.avg.toFixed(1)}</span>
        <div className="db-rating-stars">
          {[1, 2, 3, 4, 5].map(n => (
            <span key={n} className={n <= rounded ? 'filled' : ''}>★</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function BooleanCard({ insight }) {
  const yesPct = Math.round((insight.yes / insight.total) * 100);
  return (
    <div className="db-card db-insight-card">
      <div className="db-card-header">
        <h3 className="db-card-title">{insight.field.label}</h3>
        <span className="db-badge">{insight.total} پاسخ</span>
      </div>
      <div className="db-bool-track">
        <div className="db-bool-fill" style={{ width: `${yesPct}%` }} />
      </div>
      <div className="db-bool-labels">
        <span className="yes">✔️ بله — {insight.yes} ({yesPct}%)</span>
        <span className="no">✕ خیر — {insight.no}</span>
      </div>
    </div>
  );
}

function StatInsightCard({ icon, title, value, sub, color }) {
  return (
    <div className="db-card db-insight-card db-stat-card">
      <div className="db-stat-icon" style={{ background: `${color}1f`, color }}>{icon}</div>
      <div className="db-stat-text">
        <span className="db-stat-value">{value}</span>
        <span className="db-stat-title">{title}</span>
        {sub && <span className="db-stat-sub">{sub}</span>}
      </div>
    </div>
  );
}

/* ── Main Component ── */
export const DashboardTab = ({
  stats, weeklyData, weeklyTrend,
  formatAmount, analytics, users, selectedEvent,
  amountField, fieldInsights = [], promoterDelays = [], dailyTeam = [],
}) => {


  // Admins are never promoters in the field — exclude them from every
  // online/roster computation below so they can't inflate the live count.
  const nonAdminUsers = useMemo(() => users.filter(u => !u.is_admin), [users]);

  const onlineCount = useMemo(() => {
    const thr = Date.now() - 5 * 60 * 1000;
    return nonAdminUsers.filter(u => {
      if (!u.last_seen) return false;
      const utcStr = u.last_seen.endsWith('Z') ? u.last_seen : u.last_seen + 'Z';
      return new Date(utcStr).getTime() > thr;
    }).length;
  }, [nonAdminUsers]);

  // Same raw day list PromotersTab uses to match against assigned_dates —
  // deliberately not the richer `eventDays` below (Persian-parsed, for the
  // chart), just the plain split/trim of the event's own date string.
  const eventDaysList = useMemo(() => {
    if (!selectedEvent?.start_date) return [];
    return selectedEvent.start_date.split(',').map(s => s.trim()).filter(Boolean);
  }, [selectedEvent?.start_date]);

  // Headcount per role, counted per assigned SHIFT (one promoter working 3
  // days of the event fills 3 of the "promoter_count" target slots, not 1) —
  // promoter_count/etc. on the event represent total promoter-days needed,
  // not distinct headcount, so this intentionally counts once per assigned date.
  // A promoter added WITHOUT explicit per-day checkboxes (empty assigned_dates
  // — "here for the whole event") counts once per event day, matching how
  // PromotersTab's day-grouped list already treats them, instead of just once
  // total regardless of how many days the event actually spans.
  const roleCounts = useMemo(() => {
    const counts = { promoter: 0, supervisor: 0, setup: 0, collection: 0, transport: 0 };
    const bump = (r) => { if (r in counts) counts[r]++; };
    nonAdminUsers.forEach(u => {
      const dailyRoles = parseDailyRoles(u.daily_roles);
      const dates = (u.assigned_dates || '').split(',').map(x => x.trim()).filter(Boolean);
      if (dates.length === 0) {
        const r = u.role || 'promoter';
        const shiftCount = eventDaysList.length > 0 ? eventDaysList.length : 1;
        for (let i = 0; i < shiftCount; i++) bump(r);
      } else {
        dates.forEach(d => {
          let matchedRole = null;
          for (const k in dailyRoles) {
            if (k.trim() === d) { matchedRole = dailyRoles[k]; break; }
          }
          bump(matchedRole || u.role || 'promoter');
        });
      }
    });
    return counts;
  }, [nonAdminUsers, eventDaysList]);

  // Needed headcount per role, set when the event was created
  const promoterNeeded = selectedEvent?.promoter_count ?? selectedEvent?.promoters_needed ?? 0;
  const supervisorNeeded = selectedEvent?.supervisor_count ?? 0;
  const setupNeeded = selectedEvent?.setup_count ?? 0;
  const collectionNeeded = selectedEvent?.collection_count ?? 0;

  // Unified team roster: joins promoterDelays (check-in status/delay + report
  // count, computed server-side from real submissions) with each user's live
  // presence and avatar, keyed by id — not name, so duplicate names never collide.
  const teamMembers = useMemo(() => {
    const userById = Object.fromEntries(nonAdminUsers.map(u => [u.id, u]));
    const thr = Date.now() - 5 * 60 * 1000;
    const awayThr = Date.now() - 30 * 60 * 1000;
    return promoterDelays.map(d => {
      const u = userById[d.id];
      let onlineStatus = 'offline';
      if (u?.last_seen) {
        const utcStr = u.last_seen.endsWith('Z') ? u.last_seen : u.last_seen + 'Z';
        const seenMs = new Date(utcStr).getTime();
        onlineStatus = seenMs > thr ? 'online' : seenMs > awayThr ? 'away' : 'offline';
      }
      return { ...d, avatar: u?.profile_picture || null, onlineStatus };
    });
  }, [promoterDelays, nonAdminUsers]);

  const clientName = (selectedEvent?.client_name || '').toLowerCase();
  const hasBvtSampling = !!selectedEvent?.fields?.some(f => f.type === 'bvt_sampling_report');
  const samplingLabel = (clientName === 'bvt' || hasBvtSampling) ?'تعداد کل سیگار های سمپل شده' : 'تعداد سمپلینگ محصولات';

  // BVT cigarette-match events log each handout as a "distribution" rather than
  // a sampling counter — show those alongside (or instead of) sampled counts.
  const hasBvtMatch = !!stats.hasBvtMatch;
  const hasSamplingField = !!selectedEvent?.fields?.some(f => ['sampling_counter', 'bvt_sampling_report'].includes(f.type));
  const showSampling = hasSamplingField || !hasBvtMatch;
  const distributionLabel = 'تعداد توزیع';
  const dist = stats.bvtDistribution || { total: 0, accepted: 0, rejected: 0, todayTotal: 0 };

  const chartData = useMemo(() => weeklyData.map(d => ({
    day: d.day,
    fullDay: d.fullDay,
    ...(showSampling ? { [samplingLabel]: d.sampled || 0 } : {}),
    ...(hasBvtMatch ? { [distributionLabel]: d.distributed || 0 } : {}),
  })), [weeklyData, samplingLabel, showSampling, hasBvtMatch]);

  // Reference line follows the chart's primary series.
  const primaryKey = showSampling ? samplingLabel : distributionLabel;

  const avgDailySampled = useMemo(() => {
    if (!chartData.length) return 0;
    return Math.round(chartData.reduce((s, d) => s + (d[primaryKey] || 0), 0) / chartData.length);
  }, [chartData, primaryKey]);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const eventDays = useMemo(() => {
    if (!selectedEvent?.start_date) return [];
    const persianToEnglish = s => s.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    return selectedEvent.start_date.split(',').map(s => s.trim()).filter(Boolean).map(dateStr => {
      try {
        const engDateStr = persianToEnglish(dateStr);
        const dateObj = new DateObject({ date: engDateStr, format: "YYYY/MM/DD", calendar: persian, locale: persian_fa });
        if (dateObj.isValid) {
          return {
            iso: dateObj.format("YYYY-MM-DD"),
            dayNumber: dateObj.format("DD"),
            monthName: dateObj.format("MMMM"),
            weekday: dateObj.format("dddd"),
            dateObj,
          };
        }
      } catch (e) { }
      return null;
    }).filter(Boolean).sort((a, b) => a.dateObj.valueOf() - b.dateObj.valueOf());
  }, [selectedEvent?.start_date]);

  const todayObj = new DateObject({ calendar: persian });

  const getCountdown = (targetTimeStr) => {
    if (!targetTimeStr) return null;
    const [h, m] = targetTimeStr.split(':').map(Number);
    const target = new Date();
    target.setHours(h, m, 0, 0);
    const diff = target - currentTime;
    if (diff <= 0) return null;

    const hrs = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const mins = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const secs = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  return (
    <div className="db-root">

      {/* ── Page Header ── */}
      <div className="db-page-header" style={{ marginBottom: eventDays.length ? '1rem' : '1.5rem' }}>
        <div className="db-page-header-left">
          <h1 className="db-page-title">
            داشبورد
          </h1>
          <p className="db-page-sub">نمای کلی عملکرد ایونت در لحظه</p>
        </div>
        <div className="db-page-header-right">
          <TehranClock />
          {selectedEvent?.location && (
            <div className="db-location-pill" title={selectedEvent.location}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span className="db-location-text">{selectedEvent.location}</span>
            </div>
          )}
          <div className="db-live-pill">
            <span className="db-live-dot" />
            <span>{onlineCount} نفر آنلاین</span>
          </div>
          <a href={`https://promoter.thevuteam.com/${selectedEvent?.slug}`} target="_blank" rel="noopener noreferrer" className="db-slug-pill" style={{ textDecoration: 'none', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(99,102,241,0.2)'} onMouseOut={(e) => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'} title="مشاهده صفحه پروموتر">
            {selectedEvent?.slug}
          </a>
        </div>
      </div>

      {/* ── Event Timeline Progress ── */}
      {eventDays.length > 0 && (() => {
        const passedCount = eventDays.filter(d => {
          const isToday = d.dateObj.year === todayObj.year && d.dateObj.month.number === todayObj.month.number && d.dateObj.day === todayObj.day;
          return !isToday && d.dateObj.toDate().getTime() < Date.now();
        }).length;
        const pct = Math.round((passedCount / eventDays.length) * 100);

        return (
          <div className="db-card">
            <div className="db-card-header">
              <div>
                <h3 className="db-card-title">تقویم اجرایی ایونت</h3>
                <p className="db-card-desc">
                  {passedCount} روز گذشته از {eventDays.length} روز
                  {selectedEvent?.custom_times && Object.keys(selectedEvent.custom_times).length > 0
                    ? ' — ساعات کاری متفاوت'
                    : selectedEvent?.start_time
                      ? ` — ساعت کاری: ${selectedEvent.start_time} تا ${selectedEvent.end_time || '—'}`
                      : ''}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="db-card-stat-pill">
                  <span>{pct}%</span> پیشرفت
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ height: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', marginBottom: '1.25rem', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                borderRadius: '4px',
                transition: 'width 0.6s ease'
              }} />
            </div>

            {/* Day cards grid */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(120px, 1fr))`, gap: '10px' }}>
              {eventDays.map((d, i) => {
                const isToday = d.dateObj.year === todayObj.year && d.dateObj.month.number === todayObj.month.number && d.dateObj.day === todayObj.day;
                const isPast = !isToday && d.dateObj.toDate().getTime() < Date.now();

                let statusText = 'در انتظار';
                let accentColor = '#475569';
                let countdown = null;

                // Lookup custom times for this day securely regardless of digits
                const formatEng = (str) => String(str).replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c));

                let dayStartTime = selectedEvent?.start_time;
                let dayEndTime = selectedEvent?.end_time;

                if (selectedEvent?.custom_times) {
                  const targetDateEng = formatEng(d.dateObj.format("YYYY/MM/DD"));
                  const matchedKey = Object.keys(selectedEvent.custom_times).find(k => formatEng(k) === targetDateEng);
                  if (matchedKey) {
                    dayStartTime = selectedEvent.custom_times[matchedKey].start || dayStartTime;
                    dayEndTime = selectedEvent.custom_times[matchedKey].end || dayEndTime;
                  }
                }

                if (isPast) {
                  statusText = 'تمام شد';
                  accentColor = '#10b981';
                } else if (isToday) {
                  accentColor = '#6366f1';
                  const startCd = getCountdown(dayStartTime);
                  const endCd = getCountdown(dayEndTime);
                  if (startCd) { statusText = 'تا شروع'; countdown = startCd; }
                  else if (endCd) { statusText = 'تا پایان'; countdown = endCd; }
                  else { statusText = 'امروز'; accentColor = '#10b981'; }
                }

                return (
                  <div
                    key={i}
                    style={{
                      position: 'relative',
                      borderRadius: '14px',
                      padding: '14px 12px',
                      background: isPast
                        ? 'rgba(16,185,129,0.06)'
                        : isToday
                          ? 'rgba(99,102,241,0.08)'
                          : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isPast ? 'rgba(16,185,129,0.15)' : isToday ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      overflow: 'hidden',
                      transition: 'all 0.2s',
                      boxShadow: isToday ? '0 0 20px rgba(99,102,241,0.12)' : 'none',
                    }}
                  >
                    {/* top accent bar */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                      background: accentColor,
                      opacity: isPast ? 0.5 : 1,
                    }} />

                    {/* Day number badge */}
                    <span style={{
                      fontSize: '10px', fontWeight: 700,
                      color: 'rgba(255,255,255,0.3)',
                      background: 'rgba(255,255,255,0.06)',
                      padding: '1px 6px', borderRadius: '6px',
                      marginTop: '4px',
                    }}>روز {i + 1}</span>

                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.5px' }}>{d.weekday}</span>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                      <span style={{ fontSize: '28px', fontWeight: 900, lineHeight: 1, color: isPast ? '#94a3b8' : isToday ? '#f1f5f9' : '#64748b' }}>{d.dayNumber}</span>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: isPast ? '#64748b' : isToday ? '#c7d2fe' : '#475569' }}>{d.monthName}</span>

                    <span style={{
                      fontSize: '10px', fontWeight: 800,
                      color: accentColor,
                      background: `${accentColor}18`,
                      border: `1px solid ${accentColor}30`,
                      padding: '2px 8px', borderRadius: '10px',
                      marginTop: '2px',
                    }}>{statusText}</span>

                    {isToday && countdown && (
                      <span style={{
                        fontSize: '13px', fontWeight: 900,
                        // Red = waiting to start, Green = event in progress
                        color: statusText === 'تا شروع' ? '#f43f5e' : '#10b981',
                        background: statusText === 'تا شروع'
                          ? 'rgba(244,63,94,0.1)'
                          : 'rgba(16,185,129,0.1)',
                        border: `1px solid ${statusText === 'تا شروع' ? 'rgba(244,63,94,0.25)' : 'rgba(16,185,129,0.25)'}`,
                        borderRadius: '8px',
                        padding: '3px 8px',
                        letterSpacing: '2px',
                        fontFamily: 'monospace',
                      }} dir="ltr">{countdown}</span>
                    )}

                    {isPast && (
                      <span style={{ fontSize: '16px', marginTop: '2px' }}>✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── KPI Strip: 5 columns — crew headcount per role + product stock ── */}
      <div className={`db-kpi-strip${hasBvtMatch ? ' db-kpi-strip--6' : ''}`}>
        <KpiCard
          icon={ICONS.users}
          label="پروموتر"
          value={promoterNeeded > 0 ? `${roleCounts.promoter}/${promoterNeeded}` : roleCounts.promoter}
          sub={`${onlineCount} آنلاین`}
          color="#6366f1"
        />
        <KpiCard
          icon={ICONS.shield}
          label="کاپیتان"
          value={supervisorNeeded > 0 ? `${roleCounts.supervisor}/${supervisorNeeded}` : roleCounts.supervisor}
          sub="نیروی نظارت"
          color="#818cf8"
        />
        <KpiCard
          icon={ICONS.archiveBox}
          label="کالکشن"
          value={collectionNeeded > 0 ? `${roleCounts.collection}/${collectionNeeded}` : roleCounts.collection}
          sub="نیروی کالکشن"
          color="#38bdf8"
        />
        <KpiCard
          icon={ICONS.wrench}
          label="ست‌آپ"
          value={setupNeeded > 0 ? `${roleCounts.setup}/${setupNeeded}` : roleCounts.setup}
          sub="نیروی ست‌آپ"
          color="#a78bfa"
        />
        <KpiCard
          icon={ICONS.cube}
          label="کل محصولات"
          value={stats.samplingTarget > 0 ? `${stats.totalSampled.toLocaleString('fa-IR')}/${stats.samplingTarget.toLocaleString('fa-IR')}` : stats.totalSampled.toLocaleString('fa-IR')}
          sub={stats.samplingTarget > 0 ? `باقیمانده: ${Math.max(0, stats.samplingTarget - stats.totalSampled).toLocaleString('fa-IR')}` : 'هدفی تعیین نشده'}
          color="#06b6d4"
        />
        {hasBvtMatch && (
          <KpiCard
            icon={ICONS.chartBar}
            label="توزیع‌ها"
            value={dist.total.toLocaleString('fa-IR')}
            sub={`${dist.accepted.toLocaleString('fa-IR')} پذیرفته · ${dist.rejected.toLocaleString('fa-IR')} رد شده`}
            color="#f59e0b"
          />
        )}
      </div>

      {/* ── Row 1: Weekly Performance + Top Promoters ── */}
      <div className="db-row db-row-7-3">

        {/* Weekly Performance */}
        <div className="db-card db-area-card">
          <div className="db-card-header">
            <div>
              <h3 className="db-card-title">{showSampling ? 'آمار سمپلینگ روزانه' : 'آمار توزیع روزانه'}</h3>
              <p className="db-card-desc">
                {[showSampling && samplingLabel, hasBvtMatch && distributionLabel].filter(Boolean).join(' و ')} به تفکیک روزهای ایونت
              </p>
            </div>
            <div className="db-card-header-meta">
              {showSampling && (
                <div className="db-card-stat-pill">
                  <span>{stats.totalSampled?.toLocaleString('fa-IR') || 0}</span> کل سمپل
                </div>
              )}
              {hasBvtMatch && (
                <div className="db-card-stat-pill">
                  <span>{dist.total.toLocaleString('fa-IR')}</span> کل توزیع
                </div>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barCategoryGap="28%">
              <defs>
                <linearGradient id="gradReportBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="gradDistBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              {avgDailySampled > 0 && (
                <ReferenceLine yAxisId="left" y={avgDailySampled} stroke="#475569" strokeDasharray="4 4" />
              )}
              {showSampling && (
                <Bar yAxisId="left" dataKey={samplingLabel} name={samplingLabel} fill="url(#gradReportBar)" radius={[8, 8, 0, 0]} maxBarSize={34} />
              )}
              {hasBvtMatch && (
                <Bar yAxisId="left" dataKey={distributionLabel} name={distributionLabel} fill="url(#gradDistBar)" radius={[8, 8, 0, 0]} maxBarSize={34} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <div className="db-chart-legend">
            {showSampling && <span><i style={{ background: '#6366f1' }} />{samplingLabel}</span>}
            {hasBvtMatch && <span><i style={{ background: '#f59e0b' }} />{distributionLabel}</span>}
            <span><i style={{ background: '#475569' }} />میانگین روزانه</span>
          </div>
        </div>

        {/* Team: presence, position, check-in status/delay & report count in one place */}
        <div className="db-card db-team-card">
          <div className="db-card-header">
            <h3 className="db-card-title">👥 تیم{dailyTeam.length > 0 ? ' — روز به روز' : ''}</h3>
            <span className="db-badge">{dailyTeam.length > 0 ? new Set(dailyTeam.flatMap(d => d.members.map(m => m.id))).size : teamMembers.length} نفر</span>
          </div>
          {dailyTeam.length > 0 ? <DailyTeamCard key={selectedEvent?.id} days={dailyTeam} /> : <TeamCard members={teamMembers} />}
        </div>

      </div>

      {/* ── Field Insights ── */}
      {fieldInsights.length > 0 && (
        <div className="db-section">
          <h2 className="db-section-title">تحلیل اختصاصی این ایونت</h2>
          <div className="db-insights-grid">
            {fieldInsights.map(ins => {
              if (ins.kind === 'distribution') return <DistributionCard key={ins.key} insight={ins} />;
              if (ins.kind === 'rating') return <RatingCard key={ins.key} insight={ins} />;
              if (ins.kind === 'boolean') return <BooleanCard key={ins.key} insight={ins} />;
              if (ins.kind === 'photos') return (
                <StatInsightCard key={ins.key} icon={ICONS.camera} title={ins.field.label}
                  value={`${ins.total.toLocaleString('fa-IR')} عکس`} sub="مجموع تصاویر ثبتشده" color="#06b6d4" />
              );
              if (ins.kind === 'location') return (
                <StatInsightCard key={ins.key} icon={ICONS.pin} title={ins.field.label}
                  value={`${ins.pct}%`} sub={`${ins.count} گزارش دارای موقعیت مکانی`} color="#f43f5e" />
              );
              return null;
            })}
          </div>
        </div>
      )}

    </div>
  );
};
