import React, { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { DateObject } from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import gregorian from "react-date-object/calendars/gregorian";
import gregorian_en from "react-date-object/locales/gregorian_en";
import CrewSheet from './CrewSheet';
import { resolveEffectiveRole } from '../../utils/roleUtils';
import { calcReportProgress, calcGlobalProgress } from '../../utils/progressUtils';

const SPECIAL_TYPES = ['advanced_checklist', 'team_directory', 'brief_reader', 'camera_checkin', 'camera_checkout', 'photos', 'sampling_counter', 'bvt_cigarette_match', 'bvt_sampling_report', 'mehram_supermarket_report'];

function mapsHref(location) {
  if (!location) return null;
  if (/^https?:\/\//i.test(location)) return location;
  return `https://maps.google.com/?q=${encodeURIComponent(location)}`;
}

function jalaliToGregorian(str) {
  if (!str) return null;
  try {
    const clean = String(str).replace(/-/g, '/');
    const obj = new DateObject({ date: clean, calendar: persian, locale: persian_fa });
    return obj.convert(gregorian, gregorian_en).toDate();
  } catch { return null; }
}
function toFarsiLong(d) {
  if (!d || isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
}

/* ── Prebuilt icon nodes ── */
const ICONS = {
  report: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  checklist: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4"/>
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
    </svg>
  ),
  team: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  briefing: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
    </svg>
  ),
};

/* calcReportProgress lives in utils/progressUtils.js — shared with the admin
   side (ReportsTab card, dashboard team list) so "percent of today's work
   done" is computed identically everywhere instead of drifting per view. */

export default function CrewEventTab({
  event,
  formData,
  handleChange,
  renderSectionField,
  user,
}) {
  const [openSheet, setOpenSheet] = useState(null);
  const [showCheckoutAlert, setShowCheckoutAlert] = useState(false);
  const [samplingStatus, setSamplingStatus] = useState({ target: 0, done: 0 });

  const fields       = event.fields || [];
  const manualFields = fields.filter(f => !f.autoFill);
  const autoFields   = fields.filter(f => f.autoFill);

  const checklistField = manualFields.find(f => f.type === 'advanced_checklist');
  const teamField      = manualFields.find(f => f.type === 'team_directory');
  const briefField     = manualFields.find(f => f.type === 'brief_reader');
  const checkinField   = manualFields.find(f => f.type === 'camera_checkin');
  const checkoutField  = manualFields.find(f => f.type === 'camera_checkout');
  const photosField    = manualFields.find(f => f.type === 'photos');
  const samplingField  = manualFields.find(f => f.type === 'sampling_counter');
  const bvtField       = manualFields.find(f => f.type === 'bvt_cigarette_match');
  const bvtSamplingField = manualFields.find(f => f.type === 'bvt_sampling_report');
  const mehramField    = manualFields.find(f => f.type === 'mehram_supermarket_report');
  const reportFields   = manualFields.filter(f => !SPECIAL_TYPES.includes(f.type));

  /* ─ Checklist ─ */
  const userRole           = resolveEffectiveRole(user, event);
  const allChecklistItems  = checklistField ? (checklistField.checklistItems || []) : [];
  const checklistKey       = checklistField ? `${checklistField.id}_checklist` : '_crew_checklist';
  const checklistState     = formData[checklistKey] || {};
  const visibleChecklistItems = allChecklistItems
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => {
      if (typeof item === 'string') return true;
      const perm = item.permissions ? item.permissions[userRole] : (item.role === userRole ? 'edit' : 'view');
      return perm !== 'hidden';
    });
  const checklistDone = visibleChecklistItems.filter(({ idx }) => !!checklistState[idx]).length;

  /* ─ Check-in / out ─ */
  const checkinVal   = checkinField  ? formData[checkinField.id]  : null;
  const checkoutVal  = checkoutField ? formData[checkoutField.id] : null;
  const checkinDone  = Array.isArray(checkinVal)  ? checkinVal.length  > 0 : !!checkinVal;
  const checkoutDone = Array.isArray(checkoutVal) ? checkoutVal.length > 0 : !!checkoutVal;

  /* ─ Brief ─ */
  const briefRead = briefField ? !!formData[`${briefField.id}_read`] : false;

  /* ─ Photos & Sampling ─ */
  const photosVal = photosField ? formData[photosField.id] : null;
  const photosDone = Array.isArray(photosVal) ? photosVal.length > 0 : (photosVal !== undefined && photosVal !== null && photosVal !== '');
  const samplingDone = samplingField ? Number(formData[samplingField.id]) > 0 : false;

  /* ─ Report ToolCard progress (each sub-field counts) ─ */
  const reportProgressItems = useMemo(() => calcReportProgress(reportFields, formData), [reportFields, formData]);
  const reportDone  = reportProgressItems.filter(i => i.done).length;
  const reportTotal = reportProgressItems.length;

  const editableChecklistItems = visibleChecklistItems.filter(({ item }) => {
    if (typeof item === 'string') return true;
    const perm = item.permissions ? item.permissions[userRole] : (item.role === userRole ? 'edit' : 'view');
    return perm === 'edit';
  });
  
  const editableChecklistDone = editableChecklistItems.filter(({ idx }) => !!checklistState[idx]).length;

  /* ─ GLOBAL progress (hero bar) ─ shared with the admin-side views */
  const globalProgress = useMemo(() => calcGlobalProgress(event, formData, userRole), [event, formData, userRole]);
  const totalDone     = globalProgress.done;
  const totalCount    = globalProgress.total;
  const totalProgress = globalProgress.pct;

  const teamCount = (teamField?.teamMembers || []).length || 3;

  React.useEffect(() => {
    if (samplingField && (event.slug || event.id)) {
      const fetchStatus = async () => {
        try {
          const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/events/${event.slug || event.id}/sampling_status`);
          if (res.ok) {
            const data = await res.json();
            setSamplingStatus({ target: data.total_target, done: data.total_done });
          }
        } catch (e) {}
      };
      fetchStatus();
      const interval = setInterval(fetchStatus, 15000);
      return () => clearInterval(interval);
    }
  }, [samplingField, event.slug, event.id]);

  /* ─ Date display: show today's date for multi-day events ─ */
  const engDig = s => String(s || '').replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c));

  // Today in Farsi
  const todayFarsi = new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });

  let eventDatesDisplay = todayFarsi; // Default: always show today

  if (event.start_date) {
    // For multi-day events, find the event day that matches today
    const allDates = String(event.start_date).split(',').map(s => s.trim()).filter(Boolean);
    if (allDates.length > 1) {
      // Multi-day event: find which day matches today, comparing entirely in
      // Jalali-string space. The old version converted each event day to a
      // *local-midnight* JS Date via jalaliToGregorian, then read it back out
      // with .toISOString() — which is always UTC. On a device actually set
      // to Tehran (UTC+3:30, which is the whole point of this app), local
      // midnight of day X is 20:30 UTC on day X-1, so that ISO slice silently
      // named the PREVIOUS day. Today's Tehran date (correctly computed with
      // the +210min hack a few lines below) would then only ever match an
      // event day string one day in the future — the exact "18th jumps to
      // the 20th" symptom, since day 19 could only match if the device
      // thought "today" was the 18th.
      const tehranNow = new Date(Date.now() + 210 * 60 * 1000);
      const todayJalaliStr = new DateObject({
        year: tehranNow.getUTCFullYear(),
        month: tehranNow.getUTCMonth() + 1,
        day: tehranNow.getUTCDate(),
        calendar: gregorian,
        locale: gregorian_en,
      }).convert(persian, persian_fa).format("YYYY/MM/DD");
      let matchedDate = null;
      for (const part of allDates) {
        try {
          const dayObj = new DateObject({ date: engDig(part).replace(/-/g, '/'), calendar: persian, locale: persian_fa });
          if (dayObj.format("YYYY/MM/DD") === todayJalaliStr) {
            matchedDate = toFarsiLong(dayObj.convert(gregorian, gregorian_en).toDate());
            break;
          }
        } catch { /* malformed day string — skip it, fall through to today */ }
      }
      // If today matches one of the event days, show it; otherwise show today
      eventDatesDisplay = matchedDate || todayFarsi;
    } else {
      // Single-day event: show the event date
      const d = jalaliToGregorian(engDig(event.start_date));
      eventDatesDisplay = d ? toFarsiLong(d) : todayFarsi;
    }
  }

  /* ─ Time range ─ */
  let dayStart = event.start_time, dayEnd = event.end_time;
  if (event.custom_times) {
    const todayJ = engDig(new DateObject({ calendar: persian, locale: persian_fa }).format("YYYY/MM/DD"));
    const k = Object.keys(event.custom_times).find(k => engDig(k) === todayJ);
    if (k) { dayStart = event.custom_times[k].start || dayStart; dayEnd = event.custom_times[k].end || dayEnd; }
  }
  const timeRange = [dayStart, dayEnd].filter(Boolean).join(' — ');
  const mapUrl    = mapsHref(event.location);

  /* SVG arc circumference = 2π × 15.9 ≈ 99.9 */
  const CIRC = 99.9;

  return (
    <div className="crew-event-tab-root">

      {/* ══ GLASSMORPHISM HERO ══ */}
      <motion.div
        className="crew-hero-glass"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        {/* Subtle tint orb */}
        <div className="crew-hero-tint" />

        {/* Top row */}
        <div className="crew-hero-toprow">
          <div className="crew-hero-active-pill">
            <span className="crew-hero-active-dot" />
            <span>فعال</span>
          </div>
          <span className="crew-hero-date">{eventDatesDisplay}</span>
        </div>

        {/* Title */}
        <h1 className="crew-hero-title">{event.name}</h1>
        {event.client_name && <p className="crew-hero-client">{event.client_name}</p>}

        {/* Info row */}
        <div className="crew-hero-chips">
          {timeRange && (
            <div className="crew-hero-chip">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span dir="ltr">{timeRange}</span>
            </div>
          )}
          {event.location && (
            <a href={mapUrl || undefined} target="_blank" rel="noreferrer" className="crew-hero-chip crew-hero-chip--link">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <span className="crew-hero-loc-text">{event.location}</span>
            </a>
          )}
        </div>

        {/* Progress */}
        {totalCount > 0 && (
          <div className="crew-hero-progress">
            <div className="crew-hero-progress-labels">
              <span>پیشرفت کلی</span>
              <span className="crew-hero-progress-pct">{totalDone}/{totalCount} — {totalProgress}٪</span>
            </div>
            <div className="crew-hero-progress-track">
              <motion.div
                className="crew-hero-progress-fill"
                initial={{ width: 0 }}
                animate={{ width: `${totalProgress}%` }}
                transition={{ duration: 1.1, ease: [0.34, 1.56, 0.64, 1], delay: 0.3 }}
              />
            </div>
          </div>
        )}
      </motion.div>

      {/* ══ CHECK-IN ══ */}
      {checkinField && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, delay: 0.08 }}>
          <SectionLabel
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
                <path d="M16 3.13a4 4 0 010 7.75" opacity="0.5"/>
              </svg>
            }
            text="ثبت حضور"
          />
          <div className="crew-checkin-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="crew-checkin-card crew-checkin-card--in">
              {renderSectionField(checkinField)}
            </div>
          </div>
          <p className="crew-checkin-note">فقط دوربین زنده — آپلود از گالری غیرفعال است</p>
        </motion.div>
      )}

      {/* ══ BVT CIGARETTE MATCH ══ — own top-level section, not buried in a sheet */}
      {bvtField && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, delay: 0.12 }}>
          <SectionLabel
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 12H2v4a2 2 0 002 2h10a2 2 0 002-2v-4z"/>
                <path d="M2 12v-1a2 2 0 012-2h8a2 2 0 012 2v1"/>
                <path d="M18 8v8"/><path d="M21 10v4"/><path d="M8.5 9V7.5a1.5 1.5 0 013 0V9"/>
              </svg>
            }
            text={bvtField.title || 'تطبیق سیگار BVT'}
          />
          <div className="crew-bvt-card">
            {renderSectionField(bvtField)}
          </div>
        </motion.div>
      )}

      {/* ══ BVT SAMPLING REPORT ══ — one card + counter box per BVT pack */}
      {bvtSamplingField && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, delay: 0.12 }}>
          <SectionLabel
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
            }
            text={bvtSamplingField.title || 'گزارش سمپلینگ BVT'}
          />
          <div className="crew-bvt-card">
            {renderSectionField(bvtSamplingField)}
          </div>
        </motion.div>
      )}

      {/* ══ MEHRAM SUPERMARKET REPORT ══ */}
      {mehramField && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, delay: 0.14 }}>
          <SectionLabel
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>
              </svg>
            }
            text={mehramField.title || 'گزارش سوپرمارکت'}
          />
          <div className="crew-bvt-card">
            {renderSectionField(mehramField)}
          </div>
        </motion.div>
      )}

      {/* ══ TOOL CARDS ══ */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, delay: 0.16 }}>
        <SectionLabel
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          }
          text="ابزار عملیات"
        />
        <div className="crew-tools-grid">

          {briefField && (
            <ToolCard
              icon={ICONS.briefing}
              gradient="linear-gradient(135deg,#db2777 0%,#f472b6 100%)"
              glowColor="rgba(219,39,119,0.3)"
              label="بریفینگ"
              subtitle={briefRead ? '✓ مطالعه شد' : 'اطلاعات ماموریت'}
              done={briefRead}
              progress={briefRead ? 1 : 0}
              arcColor="#db2777"
              onClick={() => setOpenSheet('briefing')}
              delay={0.16}
              circ={CIRC}
            />
          )}

          {checklistField && (
            <ToolCard
              icon={ICONS.checklist}
              gradient="linear-gradient(135deg,#4c1d95 0%,#8b5cf6 100%)"
              glowColor="rgba(76,29,149,0.3)"
              label="چک‌لیست"
              subtitle={`${editableChecklistDone} از ${editableChecklistItems.length} وظیفه شما`}
              progress={editableChecklistItems.length > 0 ? editableChecklistDone / editableChecklistItems.length : (visibleChecklistItems.length > 0 ? 1 : 0)}
              arcColor="#7c3aed"
              onClick={() => setOpenSheet('checklist')}
              delay={0.2}
              circ={CIRC}
            />
          )}

          {photosField && (
            <ToolCard
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>}
              gradient="linear-gradient(135deg,#b45309 0%,#fbbf24 100%)"
              glowColor="rgba(245,158,11,0.3)"
              label={photosField.title || "تصاویر چیدمان"}
              subtitle={photosDone ? 'ثبت شده' : 'نیازمند عکس'}
              done={photosDone}
              progress={photosDone ? 1 : 0}
              arcColor="#d97706"
              onClick={() => setOpenSheet('photos')}
              delay={0.24}
              circ={CIRC}
            />
          )}

          {samplingField && (() => {
            const { target, done } = samplingStatus;
            const myCount = Number(formData[samplingField.id] || 0);
            const displayProgress = target > 0 ? Math.min(done / target, 1) : (myCount > 0 ? 1 : 0);
            const subtitleText = target > 0 ? `توزیع: ${done} از ${target}` : (myCount > 0 ? `تعداد: ${myCount}` : 'ثبت نشده');
            
            return (
              <ToolCard
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>}
                gradient="linear-gradient(135deg,#0f766e 0%,#2dd4bf 100%)"
                glowColor="rgba(15,118,110,0.3)"
                label={samplingField.title || "تعداد سمپلینگ"}
                subtitle={subtitleText}
                done={myCount > 0}
                progress={displayProgress}
                arcColor="#0f766e"
                onClick={() => setOpenSheet('sampling')}
                delay={0.28}
                circ={CIRC}
              />
            );
          })()}

          <ToolCard
            icon={ICONS.report}
            gradient="linear-gradient(135deg,#c2410c 0%,#fb923c 100%)"
            glowColor="rgba(194,65,12,0.3)"
            label="گزارش"
            subtitle={reportTotal > 0 ? `${reportDone} از ${reportTotal} فیلد تکمیل` : 'تکمیل فرم'}
            progress={reportTotal > 0 ? reportDone / reportTotal : 0}
            arcColor="#ea580c"
            onClick={() => setOpenSheet('report')}
            delay={0.32}
            circ={CIRC}
          />

          {teamField && (
            <ToolCard
              icon={ICONS.team}
              gradient="linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%)"
              glowColor="rgba(30,58,138,0.3)"
              label="تیم"
              subtitle={`${teamCount} عضو`}
              arcColor="#2563eb"
              onClick={() => setOpenSheet('team')}
              delay={0.36}
              circ={CIRC}
            />
          )}
        </div>
      </motion.div>

      {/* ══ SHEETS ══ */}
      <CrewSheet open={openSheet === 'report'} onClose={() => setOpenSheet(null)} title="گزارش روزانه">
        {autoFields.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {autoFields.map(f => (
              <div key={f.id} className="crew-sheet-info-chip">
                <p className="crew-sheet-info-label">{f.label}</p>
                <p className="crew-sheet-info-val">{formData[f.id] || '---'}</p>
              </div>
            ))}
          </div>
        )}
        <div className="crew-sheet-fields">
          {reportFields.map(f => (
            <div key={f.id} className="crew-sheet-field-row">
              <label className="crew-sheet-field-label">
                {f.title || f.label || 'بدون عنوان'}
                {f.required && <span className="crew-sheet-required">*</span>}
              </label>
              {renderSectionField(f)}
            </div>
          ))}
          {reportFields.length === 0 && <p className="crew-sheet-empty">فیلدی تعریف نشده است.</p>}
        </div>
      </CrewSheet>

      <CrewSheet open={openSheet === 'checklist'} onClose={() => setOpenSheet(null)} title="چک‌لیست وظایف">
        {checklistField && renderSectionField(checklistField)}
      </CrewSheet>

      <CrewSheet open={openSheet === 'team'} onClose={() => setOpenSheet(null)} title="تیم عملیات">
        {teamField && renderSectionField(teamField)}
      </CrewSheet>

      <CrewSheet open={openSheet === 'briefing'} onClose={() => setOpenSheet(null)} title="بریفینگ ماموریت">
        {briefField && renderSectionField(briefField)}
      </CrewSheet>

      <CrewSheet open={openSheet === 'photos'} onClose={() => setOpenSheet(null)} title={photosField?.title || "تصاویر چیدمان"}>
        {photosField && renderSectionField(photosField)}
      </CrewSheet>

      <CrewSheet open={openSheet === 'sampling'} onClose={() => setOpenSheet(null)} title={samplingField?.title || "تعداد سمپلینگ"}>
        {samplingField && renderSectionField(samplingField)}
      </CrewSheet>

      {/* ══ CHECK-OUT ══ */}
      {checkoutField && (
        <motion.div className="mt-8 mb-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, delay: 0.4 }}>
          <SectionLabel
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>
              </svg>
            }
            text="ثبت خروج"
          />
          <div className="crew-checkin-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="crew-checkin-card crew-checkin-card--out" style={{ position: 'relative' }}>
              
              {/* Click Interceptor if not 100% */}
              {totalProgress < 100 && !checkoutDone && (
                <div 
                  className="absolute inset-0 z-10 cursor-pointer rounded-2xl" 
                  onClick={() => setShowCheckoutAlert(true)}
                  style={{ background: 'rgba(255,255,255,0.01)' }}
                ></div>
              )}
              
              <div style={{ opacity: totalProgress < 100 && !checkoutDone ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                {renderSectionField(checkoutField)}
              </div>
            </div>
          </div>
          <p className="crew-checkin-note" style={{ color: totalProgress < 100 ? '#ef4444' : '' }}>
            {totalProgress < 100 ? 'برای ثبت خروج باید تمام وظایف و گزارشات (۱۰۰٪) تکمیل شود' : 'شما مجاز به ثبت خروج هستید'}
          </p>
        </motion.div>
      )}

      {/* Missing Fields Alert */}
      {showCheckoutAlert && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] p-4 flex items-center justify-center">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-zinc-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-red-100 dark:border-red-900/30"
          >
            <div className="w-16 h-16 bg-red-100 dark:bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h3 className="text-lg font-bold text-center text-gray-900 dark:text-white mb-2">عملیات خروج مجاز نیست!</h3>
            <p className="text-sm text-center text-gray-600 dark:text-gray-400 mb-5">
              برای ثبت تصویر خروج، باید تمام وظایف زیر را تکمیل کنید:
            </p>
            <div className="max-h-48 overflow-y-auto mb-5 space-y-2 px-1">
              {globalProgress.items.filter(i => !i.done).map((item, i) => (
                <div key={i} className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 p-2.5 rounded-xl border border-red-100 dark:border-red-500/20 text-red-800 dark:text-red-300 text-xs font-bold text-right" dir="rtl">
                  <span className="shrink-0 mt-0.5">⚠️</span>
                  <span>{item.title}</span>
                </div>
              ))}
            </div>
            <button 
              onClick={() => setShowCheckoutAlert(false)}
              className="w-full py-3.5 font-bold rounded-xl shadow-md cursor-pointer hover:scale-[1.02] transition-transform"
              style={{ backgroundColor: 'var(--primary-color)', color: '#000' }}
            >
              متوجه شدم
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

/* ── Section Label with SVG icon ── */
function SectionLabel({ icon, text }) {
  return (
    <div className="crew-section-label">
      <span className="crew-section-label-icon">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

/* ── Tool Card (glassmorphism) ── */
function ToolCard({ icon, gradient, glowColor, label, subtitle, progress, done, arcColor, onClick, delay = 0, circ = 99.9 }) {
  const hasProg  = progress !== undefined;
  const filled   = hasProg ? progress * circ : 0;
  const empty    = hasProg ? (1 - progress) * circ : circ;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, delay }}
      whileTap={{ scale: 0.97 }}
      className="crew-tool-card"
    >
      {/* Gradient icon bubble */}
      <div className="crew-tool-icon" style={{ background: gradient, boxShadow: `0 6px 18px ${glowColor}` }}>
        {icon}
      </div>

      {/* Text */}
      <div className="crew-tool-info">
        <p className="crew-tool-label">{label}</p>
        <p className={`crew-tool-sub${done ? ' crew-tool-sub--done' : ''}`}>{subtitle}</p>
      </div>

      {/* Arc progress */}
      {hasProg && (
        <div className="crew-tool-arc">
          <svg width="40" height="40" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
            <circle fill="none" stroke="#ede9fe" strokeWidth="3" cx="18" cy="18" r="15.9" />
            <circle
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              cx="18" cy="18" r="15.9"
              strokeDasharray={`${filled.toFixed(2)} ${empty.toFixed(2)}`}
              style={{ stroke: arcColor, transition: 'stroke-dasharray 0.65s ease' }}
            />
          </svg>
          <span className="crew-tool-arc-pct" style={{ color: arcColor }}>{Math.round((progress || 0) * 100)}</span>
        </div>
      )}

      <ChevronLeft size={13} className="crew-tool-chevron" />
    </motion.button>
  );
}
