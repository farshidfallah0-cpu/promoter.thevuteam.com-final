import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import CrewHeader from './crew/CrewHeader';
import './EventsDirectory.css';
import { Calendar, Clock, ArrowLeft, Loader2, AlertCircle, Building2, CheckCircle2, XCircle, MapPin } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/* ── تبدیل اعداد فارسی/عربی به لاتین ── */
function toLatinDigits(str) {
  if (!str) return str;
  return String(str)
    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0)
    .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x0660);
}

/* ── نام ماه جلالی ── */
const JALALI_MONTHS = [
  'فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور',
  'مهر','آبان','آذر','دی','بهمن','اسفند'
];

/**
 * یک رشتهٔ تاریخ (جلالی YYYY/MM/DD یا میلادی YYYY-MM-DD) را به شکل خوانا برمی‌گرداند.
 * اگر null باشد null برمی‌گرداند.
 */
function parseOneDateStr(raw) {
  if (!raw) return null;
  const str = toLatinDigits(raw.trim());

  // جلالی: YYYY/MM/DD
  if (str.includes('/')) {
    const [y, m, d] = str.split('/').map(Number);
    const month = JALALI_MONTHS[m - 1] ?? m;
    if (!isNaN(d) && m >= 1 && m <= 12) {
      return { full: `${d} ${month} ${y}`, short: `${d} ${month}` };
    }
    return { full: raw.trim(), short: raw.trim() };
  }

  // میلادی: YYYY-MM-DD
  try {
    const date = new Date(str + 'T00:00:00');
    if (!isNaN(date.getTime())) {
      const full = date.toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', year: 'numeric' });
      const short = date.toLocaleDateString('fa-IR', { day: 'numeric', month: 'long' });
      return { full, short };
    }
  } catch {}

  return { full: raw.trim(), short: raw.trim() };
}

/**
 * از start_date و end_date ایونت، تاریخ شروع و پایان را استخراج می‌کند.
 * - وقتی end_date وجود دارد → از آن استفاده می‌شود
 * - وقتی start_date چند تاریخ comma-separated دارد → آخرین تاریخ به عنوان پایان
 */
function extractDates(startDateRaw, endDateRaw) {
  if (!startDateRaw) return { start: null, end: null, isMultiDay: false };

  const allDates = startDateRaw.split(',').map(s => s.trim()).filter(Boolean);
  const firstRaw = allDates[0];

  let endRaw;
  if (endDateRaw) {
    // end_date مستقیم داده شده
    const endDates = endDateRaw.split(',').map(s => s.trim()).filter(Boolean);
    endRaw = endDates[endDates.length - 1];
  } else if (allDates.length > 1) {
    // چند تاریخ در start_date: آخرین = پایان
    endRaw = allDates[allDates.length - 1];
  } else {
    endRaw = null;
  }

  const start = parseOneDateStr(firstRaw);
  const end = endRaw && endRaw !== firstRaw ? parseOneDateStr(endRaw) : null;
  const isMultiDay = !!end;

  return { start, end, isMultiDay };
}

/** آیا custom_times واقعی (غیر null/empty) است؟ */
function hasCustomTimes(customTimes) {
  if (!customTimes || customTimes === 'null') return false;
  try {
    const parsed = typeof customTimes === 'string' ? JSON.parse(customTimes) : customTimes;
    if (!parsed) return false;
    return Object.keys(parsed).length > 0;
  } catch {
    return false;
  }
}

function formatTime(t) {
  // '00:00' is a legitimate midnight end time (e.g. an event running until
  // 12 AM), not "unset" — only an actually-empty value should hide the chip.
  if (!t) return null;
  return t.length > 5 ? t.slice(0, 5) : t;
}

/* ════════════════════════════════════════════════════ */

export default function EventsDirectory({ theme, toggleTheme }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API_URL}/events/public`)
      .then(res => setEvents(res.data))
      .catch(() => setError('خطا در دریافت ایونت‌ها'))
      .finally(() => setLoading(false));
  }, []);

  const activeEvents = events.filter(e => e.is_active);
  const inactiveEvents = events.filter(e => !e.is_active);

function getNotchedPath(w, h, nw = 68, nh = 68, R = 18, r = 12) {
  const pad = 1;
  const left = pad;
  const right = Math.max(w - pad, left + nw + 20);
  const top = pad;
  const bottom = Math.max(h - pad, top + nh + 20);
  const notchX = left + nw;
  const notchY = top + nh;

  return [
    `M ${notchX + r} ${top}`,
    `L ${right - R} ${top}`,
    `A ${R} ${R} 0 0 1 ${right} ${top + R}`,
    `L ${right} ${bottom - R}`,
    `A ${R} ${R} 0 0 1 ${right - R} ${bottom}`,
    `L ${left + R} ${bottom}`,
    `A ${R} ${R} 0 0 1 ${left} ${bottom - R}`,
    `L ${left} ${notchY + r}`,
    `A ${r} ${r} 0 0 1 ${left + r} ${notchY}`,
    `L ${notchX - r} ${notchY}`,
    `A ${r} ${r} 0 0 0 ${notchX} ${notchY - r}`,
    `L ${notchX} ${top + r}`,
    `A ${r} ${r} 0 0 1 ${notchX + r} ${top}`,
    'Z'
  ].join(' ');
}

function EventDirectoryCard({ event, isActive, navigate }) {
  const cardRef = React.useRef(null);
  const [dims, setDims] = React.useState({ w: 260, h: 360 });

  React.useLayoutEffect(() => {
    if (!cardRef.current) return;
    const update = () => {
      if (cardRef.current) {
        const r = cardRef.current.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setDims({ w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, []);

  const { start, end, isMultiDay } = extractDates(event.start_date, event.end_date);
  const isCustomTime = hasCustomTimes(event.custom_times);
  const startTime = isCustomTime ? null : formatTime(event.start_time);
  const endTime = isCustomTime ? null : formatTime(event.end_time);

  return (
    <button
      ref={cardRef}
      className={`ed-card${isActive ? '' : ' ed-card--dim'}`}
      onClick={() => navigate(`/${event.slug}`)}
    >
      <svg
        className="ed-card-svg"
        width={dims.w}
        height={dims.h}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
      >
        <path
          d={getNotchedPath(dims.w, dims.h, 55, 55, 18, 10)}
          className="ed-card-path"
        />
      </svg>

      <div className="ed-card-logo-float">
        {event.client_logo ? (
          <img src={event.client_logo} alt={event.client_name || ''} className="ed-card-logo-img" />
        ) : (
          <div className="ed-card-logo-fallback">
            <Building2 size={20} />
            {event.client_name ? (
              <span className="ed-card-logo-initials">{event.client_name.slice(0, 3).toUpperCase()}</span>
            ) : (
              <span className="ed-card-logo-initials">VU</span>
            )}
          </div>
        )}
      </div>

      <div className="ed-card-content">
        <div className="ed-card-top-row">
          <div className={`ed-badge${isActive ? ' ed-badge--active' : ' ed-badge--inactive'}`}>
            {isActive
              ? <><CheckCircle2 size={10} /><span>فعال</span></>
              : <><XCircle size={10} /><span>غیرفعال</span></>
            }
          </div>
        </div>

        <h2 className="ed-card-name">{event.name}</h2>

        {event.client_name && (
          <div className="ed-card-client">
            <Building2 size={11} />
            <span>{event.client_name}</span>
          </div>
        )}

        {event.location && (
          <div className="ed-card-location">
            <MapPin size={15} className="ed-location-icon" />
            <span>{event.location}</span>
          </div>
        )}

        <div className="ed-card-divider" />

        <div className="ed-card-dates">
          <div className="ed-date-col">
            <span className="ed-date-label">شروع</span>
            <span className="ed-date-val">{start ? start.full : '—'}</span>
          </div>
          {(isMultiDay || end) && (
            <>
              <span className="ed-date-sep">←</span>
              <div className="ed-date-col ed-date-col--end">
                <span className="ed-date-label">پایان</span>
                <span className="ed-date-val">{end ? end.full : '—'}</span>
              </div>
            </>
          )}
        </div>

        <div className="ed-card-time">
          <Clock size={11} className="ed-time-icon" />
          {isCustomTime ? (
            <span className="ed-time-custom">ساعت متغیر</span>
          ) : (startTime || endTime) ? (
            <span className="ed-time-val">
              {startTime && endTime ? `${startTime} تا ${endTime}` : startTime || endTime}
            </span>
          ) : (
            <span className="ed-time-empty">—</span>
          )}
        </div>

        <div className="ed-card-footer">
          <span className="ed-cta">ورود به پنل</span>
          <ArrowLeft size={12} className="ed-cta-arrow" />
        </div>
      </div>
    </button>
  );
}

  return (
    <div className="ed-root" data-theme={theme}>
      <CrewHeader theme={theme} toggleTheme={toggleTheme} eventName={null} />

      <div className="ed-page">

        {loading ? (
          <div className="ed-state">
            <Loader2 className="ed-spinner" />
            <span>در حال بارگذاری…</span>
          </div>
        ) : error ? (
          <div className="ed-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        ) : events.length === 0 ? (
          <div className="ed-empty">
            <span className="ed-empty-icon">🗓️</span>
            <p className="ed-empty-title">ایونتی وجود ندارد</p>
            <p className="ed-empty-sub">هیچ ایونتی ثبت نشده است</p>
          </div>
        ) : (
          <>
            {/* ── ایونت‌های فعال داخل باکس مینیمال ── */}
            {activeEvents.length > 0 && (
              <div className="ed-box">
                <div className="ed-box-header">
                  <span className="ed-box-dot" />
                  <span className="ed-box-label">ایونت‌های فعال</span>
                  <span className="ed-box-count">{activeEvents.length}</span>
                </div>
                <div className="ed-grid ed-grid--centered">
                  {activeEvents.map(e => (
                    <EventDirectoryCard key={e.id} event={e} isActive={true} navigate={navigate} />
                  ))}
                </div>
              </div>
            )}

            {/* ── ایونت‌های غیرفعال ── */}
            {inactiveEvents.length > 0 && (
              <div className="ed-inactive-section">
                <div className="ed-section-label">غیرفعال</div>
                <div className="ed-grid">
                  {inactiveEvents.map(e => (
                    <EventDirectoryCard key={e.id} event={e} isActive={false} navigate={navigate} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
