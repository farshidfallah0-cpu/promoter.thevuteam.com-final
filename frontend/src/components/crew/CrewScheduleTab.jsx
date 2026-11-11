import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { Clock, LogIn, LogOut, CalendarCheck } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function isoDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function jalaliLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    day: d.toLocaleDateString('fa-IR', { weekday: 'long' }),
    full: d.toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', year: 'numeric' }),
    shortDayName: d.toLocaleDateString('fa-IR', { weekday: 'short' }),
    dayNumber: d.toLocaleDateString('fa-IR', { day: 'numeric' }),
  };
}

function formatClock(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}

function duration(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const mins = Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} ساعت${m ? ` و ${m} دقیقه` : ''}`;
}

export default function CrewScheduleTab({ token, event }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/attendance/my`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [token]);

  const activeDates = useMemo(() => new Set(records.map(r => r.date)), [records]);
  const todayStr = useMemo(() => isoDate(new Date()), []);
  const todayMs = new Date().setHours(0,0,0,0);

  // Parse event scheduled dates
  const eventDatesList = useMemo(() => {
    if (!event || !event.start_date) return [];
    // Can be comma-separated Gregorian or Jalali strings
    return event.start_date.split(',').map(s => s.trim()).filter(Boolean);
  }, [event]);

  // Convert eventDates to Date objects or ISO strings for easy comparison
  const parsedEventDates = useMemo(() => {
    const dates = [];
    eventDatesList.forEach(dStr => {
      // If it looks like jalali YYYY/MM/DD
      if (dStr.includes('/')) {
         try {
           const d = new DateObject({ date: dStr, format: "YYYY/MM/DD", calendar: persian, locale: persian_fa });
           dates.push({
             iso: isoDate(d.toDate()),
             dateObj: d.toDate(),
             origDateStr: dStr,
           });
         } catch(e) {}
      } else {
         const d = new Date(dStr);
         if (!isNaN(d.valueOf())) {
           dates.push({
             iso: isoDate(d),
             dateObj: d,
             origDateStr: dStr,
           });
         }
      }
    });
    // Sort chronologically
    return dates.sort((a,b) => a.dateObj - b.dateObj);
  }, [eventDatesList]);

  const scheduledIsoSet = useMemo(() => new Set(parsedEventDates.map(d => d.iso)), [parsedEventDates]);

  return (
    <div className="px-4 pt-4 pb-32 space-y-6">
      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] shadow-sm p-4 border border-slate-100 dark:border-zinc-800 schedule-calendar-wrap">
        <Calendar
          calendar={persian}
          locale={persian_fa}
          readOnly
          monthYearSeparator="، "
          className="!w-full !shadow-none !border-none !bg-transparent rmdp-mobile-custom"
          mapDays={({ date }) => {
            const g = date.toDate();
            const gStr = isoDate(g);
            
            const isScheduled = scheduledIsoSet.has(gStr);
            const isToday = gStr === todayStr;
            const ms = g.getTime();
            const isPast = ms < todayMs;
            
            let bgClass = "";
            let textClass = "text-slate-700 dark:text-slate-300";

            if (isToday) {
               textClass = "text-indigo-600 dark:text-indigo-400 font-extrabold text-lg";
            } else if (isScheduled) {
               if (isPast) {
                 textClass = "text-red-500 dark:text-red-400 font-bold line-through decoration-red-300 dark:decoration-red-800/50";
               } else {
                 textClass = "text-indigo-500 dark:text-indigo-400 font-bold";
               }
            } else {
               textClass = "text-slate-600 dark:text-slate-400";
            }

            return {
              className: "custom-day-cell",
              children: (
                <div className={`w-10 h-10 mx-auto flex flex-col items-center justify-center relative transition-all ${bgClass} ${textClass}`}>
                  <span className="text-sm">{date.day}</span>
                </div>
              ),
            };
          }}
        />
      </div>

      <div>
        <h3 className="text-[13px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-4 px-1">
          برنامه‌های پیش‌رو
        </h3>

        {loading && (
          <p className="text-center text-sm text-gray-400 dark:text-zinc-500 py-8">در حال بارگذاری...</p>
        )}

        {!loading && parsedEventDates.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-300 dark:border-zinc-700 py-10 flex flex-col items-center gap-2">
            <CalendarCheck size={26} className="text-slate-300 dark:text-zinc-600" />
            <p className="text-sm text-gray-400 dark:text-zinc-500">تاریخی برای این رویداد ثبت نشده است</p>
          </div>
        )}

        <div className="space-y-3">
          {!loading && parsedEventDates.map((item, idx) => {
            const r = records.find(rec => rec.date === item.iso);
            const { dayNumber, shortDayName, full } = jalaliLabel(item.iso);
            
            const ms = item.dateObj.getTime();
            const isToday = item.iso === todayStr;
            const isPast = ms < todayMs;
            
            const isOpen = r && !!r.clock_in_time && !r.clock_out_time;
            const dur = r ? duration(r.clock_in_time, r.clock_out_time) : null;
            
            const origDateStr = item.origDateStr;
            let dayStartTime = event?.start_time || '08:00';
            let dayEndTime = event?.end_time || '16:00';
            
            if (event?.custom_times) {
              const formatEng = (str) => String(str).replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c));
              const targetEng = formatEng(origDateStr);
              const matchedKey = Object.keys(event.custom_times).find(k => formatEng(k) === targetEng);
              if (matchedKey) {
                dayStartTime = event.custom_times[matchedKey].start || dayStartTime;
                dayEndTime = event.custom_times[matchedKey].end || dayEndTime;
              }
            }
            
            return (
              <div key={idx} className={`rounded-[1.2rem] border ${isPast ? 'border-transparent bg-slate-100/60 dark:bg-zinc-900/40 opacity-60 grayscale-[30%]' : 'border-slate-200/80 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900'} p-3 flex gap-4 items-center transition-all`}>
                
                {/* Left Date Block */}
                <div className={`w-14 h-16 rounded-[1rem] flex flex-col items-center justify-center shrink-0 ${isPast ? 'bg-slate-200/50 dark:bg-zinc-800/40' : 'bg-slate-50 dark:bg-zinc-800'}`}>
                  <span className="text-[10px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">{shortDayName}</span>
                  <span className={`text-lg font-black ${isToday ? 'text-indigo-600 dark:text-indigo-400' : isPast ? 'text-slate-400 dark:text-zinc-600' : 'text-slate-800 dark:text-slate-200'}`}>{dayNumber}</span>
                </div>
                
                {/* Right Content */}
                <div className="flex-1 min-w-0 py-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className={`text-sm font-bold truncate ${isPast ? 'text-slate-500 dark:text-zinc-400 line-through' : 'text-slate-800 dark:text-white'}`}>
                      {event?.name || 'شیفت کاری'}
                    </p>
                    
                    {(!isPast && isToday) && (
                       <button className="px-3 py-1 rounded-full border border-slate-200 dark:border-zinc-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                         شروع
                       </button>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-1 text-[11px] text-slate-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Clock size={11} className="text-slate-400" />
                      {dayStartTime} تا {dayEndTime}
                    </span>
                    
                    {/* If there is an attendance record for this past/current shift */}
                    {r && (
                      <div className="flex items-center gap-3 mt-1.5 p-2 rounded-lg bg-slate-50 dark:bg-zinc-800/60">
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500 font-bold">
                          <LogIn size={11} /> {formatClock(r.clock_in_time)}
                        </span>
                        {r.clock_out_time && (
                          <span className="flex items-center gap-1 text-rose-500 dark:text-rose-400 font-bold">
                            <LogOut size={11} /> {formatClock(r.clock_out_time)}
                          </span>
                        )}
                        {isOpen && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 ml-auto">در حال کار</span>
                        )}
                        {dur && !isOpen && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-zinc-700 dark:text-slate-300 ml-auto">{dur}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
