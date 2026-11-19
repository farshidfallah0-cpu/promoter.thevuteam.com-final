import React, { useState, useEffect, useMemo } from 'react';
import { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import './eventCountdown.css';

const persianToEnglish = (s) =>
  String(s || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

const parseCustomTimes = (ct) => {
  if (!ct || ct === 'null') return null;
  try {
    return typeof ct === 'string' ? JSON.parse(ct) : ct;
  } catch {
    return null;
  }
};

// Builds a JS Date from a Jalali "YYYY/MM/DD" string and an "HH:MM" time.
const toDateTime = (dateStr, timeStr) => {
  const dateObj = new DateObject({
    date: persianToEnglish(dateStr),
    format: 'YYYY/MM/DD',
    calendar: persian,
  });
  if (!dateObj.isValid) return null;
  const d = dateObj.toDate();
  const [h, m] = persianToEnglish(timeStr || '00:00').split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};

// Event window: first day + its start time → last day + its end time
// (custom_times per day override the default start/end, same as EventCalendarBar).
export const getEventWindow = (event) => {
  if (!event?.start_date) return null;
  const days = event.start_date.split(',').map((s) => s.trim()).filter(Boolean);
  if (event.end_date) {
    const endDays = event.end_date.split(',').map((s) => s.trim()).filter(Boolean);
    if (endDays.length) days.push(endDays[endDays.length - 1]);
  }
  const parsed = days
    .map((s) => ({ raw: s, at: toDateTime(s, '00:00') }))
    .filter((d) => d.at)
    .sort((a, b) => a.at - b.at);
  if (!parsed.length) return null;

  const custom = parseCustomTimes(event.custom_times);
  const timesFor = (raw) => {
    let start = event.start_time;
    let end = event.end_time;
    if (custom) {
      const key = Object.keys(custom).find((k) => persianToEnglish(k) === persianToEnglish(raw));
      if (key) {
        start = custom[key]?.start || start;
        end = custom[key]?.end || end;
      }
    }
    return { start, end };
  };

  const first = parsed[0].raw;
  const last = parsed[parsed.length - 1].raw;
  const startTime = timesFor(first).start;
  const { start: lastStart, end: endTime } = timesFor(last);

  const start = toDateTime(first, startTime);
  let end = toDateTime(last, endTime || '23:59');
  // An end time at/before that day's start time (e.g. 18:00 → 00:00) runs past midnight.
  const lastDayStart = toDateTime(last, lastStart);
  if (endTime && lastDayStart && end <= lastDayStart) end.setDate(end.getDate() + 1);

  return { start, end };
};

const pad = (n) => String(n).padStart(2, '0');

const splitDiff = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hrs: pad(Math.floor((total % 86400) / 3600)),
    mins: pad(Math.floor((total % 3600) / 60)),
    secs: pad(total % 60),
  };
};

const faDate = (d) =>
  d.toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

export const EventCountdown = ({ event }) => {
  const [now, setNow] = useState(Date.now());
  const window_ = useMemo(
    () => getEventWindow(event),
    [event?.start_date, event?.end_date, event?.start_time, event?.end_time, event?.custom_times]
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!window_?.start) return <span className="evc-empty">—</span>;

  const { start, end } = window_;
  let phase;
  let target;
  if (now < start) { phase = 'before'; target = start; }
  else if (end && now < end) { phase = 'live'; target = end; }
  else phase = 'ended';

  const range = `شروع: ${faDate(start)}${end ? `\nپایان: ${faDate(end)}` : ''}`;

  if (phase === 'ended') {
    return (
      <div className="evt-box is-ended" title={range}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        <span className="evt-label">پایان یافته</span>
      </div>
    );
  }

  const { days, hrs, mins, secs } = splitDiff(target - now);
  // Always 4 slots (days · hours · min · sec) so digits line up in every row; no days → ghost slot keeps the hours column in place.
  const tiles = [[days > 0 ? String(days) : '', 'روز', days <= 0], [hrs, 'ساعت'], [mins, 'دقیقه'], [secs, 'ثانیه']];
  const pct = phase === 'live' && end ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : 0;

  return (
    <div className={`evt-box ${phase === 'before' ? 'is-before' : 'is-live'}`} title={range}>
      <div className="evt-side">
        <span className="evt-label"><span className="evt-dot" />{phase === 'before' ? 'تا شروع' : 'تا پایان'}</span>
        {phase === 'live' && <span className="evt-pct">{Math.round(pct).toLocaleString('fa-IR')}٪</span>}
      </div>
      <div className="evt-tiles" dir="ltr">
        {tiles.map(([v, l, ghost]) => (
          <span className={`evt-tile${ghost ? ' is-ghost' : ''}`} key={l} aria-hidden={ghost || undefined}><b>{v || '00'}</b><i>{l}</i></span>
        ))}
      </div>
      <div className={`evt-bar ${phase === 'before' ? 'is-idle' : ''}`}><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
};

export default EventCountdown;
