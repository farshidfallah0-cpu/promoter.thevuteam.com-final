import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  CalendarCheck, CheckCircle2, Circle, MapPin, Navigation, AlertTriangle, X, Clock, Route as RouteIcon, Copy, Loader2, LocateFixed, LocateOff, Store,
} from 'lucide-react';
import { MEHRAM_STORES } from './mehramData';
import {
  dayStart, dayWeekdayName, dayShort, fmtTime, fmtDuration, fmtDistance, fa, buildPersonDay, DAY, weekStart, fmtDay,
} from './mehramVisits';
import { weekVisitMap } from './MehramWeeklyPlan';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const STORE_BY_ID = new Map(MEHRAM_STORES.map((s) => [s.id, s]));
// A leg faster than this between two reports is not a real drive — one of the two fixes is off.
const IMPLAUSIBLE_KMH = 150;

const VERDICT_ICON = { near: LocateFixed, far: Navigation, none: LocateOff, nostore: LocateFixed };
const VERDICT_TONE = { near: 'good', far: 'warn', none: 'bad', nostore: 'muted' };

/**
 * «برنامه و مسیر روزانه»: for one day, each promoter's planned stores next to what they
 * actually reported, in order, with the distance and time between consecutive stores.
 * Positions come from the GPS fix taken with every storefront selfie — nothing extra is sent.
 */
const MehramDaily = ({ token, days, events, eventId, onEventChange, visits, dayPlans, onPlansChanged, onPlan }) => {
  const [day, setDay] = useState(null);
  const [busy, setBusy] = useState('');
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  // The weekly plan of the week this day falls in: stores not visited yet stay listed under each promoter, and turn green once visited.
  const [weekRows, setWeekRows] = useState([]);
  const weekOfDay = day == null ? null : weekStart(day);
  useEffect(() => {
    if (weekOfDay == null) return undefined;
    let live = true;
    axios.get(`${API_URL}/admin/mehram/plans?week=${weekOfDay}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => { if (live) setWeekRows(res.data || []); }).catch(() => { if (live) setWeekRows([]); });
    return () => { live = false; };
  }, [weekOfDay, token, dayPlans]);
  const weekVisits = useMemo(() => (weekOfDay == null ? new Map() : weekVisitMap(visits, weekOfDay)), [visits, weekOfDay]);

  useEffect(() => {
    if (!days.length) return;
    if (day && days.includes(day)) return;
    const today = dayStart(Date.now());
    const active = days.find((d) => dayPlans.some((p) => p.day === d) || visits.some((v) => v.submittedAt >= d && v.submittedAt < d + DAY));
    setDay(days.includes(today) ? today : (active ?? days[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, day]);

  const dayVisits = useMemo(() => (day == null ? [] : visits.filter((v) => v.submittedAt >= day && v.submittedAt < day + DAY)), [visits, day]);
  const dayRows = useMemo(() => dayPlans.filter((p) => p.day === day), [dayPlans, day]);

  const groups = useMemo(() => {
    const m = new Map();
    const get = (key, name) => {
      if (!m.has(key)) m.set(key, { key, name, planned: [], visits: [], weekly: [] });
      return m.get(key);
    };
    dayRows.forEach((p) => get(p.personKey, p.personName).planned.push(p));
    weekRows.forEach((p) => get(p.personKey, p.personName).weekly.push(p));
    dayVisits.forEach((v) => {
      const key = v.personKey || `n:${v.promoterName}`;
      const g = get(key, v.promoterName);
      g.visits.push(v);
    });
    // Someone who only appears in the weekly plan has nothing on this day — don't list them under it.
    return [...m.values()].filter((g) => g.planned.length || g.visits.length).map((g) => ({ ...g, day: buildPersonDay(g.planned, g.visits, STORE_BY_ID) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }, [dayRows, dayVisits, weekRows]);

  const totals = useMemo(() => groups.reduce((t, g) => ({
    planned: t.planned + g.day.plannedCount, done: t.done + g.day.doneCount, visits: t.visits + g.day.stops.length,
    off: t.off + g.day.offPlan, far: t.far + g.day.far, travel: t.travel + g.day.travelM,
  }), { planned: 0, done: 0, visits: 0, off: 0, far: 0, travel: 0 }), [groups]);

  const put = async (body, doneMsg, key) => {
    setBusy(key);
    try {
      await axios.put(`${API_URL}/admin/mehram/day-plans`, body, auth);
      await onPlansChanged();
      if (doneMsg) toast.success(doneMsg);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'خطا در ذخیره‌ی برنامه');
    } finally {
      setBusy('');
    }
  };
  const removeStop = (g, storeId) => put({ days: [day], store_ids: [storeId], person_key: null }, 'از برنامه‌ی این روز حذف شد', `rm${g.key}${storeId}`);
  const copyTo = async (targetDays) => {
    if (!targetDays.length) return;
    setBusy('copy');
    try {
      // PUT assigns one person per call; planned stores keep their order.
      for (const g of groups.filter((x) => x.planned.length)) {
        await axios.put(`${API_URL}/admin/mehram/day-plans`, {
          days: targetDays, store_ids: g.planned.map((p) => p.storeId), person_key: g.key, person_name: g.name,
        }, auth);
      }
      await onPlansChanged();
      toast.success(`برنامه‌ی این روز برای ${fa(targetDays.length)} روز دیگر کپی شد`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'خطا در کپی برنامه');
    } finally {
      setBusy('');
    }
  };

  if (!days.length || day == null) return <div className="mst-empty"><CalendarCheck size={26} /> ایونتی با تاریخ مشخص پیدا نشد. تاریخ‌های ایونت را در تنظیمات ایونت وارد کنید.</div>;

  const plannedByDay = (d) => dayPlans.filter((p) => p.day === d).length;
  const visitedByDay = (d) => visits.filter((v) => v.submittedAt >= d && v.submittedAt < d + DAY).length;
  const nextDay = days[days.indexOf(day) + 1];

  return (
    <div className="mdy">
      {events.length > 0 && (
        <div className="mdy-event">
          <span>ایونت:</span>
          <select value={eventId ?? ''} onChange={(e) => onEventChange(Number(e.target.value))} aria-label="ایونت">
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}{e.archived ? ' (آرشیو)' : ''} — {fa(e.days.length)} روز</option>)}
          </select>
          <small>برنامه‌ها و بازدیدهای ایونت‌های قبلی و آرشیوشده همچنان حفظ می‌شوند.</small>
        </div>
      )}
      <div className="mdy-days" role="tablist" aria-label="روز">
        {days.map((d, i) => (
          <button type="button" key={d} role="tab" aria-selected={d === day} className={d === day ? 'on' : ''} onClick={() => setDay(d)}>
            <em>روز {fa(i + 1)}</em>
            <b>{dayWeekdayName(d)}</b>
            <small>{dayShort(d)}</small>
            <span>
              {plannedByDay(d) > 0 && <i className="plan">{fa(plannedByDay(d))} برنامه</i>}
              {visitedByDay(d) > 0 && <i className="done">{fa(visitedByDay(d))} بازدید</i>}
            </span>
          </button>
        ))}
      </div>

      <div className="mdy-bar">
        <div className="mdy-kpis">
          <span><b>{fa(totals.done)}</b>/{fa(totals.planned)} <small>برنامه انجام شد</small></span>
          <span><b>{fa(totals.visits)}</b> <small>بازدید ثبت‌شده</small></span>
          <span className={totals.off ? 'warn' : ''}><b>{fa(totals.off)}</b> <small>خارج از برنامه</small></span>
          <span className={totals.far ? 'warn' : ''}><b>{fa(totals.far)}</b> <small>دور از فروشگاه</small></span>
          <span><b>{totals.travel ? (totals.travel / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 }) : fa(0)}</b> <small>کیلومتر مسیر</small></span>
        </div>
        <div className="mdy-bar-actions">
          <button type="button" className="mst-btn" onClick={onPlan}><CalendarCheck size={15} /> برنامه‌ریزی روزها</button>
          {nextDay && groups.some((g) => g.planned.length) && (
            <button type="button" className="mst-btn" disabled={busy === 'copy'} onClick={() => copyTo([nextDay])}>
              {busy === 'copy' ? <Loader2 size={15} className="mst-spin" /> : <Copy size={15} />} کپی به {dayWeekdayName(nextDay)}
            </button>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="mst-empty">
          <RouteIcon size={26} /> برای {dayWeekdayName(day)} {dayShort(day)} برنامه‌ای ثبت نشده و بازدیدی هم انجام نشده است.
          <button type="button" className="mst-btn primary" onClick={onPlan}><CalendarCheck size={15} /> ساخت برنامه‌ی این روز</button>
        </div>
      ) : (
        <div className="mdy-people">
          {groups.map((g) => <PersonDay key={g.key} g={g} weekVisits={weekVisits} busy={busy} onRemove={(sid) => removeStop(g, sid)} />)}
        </div>
      )}
      <p className="mdy-note"><MapPin size={12} /> موقعیت هر بازدید همان لحظه‌ی گرفتن سلفی سردر ثبت می‌شود؛ فاصله و زمان بین دو فروشگاه از روی همین نقاط محاسبه می‌شود.</p>
    </div>
  );
};

const PersonDay = ({ g, weekVisits, busy, onRemove }) => {
  const d = g.day;
  const pct = d.plannedCount ? Math.round((d.doneCount / d.plannedCount) * 100) : null;
  return (
    <section className="mdy-person">
      <header>
        <span className="mst-avatar">{(g.name || '؟').charAt(0)}</span>
        <div className="mdy-person-name">
          <b>{g.name}</b>
          <small>
            {d.startAt ? <><Clock size={11} /> {fmtTime(d.startAt)}{d.endAt !== d.startAt ? ` تا ${fmtTime(d.endAt)}` : ''}</> : 'هنوز بازدیدی ثبت نکرده'}
            {d.travelM > 0 && <> · <RouteIcon size={11} /> {fmtDistance(d.travelM)}</>}
          </small>
        </div>
        <div className="mdy-person-stat">
          {pct != null ? <><b>{fa(d.doneCount)}/{fa(d.plannedCount)}</b><small>برنامه</small></> : <><b>{fa(d.stops.length)}</b><small>بازدید</small></>}
        </div>
      </header>
      {pct != null && <div className="mst-progress"><span style={{ width: `${pct}%` }} /></div>}
      {(d.offPlan > 0 || d.far > 0 || d.noFix > 0) && (
        <div className="mdy-flags">
          {d.offPlan > 0 && <span className="mst-tag warn"><AlertTriangle size={11} /> {fa(d.offPlan)} بازدید خارج از برنامه</span>}
          {d.far > 0 && <span className="mst-tag warn"><Navigation size={11} /> {fa(d.far)} بازدید دور از فروشگاه</span>}
          {d.noFix > 0 && <span className="mst-tag bad"><LocateOff size={11} /> {fa(d.noFix)} بدون موقعیت</span>}
        </div>
      )}

      <ol className="mdy-timeline">
        {d.stops.map((s, i) => {
          const VIcon = VERDICT_ICON[s.verdict.state] || LocateFixed;
          const leg = s.leg;
          const odd = leg && leg.speedKmh != null && leg.speedKmh > IMPLAUSIBLE_KMH;
          return (
            <React.Fragment key={s.visit.id}>
              {leg && (
                <li className={`mdy-leg ${odd ? 'odd' : ''}`}>
                  <span className="mdy-leg-line" />
                  <span className="mdy-leg-text">
                    <Navigation size={12} />
                    {leg.distance != null ? fmtDistance(leg.distance) : 'فاصله نامشخص'} · {fmtDuration(leg.gap)}
                    {odd && <b> · سرعت غیرعادی، موقعیت را بررسی کنید</b>}
                  </span>
                </li>
              )}
              <li className="mdy-stop done">
                <span className="mdy-dot"><CheckCircle2 size={16} /></span>
                <div className="mdy-stop-body">
                  <b>{fa(i + 1)}. {s.visit.storeName || s.store?.name}</b>
                  <small><MapPin size={11} /> {s.store?.city || s.visit.city}{s.store?.district ? ` · ${s.store.district}` : ''} · {fmtTime(s.visit.submittedAt)}</small>
                </div>
                <div className="mdy-stop-tags">
                  {!s.planned && d.plannedCount > 0 && <span className="mst-tag warn">خارج از برنامه</span>}
                  <span className={`mst-tag ${VERDICT_TONE[s.verdict.state]}`}><VIcon size={11} /> {s.verdict.label}</span>
                </div>
              </li>
            </React.Fragment>
          );
        })}
        {d.missed.map((m) => (
          <li key={m.storeId} className="mdy-stop todo">
            <span className="mdy-dot"><Circle size={16} /></span>
            <div className="mdy-stop-body">
              <b>{m.store?.name || m.storeId}</b>
              <small><MapPin size={11} /> {m.store?.city}{m.store?.district ? ` · ${m.store.district}` : ''} · در برنامه، هنوز انجام نشده</small>
            </div>
            <button type="button" className="mdy-x" disabled={busy === `rm${g.key}${m.storeId}`} onClick={() => onRemove(m.storeId)} aria-label="حذف از برنامه‌ی این روز" title="حذف از برنامه‌ی این روز"><X size={14} /></button>
          </li>
        ))}
        {g.weekly.length > 0 && (
          <>
            <li className="mdy-weekhead"><CalendarCheck size={13} /> برنامه‌ی هفتگی · {fa(g.weekly.filter((w) => weekVisits.has(w.storeId)).length)} از {fa(g.weekly.length)} بازدید شد</li>
            {g.weekly.map((w, i) => {
              const v = weekVisits.get(w.storeId);
              const store = STORE_BY_ID.get(w.storeId);
              return (
                <li key={`w${w.storeId}`} className={`mdy-stop week ${v ? 'done' : 'todo'}`}>
                  <span className="mdy-dot">{v ? <CheckCircle2 size={16} /> : <Circle size={16} />}</span>
                  <div className="mdy-stop-body">
                    <b>{fa(i + 1)}. {store?.name || w.storeId}</b>
                    <small><MapPin size={11} /> {store?.city}{store?.district ? ` · ${store.district}` : ''} · {v ? `بازدید شد ${fmtDay(v.submittedAt)} ${fmtTime(v.submittedAt)}` : 'در برنامه‌ی هفتگی، هنوز بازدید نشده'}</small>
                  </div>
                </li>
              );
            })}
          </>
        )}
        {!d.stops.length && !d.missed.length && !g.weekly.length && <li className="mdy-empty"><Store size={14} /> چیزی ثبت نشده</li>}
      </ol>
    </section>
  );
};

export default MehramDaily;
