import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { TehranClock } from './TehranClock';
import './eventCalendarBar.css';

const persianToEnglish = (s) =>
  String(s || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

export const EventCalendarBar = ({ selectedEvent }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isExpanded, setIsExpanded] = useState(false);
  const gridRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const eventDays = useMemo(() => {
    if (!selectedEvent?.start_date) return [];
    return selectedEvent.start_date
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((dateStr) => {
        try {
          const engStr = persianToEnglish(dateStr);
          const dateObj = new DateObject({
            date: engStr,
            format: 'YYYY/MM/DD',
            calendar: persian,
            locale: persian_fa,
          });
          if (dateObj.isValid) {
            return {
              iso: dateObj.format('YYYY-MM-DD'),
              dayNumber: dateObj.format('DD'),
              monthName: dateObj.format('MMMM'),
              weekday: dateObj.format('dddd'),
              dateObj,
            };
          }
        } catch (e) {}
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.dateObj.valueOf() - b.dateObj.valueOf());
  }, [selectedEvent?.start_date]);

  // Centre today's chip inside the scrolling strip (RTL-aware: scrollLeft is
  // 0 at the right edge and negative towards the left).
  useEffect(() => {
    const el = gridRef.current;
    if (!el || isExpanded) return;
    const chip = el.querySelector('.ecb-day-chip.today') || el.querySelector('.ecb-day-chip.future');
    if (!chip) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const visibleLeft = chip.offsetLeft - el.clientWidth / 2 + chip.offsetWidth / 2;
    el.scrollLeft = rtl ? visibleLeft - (el.scrollWidth - el.clientWidth) : visibleLeft;
  }, [eventDays.length, isExpanded]);

  const todayObj = useMemo(() => new DateObject({ calendar: persian }), []);
  const todayObjDyn = new DateObject({ date: currentTime, calendar: persian });

  const getCountdown = (timeStr) => {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    const target = new Date(currentTime);
    target.setHours(h, m, 0, 0);
    const diff = target - currentTime;
    if (diff <= 0) return null;
    const hrs = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const mins = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const secs = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const formatEng = (str) => persianToEnglish(str);

  if (!selectedEvent || eventDays.length === 0) return null;

  const isTodayFn = (d) =>
    d.dateObj.year === todayObjDyn.year &&
    d.dateObj.month.number === todayObjDyn.month.number &&
    d.dateObj.day === todayObjDyn.day;

  const isPastFn = (d) =>
    !isTodayFn(d) && d.dateObj.toDate().getTime() < Date.now();

  const passedCount = eventDays.filter((d) => isPastFn(d)).length;
  const todayDayIndex = eventDays.findIndex(isTodayFn);
  // Past days count fully; today (if part of the event) counts as half-progress.
  // This also prevents the percentage from getting stuck at 0 once a single-day
  // event has already ended (it correctly reaches 100% instead of resetting to 0).
  const progressPct = eventDays.length > 0
    ? Math.round(((passedCount + (todayDayIndex >= 0 ? 0.5 : 0)) / eventDays.length) * 100)
    : 0;

  const getDayTimes = (d) => {
    let start = selectedEvent.start_time;
    let end = selectedEvent.end_time;
    if (selectedEvent.custom_times) {
      const targetDateEng = formatEng(d.dateObj.format('YYYY/MM/DD'));
      const matchedKey = Object.keys(selectedEvent.custom_times).find(
        (k) => formatEng(k) === targetDateEng
      );
      if (matchedKey) {
        start = selectedEvent.custom_times[matchedKey].start || start;
        end = selectedEvent.custom_times[matchedKey].end || end;
      }
    }
    return { start, end };
  };

  const todayDay = todayDayIndex >= 0 ? eventDays[todayDayIndex] : null;
  const todayTimes = todayDay ? getDayTimes(todayDay) : {};
  const startCountdown = getCountdown(todayTimes.start);
  const endCountdown = getCountdown(todayTimes.end);

  let todayStatus = null;
  let todayCountdown = null;
  if (todayDayIndex >= 0) {
    if (startCountdown) { todayStatus = 'تا شروع'; todayCountdown = startCountdown; }
    else if (endCountdown) { todayStatus = 'تا پایان'; todayCountdown = endCountdown; }
    else { todayStatus = 'در جریان'; }
  }

  // Long events (e.g. 30 days) can't fit one row, so by default every day sits
  // in a horizontally scrollable strip that opens on today; "show all" wraps the
  // days into a normal grid instead.
  const visibleDays = eventDays;

  return (
    <div className="ecb-root">
      <div className="ecb-header">
        <div className="ecb-header-left">
          <div className="ecb-cal-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <div className="ecb-header-info">
            <span className="ecb-title">تقویم اجرایی</span>
            <span className="ecb-sub">{passedCount} از {eventDays.length} روز گذشته</span>
          </div>
        </div>

        <div className="ecb-header-right">
          <TehranClock className="compact" />
          {todayDayIndex >= 0 && todayCountdown && (
            <div className={`ecb-countdown-pill ${todayStatus === 'تا شروع' ? 'is-before' : 'is-active'}`}>
              <span className="ecb-countdown-label">{todayStatus}</span>
              <span className="ecb-countdown-time" dir="ltr">{todayCountdown}</span>
            </div>
          )}
          {todayDayIndex >= 0 && !todayCountdown && (
            <div className="ecb-active-pill">
              <span className="ecb-pulse-dot" />
              <span>{todayStatus}</span>
            </div>
          )}
          {eventDays.length > 7 && (
            <button type="button" className="ecb-toggle-btn" onClick={() => setIsExpanded((p) => !p)}>
              {isExpanded ? 'نمایش فشرده' : `نمایش همه ${eventDays.length} روز`}
            </button>
          )}
          <div className="ecb-progress-wrap">
            <div className="ecb-progress-track">
              <div className="ecb-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="ecb-progress-pct">{progressPct}٪</span>
          </div>
        </div>
      </div>

      <div ref={gridRef} className={`ecb-days-grid${isExpanded ? ' expanded' : ''}`}>
        {visibleDays.map((d, i) => {
          const isToday = isTodayFn(d);
          const isPast = isPastFn(d);
          const { start: dayStart, end: dayEnd } = getDayTimes(d);
          const dayIdx = eventDays.indexOf(d);

          return (
            <div
              key={i}
              className={`ecb-day-chip ${isToday ? 'today' : isPast ? 'past' : 'future'}`}
            >
              {/* LEFT: day number block */}
              <div className="ecb-chip-num-col">
                <span className="ecb-day-label">روز {dayIdx + 1}</span>
                <span className="ecb-day-number">{d.dayNumber}</span>
                <span className="ecb-day-month">{d.monthName}</span>
              </div>

              {/* RIGHT: weekday + badge + time + countdown */}
              <div className="ecb-chip-info-col">
                <span className="ecb-day-weekday">{d.weekday}</span>

                <div className="ecb-chip-mid-row">
                  <span className={`ecb-day-badge ${isToday ? 'badge-today' : isPast ? 'badge-past' : 'badge-future'}`}>
                    {isToday ? 'امروز' : isPast ? '✓ تمام' : 'پیش رو'}
                  </span>
                  {(dayStart || dayEnd) && (
                    <span className="ecb-day-time" dir="ltr">
                      {dayStart}{dayStart && dayEnd && '–'}{dayEnd}
                    </span>
                  )}
                </div>

                {isToday && todayCountdown && (
                  <span className={`ecb-day-countdown ${todayStatus === 'تا شروع' ? 'is-before' : 'is-active'}`} dir="ltr">{todayCountdown}</span>
                )}
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
};

export default EventCalendarBar;
