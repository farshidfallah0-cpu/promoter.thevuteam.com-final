import React, { useState, useEffect } from 'react';
import { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import './tehranClock.css';

const WEEKDAYS_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

function getTehranNow() {
  // Asia/Tehran = UTC+3:30 (UTC+4:30 in daylight saving)
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran' }));
}

function useTehranClock() {
  const [now, setNow] = useState(getTehranNow);
  useEffect(() => {
    // Tick every second, aligned to the clock boundary
    let interval;
    const ms = 1000 - getTehranNow().getMilliseconds();
    const t = setTimeout(() => {
      setNow(getTehranNow());
      interval = setInterval(() => setNow(getTehranNow()), 1000);
    }, ms);
    return () => {
      clearTimeout(t);
      if (interval) clearInterval(interval);
    };
  }, []);
  return now;
}

export function TehranClock({ className = '' }) {
  const now = useTehranClock();

  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');

  const shamsi = new DateObject({ date: now, calendar: persian, locale: persian_fa });
  const shamsiStr = `${WEEKDAYS_FA[now.getDay()]}، ${shamsi.format('D MMMM YYYY')}`;

  return (
    <div className={`tehran-clock ${className}`} title="ساعت به وقت تهران">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span className="tehran-clock-time">
        <span className="tehran-clock-hm">{h}:{m}</span>
        <span className="tehran-clock-sep">:</span>
        <span className="tehran-clock-sec">{s}</span>
      </span>
      <span className="tehran-clock-date">{shamsiStr}</span>
    </div>
  );
}

export default TehranClock;
