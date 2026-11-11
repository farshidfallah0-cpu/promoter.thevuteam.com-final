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
const getEventWindow = (event) => {
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

  if (phase === 'ended') {
    return (
      <span className="evc-pill is-ended">
        <span className="evc-label">پایان یافته</span>
      </span>
    );
  }

  const { days, hrs, mins, secs } = splitDiff(target - now);

  return (
    <span
      className={`evc-pill ${phase === 'before' ? 'is-before' : 'is-live'}`}
      title={phase === 'before' ? 'زمان باقی‌مانده تا شروع' : 'زمان باقی‌مانده تا پایان'}
    >
      <span className="evc-dot" />
      <span className="evc-label">{phase === 'before' ? 'تا شروع' : 'تا پایان'}</span>
      <span className="evc-time" dir="ltr">
        {days > 0 && <span className="evc-days">{days}d</span>}
        <span>{hrs}</span><span className="evc-colon">:</span>
        <span>{mins}</span><span className="evc-colon">:</span>
        <span>{secs}</span>
      </span>
    </span>
  );
};

export default EventCountdown;
