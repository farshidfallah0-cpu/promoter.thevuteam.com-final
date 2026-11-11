import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MapPin, ChevronLeft, Cigarette } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import './reports.css';
import { buildBvtWorkbook } from './bvtExcelExport';
import MehramAdminSection, { getMehramStats, collectMehram } from '../../../components/MehramSupermarketReport/MehramAdminSection';
import { buildVisitOrder } from '../../../components/MehramSupermarketReport/VisitDots';
import { mehramStateMatches } from '../../../components/MehramSupermarketReport/mehramData';
import MehramExportModal from '../../../components/MehramSupermarketReport/MehramExportModal';
import { EventCalendarBar } from '../../components/EventCalendarBar';
import { BVT_PRODUCTS, parseLatLngFromMapsUrl } from '../../../components/BVTCigaretteMatch/cigaretteDatabase';
import { roleLabel, parseDailyRoles } from '../../utils/roleHelpers';
import { resolveEffectiveRole } from '../../../utils/roleUtils';
import { calcGlobalProgress } from '../../../utils/progressUtils';
import { MapContainer, TileLayer, Marker, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/* ── Icon set (same visual language as the rest of the admin panel) ── */
const ICONS = {
  clipboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h6m-6 3.75h6M10.5 3.75h3a1.5 1.5 0 011.5 1.5v.75H9v-.75a1.5 1.5 0 011.5-1.5z" /><path d="M6.75 6h10.5a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5v-12a1.5 1.5 0 011.5-1.5z" /></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>,
  camera: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.174C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>,
  flag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4" /><path d="M5 4h13l-3 4.5L18 13H5" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  calendarDays: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  list: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>,
  excel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>,
  pdf: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  reset: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3 3 3 9 9 9" /></svg>,
};

/* ── KPI card ── */
function KpiCard({ icon, label, value, sub, color }) {
  return (
    <div className="r-kpi-card" style={{ '--accent': color }}>
      <div className="r-kpi-glow" />
      <div className="r-kpi-icon-badge" style={{ background: `${color}1f`, color }}>{icon}</div>
      <div className="r-kpi-body">
        <span className="r-kpi-val">{value}</span>
        <span className="r-kpi-label">{label}</span>
        {sub && <span className="r-kpi-sub">{sub}</span>}
      </div>
      <div className="r-kpi-accent" style={{ background: color }} />
    </div>
  );
}

// Helper to convert Persian/Arabic digits to English digits
const faToEnDigits = (str) => String(str || '').replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٥٦٧٨٩".indexOf(d));

// Names in the Mission Complete PDF are a mix of Persian and Latin-script
// crew members. Forcing dir="rtl" on every name (needed for Persian glyphs to
// shape correctly) makes CSS ellipsis truncate LATIN names from the wrong
// end — "Saeed Mohammadi" was showing as "...ed mohammadi" instead of
// "Saeed Moham...". Only force rtl when the text actually contains
// Arabic-script characters; Latin names keep their natural ltr truncation.
const hasArabicScript = (str) => /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(str || '');

// Client names are stored lowercase in the DB (used for case-insensitive
// logo matching elsewhere), but a Latin-script acronym like "bvt" should
// still print as "BVT" on the client-facing PDF rather than the raw DB casing.
const KNOWN_CLIENT_ACRONYMS = ['bvt'];
const formatClientName = (name) => {
  if (!name) return name;
  const lower = String(name).trim().toLowerCase();
  return KNOWN_CLIENT_ACRONYMS.includes(lower) ? lower.toUpperCase() : name;
};

// The promoter app stamps the exact capture moment onto `${field.id}_time` (ms
// epoch) the instant a check-in/check-out photo is taken — that is the only
// trustworthy per-field timestamp. The submission row itself is a single row
// per promoter/day that gets overwritten in place on every save, so the row's
// own `submitted_at` mutates every time (checkout included) and cannot be used
// as a stand-in for "when the check-in photo was taken". `data_timestamps`
// (built below from row-level `submitted_at`) is only a fallback for rows
// saved before this per-field stamp existed.
const getFieldCaptureTime = (s, field, fallbackIso) => {
  if (field && s.data && s.data[field.id]) {
    const raw = s.data[`${field.id}_time`];
    const ms = raw !== undefined && raw !== null ? Number(raw) : NaN;
    if (!isNaN(ms) && ms > 0) return new Date(ms);
    return fallbackIso ? new Date(fallbackIso) : null;
  }
  return null;
};

// Tehran-local "date · time" stamp shown over a photo in the fullscreen viewer.
const formatPhotoStamp = (d) => {
  if (!d || isNaN(d.getTime())) return null;
  const tz = { timeZone: 'Asia/Tehran' };
  return {
    date: d.toLocaleDateString('fa-IR', { ...tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    time: d.toLocaleTimeString('fa-IR', { ...tz, hour: '2-digit', minute: '2-digit' }),
  };
};

// Capture time of a checklist item photo: the promoter app stamps
// `${field.id}_photo_${idx}_time` on first upload (same as check-in/out);
// older rows fall back to when that key was first saved.
const getChecklistPhotoTime = (s, photoKey) => {
  const ms = Number(s.data?.[`${photoKey}_time`]);
  if (!isNaN(ms) && ms > 0) return new Date(ms);
  const fallback = s.data_timestamps?.[photoKey] || s.first_submitted_at || s.submitted_at;
  return fallback ? new Date(fallback) : null;
};

const getCheckinField = (fields, s) => fields.find(f => f.type === 'camera_checkin') || fields.find(f => ['camera', 'image'].includes(f.type) && s.data[f.id]);
const getCheckoutField = (fields) => fields.find(f => f.type === 'camera_checkout');

const getCheckinTime = (s, fields) => {
  const field = getCheckinField(fields, s);
  const fallback = s.first_submitted_at || s.submitted_at;
  return getFieldCaptureTime(s, field, fallback);
};

const getCheckoutTime = (s, fields) => {
  const field = getCheckoutField(fields);
  const fallback = s.submitted_at;
  return getFieldCaptureTime(s, field, fallback);
};

// Persian/Arabic digits → English (dates coming from the Jalali date picker
// are stored with whichever digit set the admin typed).
const toEnDigits = (s) => String(s || '')
  .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

// selectedEvent.start_date / a promoter's assigned_dates are Jalali calendar
// strings ("YYYY/MM/DD"), not ISO — this parses them properly (via the same
// react-date-object calendar the rest of the admin panel uses) so the Mission
// Complete PDF can show a real English weekday name next to the Jalali date.
function buildMissionDays(selectedEvent) {
  if (!selectedEvent?.start_date) return [];
  const seen = new Set();
  const days = String(selectedEvent.start_date)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(raw => {
      const key = toEnDigits(raw);
      if (seen.has(key)) return null;
      seen.add(key);
      try {
        const dObj = new DateObject({ date: key, format: 'YYYY/MM/DD', calendar: persian, locale: persian_fa });
        if (!dObj.isValid) return null;
        const gDate = dObj.toDate();
        return {
          rawPart: raw,
          dateKey: key,
          gDate: gDate && !isNaN(gDate.getTime()) ? gDate : null,
          weekdayEn: gDate && !isNaN(gDate.getTime()) ? gDate.toLocaleDateString('en-US', { weekday: 'long' }) : '',
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  days.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return days.map((d, idx) => ({ ...d, dayNum: idx + 1 }));
}

// Renders the event's day list as a plain-English date range for the Mission
// Completed PDF (e.g. "August 4–6, 2026" or "Aug 30 – Sep 1, 2026") from the
// Gregorian dates already resolved by buildMissionDays.
function formatMissionDateRangeEn(missionDays) {
  const dates = missionDays.map(d => d.gDate).filter(Boolean).sort((a, b) => a - b);
  if (dates.length === 0) return '—';
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first.getTime() === last.getTime()) {
    return first.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  if (first.getFullYear() === last.getFullYear()) {
    if (first.getMonth() === last.getMonth()) {
      return `${first.toLocaleDateString('en-US', { month: 'long' })} ${first.getDate()}–${last.getDate()}, ${last.getFullYear()}`;
    }
    return `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatMissionDateRangeFa(missionDays) {
  const dates = missionDays.map(d => d.gDate).filter(Boolean).sort((a, b) => a - b);
  if (dates.length === 0) return '—';
  const first = dates[0];
  const last = dates[dates.length - 1];
  const opts = { year: 'numeric', month: 'long', day: 'numeric' };
  if (first.getTime() === last.getTime()) {
    return first.toLocaleDateString('fa-IR', opts);
  }
  return `${first.toLocaleDateString('fa-IR', opts)} تا ${last.toLocaleDateString('fa-IR', opts)}`;
}

/* ── Compact table view — fast scanning of many reports at once ── */
function ReportsTableView({ submissions, fields, getPromoterName, calculateLateness, openSubmissionPhoto, localFlags = {}, approvalMode = false, clientView = false }) {
  const checklistField = fields.find(f => f.type === 'advanced_checklist');
  const bvtSamplingField = fields.find(f => f.type === 'bvt_sampling_report');
  const dailyReportField = fields.find(f => f.type === 'daily_report');
  const mehramField = fields.find(f => f.type === 'mehram_supermarket_report');

  return (
    <div className="reports-table-wrap">
      <table className="reports-table">
        <thead>
          <tr>
            <th>#</th>
            <th>پروموتر</th>
            <th>تاریخ</th>
            <th>ساعت ورود</th>
            <th>وضعیت</th>
            <th>ورود</th>
            <th>خروج</th>
            <th>چک‌لیست</th>
            <th>گزارش روزانه</th>
            {bvtSamplingField && <th>سمپل BVT</th>}
            {mehramField && <th>سوپرمارکت‌ها</th>}
            {approvalMode && <th>تایید کلاینت</th>}
          </tr>
        </thead>
        <tbody>
          {submissions.map((s, i) => {
            const checkinTimeObj = getCheckinTime(s, fields);
            const timeStr = checkinTimeObj ? checkinTimeObj.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '-';
            const dateObj = s.first_submitted_at ? new Date(s.first_submitted_at) : (s.submitted_at ? new Date(s.submitted_at) : null);
            const dateStr = dateObj ? dateObj.toLocaleDateString('fa-IR') : '-';

            const checkinField = getCheckinField(fields, s);
            const checkoutField = getCheckoutField(fields);
            const checkinUrl = checkinField && s.data[checkinField.id] ? (Array.isArray(s.data[checkinField.id]) ? s.data[checkinField.id][0] : s.data[checkinField.id]) : null;
            const checkoutUrl = checkoutField && s.data[checkoutField.id] ? (Array.isArray(s.data[checkoutField.id]) ? s.data[checkoutField.id][0] : s.data[checkoutField.id]) : null;

            const lateness = calculateLateness(checkinTimeObj);

            let checklistPct = null;
            if (checklistField) {
              const obj = s.data[`${checklistField.id}_checklist`];
              if (obj) {
                const items = checklistField.checklistItems || [1, 2, 3];
                const total = items.length || 1;
                const done = items.filter((_, idx) => obj[idx]).length;
                checklistPct = Math.round((done / total) * 100);
              }
            }
            const hasReportText = dailyReportField && (s.data[`${dailyReportField.id}_summary`] || s.data[`${dailyReportField.id}_issues`]);

            return (
              <tr key={s.id}>
                <td className="rt-num">{i + 1}</td>
                <td>
                  <div className="rt-promoter">
                    <span className="rt-ava">{getPromoterName(s).charAt(0)}</span>
                    <span>{getPromoterName(s)}</span>
                    {s.submission_count > 1 && <span className="rt-sub-count">{s.submission_count}×</span>}
                  </div>
                </td>
                <td className="rt-muted">{dateStr}</td>
                <td className="rt-muted">{timeStr}</td>
                <td>
                  {lateness
                    ? (lateness.isLate
                      ? <span className="r-pill-tag danger">تاخیر {lateness.text}</span>
                      : <span className="r-pill-tag success">به‌موقع</span>)
                    : <span className="rt-muted">—</span>}
                </td>
                <td>{checkinUrl ? (
                  <div className="relative inline-block">
                    {(localFlags[`${s.field_submission_ids?.[checkinField.id] || s.original_id}_${checkinField.id}`] || s.data._flags?.[checkinField.id]) && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center z-10 shadow-sm" title={(localFlags[`${s.field_submission_ids?.[checkinField.id] || s.original_id}_${checkinField.id}`] || s.data._flags?.[checkinField.id])?.reason}>⚠️</span>}
                    <img src={checkinUrl} className="rt-thumb" onClick={() => openSubmissionPhoto(s, checkinUrl, checkinField.id)} alt="" />
                  </div>
                ) : <span className="rt-muted">—</span>}</td>
                <td>{checkoutUrl ? (
                  <div className="relative inline-block">
                    {(localFlags[`${s.field_submission_ids?.[checkoutField.id] || s.original_id}_${checkoutField.id}`] || s.data._flags?.[checkoutField.id]) && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center z-10 shadow-sm" title={(localFlags[`${s.field_submission_ids?.[checkoutField.id] || s.original_id}_${checkoutField.id}`] || s.data._flags?.[checkoutField.id])?.reason}>⚠️</span>}
                    <img src={checkoutUrl} className="rt-thumb" onClick={() => openSubmissionPhoto(s, checkoutUrl, checkoutField.id)} alt="" />
                  </div>
                ) : <span className="rt-muted">—</span>}</td>
                <td>
                  {checklistPct !== null ? (
                    <div className="rt-progress">
                      <div className="rt-progress-track"><div className="rt-progress-fill" style={{ width: `${checklistPct}%` }} /></div>
                      <span>{checklistPct}٪</span>
                    </div>
                  ) : <span className="rt-muted">—</span>}
                </td>
                <td>{hasReportText ? <span className="r-pill-tag info">دارد</span> : <span className="rt-muted">—</span>}</td>
                {bvtSamplingField && (() => {
                  const counts = s.data[`${bvtSamplingField.id}_counts`] || {};
                  const prods = bvtSamplingField.bvtProducts?.length ? bvtSamplingField.bvtProducts : BVT_PRODUCTS;
                  const sum = prods.reduce((a, p) => a + (Number(counts[p.id]) || 0), 0);
                  return <td>{sum > 0 ? <span className="r-pill-tag info">{sum.toLocaleString('fa-IR')}</span> : <span className="rt-muted">—</span>}</td>;
                })()}
                {mehramField && (() => {
                  const m = getMehramStats(mehramField, s.data);
                  return <td>{m.reports > 0 || (!clientView && m.calls > 0)
                    ? <>
                        <span className="r-pill-tag info">{m.reports.toLocaleString('fa-IR')} گزارش{clientView ? '' : ` · ${m.calls.toLocaleString('fa-IR')} تماس`}</span>
                        {m.shortages > 0 && <span className="r-pill-tag danger" style={{ marginInlineStart: 4 }}>{m.shortages.toLocaleString('fa-IR')} کمبود</span>}
                      </>
                    : <span className="rt-muted">—</span>}</td>;
                })()}
                {approvalMode && (
                  <td>
                    {s.approval === 'approved' && <span className="r-pill-tag success">تایید شده</span>}
                    {s.approval === 'changed' && <span className="r-pill-tag warning">تغییر جدید</span>}
                    {s.approval === 'pending' && <span className="r-pill-tag danger">در انتظار</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Jalali → Gregorian [y, m, d] (same algorithm as mehramVisits.js).
function jalaliToGregorian(jy, jm, jd) {
  const y = jy + 1595;
  let days = -355668 + 365 * y + Math.floor(y / 33) * 8 + Math.floor(((y % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    days -= 1;
    gy += 100 * Math.floor(days / 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const sal = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < 13 && gd > sal[gm]) { gd -= sal[gm]; gm += 1; }
  return [gy, gm, gd];
}

// Helper to extract and format unique event days
function getEventDaysList(selectedEvent, submissions) {
  const dayList = [];
  const addedKeys = new Set();

  if (selectedEvent?.start_date) {
    const rawParts = String(selectedEvent.start_date).split(',').map(s => s.trim()).filter(Boolean);
    rawParts.sort((a, b) => faToEnDigits(a).localeCompare(faToEnDigits(b)));
    rawParts.forEach((part, idx) => {
      const normPart = faToEnDigits(part);
      if (!addedKeys.has(normPart)) {
        addedKeys.add(normPart);

        let label = part;
        let dayOfWeek = '';

        // Event days are typed either as ISO dates or as Jalali «1405/08/04»; both get a weekday name.
        const m = normPart.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
        if (m) {
          let [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
          const jalali = y < 1700;
          if (jalali) [y, mo, d] = jalaliToGregorian(y, mo, d);
          const dObj = new Date(Date.UTC(y, mo - 1, d));
          if (!isNaN(dObj.getTime())) {
            dayOfWeek = dObj.toLocaleDateString('fa-IR', { weekday: 'long', timeZone: 'UTC' });
            if (!jalali) label = dObj.toLocaleDateString('fa-IR', { timeZone: 'UTC' });
          }
        }

        dayList.push({
          id: normPart,
          dayNum: idx + 1,
          dateKey: normPart,
          rawPart: part,
          weekday: dayOfWeek,
          dateText: label,
          label: `روز ${idx + 1} (${dayOfWeek ? dayOfWeek + ' ' : ''}${label})`,
        });
      }
    });
  }

  return dayList;
}

// Today (Tehran) — ISO event days compare by date, Jalali-typed days by their normalised «yyyy/m/d».
const isTodayDay = (day) => {
  if (!day) return false;
  const now = new Date(Date.now() + 210 * 60 * 1000);
  if (faToEnDigits(day.dateKey) === now.toISOString().slice(0, 10)) return true;
  const jal = faToEnDigits(new Date().toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' })).replace(/\/0/g, '/');
  return [day.dateKey, day.rawPart].some((x) => faToEnDigits(String(x || '')).replace(/\/0/g, '/') === jal);
};

const matchesDay = (s, dayItem) => {
  if (!s || !dayItem) return false;
  const timeToUse = s.first_submitted_at || s.submitted_at;
  if (!timeToUse) return false;
  const subIso = timeToUse.slice(0, 10);
  const subObj = new Date(timeToUse);
  const subJalali = !isNaN(subObj.getTime()) ? faToEnDigits(subObj.toLocaleDateString('fa-IR')) : '';

  const targetNorm = faToEnDigits(dayItem.dateKey);
  const targetRawNorm = faToEnDigits(dayItem.rawPart);

  const cleanTarget = targetNorm.replace(/\/0/g, '/');
  const cleanTargetRaw = targetRawNorm.replace(/\/0/g, '/');
  const cleanSubJalali = subJalali.replace(/\/0/g, '/');

  if (subIso === targetNorm || subIso === targetRawNorm) return true;
  if (cleanSubJalali && (cleanSubJalali === cleanTarget || cleanSubJalali === cleanTargetRaw)) return true;
  return false;
};

// document.fonts.ready only resolves for faces the browser has already
// started fetching — it does nothing to *start* a fetch. A weight/family
// combo that happens not to be on-screen anywhere else yet (e.g. a PDF
// template's own heading weight) can lose that race and get captured in a
// generic fallback font instead of Vazirmatn/Poppins. Explicitly requesting
// every weight actually used across the PDF templates before waiting on
// `ready` removes the race instead of hoping something else already triggered
// the load.
const preloadReportFonts = async () => {
  if (!document.fonts) return;
  const specs = [
    '400 16px Vazirmatn', '600 16px Vazirmatn', '700 16px Vazirmatn', '800 16px Vazirmatn', '900 16px Vazirmatn',
    '400 16px Poppins', '600 16px Poppins', '700 16px Poppins', '800 16px Poppins',
  ];
  try {
    await Promise.all(specs.map(spec => document.fonts.load(spec).catch(() => {})));
    await document.fonts.ready;
  } catch { /* best-effort — capture proceeds with whatever loaded */ }
};

export const ReportsTab = ({ selectedEvent, submissions, token, formatAmount, users, onGoToMapPoint, requiresApproval = false, canApprove = false, onApprovalChange, clientView = false, onRefresh, refreshing = false, updatedAt = null, canDelete = false }) => {
  const [filterDateRange, setFilterDateRange] = useState('all');
  const [filterPromoter, setFilterPromoter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('cards');
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  // html2canvas's foreignObjectRendering mode captures the template through an
  // SVG-as-<img>, which — per browser security rules for SVG images — refuses
  // to load ANY externally-referenced image while rasterizing (neither a CSS
  // background-image nor a plain <img src>, even same-origin). Both the
  // template's background art and the pinned photos only render once inlined
  // as base64 data URIs here, swapped in for the brief capture window only.
  const [pdfCaptureAssets, setPdfCaptureAssets] = useState(null);
  // Asked for once per export (see exportToPDF) rather than kept as a
  // persistent field on the event — this is a one-off number for a single
  // poster, not something that needs to live anywhere else. null means "not
  // provided this export", which hides the whole section instead of showing
  // a zero.
  const [missionSampledCount, setMissionSampledCount] = useState(null);
  const [bvtPdfLoading, setBvtPdfLoading] = useState(false);
  const [bvtExcelLoading, setBvtExcelLoading] = useState(false);
  const [mehramExportOpen, setMehramExportOpen] = useState(false);
  const [bvtCaptureAssets, setBvtCaptureAssets] = useState(null);
  const [bvtMapReady, setBvtMapReady] = useState(false);
  const [bvtMapImageUri, setBvtMapImageUri] = useState(null);
  // bvtPageHeight starts at 2120 and grows to fit the unbounded
  // sampled-cigarettes list before PDF capture (see exportBvtToPDF).
  const [bvtPageHeight, setBvtPageHeight] = useState(2120);
  // The itemized "sampled cigarettes" list has no upper bound on row count,
  // and it now sits between the extra-stats boxes and the map — so none of
  // .bvt-page's height, .bvt-detail-section's top, or .bvt-map-wrapper's top
  // can be fixed CSS numbers any more. All three are measured and written
  // directly via these refs right before capture (see exportBvtToPDF)
  // instead of through React state — a state+re-render round trip here would
  // race the html2canvas capture (and did: it's why the location pins were
  // landing off-target). Reading layout via ref forces a synchronous reflow,
  // so the very next measurement is guaranteed current.
  const bvtPageRef = useRef(null);
  const bvtExtraStatsRef = useRef(null);
  const bvtDetailSectionRef = useRef(null);
  const bvtMapWrapperRef = useRef(null);
  const [deletedKeys, setDeletedKeys] = useState(new Set());
  // Client-approval (events whose client has its own panel account): the client
  // only ever sees cards one of our admins approved. 'all' | 'pending' | 'approved'.
  const [approvalFilter, setApprovalFilter] = useState('all');
  const [approving, setApproving] = useState({});
  const [localFlags, setLocalFlags] = useState({});
  const refreshRef = useRef(null);

  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [isFlagging, setIsFlagging] = useState(false);

  // Gallery-style stepping through a checklist card's photos in the fullscreen viewer
  const fsGallery = fullscreenImage?.gallery || null;
  const fsIndex = fullscreenImage?.galleryIndex ?? 0;
  const goToFullscreen = (i) => {
    if (!fsGallery || i < 0 || i >= fsGallery.length) return;
    setFlagModalOpen(false);
    setFlagReason('');
    setFullscreenImage({ ...fsGallery[i], gallery: fsGallery, galleryIndex: i });
  };
  const fsPrev = () => goToFullscreen(fsIndex - 1);
  const fsNext = () => goToFullscreen(fsIndex + 1);

  useEffect(() => {
    if (!fullscreenImage) return;
    const onKeyDown = (e) => {
      if (flagModalOpen && e.target?.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') { setFullscreenImage(null); setFlagModalOpen(false); setFlagReason(''); }
      else if (e.key === 'ArrowLeft') fsNext();
      else if (e.key === 'ArrowRight') fsPrev();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreenImage, flagModalOpen]);

  const fsStamp = fullscreenImage?.takenAt ? formatPhotoStamp(new Date(fullscreenImage.takenAt)) : null;

  // Every photo in one report card, in reading order (check-in, check-out,
  // other photo fields, checklist item photos) — the fullscreen viewer steps
  // through these with next/prev and stamps each one's capture date/time.
  // submissionId is the real DB row that holds that photo (report cards are
  // grouped per promoter/day, so s.id is only a group key).
  const buildSubmissionGallery = (s) => {
    const items = [];
    const subIdFor = (key) => s.field_submission_ids?.[key] || s.original_id || s.id;
    const urlsOf = (v) => (Array.isArray(v) ? v : (typeof v === 'string' && v ? [v] : [])).filter(u => typeof u === 'string' && u.trim());
    const promoter = getPromoterName(s);
    const push = (key, urls, extra) => urls.forEach(url => items.push({ url, key, submissionId: subIdFor(key), promoter, ...extra }));

    const checkinF = getCheckinField(fields, s);
    const checkoutF = getCheckoutField(fields);
    if (checkinF) {
      const t = getCheckinTime(s, fields);
      push(checkinF.id, urlsOf(s.data?.[checkinF.id]), { fieldId: checkinF.id, label: 'تصویر ورود', takenAt: t ? t.getTime() : null });
    }
    if (checkoutF) {
      const t = getCheckoutTime(s, fields);
      push(checkoutF.id, urlsOf(s.data?.[checkoutF.id]), { fieldId: checkoutF.id, label: 'تصویر خروج', takenAt: t ? t.getTime() : null });
    }
    fields
      .filter(f => ['camera', 'image', 'photos', 'camera_checkin', 'camera_checkout'].includes(f.type) && f.id !== checkinF?.id && f.id !== checkoutF?.id)
      .forEach(f => {
        const ms = Number(s.data?.[`${f.id}_time`]);
        const fallback = s.data_timestamps?.[f.id] || s.first_submitted_at || s.submitted_at;
        const takenAt = !isNaN(ms) && ms > 0 ? ms : (fallback ? new Date(fallback).getTime() : null);
        push(f.id, urlsOf(s.data?.[f.id]), { fieldId: f.id, label: f.title || f.label || getFieldLabel(f), takenAt });
      });
    fields.filter(f => f.type === 'advanced_checklist').forEach(f => {
      const listItems = f.checklistItems || [];
      Object.keys(s.data || {})
        .map(k => {
          const prefix = `${f.id}_photo_`;
          const rest = k.startsWith(prefix) ? k.slice(prefix.length) : '';
          return /^\d+$/.test(rest) ? [k, rest] : null;
        })
        .filter(Boolean)
        .sort((a, b) => Number(a[1]) - Number(b[1]))
        .forEach(m => {
          const idx = Number(m[1]);
          const item = listItems[idx];
          const t = getChecklistPhotoTime(s, m[0]);
          push(m[0], urlsOf(s.data[m[0]]), {
            fieldId: f.id,
            index: idx,
            label: (typeof item === 'string' ? item : item?.title) || `آیتم ${idx + 1}`,
            takenAt: t ? t.getTime() : null,
          });
        });
    });
    return items;
  };

  // key = the data key holding the photo (field id, or `${fieldId}_photo_${idx}`)
  const openSubmissionPhoto = (s, url, key) => {
    const gallery = buildSubmissionGallery(s);
    let pos = gallery.findIndex(g => g.url === url && (!key || g.key === key));
    if (pos < 0) pos = gallery.findIndex(g => g.url === url);
    if (pos < 0) {
      setFullscreenImage({ url, submissionId: s.field_submission_ids?.[key] || s.original_id, fieldId: key });
      return;
    }
    setFullscreenImage({ ...gallery[pos], gallery, galleryIndex: pos });
  };

  const handleFlagImage = async () => {
    if (!fullscreenImage || !fullscreenImage.submissionId || !fullscreenImage.fieldId) return;
    setIsFlagging(true);
    try {
      // "ADMIN_ONLY" prefix keeps this internal — EventForm.jsx only shows a
      // flag (and its "please retake" notice) to the promoter when the reason
      // does NOT start with this marker, so admin-side flags from here stay
      // invisible to them and never force a reshoot.
      const trimmedReason = flagReason.trim();
      const reason = trimmedReason ? `ADMIN_ONLY: ${trimmedReason}` : 'ADMIN_ONLY';
      const res = await axios.post(`${API_URL}/admin/events/${selectedEvent.id}/submissions/${fullscreenImage.submissionId}/flag`, {
        field_id: fullscreenImage.fieldId,
        index: fullscreenImage.index !== undefined ? fullscreenImage.index : null,
        reason
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.ok) {
        toast.success('تصویر فلگ شد — در گالری نمایش داده می‌شود');

        // Update local state without mutating frozen props
        const key = fullscreenImage.index !== undefined ? `${fullscreenImage.fieldId}_${fullscreenImage.index}` : fullscreenImage.fieldId;
        setLocalFlags(prev => ({
          ...prev,
          [`${fullscreenImage.submissionId}_${key}`]: res.data.flags[key]
        }));

        setFlagModalOpen(false);
        setFullscreenImage(null);
        setFlagReason('');
      }
    } catch (err) {
      console.error(err);
      toast.error('خطا: ' + (err.response?.data?.detail || 'در ثبت وضعیت تصویر'));
    } finally {
      setIsFlagging(false);
    }
  };

  const eventDays = useMemo(() => getEventDaysList(selectedEvent, submissions), [selectedEvent, submissions]);

  // «ویزیت چندم» of every Mehram report: its rank among all the reports of the same store (all days, all promoters).
  const mehramVisitOrder = useMemo(() => {
    const mf = selectedEvent?.fields?.find((f) => f.type === 'mehram_supermarket_report');
    if (!mf) return null;
    return buildVisitOrder((submissions || []).map((s) => collectMehram(mf, s.data).reports));
  }, [selectedEvent, submissions]);

  useEffect(() => {
    if (eventDays.length > 0) {
      const matchToday = eventDays.find(isTodayDay);
      if (matchToday) {
        setFilterDateRange(matchToday.id);
      } else {
        setFilterDateRange('all');
      }
    } else {
      setFilterDateRange('all');
    }
  }, [selectedEvent?.id, eventDays.length]);

  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current);
    if (filterDateRange !== 'all') {
      refreshRef.current = setInterval(() => {
        setSearchTerm(t => t);
      }, 30000);
    }
    return () => clearInterval(refreshRef.current);
  }, [filterDateRange]);

  const fields = selectedEvent?.fields || [];

  const expandedFields = useMemo(() => {
    const exp = [];
    fields.forEach(f => {
      if (f.type === 'daily_report') {
        exp.push({ ...f, id: `${f.id}_summary`, type: 'textarea', label: f.label ? `${f.label} (خلاصه)` : 'خلاصه عملکرد روزانه' });
        exp.push({ ...f, id: `${f.id}_issues`, type: 'textarea', label: f.label ? `${f.label} (مشکلات)` : 'گزارش مشکلات و چالش‌ها' });
      } else {
        exp.push(f);
      }
    });
    return exp;
  }, [fields]);

  const promoters = useMemo(() => {
    if (!users) return [];
    return users.filter(u => !u.is_admin);
  }, [users]);

  const getPromoterName = (s) => {
    if (s.promoter_name && s.promoter_name !== 'نامشخص') return s.promoter_name;
    if (s.promoter_id && users) {
      const u = users.find(u => u.id === s.promoter_id);
      if (u) return u.full_name || u.username;
    }
    return 'نامشخص';
  };

  const getPromoterAvatar = (s) => {
    if (!s.promoter_id || !users) return null;
    const u = users.find(u => u.id === s.promoter_id);
    return u?.profile_picture || null;
  };

  const getPromoterRole = (s) => {
    if (s.promoter_id && users) {
      const u = users.find(u => u.id === s.promoter_id);
      if (u) {
        // A crew member's role can be assigned per event day (daily_roles),
        // while u.role (their base/default role) is always just 'promoter' —
        // set once when they're added and never touched by the per-day role
        // pickers. Using u.role alone is why every report card showed
        // "پروموتر" even for people entered as کاپیتان on that specific day.
        // Resolve the role for the day THIS submission actually belongs to.
        const dailyRoles = parseDailyRoles(u.daily_roles);
        const dayItem = eventDays.find(d => matchesDay(s, d));
        if (dayItem) {
          const dayRole = dailyRoles[dayItem.rawPart] ?? dailyRoles[dayItem.dateKey];
          if (dayRole) return dayRole;
        }
        return u.role || 'promoter';
      }
    }
    return 'promoter';
  };

  const dayCounts = useMemo(() => {
    const counts = { all: submissions.length };
    eventDays.forEach(day => {
      counts[day.id] = submissions.filter(s => matchesDay(s, day)).length;
    });
    return counts;
  }, [submissions, eventDays]);

  const baseFilteredSubmissions = useMemo(() => {
    const sortedOriginal = [...submissions].sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));

    const groups = {};
    sortedOriginal.forEach(s => {
      const ts = s.first_submitted_at || s.submitted_at;
      const dateStr = ts ? new Date(new Date(ts).getTime() + 210 * 60 * 1000).toISOString().split('T')[0] : 'unknown-date';
      const key = `${s.promoter_id}_${dateStr}`;

      if (!groups[key]) {
        groups[key] = {
          id: key,
          original_id: s.id, // Fallback
          promoter_id: s.promoter_id,
          promoter_name: s.promoter_name,
          first_submitted_at: s.first_submitted_at || s.submitted_at,
          submitted_at: s.submitted_at,
          last_updated: s.submitted_at,
          data: { ...s.data },
          data_timestamps: {},
          field_submission_ids: {},
          submission_ids: [],
          approved_count: 0,
          stale_count: 0,
          mehram_states: {},
          mehram_reviews: {},
          mehram_approvals: {},
          approved_by: null,
          approved_at: null,
          submission_count: 1
        };
        for (const k in s.data) {
          groups[key].data_timestamps[k] = s.submitted_at;
          groups[key].field_submission_ids[k] = s.id;
        }
      } else {
        for (const k in s.data) {
          groups[key].data[k] = s.data[k];
          groups[key].field_submission_ids[k] = s.id;
          if (s.data[k] && !groups[key].data_timestamps[k]) {
            groups[key].data_timestamps[k] = s.submitted_at;
          }
        }
        groups[key].last_updated = s.submitted_at;
        groups[key].submitted_at = s.submitted_at;
        if (s.promoter_name && s.promoter_name !== 'نامشخص') {
          groups[key].promoter_name = s.promoter_name;
        }
        groups[key].submission_count += 1;
      }
      // Approval is per card: a card is approved only when every row in it is.
      const g = groups[key];
      g.submission_ids.push(s.id);
      if (s.approved_at) {
        g.approved_count += 1;
        if (!g.approved_at || s.approved_at > g.approved_at) { g.approved_at = s.approved_at; g.approved_by = s.approved_by; }
      }
      if (s.approval_stale) g.stale_count += 1;
      if (s.mehram_states) Object.assign(g.mehram_states, s.mehram_states);
      if (s.mehram_reviews) Object.assign(g.mehram_reviews, s.mehram_reviews);
      if (s.mehram_approvals) Object.assign(g.mehram_approvals, s.mehram_approvals);
    });
    Object.values(groups).forEach(g => {
      const states = Object.values(g.mehram_states);
      if (states.length) {
        // Mehram: approval is per supermarket — the card is approved once every store in it is.
        g.approval = states.every(v => v === 'approved') ? 'approved' : states.every(v => v === 'pending' || v === 'rejected') ? 'pending' : 'changed';
        return;
      }
      g.approval = g.approved_count === 0 ? 'pending'
        : (g.approved_count < g.submission_ids.length || g.stale_count > 0) ? 'changed' : 'approved';
    });

    let result = Object.values(groups).filter(g => !deletedKeys.has(g.id));

    if (filterPromoter !== 'all') {
      result = result.filter(s => String(s.promoter_id) === String(filterPromoter));
    }

    if (filterDateRange !== 'all') {
      const selectedDayObj = eventDays.find(d => d.id === filterDateRange);
      if (selectedDayObj) {
        result = result.filter(s => matchesDay(s, selectedDayObj));
      } else {
        result = result.filter(s => {
          const ts = s.first_submitted_at || s.submitted_at;
          if (!ts) return false;
          // Convert UTC timestamp to Tehran date for correct day boundary comparison
          const tehranDate = new Date(new Date(ts).getTime() + 210 * 60 * 1000).toISOString().slice(0, 10);
          return tehranDate === filterDateRange;
        });
      }
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(s => {
        const pName = getPromoterName(s).toLowerCase();
        if (pName.includes(term)) return true;
        for (const key in s.data) {
          const val = String(s.data[key]).toLowerCase();
          if (val.includes(term)) return true;
        }
        return false;
      });
    }

    result.sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated));
    return result;
  }, [submissions, filterPromoter, filterDateRange, searchTerm, deletedKeys]);

  const approvalCounts = useMemo(() => {
    // Mehram cards count one per supermarket report (a promoter with 10 reports, 5 approved = 5 + 5), other cards one each.
    const c = { all: 0, pending: 0, approved: 0, rejected: 0 };
    baseFilteredSubmissions.forEach(g => {
      const states = Object.values(g.mehram_states || {});
      if (states.length) {
        states.forEach(v => { if (v === 'approved') c.approved += 1; else if (v === 'rejected') c.rejected += 1; else c.pending += 1; });
        c.all += states.length;
      } else {
        c.all += 1;
        if (g.approval === 'approved') c.approved += 1; else c.pending += 1;
      }
    });
    return c;
  }, [baseFilteredSubmissions]);

  const filteredSubmissions = useMemo(() => {
    if (!requiresApproval || approvalFilter === 'all') return baseFilteredSubmissions;
    return baseFilteredSubmissions.filter(g => {
      const states = Object.values(g.mehram_states || {});
      // Mehram: a card stays when at least one of its supermarket reports matches (the section hides the rest).
      if (states.length) return states.some(v => mehramStateMatches(v, approvalFilter));
      return approvalFilter === 'approved' ? g.approval === 'approved' : approvalFilter === 'pending' && g.approval !== 'approved';
    });
  }, [baseFilteredSubmissions, requiresApproval, approvalFilter]);

  // Mehram: approve/withdraw single supermarkets (the client only ever sees approved ones).
  const setMehramApproval = async (cards, reportIds, approve, key) => {
    const ids = cards.flatMap(g => g.submission_ids);
    if (!ids.length || !reportIds.length) return;
    setApproving(p => ({ ...p, [key]: true }));
    try {
      const res = await axios.post(`${API_URL}/admin/events/${selectedEvent.id}/mehram-reports/approval`,
        { submission_ids: ids, report_ids: reportIds, approve },
        { headers: { Authorization: `Bearer ${token}` } });
      onApprovalChange?.(res.data);
      toast.success(approve
        ? (reportIds.length > 1 ? `${reportIds.length.toLocaleString('fa-IR')} سوپرمارکت تایید شد و برای مهرام نمایش داده می‌شود` : 'سوپرمارکت تایید شد و برای مهرام نمایش داده می‌شود')
        : 'تایید لغو شد — این سوپرمارکت دیگر برای مهرام نمایش داده نمی‌شود');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'خطا در تایید گزارش');
    } finally {
      setApproving(p => ({ ...p, [key]: false }));
    }
  };

  // Admin fixes of one supermarket report: photos removed/replaced, answers/statuses changed.
  const saveMehramEdit = async (card, reportId, patch) => {
    const res = await axios.post(`${API_URL}/admin/events/${selectedEvent.id}/mehram-reports/edit`,
      { submission_ids: card.submission_ids, report_id: String(reportId), ...patch },
      { headers: { Authorization: `Bearer ${token}` } });
    onApprovalChange?.(res.data);
    toast.success('تغییرات گزارش ذخیره شد');
  };

  const uploadMehramPhoto = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await axios.post(`${API_URL}/upload/image`, fd, { headers: { Authorization: `Bearer ${token}` } });
    return res.data.url;
  };

  // «عدم تایید» taken back: the report is simply «در انتظار تایید» again.
  const setMehramReset = async (card, reportIds, key) => {
    setApproving(p => ({ ...p, [key]: true }));
    try {
      const res = await axios.post(`${API_URL}/admin/events/${selectedEvent.id}/mehram-reports/reset-review`,
        { submission_ids: card.submission_ids, report_ids: reportIds },
        { headers: { Authorization: `Bearer ${token}` } });
      onApprovalChange?.(res.data);
      toast.success('گزارش به حالت «در انتظار تایید» برگشت');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'خطا در بازگرداندن گزارش');
    } finally {
      setApproving(p => ({ ...p, [key]: false }));
    }
  };

  // Delete one supermarket report for good (only for the account the server allows). The store is «not visited» again everywhere.
  const deleteMehramReport = async (card, reportId) => {
    const res = await axios.post(`${API_URL}/admin/events/${selectedEvent.id}/mehram-reports/delete`,
      { submission_ids: card.submission_ids, report_id: String(reportId) },
      { headers: { Authorization: `Bearer ${token}` } });
    onApprovalChange?.(res.data);
    toast.success('گزارش حذف شد — این فروشگاه دوباره «بازدیدنشده» است و در برنامه‌ی هفتگی می‌ماند');
  };

  // «عدم تایید» with a reason (shown to our other admins, never to the client).
  const setMehramReject = async (card, reportIds, reason, key) => {
    setApproving(p => ({ ...p, [key]: true }));
    try {
      const res = await axios.post(`${API_URL}/admin/events/${selectedEvent.id}/mehram-reports/reject`,
        { submission_ids: card.submission_ids, report_ids: reportIds, reason },
        { headers: { Authorization: `Bearer ${token}` } });
      onApprovalChange?.(res.data);
      toast.success('عدم تایید ثبت شد — این سوپرمارکت برای مهرام نمایش داده نمی‌شود');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'خطا در ثبت عدم تایید');
    } finally {
      setApproving(p => ({ ...p, [key]: false }));
    }
  };

  const setApproval = async (cards, approve, key) => {
    const mehramCards = cards.filter(g => Object.keys(g.mehram_states || {}).length);
    const plainCards = cards.filter(g => !Object.keys(g.mehram_states || {}).length);
    if (mehramCards.length) {
      const reportIds = mehramCards.flatMap(g => Object.entries(g.mehram_states).filter(([, v]) => approve ? (v === 'pending' || v === 'changed') : v === 'approved' || v === 'changed').map(([id]) => id));
      await setMehramApproval(mehramCards, reportIds, approve, key);
    }
    const ids = plainCards.flatMap(g => g.submission_ids);
    if (!ids.length) return;
    setApproving(p => ({ ...p, [key]: true }));
    try {
      const res = await axios.post(`${API_URL}/admin/events/${selectedEvent.id}/submissions/approval`,
        { submission_ids: ids, approve },
        { headers: { Authorization: `Bearer ${token}` } });
      onApprovalChange?.(res.data);
      toast.success(approve
        ? (plainCards.length > 1 ? `${plainCards.length.toLocaleString('fa-IR')} گزارش تایید شد و برای کلاینت نمایش داده می‌شود` : 'گزارش تایید شد و برای کلاینت نمایش داده می‌شود')
        : 'تایید گزارش لغو شد — دیگر برای کلاینت نمایش داده نمی‌شود');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'خطا در تایید گزارش');
    } finally {
      setApproving(p => ({ ...p, [key]: false }));
    }
  };

  const fmtApprovedAt = (ts) => ts ? new Date(ts).toLocaleString('fa-IR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  const renderApprovalStrip = (s) => {
    if (!requiresApproval) return null;
    const mStates = Object.values(s.mehram_states || {});
    if (mStates.length) {
      const ok = mStates.filter(v => v === 'approved').length;
      return (
        <div className={`mrc-approval ${s.approval}`}>
          <span className="mrc-approval-pill">
            {s.approval === 'approved' ? '✓' : '⏳'} {ok.toLocaleString('fa-IR')} از {mStates.length.toLocaleString('fa-IR')} سوپرمارکت برای مهرام تایید شده — تایید هر سوپرمارکت در همان کارت انجام می‌شود
          </span>
        </div>
      );
    }
    const busy = !!approving[s.id];
    const label = { approved: 'تایید شده — قابل مشاهده برای کلاینت', changed: 'تغییرات جدید در انتظار تایید', pending: 'در انتظار تایید — کلاینت نمی‌بیند' }[s.approval];
    return (
      <div className={`mrc-approval ${s.approval}`}>
        <span className="mrc-approval-pill">
          {s.approval === 'approved' ? '✓' : s.approval === 'changed' ? '↻' : '⏳'} {label}
        </span>
        {s.approved_by && s.approval !== 'pending' && (
          <span className="mrc-approval-meta">
            {s.approval === 'changed' ? 'نسخه‌ی قبلی تایید شده توسط' : 'توسط'} {s.approved_by} · {fmtApprovedAt(s.approved_at)}
          </span>
        )}
        {canApprove && (
          <div className="mrc-approval-actions">
            {s.approval !== 'approved' && (
              <button type="button" className="mrc-approve-btn" disabled={busy} onClick={() => setApproval([s], true, s.id)}>
                {busy ? '...' : s.approval === 'changed' ? 'تایید نسخه‌ی جدید' : 'تایید برای کلاینت'}
              </button>
            )}
            {s.approval !== 'pending' && (
              <button type="button" className="mrc-unapprove-btn" disabled={busy} onClick={() => setApproval([s], false, s.id)}>
                لغو تایید
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const calculateLateness = (submissionTimeStr) => {
    if (!submissionTimeStr) return null;
    try {
      // The whole app's schedule (start_time, custom_times) is authored and
      // meant in Tehran wall-clock time. `subDate` is a real instant (fine
      // regardless of viewer timezone), but the old `targetDate.setHours(...)`
      // below applied THAT to the *viewing browser's own local timezone* — so
      // the exact same check-in showed a different lateness depending on
      // where the admin opened the report from (e.g. a real 30-minute delay
      // read as a full hour from Dubai, which is 30 minutes ahead of Tehran).
      // Everything here is computed in explicit Tehran time instead, so the
      // result is the same real-world number no matter who's looking.
      const TEHRAN_OFFSET_MS = 210 * 60 * 1000;
      const GRACE_MS = 5 * 60 * 1000;
      const subDate = new Date(submissionTimeStr);
      let targetTimeStr = selectedEvent?.start_time;

      if (selectedEvent?.custom_times) {
        const subJalali = faToEnDigits(subDate.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' }));
        const subJalaliNoZero = faToEnDigits(subDate.toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' }));

        const matchedKey = Object.keys(selectedEvent.custom_times).find(k => {
          const cleanK = faToEnDigits(k);
          return cleanK === subJalali || cleanK === subJalaliNoZero || cleanK.replace(/\b0/g, '') === subJalaliNoZero;
        });

        if (matchedKey && selectedEvent.custom_times[matchedKey].start) {
          targetTimeStr = selectedEvent.custom_times[matchedKey].start;
        }
      }

      if (!targetTimeStr) return null;

      const [targetH, targetM] = targetTimeStr.split(':').map(Number);
      // Target instant = "targetH:targetM Tehran time, on the Tehran calendar
      // day the check-in itself fell on" — built via the shift-to-UTC-getters
      // trick (add the offset, read UTC fields, build the UTC instant, then
      // subtract the offset back off) instead of Date's local setHours.
      const subShifted = new Date(subDate.getTime() + TEHRAN_OFFSET_MS);
      const targetShifted = new Date(Date.UTC(
        subShifted.getUTCFullYear(), subShifted.getUTCMonth(), subShifted.getUTCDate(),
        targetH, targetM, 0, 0
      ));
      const targetDate = new Date(targetShifted.getTime() - TEHRAN_OFFSET_MS);

      const diffMs = subDate - targetDate;
      const diffMinutes = Math.floor(diffMs / 60000);

      // 5-minute grace period — arriving right at (or just after) the
      // official start doesn't count as being late.
      if (diffMs > GRACE_MS) {
        const hours = Math.floor(diffMinutes / 60);
        const mins = diffMinutes % 60;
        let text = '';
        if (hours > 0) text += `${hours} ساعت`;
        if (hours > 0 && mins > 0) text += ' و ';
        if (mins > 0 || hours === 0) text += `${mins} دقیقه`;
        return { isLate: true, minutes: diffMinutes, text };
      } else {
        return { isLate: false, minutes: 0, text: 'بدون تاخیر' };
      }
    } catch (e) {
      return null;
    }
  };

  const kpiStats = useMemo(() => {
    let checkinsCount = 0;
    let checkoutsCount = 0;
    let lateCount = 0;
    const uniquePromoterIds = new Set();

    filteredSubmissions.forEach(s => {
      uniquePromoterIds.add(s.promoter_id);
      fields.forEach(f => {
        if (f.type === 'camera_checkin' && s.data[f.id]) checkinsCount++;
        if (f.type === 'camera_checkout' && s.data[f.id]) checkoutsCount++;
      });
      const lateness = calculateLateness(getCheckinTime(s, fields));
      if (lateness?.isLate) lateCount++;
    });

    return {
      total: filteredSubmissions.length,
      promotersCount: uniquePromoterIds.size,
      checkins: checkinsCount,
      checkouts: checkoutsCount,
      lates: lateCount
    };
  }, [filteredSubmissions, fields, selectedEvent]);

  // ── Mission Completed PDF: the event's day list, in English ────────────
  // Always covers every event day regardless of whatever date filter happens
  // to be active in the tab — this is a final whole-event summary.
  const missionDays = useMemo(() => buildMissionDays(selectedEvent), [selectedEvent?.start_date]);
  const missionDateRangeEn = useMemo(() => formatMissionDateRangeEn(missionDays), [missionDays]);

  // The optional "SAMPLED PRODUCTS" section (see exportToPDF) needs its own
  // room between OPERATION SUMMARY and the photo grid — everything below it
  // shifts down by this amount, and the page grows to match, only when a
  // count was actually provided for this export. A plain function (not a
  // render-time const) because exportToPDF needs to call it with the count it
  // JUST resolved from the prompt, not whatever `missionSampledCount` state
  // was at the start of this render — reading the render-time const instead
  // was exactly the bug that clipped the footer off the bottom of the PDF:
  // the DOM/CSS height correctly grew (a fresh re-render did see the new
  // state), but the *already-running* exportToPDF call is a closure fixed at
  // the moment it started, so its own copy of that const stayed stuck at the
  // pre-prompt value — capturing a shorter box than the page had actually
  // grown to.
  const MISSION_EXTRA_SHIFT = 110;
  const computeMissionLayout = (count) => ({
    pageHeight: count != null ? 1514 + MISSION_EXTRA_SHIFT : 1514,
    photoGridTop: count != null ? 700 + MISSION_EXTRA_SHIFT : 700,
    locationTop: count != null ? 1080 + MISSION_EXTRA_SHIFT : 1080,
  });
  const { pageHeight: missionPageHeight, photoGridTop: missionPhotoGridTop, locationTop: missionLocationTop } = computeMissionLayout(missionSampledCount);
  const missionDateRangeFa = useMemo(() => formatMissionDateRangeFa(missionDays), [missionDays]);

  // Up to 6 photos the admin pinned in the Gallery tab for this summary —
  // padded to exactly 6 slots so empty slots render as blank placeholder boxes.
  const missionReportPhotos = useMemo(() => {
    const photos = (selectedEvent?.report_photos || []).slice(0, 6);
    return Array.from({ length: 6 }, (_, i) => photos[i] || null);
  }, [selectedEvent?.report_photos]);

  // Executive Excel Export — styled workbook (brand header row, zebra rows, frozen
  // header, autofilter, colored status column) plus a summary sheet, built with
  // ExcelJS since the plain `xlsx` community package can't write any cell styling.
  const exportToExcel = async () => {
    if (filteredSubmissions.length === 0) return toast.error('گزارشی برای خروجی وجود ندارد');
    setExportLoading(true);
    try {
      const mainPhotoFields = fields.filter(f => ['camera_checkin', 'camera_checkout', 'camera', 'image', 'photos'].includes(f.type));
      const checkinField = mainPhotoFields.find(f => f.type === 'camera_checkin') || mainPhotoFields[0];
      const checkoutField = mainPhotoFields.find(f => f.type === 'camera_checkout');
      const dailyReportField = fields.find(f => f.type === 'daily_report');
      const checklistField = fields.find(f => f.type === 'advanced_checklist');

      const customOtherFields = fields.filter(f =>
        !['camera_checkin', 'camera_checkout', 'daily_report', 'advanced_checklist', 'bvt_sampling_report'].includes(f.type) &&
        f.id !== checkinField?.id && f.id !== checkoutField?.id
      );
      // One column per BVT pack (+ a total) so counts can be summed/pivoted in Excel.
      const bvtSamplingExportField = fields.find(f => f.type === 'bvt_sampling_report');
      const bvtSamplingExportProducts = bvtSamplingExportField ? getSamplingProducts(bvtSamplingExportField) : [];

      const BRAND = 'FF6366F1';
      const HEADER_TEXT = 'FFFFFFFF';
      const ZEBRA = 'FFF8FAFC';
      const BORDER = 'FFE2E8F0';

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'VU Event Platform';
      workbook.created = new Date();

      /* ── Sheet 1: Executive summary ── */
      const summarySheet = workbook.addWorksheet('خلاصه آماری', { views: [{ rightToLeft: true }] });
      summarySheet.columns = [{ width: 32 }, { width: 20 }];

      summarySheet.mergeCells('A1:B1');
      const titleCell = summarySheet.getCell('A1');
      titleCell.value = `گزارش جامع ایونت: ${selectedEvent?.name || ''}`;
      titleCell.font = { size: 15, bold: true, color: { argb: 'FF1E293B' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      summarySheet.getRow(1).height = 30;

      summarySheet.mergeCells('A2:B2');
      const subCell = summarySheet.getCell('A2');
      subCell.value = `تاریخ خروجی: ${new Date().toLocaleDateString('fa-IR')}`;
      subCell.font = { size: 11, color: { argb: 'FF64748B' } };
      subCell.alignment = { horizontal: 'center' };
      summarySheet.getRow(2).height = 22;

      summarySheet.addRow([]);

      const styleHeaderRow = (row) => row.eachCell(cell => {
        cell.font = { bold: true, color: { argb: HEADER_TEXT } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      const styleZebraRow = (row, i) => row.eachCell(cell => {
        cell.border = { bottom: { style: 'thin', color: { argb: BORDER } } };
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      });

      styleHeaderRow(summarySheet.addRow(['شاخص', 'مقدار']));
      [
        ['گزارش کل', kpiStats.total],
        ['پروموتر فعال', kpiStats.promotersCount],
        ['ورود ثبت‌شده', kpiStats.checkins],
        ['خروج ثبت‌شده', kpiStats.checkouts],
        ['تعداد تاخیرها', kpiStats.lates],
      ].forEach((r, i) => {
        const row = summarySheet.addRow(r);
        row.getCell(1).font = { bold: true, color: { argb: 'FF334155' } };
        row.getCell(2).font = { bold: true, color: { argb: 'FF4F46E5' } };
        row.getCell(2).alignment = { horizontal: 'center' };
        styleZebraRow(row, i);
      });

      summarySheet.addRow([]);
      const breakdownTitleRow = summarySheet.addRow(['عملکرد به تفکیک پروموتر']);
      summarySheet.mergeCells(`A${breakdownTitleRow.number}:B${breakdownTitleRow.number}`);
      breakdownTitleRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF1E293B' } };
      breakdownTitleRow.getCell(1).alignment = { horizontal: 'center' };

      const byPromoter = {};
      filteredSubmissions.forEach(s => {
        const name = getPromoterName(s);
        byPromoter[name] = (byPromoter[name] || 0) + 1;
      });
      styleHeaderRow(summarySheet.addRow(['نام پروموتر', 'تعداد گزارش']));
      Object.entries(byPromoter).sort((a, b) => b[1] - a[1]).forEach(([name, count], i) => {
        const row = summarySheet.addRow([name, count]);
        row.getCell(2).alignment = { horizontal: 'center' };
        styleZebraRow(row, i);
      });

      /* ── Sheet 2: Detailed report table ── */
      const headers = [
        'ردیف', 'نام پروموتر', 'تاریخ ثبت', 'زمان ثبت ورود',
        'تصویر ورود (لینک)', 'تصویر خروج (لینک)', 'زمان ثبت خروج',
        'وضعیت تاخیر/حضور', 'چک‌لیست وظایف', 'خلاصه عملکرد روزانه', 'گزارش مشکلات و چالش‌ها',
        ...customOtherFields.map(f => getFieldLabel(f)),
        ...(bvtSamplingExportField ? [...bvtSamplingExportProducts.map(p => `سمپل ${p.name}`), 'مجموع سمپل BVT'] : []),
      ];

      const detailSheet = workbook.addWorksheet('گزارشات ایونت', {
        views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
      });
      detailSheet.columns = headers.map((h, i) => {
        let width = 20;
        if (i === 0) width = 7;
        else if (i === 1) width = 18;
        else if ([4, 5].includes(i)) width = 30;
        else if ([8, 9, 10].includes(i)) width = 40;
        return { header: h, key: `c${i}`, width };
      });
      styleHeaderRow(detailSheet.getRow(1));
      detailSheet.getRow(1).height = 28;

      filteredSubmissions.forEach((s, index) => {
        const checkinTimeObj = getCheckinTime(s, fields);
        const checkoutTimeObj = getCheckoutTime(s, fields);
        const dateStr = (checkinTimeObj || (s.submitted_at ? new Date(s.submitted_at) : new Date())).toLocaleDateString('fa-IR');
        const timeStr = checkinTimeObj ? checkinTimeObj.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '-';

        const cInUrl = checkinField && s.data[checkinField.id] ? (Array.isArray(s.data[checkinField.id]) ? s.data[checkinField.id][0] : s.data[checkinField.id]) : '-';
        const cOutUrl = checkoutField && s.data[checkoutField.id] ? (Array.isArray(s.data[checkoutField.id]) ? s.data[checkoutField.id][0] : s.data[checkoutField.id]) : '-';
        const cOutTime = checkoutTimeObj ? checkoutTimeObj.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '-';

        const lateness = calculateLateness(checkinTimeObj);
        const latenessText = lateness ? (lateness.isLate ? `تاخیر: ${lateness.text}` : 'به موقع') : '-';

        let checklistText = '-';
        if (checklistField && s.data[`${checklistField.id}_checklist`]) {
          const checklistObj = s.data[`${checklistField.id}_checklist`] || {};
          const items = checklistField.checklistItems || [
            { title: 'تحویل وسایل، استند و نمونه محصولات' },
            { title: 'حضور در لوکیشن و اعلام ورود' },
            { title: 'چیدمان میز سمپلینگ' },
          ];
          checklistText = items.map((item, idx) => `${item.title}: ${checklistObj[idx] ? 'انجام شد' : 'انجام نشد'}`).join(' | ');
        }

        const summaryText = dailyReportField ? (s.data[`${dailyReportField.id}_summary`] || '-') : '-';
        const issuesText = dailyReportField ? (s.data[`${dailyReportField.id}_issues`] || '-') : '-';

        const row = [
          index + 1, getPromoterName(s), dateStr, timeStr,
          cInUrl, cOutUrl, cOutTime, latenessText, checklistText, summaryText, issuesText,
        ];
        customOtherFields.forEach(f => {
          let val = s.data[f.id];
          if (val === undefined || val === null) val = '-';
          else if (typeof val === 'boolean') val = val ? 'بله' : 'خیر';
          else if (f.type === 'number') val = formatAmount ? formatAmount(val) : val;
          else if (Array.isArray(val)) val = val.join(', ');
          row.push(String(val));
        });
        if (bvtSamplingExportField) {
          getSamplingRows(bvtSamplingExportField, s.data).forEach(r => row.push(r.count));
          row.push(getSamplingTotal(bvtSamplingExportField, s.data));
        }

        const excelRow = detailSheet.addRow(row);
        excelRow.eachCell(cell => {
          cell.alignment = { vertical: 'middle', wrapText: true, horizontal: 'right' };
          cell.border = { bottom: { style: 'thin', color: { argb: BORDER } } };
        });
        if (index % 2 === 1) {
          excelRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
          });
        }
        excelRow.getCell(8).font = { bold: true, color: { argb: lateness?.isLate ? 'FFDC2626' : 'FF16A34A' } };
      });

      detailSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer], { type: 'application/octet-stream' }), `VU_Reports_${selectedEvent?.slug || 'event'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('فایل اکسل جامع با موفقیت ساخته شد');
    } catch (e) {
      console.error(e);
      toast.error('خطا در ساخت فایل اکسل');
    } finally {
      setExportLoading(false);
    }
  };

  // "Mission Completed" poster-style PDF — a single flowing page shaped like
  // the branded template (background art + pinned photos), not an A4 report.
  const fetchAsDataUri = async (url) => {
    if (!url) return null;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const exportToPDF = async () => {
    if (!selectedEvent) return toast.error('رویدادی انتخاب نشده');

    // Asked before anything else — leaving it blank/cancelling skips the
    // "SAMPLED PRODUCTS" section entirely rather than showing a 0.
    const rawCount = window.prompt('تعداد محصولات سمپل‌شده را وارد کنید (اختیاری — برای رد شدن از این بخش خالی بگذارید):', '');
    const parsedCount = rawCount != null ? parseInt(faToEnDigits(rawCount).trim(), 10) : NaN;
    const finalCount = Number.isFinite(parsedCount) && parsedCount >= 0 ? parsedCount : null;
    setMissionSampledCount(finalCount);
    // Computed from `finalCount` directly (not the render-scoped
    // missionPageHeight etc.) — this function's own closure would otherwise
    // keep whatever those were BEFORE the prompt above ran, since a state
    // update doesn't retroactively change an already-executing closure's
    // local bindings. That mismatch was exactly why the footer got clipped
    // off the bottom of the PDF: the page's real DOM/CSS height grew to fit
    // the new section, but the html2canvas capture below still used the
    // pre-prompt (shorter) height.
    const { pageHeight: capturePageHeight, locationTop: captureLocationTop } = computeMissionLayout(finalCount);
    // One frame so the template (whose layout shifts to make/skip room for
    // that section) reflects the new state before it gets captured below.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    setPdfLoading(true);
    try {
      const originalScrollY = window.scrollY;
      window.scrollTo(0, 0);

      const element = document.getElementById('pdf-export-template');
      element.classList.add('pdf-rendering-active');

      // The Persian crew names need the Vazirmatn font's Arabic-script glyph
      // shapes actually loaded before the foreignObject capture rasterizes
      // them — text that shows up later in the page (captains, further down)
      // can otherwise lose that race even though earlier text (promoters)
      // already forced the font in.
      await preloadReportFonts();

      // html2canvas's foreignObjectRendering mode captures through an
      // SVG-as-<img>, and per browser security rules an SVG loaded as an image
      // is barred from fetching any externally-referenced resource while it
      // rasterizes — neither a CSS background-image nor a plain <img src>,
      // even same-origin ones. The background art and pinned photos only
      // show up once inlined as base64 data URIs, so swap those in and let
      // React re-render before capturing.
      const [logoDataUri, locationImageDataUri, ...photoDataUris] = await Promise.all([
        fetchAsDataUri('/images/vuLogo.png'),
        fetchAsDataUri(selectedEvent?.report_location_image),
        ...missionReportPhotos.map((url) => fetchAsDataUri(url)),
      ]);
      setPdfCaptureAssets({ logo: logoDataUri, locationImage: locationImageDataUri, photos: photoDataUris });

      // Let the browser paint the now-visible template (with swapped-in data
      // URIs) once before capture.
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        imageTimeout: 15000,
        // html2canvas's default renderer draws every glyph itself instead of
        // delegating to the browser's text-shaping engine, so it can't join
        // Persian/Arabic letters into their connected forms — names come out
        // as disconnected, garbled characters no matter what `dir` says.
        // foreignObjectRendering routes the capture through an SVG
        // <foreignObject> instead, which the browser rasterizes with its own
        // real text engine (the same one that already renders these names
        // correctly everywhere else in the app), fixing the shaping at the
        // source rather than working around it.
        foreignObjectRendering: true,
        // Pin the exact capture box instead of letting html2canvas infer it
        // from the element's live bounding rect. With foreignObjectRendering,
        // that inference has been the actual source of the recurring
        // off-color strip down one edge: it's been picking up a sliver of
        // whatever sits just past the template in the page's own layout
        // (scrollbar gutter, etc.), not a sizing mismatch inside the template
        // itself — which is why fixing things *inside* .msc-page never
        // fully closed the gap. Forcing width/height/x/y to the template's
        // own authored 750x1514 box leaves no room for that drift.
        width: 750,
        height: capturePageHeight,
        x: 0,
        y: 0,
      });

      window.scrollTo(0, originalScrollY);

      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      // Single flowing page shaped exactly like the template (poster ratio),
      // not A4 — slicing this design across page breaks would cut through the
      // photo grid and location box.
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]);
      // Drawn very slightly oversized (not exactly pdfWidth/pdfHeight) so that
      // any sub-pixel rounding in the canvas capture can't leave a hairline of
      // the page's own background showing on the right/bottom edge.
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth + 0.3, pdfHeight + 0.3);

      // Make the location box a real clickable link to the pinned map URL.
      // Coordinates match the baked-in pin box measured on the template (see
      if (selectedEvent?.report_location) {
        const boxX = pdfWidth * (50 / 750);
        const boxY = pdfHeight * (captureLocationTop / capturePageHeight);
        const boxW = pdfWidth * (650 / 750);
        const boxH = pdfHeight * (220 / capturePageHeight);
        pdf.link(boxX, boxY, boxW, boxH, { url: selectedEvent.report_location });
      }

      pdf.save(`VU_Mission_Completed_${selectedEvent?.slug || 'event'}_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('فایل PDF با موفقیت ساخته شد');
    } catch (e) {
      toast.error('خطا در ساخت PDF');
      console.error(e);
    } finally {
      document.getElementById('pdf-export-template')?.classList.remove('pdf-rendering-active');
      setPdfCaptureAssets(null);
      setMissionSampledCount(null);
      setPdfLoading(false);
    }
  };

  const bvtField = selectedEvent?.fields?.find(f => f.type === 'bvt_cigarette_match');
  const mehramExportField = selectedEvent?.fields?.find(f => f.type === 'mehram_supermarket_report');
  // The reports page's own day / promoter / search filters, spelled out for the Mehram export files.
  const mehramFilterLines = () => {
    const day = filterDateRange !== 'all' ? eventDays.find(d => d.id === filterDateRange)?.label : null;
    const promoter = filterPromoter !== 'all'
      ? (() => {
          const sub = filteredSubmissions.find(s => String(s.promoter_id) === String(filterPromoter));
          if (sub) return getPromoterName(sub);
          const u = (users || []).find(u => String(u.id) === String(filterPromoter));
          return u ? (u.full_name || u.username) : null;
        })()
      : null;
    return [day ? `روز: ${day}` : 'همه روزها', promoter && `پروموتر: ${promoter}`, searchTerm && `جستجو: «${searchTerm}»`].filter(Boolean);
  };
  // The event may have its own custom product lineup (edited in SectionBuilder);
  // fall back to the global default four only when it doesn't.
  const activeBvtProducts = bvtField?.bvtProducts?.length ? bvtField.bvtProducts : BVT_PRODUCTS;

  // Loose match for when the stored name drifted by only casing/whitespace
  // (e.g. a product renamed with trailing spaces trimmed, or re-typed with
  // different capitalization) — tried only after the exact-match tiers below
  // fail, so it never overrides a legitimate exact match.
  const normalizeBvtName = (n) => String(n || '').trim().toLowerCase();
  const findBvtProductLoosely = (list, name) => {
    if (!name) return null;
    const target = normalizeBvtName(name);
    return list.find(p => normalizeBvtName(p.name) === target) || null;
  };

  // A history entry's recommendedId/recommendedName can drift from the
  // event's current product list (renamed products, a custom override edited
  // after the entry was logged — same root cause fixed for images earlier).
  // Resolving every entry to one of the *current* products before counting is
  // what guarantees the "محصولات سمپل شده" box's counts always add up to the
  // total accepted samples, instead of splintering into stray name buckets.
  const resolveBvtProductFor = (h) => (
    activeBvtProducts.find(p => p.id === h.recommendedId) ||
    activeBvtProducts.find(p => p.name === h.recommendedName) ||
    BVT_PRODUCTS.find(p => p.id === h.recommendedId) ||
    BVT_PRODUCTS.find(p => p.name === h.recommendedName) ||
    findBvtProductLoosely(activeBvtProducts, h.recommendedName) ||
    findBvtProductLoosely(BVT_PRODUCTS, h.recommendedName) ||
    null
  );

  const bvtStats = useMemo(() => {
    if (!bvtField) return null;
    let totalSamples = 0;
    let manualSamples = 0;
    let rejectedTotal = 0;
    const genders = { 'مرد': 0, 'زن': 0 };
    const ageRanges = { '18-30': 0, '+30': 0 };
    const rejectedGenders = { 'مرد': 0, 'زن': 0 };
    const rejectedAgeRanges = { '18-30': 0, '+30': 0 };
    const products = {};
    const rejects = {};
    const points = [];
    const detailRows = [];

    filteredSubmissions.forEach(s => {
      const hist = s.data?.[`${bvtField.id}_history`] || [];
      hist.forEach(h => {
        if (h.status === 'rejected') {
          rejectedTotal += 1;
          if (h.gender) rejectedGenders[h.gender] = (rejectedGenders[h.gender] || 0) + 1;
          if (h.ageRange) rejectedAgeRanges[h.ageRange] = (rejectedAgeRanges[h.ageRange] || 0) + 1;
          const reason = h.rejectionReason || 'نامشخص';
          if (!rejects[reason]) rejects[reason] = { total: 0, byAge: {} };
          rejects[reason].total += 1;
          const ageKey = h.ageRange || 'نامشخص';
          rejects[reason].byAge[ageKey] = (rejects[reason].byAge[ageKey] || 0) + 1;
        } else {
          // totalSamples/genders/ageRanges only count entries that actually
          // ended up in someone's hand — a rejected offer isn't a "sample
          // distributed", it's covered by rejectedTotal/rejectedGenders/
          // rejectedAgeRanges above instead. Mixing the two was why
          // "توزیع شده" and "آمار سمپلینگ" were counting rejections too.
          totalSamples++;
          if (h.manual) manualSamples++;
          if (h.gender) genders[h.gender] = (genders[h.gender] || 0) + 1;
          if (h.ageRange) ageRanges[h.ageRange] = (ageRanges[h.ageRange] || 0) + 1;
          const resolved = resolveBvtProductFor(h);
          // Group by the resolved product's stable id when we have one, so
          // the same physical product never splinters into separate rows
          // just because its stored name drifted; unresolvable legacy
          // entries still get counted under their raw name rather than lost.
          const key = resolved?.id || h.recommendedName || 'نامشخص';
          if (!products[key]) products[key] = { name: resolved?.name || h.recommendedName || 'نامشخص', product: resolved, count: 0 };
          products[key].count += 1;
          // Only actually-accepted handouts belong in the itemized "sampled
          // cigarettes" list below — rejections are already covered by the
          // reasons table above.
          detailRows.push({
            id: h.id,
            // Manual entries store the promoter's free-typed note in targetName —
            // the PDF shows just a "ثبت دستی" label for those, not the note.
            targetName: h.manual ? 'ثبت دستی' : (h.targetName || 'نامشخص'),
            manual: !!h.manual,
            overridden: !!h.overridden,
            suggestedName: h.suggestedName || null,
            // Promoter's free-text note: manual entries keep it in targetName
            note: h.note || (h.manual && h.targetName && !/^ثبت دستی/.test(h.targetName) ? h.targetName : null),
            recommendedName: h.recommendedName || 'نامشخص',
            time: h.time || null,
            gender: h.gender || null,
            ageRange: h.ageRange || null,
            location: h.location || null,
          });
        }

        if (h.location) {
          const match = String(h.location).match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
          if (match) {
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            if (!isNaN(lat) && !isNaN(lng)) {
              points.push({ lat, lng, ...h });
            }
          }
        }
      });
    });

    detailRows.sort((a, b) => (b.time || 0) - (a.time || 0));

    // clustering logic
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const distanceMeters = (a, b) => {
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const h_v = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h_v));
    };

    const used = new Array(points.length).fill(false);
    const clusters = [];
    for (let i = 0; i < points.length; i++) {
      if (used[i]) continue;
      const group = [points[i]];
      used[i] = true;
      for (let j = i + 1; j < points.length; j++) {
        if (used[j]) continue;
        if (distanceMeters(points[i], points[j]) <= 20) {
          group.push(points[j]);
          used[j] = true;
        }
      }
      clusters.push({
        lat: group.reduce((s, p) => s + p.lat, 0) / group.length,
        lng: group.reduce((s, p) => s + p.lng, 0) / group.length,
        count: group.length,
      });
    }

    return { totalSamples, manualSamples, rejectedTotal, genders, ageRanges, rejectedGenders, rejectedAgeRanges, products, rejects, clusters, points, detailRows };
  }, [bvtField, filteredSubmissions, activeBvtProducts]);

  // Full BVT data as a styled multi-sheet workbook — everything the BVT PDF
  // shows plus rejected entries, manual notes, per-promoter/per-day stats.
  const exportBvtToExcel = async () => {
    if (!selectedEvent || !bvtField) return toast.error('رویدادی انتخاب نشده');
    setBvtExcelLoading(true);
    try {
      const dayLabel = filterDateRange !== 'all' ? eventDays.find(d => d.id === filterDateRange)?.label : null;
      const promoterLabel = filterPromoter !== 'all'
        ? (() => {
            const sub = filteredSubmissions.find(s => String(s.promoter_id) === String(filterPromoter));
            if (sub) return getPromoterName(sub);
            const u = (users || []).find(u => String(u.id) === String(filterPromoter));
            return u ? (u.full_name || u.username) : null;
          })()
        : null;
      const filtersText = [
        dayLabel && `روز ${dayLabel}`,
        promoterLabel && `پروموتر ${promoterLabel}`,
        searchTerm && `جستجو «${searchTerm}»`,
      ].filter(Boolean).join('، ');

      const samplingField = fields.find(f => f.type === 'bvt_sampling_report');
      const wb = await buildBvtWorkbook({
        event: selectedEvent,
        clientName: formatClientName(selectedEvent.client_name),
        dateRangeFa: missionDateRangeFa,
        daysCount: missionDays.length,
        filtersText,
        submissions: filteredSubmissions,
        bvtField,
        samplingField,
        samplingProducts: samplingField ? getSamplingProducts(samplingField) : [],
        activeProducts: activeBvtProducts,
        getPromoterName,
        resolveProduct: resolveBvtProductFor,
      });
      const buffer = await wb.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `VU_BVT_Report_${selectedEvent.slug || 'event'}_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      toast.success('فایل اکسل BVT با موفقیت ساخته شد');
    } catch (e) {
      console.error(e);
      toast.error('خطا در ساخت اکسل BVT');
    } finally {
      setBvtExcelLoading(false);
    }
  };

  const exportBvtToPDF = async () => {
    if (!selectedEvent) return toast.error('رویدادی انتخاب نشده');
    setBvtPdfLoading(true);
    try {
      const originalScrollY = window.scrollY;
      window.scrollTo(0, 0);

      // wait for React to mount the conditional MapContainer
      await new Promise(resolve => setTimeout(resolve, 200));

      const element = document.getElementById('bvt-pdf-export-template');
      if (element) {
        element.classList.add('pdf-rendering-active');
      }

      await preloadReportFonts();

      const logoDataUri = await fetchAsDataUri('/images/vuLogo.png');

      // Pre-fetch each sampled product's photo as a data URI — same reasoning
      // as the logo above, since html2canvas capturing a same-origin <img>
      // that's still mid-fetch is the same kind of race as the font one.
      const productImages = {};
      await Promise.all(Object.entries(bvtStats.products).map(async ([key, info]) => {
        if (!info.product?.image) {
          // No resolved product (recommendedId/recommendedName didn't match
          // anything in the current product list, even loosely) — logged so
          // this is diagnosable from the console instead of just a silently
          // blank photo slot in the exported PDF.
          console.warn(`[BVT PDF] no product resolved for "${info.name}" — recommendedId/recommendedName didn't match the event's current product list, so no photo will be shown for it.`);
          return;
        }
        const uri = await fetchAsDataUri(info.product.image);
        if (!uri) {
          console.warn(`[BVT PDF] failed to fetch product photo for "${info.name}" from ${info.product.image} — falling back to a placeholder icon in the PDF.`);
          return;
        }
        productImages[key] = uri;
      }));

      // Build static map image by drawing OSM tiles onto a canvas
      let mapImageUri = null;
      if (bvtStats?.clusters?.length > 0) {
        try {
          const centerLat = bvtStats.clusters.reduce((s, c) => s + c.lat, 0) / bvtStats.clusters.length;
          const centerLng = bvtStats.clusters.reduce((s, c) => s + c.lng, 0) / bvtStats.clusters.length;
          const W = 650, H = 260;
          // The live map tab auto-fits its view to every marker (react-leaflet
          // fitBounds), which is why widely-spread locations still show clearly
          // spread out there. This static map used a hardcoded zoom=14 instead —
          // fine when distributions happened to cluster tightly, but at zoom 14
          // (roughly neighborhood-block scale) any two locations more than ~1-2km
          // apart than the average center fell outside this 650x260 canvas
          // entirely, or crowded together right at its edge — making a genuinely
          // spread-out day of distributions look like one small huddle. Zoom is
          // now picked to fit every cluster's actual lat/lng bounding box, the
          // same way Leaflet's own fitBounds does, so the static map always shows
          // everything the live one does.
          const mercatorY = (lat) => {
            const sinLat = Math.sin(lat * Math.PI / 180);
            return 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
          };
          const lats = bvtStats.clusters.map(c => c.lat);
          const lngs = bvtStats.clusters.map(c => c.lng);
          const minLat = Math.min(...lats), maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
          const worldWidthFrac = (maxLng - minLng) / 360;
          const worldHeightFrac = Math.abs(mercatorY(minLat) - mercatorY(maxLat));
          const MAP_PADDING = 60; // px of breathing room so edge markers aren't clipped
          const MIN_ZOOM = 3, MAX_ZOOM = 16;
          let zoom = MAX_ZOOM;
          [
            worldWidthFrac > 0 ? Math.log2((W - MAP_PADDING) / (worldWidthFrac * 256)) : Infinity,
            worldHeightFrac > 0 ? Math.log2((H - MAP_PADDING) / (worldHeightFrac * 256)) : Infinity,
          ].forEach(z => { if (z < zoom) zoom = z; });
          zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(zoom)));
          const tileSize = 256;
          // The map centre is a fractional point INSIDE a tile, not the tile's own
          // centre. Tiles used to be drawn as if the centre sat exactly in the
          // middle of tile (tileX, tileY), while the markers below are placed
          // from the exact lat/lng — so the basemap was shifted against every
          // marker by up to half a tile (~128px): at zoom 16 that is a few
          // hundred metres, at lower zooms kilometres, and it changed from
          // report to report with wherever the centre happened to fall in its
          // tile. Anchor the tile grid on the exact fractional centre instead.
          const worldSize = Math.pow(2, zoom);
          const centerTileXf = (centerLng + 180) / 360 * worldSize;
          const centerTileYf = mercatorY(centerLat) * worldSize;
          const tileX = Math.floor(centerTileXf);
          const tileY = Math.floor(centerTileYf);
          const spanX = Math.ceil(W / 2 / tileSize) + 1;
          const spanY = Math.ceil(H / 2 / tileSize) + 1;
          const canvas = document.createElement('canvas');
          canvas.width = W; canvas.height = H;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#e8e0d8';
          ctx.fillRect(0, 0, W, H);
          const subdomains = ['a', 'b', 'c'];
          const tilePromises = [];
          for (let dx = -spanX; dx <= spanX; dx++) {
            for (let dy = -spanY; dy <= spanY; dy++) {
              const tx = tileX + dx, ty = tileY + dy;
              if (ty < 0 || ty >= worldSize) continue;
              const wrappedTx = ((tx % worldSize) + worldSize) % worldSize;
              const s = subdomains[(wrappedTx + ty) % 3];
              const url = `https://${s}.tile.openstreetmap.org/${zoom}/${wrappedTx}/${ty}.png`;
              const drawX = W / 2 + (tx - centerTileXf) * tileSize;
              const drawY = H / 2 + (ty - centerTileYf) * tileSize;
              tilePromises.push(
                fetchAsDataUri(url).then(uri => ({ uri, drawX, drawY })).catch(() => null)
              );
            }
          }
          const tiles = await Promise.all(tilePromises);
          await Promise.all(tiles.filter(Boolean).map(({ uri, drawX, drawY }) =>
            new Promise(res => {
              const img = new Image();
              img.onload = () => { ctx.drawImage(img, drawX, drawY, tileSize, tileSize); res(); };
              img.onerror = res;
              img.src = uri;
            })
          ));
          // Draw cluster circles
          const lng2px = (lng) => W / 2 + (lng - centerLng) * Math.pow(2, zoom) * tileSize / 360;
          const lat2px = (lat) => {
            const sinLat = Math.sin(lat * Math.PI / 180);
            const worldY = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * Math.pow(2, zoom) * tileSize;
            const centerSinLat = Math.sin(centerLat * Math.PI / 180);
            const centerWorldY = (0.5 - Math.log((1 + centerSinLat) / (1 - centerSinLat)) / (4 * Math.PI)) * Math.pow(2, zoom) * tileSize;
            return H / 2 + (worldY - centerWorldY);
          };
          bvtStats.clusters.forEach(cl => {
            const px = lng2px(cl.lng), py = lat2px(cl.lat);
            const r = Math.max(8, Math.min(30, 8 + cl.count * 3));
            ctx.beginPath();
            ctx.arc(px, py, r, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(14, 165, 233, 0.7)';
            ctx.fill();
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 2;
            ctx.stroke();
            if (cl.count > 1) {
              ctx.fillStyle = '#fff';
              ctx.font = 'bold 11px Poppins,sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(cl.count), px, py);
            }
          });
          mapImageUri = canvas.toDataURL('image/png');
        } catch (e) {
          console.warn('[BVT] map canvas failed:', e);
        }
      }

      setBvtCaptureAssets({ logo: logoDataUri, productImages });
      setBvtMapImageUri(mapImageUri);
      setBvtMapReady(true);

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 800));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      // Measure extra-stats box bottom to position detail section right
      // below it — no hardcoded gap that breaks when products/rejects grow.
      const pageEl = document.getElementById('bvt-pdf-export-template')?.querySelector('.bvt-page');
      const pageElRect = pageEl?.getBoundingClientRect();
      const extraStatsRect = bvtExtraStatsRef.current?.getBoundingClientRect();
      let DETAIL_SECTION_TOP = 1620; // fallback
      if (pageElRect && extraStatsRect) {
        // extraStatsRect.bottom - pageElRect.top gives pixel offset within the page
        DETAIL_SECTION_TOP = Math.ceil(extraStatsRect.bottom - pageElRect.top) + 32;
      }
      if (bvtDetailSectionRef.current) {
        bvtDetailSectionRef.current.style.top = `${DETAIL_SECTION_TOP}px`;
      }
      const MAP_HEIGHT = 280;
      const MAP_GAP = 32;      // spacing between detail bottom and map top
      const FOOTER_RESERVE = 150;
      const measuredDetailHeight = bvtDetailSectionRef.current?.getBoundingClientRect().height || 0;
      const mapTop = Math.ceil(DETAIL_SECTION_TOP + measuredDetailHeight + MAP_GAP);
      // Write map top directly via ref — avoids a re-render race with html2canvas
      if (bvtMapWrapperRef.current) {
        bvtMapWrapperRef.current.style.top = `${mapTop}px`;
      }
      const neededHeight = Math.max(2400, Math.ceil(mapTop + MAP_HEIGHT + FOOTER_RESERVE));
      setBvtPageHeight(neededHeight);

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      // Each row's location pin becomes a real clickable region in the final
      // PDF (see pdf.link() below) — captured here as a fraction of the
      // template's own box so it survives the mm conversion regardless of
      // the page's (now dynamic) height.
      const pageRect = element.getBoundingClientRect();
      // Padded a few px past the visible 20x20 icon on every side — a tiny
      // dot is an unreasonably precise click target in a PDF viewer, and
      // this also absorbs any hair of drift between the measured rect and
      // where the rasterized icon actually lands.
      const LOC_HIT_PAD = 6;
      const linkTargets = Array.from(element.querySelectorAll('[data-bvt-loc-url]')).map(el => {
        const r = el.getBoundingClientRect();
        return {
          url: el.getAttribute('data-bvt-loc-url'),
          xRatio: (r.left - LOC_HIT_PAD - pageRect.left) / pageRect.width,
          yRatio: (r.top - LOC_HIT_PAD - pageRect.top) / pageRect.height,
          wRatio: (r.width + LOC_HIT_PAD * 2) / pageRect.width,
          hRatio: (r.height + LOC_HIT_PAD * 2) / pageRect.height,
        };
      });

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        imageTimeout: 15000,
        foreignObjectRendering: true,
        width: 750,
        height: neededHeight,
        x: 0,
        y: 0,
      });

      window.scrollTo(0, originalScrollY);

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]);
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth + 0.3, pdfHeight + 0.3);
      linkTargets.forEach(({ url, xRatio, yRatio, wRatio, hRatio }) => {
        if (!url) return;
        pdf.link(pdfWidth * xRatio, pdfHeight * yRatio, pdfWidth * wRatio, pdfHeight * hRatio, { url });
      });
      pdf.save(`VU_BVT_Report_${selectedEvent?.slug || 'event'}_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('فایل PDF توزیع سیگار با موفقیت ساخته شد');
    } catch (e) {
      toast.error('خطا در ساخت PDF توزیع سیگار');
      console.error(e);
    } finally {
      document.getElementById('bvt-pdf-export-template')?.classList.remove('pdf-rendering-active');
      // Reset inline styles so elements revert to their CSS defaults
      if (bvtMapWrapperRef.current) bvtMapWrapperRef.current.style.top = '';
      if (bvtDetailSectionRef.current) bvtDetailSectionRef.current.style.top = '';
      setBvtCaptureAssets(null);
      setBvtMapReady(false);
      setBvtMapImageUri(null);
      setBvtPageHeight(2120);
      setBvtPdfLoading(false);
    }
  };

  const getFieldLabel = (f) => {
    if (f.label) return f.label;
    if (f.title) return f.title;
    if (f.type === 'camera_checkin') return 'تصویر ورود';
    if (f.type === 'camera_checkout') return 'تصویر خروج';
    if (f.type === 'brief_reader') return 'مطالعه پروتکل';
    if (f.type === 'advanced_checklist') return 'چک‌لیست وظایف';
    if (f.type === 'sampling_counter') return 'تعداد سمپلینگ';
    if (f.type === 'bvt_cigarette_match') return 'تطبیق سیگار BVT';
    if (f.type === 'bvt_sampling_report') return 'گزارش سمپلینگ BVT';
    if (f.type === 'photos') return 'گالری تصاویر';
    return f.type || 'فیلد ناشناس';
  };

  const renderFieldValue = (f, s) => {
    if (f.type === 'brief_reader') {
      const isRead = s.data[`${f.id}_read`] === true || s.data[`${f.id}_read`] === 'true';
      return isRead
        ? <span className="r-pill-tag success">✅ مطالعه شده</span>
        : <span className="r-pill-tag danger">❌ مطالعه نشده</span>;
    }

    if (f.type === 'sampling_counter') {
      const val = s.data[f.id];
      if (val === undefined || val === null || val === '') return '-';
      return (
        <span className="r-pill-tag" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', border: '1px solid rgba(99, 102, 241, 0.2)', fontWeight: 700 }}>
          📦 {val} سمپل توزیع شده
        </span>
      );
    }

    if (f.type === 'advanced_checklist') {
      const checklistObj = s.data[`${f.id}_checklist`] || {};
      const items = f.checklistItems || [
        { title: 'تحویل وسایل، استند و نمونه محصولات', role: 'supervisor' },
        { title: 'حضور در لوکیشن و اعلام ورود به مدیر', role: 'supervisor' },
        { title: 'چیدمان میز سمپلینگ و پرچم برند', role: 'setup' }
      ];

      const promoterObj = (users || []).find(u => u.id === s.promoter_id);
      const userRole = promoterObj ? resolveEffectiveRole(promoterObj, selectedEvent) : 'promoter';

      const visibleItems = items.map((item, idx) => ({ item, idx })).filter(({ item }) => {
        if (typeof item === 'string') return true;
        const defaultPerm = (item.role === userRole) ? 'edit' : 'view';
        const effectivePerm = item.permissions ? item.permissions[userRole] : defaultPerm;
        return effectivePerm === 'edit';
      });

      const completedCount = visibleItems.filter(({ idx }) => checklistObj[idx]).length;
      const totalItems = visibleItems.length || 1;

      const progressPercent = Math.round((completedCount / totalItems) * 100);

      return (
        <div className="mrc-checklist-card">
          <div className="mrc-checklist-header">
            <span className="mrc-checklist-title">📋 {getFieldLabel(f)}</span>
            <span className={`mrc-checklist-progress ${completedCount === visibleItems.length && visibleItems.length > 0 ? 'complete' : ''}`}>
              {completedCount} از {visibleItems.length} تکمیلی ({progressPercent}٪)
            </span>
          </div>
          <div className="mrc-checklist-items">
            {visibleItems.map(({ item, idx }) => {
              const isChecked = checklistObj[idx];
              let itemPhotoUrls = s.data[`${f.id}_photo_${idx}`];
              if (itemPhotoUrls && typeof itemPhotoUrls === 'string') {
                itemPhotoUrls = [itemPhotoUrls];
              } else if (!Array.isArray(itemPhotoUrls)) {
                itemPhotoUrls = [];
              }

              return (
                <div key={idx} className={`mrc-checklist-item ${isChecked ? 'done' : 'pending'}`}>
                  <div className="mrc-checklist-item-title">
                    <span className="mrc-check-icon">{isChecked ? '✅' : '❌'}</span>
                    <span className="mrc-item-text">{typeof item === 'string' ? item : item.title}</span>
                  </div>
                  {itemPhotoUrls && itemPhotoUrls.length > 0 && (
                    <div className="mrc-checklist-thumbs">
                      {itemPhotoUrls.map((url, i) => {
                        const flag = s.data._flags?.[`${f.id}_${idx}`];
                        return (
                          <div key={i} className="mrc-checklist-thumb-wrapper relative inline-block" onClick={() => openSubmissionPhoto(s, url, `${f.id}_photo_${idx}`)}>
                            {flag && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center z-10 shadow-sm" title={flag.reason}>⚠️</span>}
                            <img src={url} alt="پیوست" className="mrc-checklist-thumb" />
                            <span className="mrc-thumb-zoom">🔍</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    const val = s.data[f.id];
    if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) return '-';

    if (typeof val === 'boolean' || f.type === 'checkbox') {
      const isTrue = val === true || val === 'true';
      return isTrue
        ? <span className="r-pill-tag success">✓ بله</span>
        : <span className="r-pill-tag danger">✕ خیر</span>;
    }

    if (['image', 'camera', 'camera_checkin', 'camera_checkout', 'photos'].includes(f.type)) {
      const urls = Array.isArray(val) ? val : (typeof val === 'string' ? [val] : []);
      if (urls.length > 0) {
        return (
          <div className="reports-thumb-row">
            {urls.map((u, i) => {
              const flag = s.data._flags?.[f.id];
              return (
                <div key={i} className="relative inline-block">
                  {flag && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center z-10 shadow-sm" title={flag.reason}>⚠️</span>}
                  <img src={u} alt="" className="reports-thumb" onClick={() => openSubmissionPhoto(s, u, f.id)} />
                </div>
              );
            })}
          </div>
        );
      }
      return '-';
    }

    if (f.type === 'signature' && typeof val === 'string') {
      return <img src={val} alt="امضا" className="reports-thumb reports-thumb-signature" onClick={() => setFullscreenImage(val)} />;
    }
    if (f.type === 'choice' || f.type === 'select') {
      return Array.isArray(val) ? val.join('، ') : String(val);
    }
    if (f.type === 'location' && typeof val === 'string' && /^https?:\/\//.test(val)) {
      return <a href={val} target="_blank" rel="noreferrer" className="reports-map-link">📍 مشاهده روی نقشه</a>;
    }
    if ((f.type === 'number' || f.type === 'price') && formatAmount) return formatAmount(val);
    return String(val);
  };

  // Dedicated BVT cigarette-match section — rendered as its own block right under
  // the check-in photo (not squeezed into the generic misc-fields chip grid, which
  // is far too small a box for a running distribution log with product photos).
  const renderBvtSection = (f, s) => {
    const bvtHistory = s.data[`${f.id}_history`] || [];
    if (bvtHistory.length === 0) return null;

    const activeBvtProducts = f.bvtProducts?.length ? f.bvtProducts : BVT_PRODUCTS;

    // A history entry's recommendedId can go stale — the event's product list
    // (f.bvtProducts) may have been edited/renamed after the entry was logged.
    // Fall back to matching by the name stored on the entry itself, then to the
    // global default list, before giving up on showing that product's photo.
    const resolveBvtProduct = (h) => (
      activeBvtProducts.find(p => p.id === h.recommendedId) ||
      activeBvtProducts.find(p => p.name === h.recommendedName) ||
      BVT_PRODUCTS.find(p => p.id === h.recommendedId) ||
      BVT_PRODUCTS.find(p => p.name === h.recommendedName) ||
      findBvtProductLoosely(activeBvtProducts, h.recommendedName) ||
      findBvtProductLoosely(BVT_PRODUCTS, h.recommendedName) ||
      null
    );

    const breakdown = {};
    const rejectionBreakdown = {};

    bvtHistory.forEach(h => {
      if (h.status === 'rejected') {
        const reason = h.rejectionReason || 'بدون دلیل';
        if (!rejectionBreakdown[reason]) rejectionBreakdown[reason] = {};
        const demoKey = `${h.gender || 'نامشخص'} - ${h.ageRange || 'نامشخص'}`;
        rejectionBreakdown[reason][demoKey] = (rejectionBreakdown[reason][demoKey] || 0) + 1;
      } else {
        const product = resolveBvtProduct(h);
        const key = product?.id || h.recommendedId || h.recommendedName;
        if (!breakdown[key]) breakdown[key] = { product, name: product?.name || h.recommendedName, count: 0 };
        breakdown[key].count += 1;
      }
    });

    return (
      <div className="bvt-report-card">
        <div className="bvt-report-header">
          <div className="bvt-report-title-group">
            <span className="bvt-report-title">تطبیق سیگار BVT</span>
          </div>
          <span className="bvt-report-count">{bvtHistory.length} توزیع</span>
        </div>

        <div className="bvt-report-breakdown">
          {Object.entries(breakdown).map(([key, b]) => {
            // b.product may have no image if the event uses a custom product list
            // without image paths — fall back to the global BVT_PRODUCTS database.
            const imgSrc = b.product?.image ||
              BVT_PRODUCTS.find(p => p.id === (b.product?.id) || p.name === b.name)?.image ||
              null;
            return (
              <div key={key} className="bvt-report-breakdown-chip">
                {imgSrc && <img src={imgSrc} alt="" className="bvt-report-breakdown-img" />}
                <span className="bvt-report-breakdown-name">{b.name}</span>
                <span className="bvt-report-breakdown-count">×{b.count}</span>
              </div>
            );
          })}
        </div>

        {Object.keys(rejectionBreakdown).length > 0 && (
          <div className="bvt-report-rejections" style={{ margin: '0 14px 12px', padding: '12px', background: 'rgba(244, 63, 94, 0.04)', borderRadius: '12px', border: '1px dashed rgba(244, 63, 94, 0.3)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '800', marginBottom: '10px', color: '#f43f5e', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
              دلایل عدم پذیرش و دموگرافی
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(rejectionBreakdown).sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0)).map(([reason, demos]) => (
                <div key={reason} style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(244, 63, 94, 0.1)' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>{reason}</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {Object.entries(demos).map(([demo, count]) => (
                      <span key={demo} style={{ fontSize: '0.7rem', background: 'var(--bg-input)', border: '1px solid var(--border-color)', padding: '3px 8px', borderRadius: '6px', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {demo} <span style={{ fontWeight: '800', color: '#f43f5e', background: 'rgba(244,63,94,0.1)', padding: '0 4px', borderRadius: '4px' }}>{count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bvt-report-list">
          {bvtHistory.map(h => {
            const product = resolveBvtProduct(h);
            return (
              <div key={h.id} className="bvt-report-row" style={{ '--bvt-row-accent': product?.accent || '#6366f1' }}>
                <div className="bvt-report-thumb-wrap">
                  {product?.image && <img src={product.image} alt="" className="bvt-report-thumb" />}
                </div>
                <div className="bvt-report-info">
                  {/* Given product first (bold, full name), then the customer's
                      cigarette — or, for a manual entry, the promoter's note —
                      on its own labelled line so nothing gets cut off. */}
                  <span className="bvt-report-main">
                    {h.status === 'rejected' && <span className="bvt-report-manual-tag rejected">رد شده</span>}
                    {h.manual && <span className="bvt-report-manual-tag">ثبت دستی</span>}
                    {h.overridden && <span className="bvt-report-manual-tag override">تغییر پیشنهاد</span>}
                    <span className="bvt-report-recommended">{h.recommendedName}</span>
                  </span>
                  {h.targetName && (
                    <span className="bvt-report-target">
                      <span className="bvt-report-target-label">{h.manual ? 'توضیحات' : 'سیگار مخاطب'}</span>
                      <span className="bvt-report-target-text">{h.targetName}</span>
                    </span>
                  )}
                  {(h.targetNicotine != null || h.targetTar != null || h.gender || h.ageRange) && (
                    <span className="bvt-report-specs">
                      {h.gender && <span className="bvt-chip" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}>{h.gender} {h.ageRange}</span>}
                      {h.targetNicotine != null && <span className="bvt-chip nic">نیکوتین {h.targetNicotine}mg</span>}
                      {h.targetTar != null && <span className="bvt-chip tar">قطران {h.targetTar}mg</span>}
                    </span>
                  )}
                  {h.overridden && h.suggestedName && (
                    <span className="bvt-report-target">
                      <span className="bvt-report-target-label">پیشنهاد سیستم</span>
                      <span className="bvt-report-target-text bvt-report-suggested">{h.suggestedName}</span>
                    </span>
                  )}
                  {h.note && !h.manual && (
                    <div className="bvt-report-note">📝 {h.note}</div>
                  )}
                  {h.status === 'rejected' && h.rejectionReason && (
                    <div className="bvt-report-reject-reason">علت عدم پذیرش: {h.rejectionReason}</div>
                  )}
                </div>
                <div className="bvt-report-meta">
                  <span className="bvt-report-time-badge">
                    {h.time ? new Date(h.time).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                  {h.location && (
                    <a
                      href={h.location}
                      target="_blank"
                      rel="noreferrer"
                      className="bvt-report-loc"
                      title="باز کردن لوکیشن در گوگل مپ"
                      onClick={(e) => {
                        // Also notify the map panel if listener is wired up
                        const coords = parseLatLngFromMapsUrl(h.location);
                        if (coords) {
                          onGoToMapPoint?.({
                            ...coords,
                            id: h.id,
                            targetName: h.targetName,
                            recommendedName: h.recommendedName,
                            manual: h.manual,
                            time: h.time,
                            promoterName: getPromoterName(s),
                          });
                        }
                      }}
                    >
                      <MapPin size={14} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── BVT sampling report (per-pack counts) ──────────────────────────────────
  // Each promoter's `${field.id}_counts` is { [productId]: n }. Products come
  // from the field's own lineup (editable in the section builder) with the
  // global default four as fallback, same rule as the BVT match field.
  const getSamplingProducts = (f) => (f?.bvtProducts?.length ? f.bvtProducts : BVT_PRODUCTS);

  const getSamplingRows = (f, data) => {
    const counts = data?.[`${f.id}_counts`] || {};
    return getSamplingProducts(f).map(p => ({ product: p, count: Number(counts[p.id]) || 0 }));
  };

  const getSamplingTotal = (f, data) => {
    if (f.type === 'bvt_sampling_report') {
      return getSamplingRows(f, data).reduce((sum, r) => sum + r.count, 0);
    }
    const fromRows = getSamplingRows(f, data).reduce((sum, r) => sum + r.count, 0);
    return fromRows || Number(data?.[f.id]) || 0;
  };

  const renderSamplingProductRows = (rows, total) => (
    <div className="bvts-report-rows">
      {rows.map(({ product, count }) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={product.id} className="bvts-report-row" style={{ '--bvts-accent': product.accent || '#6366f1' }}>
            <div className="bvts-report-thumb-wrap">
              {product.image
                ? <img src={product.image} alt="" className="bvts-report-thumb" />
                : <Cigarette size={20} />}
            </div>
            <div className="bvts-report-info">
              <div className="bvts-report-line">
                <span className="bvts-report-name">{product.name}</span>
                <span className="bvts-report-count">{count.toLocaleString('fa-IR')}</span>
              </div>
              <div className="bvts-report-track">
                <div className="bvts-report-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className="bvts-report-pct">{pct.toLocaleString('fa-IR')}٪</span>
          </div>
        );
      })}
    </div>
  );

  // Per-submission block: this promoter's own per-pack counts.
  const renderBvtSamplingSection = (f, s) => {
    const rows = getSamplingRows(f, s.data);
    const total = getSamplingTotal(f, s.data);
    if (total === 0) return null;
    return (
      <div className="bvts-report-card">
        <div className="bvts-report-header">
          <span className="bvts-report-title">📦 {f.title || 'گزارش سمپلینگ BVT'}</span>
          <span className="bvts-report-total">{total.toLocaleString('fa-IR')} سمپل</span>
        </div>
        {renderSamplingProductRows(rows, total)}
      </div>
    );
  };

  // Gallery (camera + upload) photos — full grid instead of a tiny chip.
  const renderGalleryPhotos = (f, s) => {
    const val = s.data[f.id];
    const urls = Array.isArray(val) ? val : (typeof val === 'string' && val ? [val] : []);
    if (urls.length === 0) return null;
    const flag = s.data._flags?.[f.id];
    return (
      <div className="rgal-card">
        <div className="rgal-header">
          <span className="rgal-title">🖼️ {f.title || 'گالری تصاویر'}</span>
          <span className="rgal-count">{urls.length.toLocaleString('fa-IR')} تصویر</span>
        </div>
        <div className="rgal-grid">
          {urls.map((u, i) => (
            <button
              key={`${u}-${i}`}
              type="button"
              className="rgal-tile"
              onClick={() => openSubmissionPhoto(s, u, f.id)}
            >
              {flag && i === 0 && <span className="rgal-flag" title={flag.reason}>⚠️</span>}
              <img src={u} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Overview across every currently-filtered report: totals per pack + per promoter.
  const renderBvtSamplingOverview = () => {
    const f = fields.find(x => x.type === 'bvt_sampling_report');
    if (!f || filteredSubmissions.length === 0) return null;

    const products = getSamplingProducts(f);
    const totals = Object.fromEntries(products.map(p => [p.id, 0]));
    const byPromoter = {};
    let grand = 0;

    filteredSubmissions.forEach(s => {
      const rows = getSamplingRows(f, s.data);
      const sum = rows.reduce((a, r) => a + r.count, 0);
      if (sum === 0) return;
      rows.forEach(r => { totals[r.product.id] += r.count; });
      const name = getPromoterName(s);
      byPromoter[name] = (byPromoter[name] || 0) + sum;
      grand += sum;
    });

    if (grand === 0) return null;

    const rows = products.map(p => ({ product: p, count: totals[p.id] }));
    const promoterList = Object.entries(byPromoter).sort((a, b) => b[1] - a[1]);

    return (
      <div className="bvts-overview">
        <div className="bvts-overview-head">
          <div>
            <h3 className="bvts-overview-title">آمار سمپلینگ BVT به تفکیک محصول</h3>
            <p className="bvts-overview-sub">مجموع گزارش‌های فیلترشده — {promoterList.length.toLocaleString('fa-IR')} نفر ثبت کرده‌اند</p>
          </div>
          <div className="bvts-overview-total">
            <span className="bvts-overview-total-num">{grand.toLocaleString('fa-IR')}</span>
            <span className="bvts-overview-total-lbl">کل سمپل</span>
          </div>
        </div>
        {renderSamplingProductRows(rows, grand)}
        {promoterList.length > 0 && (
          <div className="bvts-overview-promoters">
            {promoterList.map(([name, n]) => (
              <span key={name} className="bvts-overview-chip">
                {name} <b>{n.toLocaleString('fa-IR')}</b>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Every promoter's "problems & challenges" text in one place, newest first, so
  // the admin doesn't have to open each card to spot an issue.
  const renderIssuesDigest = () => {
    const f = fields.find(x => x.type === 'daily_report');
    if (!f || filteredSubmissions.length === 0) return null;
    const items = filteredSubmissions
      .map(s => ({ s, text: String(s.data[`${f.id}_issues`] || '').trim() }))
      .filter(x => x.text)
      .sort((a, b) => new Date(b.s.submitted_at || 0) - new Date(a.s.submitted_at || 0));
    if (items.length === 0) return null;

    return (
      <div className="rissue-card">
        <div className="rissue-head">
          <span className="rissue-title">⚠️ مشکلات و چالش‌های گزارش‌شده</span>
          <span className="rissue-count">{items.length.toLocaleString('fa-IR')} گزارش</span>
        </div>
        <div className="rissue-list">
          {items.map(({ s, text }) => {
            const d = s.first_submitted_at ? new Date(s.first_submitted_at) : (s.submitted_at ? new Date(s.submitted_at) : null);
            return (
              <div key={s.id} className="rissue-item">
                <div className="rissue-meta">
                  <span className="rissue-name">{getPromoterName(s)}</span>
                  <span className="rissue-date">{d ? d.toLocaleDateString('fa-IR') : '-'}</span>
                </div>
                <p className="rissue-text">{text}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const deleteReport = async (s) => {
    if (!window.confirm(`آیا از حذف این گزارش (${getPromoterName(s)}) اطمینان دارید؟`)) return;
    try {
      const ts = s.first_submitted_at || s.submitted_at;
      const dateStr = ts ? new Date(new Date(ts).getTime() + 210 * 60 * 1000).toISOString().split('T')[0] : '';
      const res = await axios.delete(`${API_URL}/admin/events/${selectedEvent.id}/submissions?promoter_id=${s.promoter_id}&date=${dateStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.ok) {
        toast.success('گزارش با موفقیت حذف شد');
        setDeletedKeys(prev => {
          const next = new Set(prev);
          next.add(`${s.promoter_id}_${dateStr}`);
          return next;
        });
      }
    } catch (e) {
      toast.error('خطا در حذف گزارش');
    }
  };



  // --- SAMPLING CHART COMPONENT (Dark Premium) ---
  const renderSamplingChart = () => {
    const samplingField = fields.find(f => f.type === 'sampling_counter');
    if (!samplingField || filteredSubmissions.length === 0) return null;

    let totalSamples = 0;
    const promoterStats = {};

    filteredSubmissions.forEach(s => {
      const val = s.data[samplingField.id];
      if (val) {
        const count = parseInt(val) || 0;
        const pName = getPromoterName(s);
        if (!promoterStats[pName]) promoterStats[pName] = 0;
        promoterStats[pName] += count;
        totalSamples += count;
      }
    });

    if (totalSamples === 0) return null;

    const chartData = Object.keys(promoterStats)
      .map(name => ({ name, count: promoterStats[name] }))
      .sort((a, b) => b.count - a.count);

    const maxCount = chartData[0]?.count || 1;
    const eventTarget = selectedEvent?.sampling_count || 0;

    const GRADIENTS = [
      'linear-gradient(90deg, #6366f1, #8b5cf6)',
      'linear-gradient(90deg, #06b6d4, #3b82f6)',
      'linear-gradient(90deg, #10b981, #059669)',
      'linear-gradient(90deg, #f59e0b, #ef4444)',
      'linear-gradient(90deg, #ec4899, #8b5cf6)',
      'linear-gradient(90deg, #14b8a6, #06b6d4)',
    ];

    const MEDALS = ['🥇', '🥈', '🥉'];

    const filterLabel = filterDateRange === 'all'
      ? 'کل ایونت'
      : (eventDays.find(d => d.id === filterDateRange)?.label || filterDateRange);

    const overallPct = eventTarget > 0 ? Math.min(100, Math.round((totalSamples / eventTarget) * 100)) : 0;

    return (
      <div className="sc-card">
        {/* Header row */}
        <div className="sc-header">
          <div className="sc-header-left">
            <div className="sc-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="sc-badge-icon">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h-8a1 1 0 00-1 1v3h10V4a1 1 0 00-1-1z" />
              </svg>
            </div>
            <div>
              <h3 className="sc-title">آمار سمپلینگ محصول</h3>
              <p className="sc-subtitle">فیلتر فعال: <strong style={{ color: '#818cf8' }}>{filterLabel}</strong></p>
            </div>
          </div>

          <div className="sc-header-right">
            {eventTarget > 0 && (
              <div className="sc-target-box">
                <div className="sc-target-info">
                  <span className="sc-target-lbl">تعداد کل محصولات سمپلینگ</span>
                  <span className="sc-target-val">{eventTarget.toLocaleString('fa-IR')} عدد</span>
                </div>
                <div className="sc-target-ring-container">
                  <svg className="sc-target-svg" viewBox="0 0 36 36">
                    <path className="sc-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="sc-ring-fill" strokeDasharray={`${overallPct}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <div className="sc-ring-text-overlay">{overallPct}%</div>
                </div>
              </div>
            )}

            <div className="sc-total-bubble">
              <div className="sc-total-ring">
                <span className="sc-total-num">{totalSamples.toLocaleString('fa-IR')}</span>
                <span className="sc-total-unit">عدد</span>
              </div>
              <span className="sc-total-label">مجموع توزیع شده</span>
            </div>
          </div>
        </div>

        {/* Chart bars */}
        <div className="sc-bars">
          {chartData.map((d, i) => {
            const pct = Math.max(3, Math.round((d.count / maxCount) * 100));
            // Share is relative to the total event target if available, otherwise relative to current view total
            const sharePct = eventTarget > 0
              ? Math.round((d.count / eventTarget) * 100)
              : (totalSamples > 0 ? Math.round((d.count / totalSamples) * 100) : 0);

            const gradient = GRADIENTS[i % GRADIENTS.length];
            const medal = MEDALS[i] || null;
            return (
              <div key={i} className="sc-bar-item">
                <div className="sc-bar-meta">
                  <div className="sc-bar-name-row">
                    {medal && <span className="sc-medal">{medal}</span>}
                    <span className="sc-rank">#{i + 1}</span>
                    <span className="sc-name">{d.name}</span>
                  </div>
                  <div className="sc-bar-stats">
                    <span className="sc-count">{d.count.toLocaleString('fa-IR')}</span>
                    <span className="sc-share-pill" title={eventTarget > 0 ? "درصد از کل محصولات" : "درصد از کل پخش شده"}>{sharePct}٪</span>
                  </div>
                </div>
                <div className="sc-track">
                  <div
                    className="sc-fill"
                    style={{
                      width: `${pct}%`,
                      background: gradient,
                      animationDelay: `${i * 0.08}s`
                    }}
                  >
                    <div className="sc-fill-shimmer" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const hasActiveFilters = !!searchTerm || filterPromoter !== 'all';
  const clearQuickFilters = () => { setSearchTerm(''); setFilterPromoter('all'); };

  return (
    <div className="reports-container">
      {/* ── EXECUTIVE CALENDAR BAR ── */}
      <EventCalendarBar selectedEvent={selectedEvent} />

      {/* ── PAGE HEADER ── */}
      <div className="reports-page-header">
        <div className="reports-page-header-left">
          <h1 className="reports-page-title">مدیریت گزارش‌ها</h1>
          <p className="reports-page-sub">بررسی، فیلتر و خروجی‌گیری از گزارش‌های ثبت‌شده پروموترها</p>
        </div>
        <div className="reports-actions-group">
          <button className="reports-action-btn excel" onClick={exportToExcel} disabled={exportLoading}>
            {ICONS.excel}
            {exportLoading ? 'در حال ساخت اکسل...' : 'خروجی اکسل'}
          </button>
          <button className="reports-action-btn pdf" onClick={exportToPDF} disabled={pdfLoading}>
            {ICONS.pdf}
            {pdfLoading ? 'در حال ساخت PDF...' : 'خروجی PDF'}
          </button>
          {mehramExportField && (
            <button className="reports-action-btn excel" onClick={() => setMehramExportOpen(true)} style={{ background: '#7c3aed' }}>
              {ICONS.excel}
              خروجی مهرام (اکسل / PDF)
            </button>
          )}
          {bvtField && (
            <button className="reports-action-btn pdf" onClick={exportBvtToPDF} disabled={bvtPdfLoading} style={{ background: '#0ea5e9' }}>
              {ICONS.pdf}
              {bvtPdfLoading ? 'در حال ساخت BVT...' : 'خروجی PDF BVT'}
            </button>
          )}
          {bvtField && (
            <button className="reports-action-btn excel" onClick={exportBvtToExcel} disabled={bvtExcelLoading} style={{ background: '#0f766e' }}>
              {ICONS.excel}
              {bvtExcelLoading ? 'در حال ساخت اکسل BVT...' : 'خروجی اکسل BVT'}
            </button>
          )}
        </div>
      </div>

      {mehramExportField && (
        <MehramExportModal
          open={mehramExportOpen} onClose={() => setMehramExportOpen(false)} field={mehramExportField}
          submissions={filteredSubmissions} getPromoterName={getPromoterName} event={selectedEvent}
          clientName={formatClientName(selectedEvent.client_name)} baseFilterLines={mehramExportOpen ? mehramFilterLines() : []}
          clientView={clientView} token={token}
        />
      )}

      {/* ── KPI STRIP ── */}
      <div className="reports-kpi-strip">
        <KpiCard icon={ICONS.clipboard} label="گزارش کل" value={kpiStats.total} color="#6366f1" />
        <KpiCard icon={ICONS.users} label="پروموتر فعال" value={kpiStats.promotersCount} color="#8b5cf6" />
        <KpiCard icon={ICONS.camera} label="ورود ثبت‌شده" value={kpiStats.checkins} color="#10b981" />
        <KpiCard icon={ICONS.flag} label="خروج ثبت‌شده" value={kpiStats.checkouts} color="#06b6d4" />
        <KpiCard
          icon={ICONS.clock} label="تاخیرها" value={kpiStats.lates}
          sub={kpiStats.total ? `${Math.round((kpiStats.lates / kpiStats.total) * 100)}٪ از کل گزارش‌ها` : null}
          color={kpiStats.lates > 0 ? '#f43f5e' : '#22c55e'}
        />
      </div>

      {/* ── DYNAMIC EVENT DAYS FILTER BAR ── */}
      <div className="event-days-bar-wrapper">
        <div className="event-days-header">
          <span className="event-days-title">{ICONS.calendarDays} تاریخ‌ها و روزهای ایونت</span>
          {onRefresh && (
            <button type="button" className={`reports-refresh-btn ${refreshing ? 'busy' : ''}`} onClick={onRefresh} disabled={refreshing}
              title="دریافت گزارش‌های جدید بدون رفرش صفحه (فیلترها حفظ می‌شوند)">
              <svg className={refreshing ? 'spin' : ''} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>
              بروزرسانی
              {updatedAt && <small>{new Date(updatedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</small>}
            </button>
          )}
          {filterDateRange !== 'all' && (
            <span className="live-sync-badge">
              <span className="live-pulse"></span>
              بروزرسانی لحظه‌ای زنده
            </span>
          )}
        </div>
        <div className="event-days-pills desktop-only">
          <button
            className={`event-day-pill all ${filterDateRange === 'all' ? 'active' : ''}`}
            onClick={() => setFilterDateRange('all')}
          >
            <span className="edp-name">همه روزها</span>
            <span className="edp-sub">{eventDays.length} روز</span>
          </button>

          {eventDays.map(day => (
            <button
              key={day.id}
              className={`event-day-pill ${filterDateRange === day.id ? 'active' : ''} ${isTodayDay(day) ? 'today' : ''}`}
              onClick={() => setFilterDateRange(day.id)}
            >
              <span className="edp-weekday">{day.weekday || `روز ${day.dayNum}`}</span>
              <span className="edp-name">{day.dateText}</span>
              <span className="edp-sub">{day.weekday ? `روز ${day.dayNum}` : ''}{isTodayDay(day) ? `${day.weekday ? ' · ' : ''}امروز` : ''}</span>
            </button>
          ))}
        </div>

        <div className="event-days-select-mobile mobile-only">
          <select
            value={filterDateRange}
            onChange={(e) => setFilterDateRange(e.target.value)}
          >
            <option value="all">همه روزها</option>
            {eventDays.map(day => (
              <option key={day.id} value={day.id}>
                {isTodayDay(day) ? '● امروز — ' : ''}{day.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── SEARCH & VIEW FILTERS BAR ── */}
      <div className="reports-search-filter-bar">
        <div className="r-search-box">
          {ICONS.search}
          <input
            type="text"
            placeholder="جستجو بر اساس نام پروموتر، گزارش یا متن..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="r-search-clear" onClick={() => setSearchTerm('')}>✕</button>
          )}
        </div>

        <select
          className="reports-select-dropdown"
          value={filterPromoter}
          onChange={(e) => setFilterPromoter(e.target.value)}
        >
          <option value="all">همه پروموترها ({promoters.length})</option>
          {promoters.map(p => (
            <option key={p.id} value={p.id}>{p.full_name || p.username}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button className="reports-reset-btn" onClick={clearQuickFilters}>
            {ICONS.reset} پاک‌کردن فیلتر
          </button>
        )}

        <div className="reports-view-toggle">
          <button className={`view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`} onClick={() => setViewMode('cards')}>
            {ICONS.grid} کارت‌ها
          </button>
          <button className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>
            {ICONS.list} فهرست فشرده
          </button>
        </div>
      </div>

      {/* ── SAMPLING OVERVIEW CHART ── */}
      {renderSamplingChart()}

      {/* ── BVT SAMPLING REPORT OVERVIEW + PROMOTER ISSUES ── */}
      {renderBvtSamplingOverview()}
      {renderIssuesDigest()}

      {/* ── CLIENT APPROVAL BAR (our admins only) ── */}
      {requiresApproval && (
        <div className="reports-approval-bar">
          <div className="rab-text">
            <b>تایید گزارش برای کلاینت</b>
            <span>گزارش‌های این ایونت فقط بعد از تایید یکی از ادمین‌ها در پنل کلاینت نمایش داده می‌شوند.</span>
          </div>
          <div className="rab-filters">
            {[['all', 'همه', approvalCounts.all], ['pending', 'در انتظار تایید', approvalCounts.pending], ['approved', 'تایید شده', approvalCounts.approved], ['rejected', 'تایید نشده', approvalCounts.rejected]].filter(([k, , n]) => k !== 'rejected' || n > 0 || approvalFilter === 'rejected').map(([k, l, n]) => (
              <button key={k} type="button" className={`rab-chip ${k} ${approvalFilter === k ? 'active' : ''}`} onClick={() => setApprovalFilter(k)}>
                {l} <span>{n.toLocaleString('fa-IR')}</span>
              </button>
            ))}
          </div>
          {canApprove && (() => {
            const pendingShown = filteredSubmissions.filter(g => g.approval !== 'approved');
            return pendingShown.length > 1 && (
              <button
                type="button"
                className="mrc-approve-btn"
                disabled={!!approving.bulk}
                onClick={() => window.confirm(`${pendingShown.length.toLocaleString('fa-IR')} گزارش نمایش‌داده‌شده تایید و برای کلاینت نمایش داده شود؟`) && setApproval(pendingShown, true, 'bulk')}
              >
                {approving.bulk ? '...' : `تایید همه‌ی ${pendingShown.length.toLocaleString('fa-IR')} گزارش نمایش‌داده‌شده`}
              </button>
            );
          })()}
        </div>
      )}

      {/* ── SUBMISSIONS FEED ── */}
      {filteredSubmissions.length === 0 ? (
        <div className="reports-empty-card">
          <div className="rec-icon">📭</div>
          <h3>گزارشی برای این تاریخ یا فیلتر یافت نشد</h3>
          <p>می‌توانید فیلتر تاریخ یا نام پروموتر را تغییر دهید.</p>
        </div>
      ) : viewMode === 'table' ? (
        /* COMPACT TABLE VIEW */
        <ReportsTableView
          submissions={filteredSubmissions}
          fields={fields}
          getPromoterName={getPromoterName}
          calculateLateness={calculateLateness}
          openSubmissionPhoto={openSubmissionPhoto}
          localFlags={localFlags}
          approvalMode={requiresApproval}
          clientView={clientView}
        />
      ) : (
        /* TIMELINE CARDS VIEW */
        <div className="reports-timeline">
          {filteredSubmissions.map(s => {
            const checkinTimeObj = getCheckinTime(s, fields);
            const checkoutTimeObj = getCheckoutTime(s, fields);
            const dateObj = s.first_submitted_at ? new Date(s.first_submitted_at) : (s.submitted_at ? new Date(s.submitted_at) : null);
            const dateStr = dateObj ? dateObj.toLocaleDateString('fa-IR') : '-';

            // Extract Camera Photos
            const checkinField = getCheckinField(fields, s);
            const checkoutField = getCheckoutField(fields);

            const checkinUrl = checkinField && s.data[checkinField.id] ? (Array.isArray(s.data[checkinField.id]) ? s.data[checkinField.id][0] : s.data[checkinField.id]) : null;
            const checkoutUrl = checkoutField && s.data[checkoutField.id] ? (Array.isArray(s.data[checkoutField.id]) ? s.data[checkoutField.id][0] : s.data[checkoutField.id]) : null;

            const checkinTimeStr = checkinTimeObj ? checkinTimeObj.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '-';
            const checkoutTimeStr = checkoutTimeObj ? checkoutTimeObj.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : checkinTimeStr;

            // Rest of fields
            const handledTypes = ['camera_checkin', 'camera_checkout', 'daily_report', 'advanced_checklist', 'bvt_cigarette_match', 'bvt_sampling_report', 'mehram_supermarket_report'];
            const isGalleryField = (f) => f.type === 'photos' && f.photoSource === 'both';
            const otherFields = fields.filter(f => !handledTypes.includes(f.type) && !isGalleryField(f) && f.id !== checkinField?.id && f.id !== checkoutField?.id);
            const bvtSamplingField = fields.find(f => f.type === 'bvt_sampling_report');
            const mehramField = fields.find(f => f.type === 'mehram_supermarket_report');
            const galleryFields = fields.filter(isGalleryField);

            const checklistField = fields.find(f => f.type === 'advanced_checklist');
            const dailyReportField = fields.find(f => f.type === 'daily_report');
            const bvtField = fields.find(f => f.type === 'bvt_cigarette_match');

            // Lateness logic for Checkin
            const lateness = calculateLateness(checkinTimeObj);

            // Presence duration — checkin → checkout gap, when both are known
            let durationText = null;
            if (checkinTimeObj && checkoutTimeObj && checkoutTimeObj > checkinTimeObj) {
              const diffMin = Math.round((checkoutTimeObj - checkinTimeObj) / 60000);
              const h = Math.floor(diffMin / 60), m = diffMin % 60;
              durationText = h > 0 ? `${h} ساعت${m > 0 ? ` و ${m} دقیقه` : ''}` : `${m} دقیقه`;
            }

            // Same "share of today's required work done" metric as the
            // promoter's own hero progress bar (crew-hero-progress) — reuses
            // getPromoterRole(s), which already resolves the role for the
            // specific day this submission belongs to, for checklist
            // item visibility/edit permissions.
            const progress = calcGlobalProgress(selectedEvent, s.data, getPromoterRole(s));

            return (
              <div key={s.id} className={`modern-report-card${getPromoterRole(s) === 'supervisor' ? ' mrc-captain' : ''}`}>
                {/* Header Info */}
                <div className="mrc-header">
                  <div className="mrc-user-info">
                    <div className="mrc-avatar">
                      {getPromoterAvatar(s) ? <img src={getPromoterAvatar(s)} alt="" /> : getPromoterName(s).charAt(0)}
                    </div>
                    <div className="mrc-user-text">
                      <span className="mrc-name">{getPromoterName(s)}</span>
                      <span className="mrc-role">{roleLabel(getPromoterRole(s))}</span>
                    </div>
                  </div>
                  <div className="mrc-timestamp">
                    <span className="mrc-date">{dateStr}</span>
                    {durationText && <span className="mrc-duration">🕐 مدت حضور: {durationText}</span>}
                  </div>
                </div>

                {renderApprovalStrip(s)}

                {/* Today's completion — same metric as the promoter's own hero progress bar */}
                {progress.total > 0 && (
                  <div className="mrc-progress">
                    <div className="mrc-progress-labels">
                      <span>پیشرفت کارها</span>
                      <span className="mrc-progress-pct">{progress.done}/{progress.total} — {progress.pct}٪</span>
                    </div>
                    <div className="mrc-progress-track">
                      <div className={`mrc-progress-fill${progress.pct >= 100 ? ' complete' : ''}`} style={{ width: `${progress.pct}%` }} />
                    </div>
                  </div>
                )}

                {/* Hero Dual Photo Area */}
                {(checkinUrl || checkoutUrl) ? (
                  <div className={`mrc-hero-photos ${checkinUrl && checkoutUrl ? 'dual' : 'single'}`}>
                    {checkinUrl && (
                      <div className="mrc-hero-photo-box" onClick={() => openSubmissionPhoto(s, checkinUrl, checkinField.id)}>
                        {(localFlags[`${s.field_submission_ids?.[checkinField.id] || s.original_id}_${checkinField.id}`] || s.data._flags?.[checkinField.id]) && <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full z-20 shadow-md">⚠️ رد شده</span>}
                        <img src={checkinUrl} alt="ورود" className="mrc-hero-img" loading="lazy" decoding="async" />
                        <div className="mrc-hero-overlay" />
                        <div className="mrc-hero-badges top">
                          <span className="mrc-badge-pill photo-type">📸 تصویر ورود</span>
                        </div>
                        <div className="mrc-hero-badges bottom">
                          {lateness && (
                            lateness.isLate ? (
                              <span className="mrc-badge-pill late">⚠️ {lateness.text} تاخیر</span>
                            ) : (
                              <span className="mrc-badge-pill ontime">✓ به موقع</span>
                            )
                          )}
                          <span className="mrc-badge-pill time">⏱️ ورود: {checkinTimeStr}</span>
                        </div>
                      </div>
                    )}

                    {checkoutUrl && (
                      <div className="mrc-hero-photo-box checkout" onClick={() => openSubmissionPhoto(s, checkoutUrl, checkoutField.id)}>
                        {(localFlags[`${s.field_submission_ids?.[checkoutField.id] || s.original_id}_${checkoutField.id}`] || s.data._flags?.[checkoutField.id]) && <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full z-20 shadow-md">⚠️ رد شده</span>}
                        <img src={checkoutUrl} alt="خروج" className="mrc-hero-img" loading="lazy" decoding="async" />
                        <div className="mrc-hero-overlay" />
                        <div className="mrc-hero-badges top">
                          <span className="mrc-badge-pill photo-type checkout">🏁 تصویر خروج</span>
                        </div>
                        <div className="mrc-hero-badges bottom">
                          <span className="mrc-badge-pill checkout-time">
                            🕒 خروج: {checkoutTimeStr}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mrc-no-photo-banner">
                    <span>📷 بدون تصویر ورود / خروج ثبت شده</span>
                  </div>
                )}

                {/* BVT Cigarette Match — right under the check-in photo, own dedicated block */}
                {bvtField && (s.data[`${bvtField.id}_history`] || []).length > 0 && (
                  <div className="mrc-section-block">
                    {renderBvtSection(bvtField, s)}
                  </div>
                )}

                {/* BVT sampling report - per-pack counts for this promoter */}
                {bvtSamplingField && getSamplingTotal(bvtSamplingField, s.data) > 0 && (
                  <div className="mrc-section-block">
                    {renderBvtSamplingSection(bvtSamplingField, s)}
                  </div>
                )}

                {/* Mehram supermarket reports — photos, shelf answers and seller-call status per store */}
                {mehramField && (
                  <div className="mrc-section-block">
                    <MehramAdminSection
                      field={mehramField} data={s.data} clientView={clientView} visitOrder={mehramVisitOrder}
                      stateFilter={requiresApproval ? approvalFilter : 'all'}
                      editor={clientView ? null : { onSave: (rid, patch) => saveMehramEdit(s, rid, patch), upload: uploadMehramPhoto, onDelete: canDelete ? (rid) => deleteMehramReport(s, rid) : null }}
                      approval={requiresApproval && Object.keys(s.mehram_states || {}).length ? {
                        states: s.mehram_states,
                        reviews: s.mehram_reviews,
                        approvals: s.mehram_approvals,
                        canApprove,
                        busy: Object.fromEntries(Object.entries(approving).filter(([k, v]) => v && k.startsWith(`${s.id}|`)).map(([k]) => [k.slice(String(s.id).length + 1), true])),
                        onSet: (ids, ap, key) => setMehramApproval([s], ids, ap, `${s.id}|${key}`),
                        onReject: (ids, reason, key) => setMehramReject(s, ids, reason, `${s.id}|${key}`),
                        onReset: (ids, key) => setMehramReset(s, ids, `${s.id}|${key}`),
                      } : null}
                    />
                  </div>
                )}

                {/* Checklist Section */}
                {checklistField && s.data[`${checklistField.id}_checklist`] && (
                  <div className="mrc-section-block">
                    {renderFieldValue(checklistField, s)}
                  </div>
                )}

                {/* Daily Report & Issues Section */}
                {dailyReportField && (s.data[`${dailyReportField.id}_summary`] || s.data[`${dailyReportField.id}_issues`]) && (
                  <div className="mrc-section-block">
                    <div className="mrc-daily-reports-wrapper">
                      {s.data[`${dailyReportField.id}_summary`] && (
                        <div className="mrc-daily-box summary">
                          <div className="mrc-daily-box-header">
                            <span>📝 خلاصه عملکرد روزانه</span>
                          </div>
                          <p className="mrc-daily-box-text">
                            {String(s.data[`${dailyReportField.id}_summary`])}
                          </p>
                        </div>
                      )}
                      {s.data[`${dailyReportField.id}_issues`] && (
                        <div className="mrc-daily-box issues">
                          <div className="mrc-daily-box-header">
                            <span>⚠️ گزارش مشکلات و چالش‌ها</span>
                          </div>
                          <p className="mrc-daily-box-text">
                            {String(s.data[`${dailyReportField.id}_issues`])}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Gallery photos (camera + upload) */}
                {galleryFields.map(gf => {
                  const gv = s.data[gf.id];
                  const has = Array.isArray(gv) ? gv.length > 0 : !!gv;
                  return has ? (
                    <div key={gf.id} className="mrc-section-block">
                      {renderGalleryPhotos(gf, s)}
                    </div>
                  ) : null;
                })}

                {/* Other Normal Fields */}
                {otherFields.length > 0 && (
                  <div className="mrc-fields-grid">
                    {otherFields.map(f => {
                      const value = renderFieldValue(f, s);
                      if (value === '-') return null;
                      return (
                        <div key={f.id} className={`mrc-field-chip ${f.type === 'brief_reader' ? 'brief-reader-chip' : ''}`}>
                          <span className="mrc-fc-label">{getFieldLabel(f)}</span>
                          <span className="mrc-fc-value">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── FULLSCREEN IMAGE MODAL ── */}
      {fullscreenImage && (
        <div className="mrc-modal-overlay" onClick={() => { setFullscreenImage(null); setFlagModalOpen(false); setFlagReason(''); }}>
          <div className="mrc-modal-content" onClick={e => e.stopPropagation()}>
            <button className="mrc-modal-close" onClick={() => { setFullscreenImage(null); setFlagModalOpen(false); setFlagReason(''); }}>✕</button>
            <img src={fullscreenImage.url || fullscreenImage} className="mrc-modal-img" alt="مشاهده کامل" />

            {fsGallery && fsGallery.length > 1 && (
              <span className="mrc-modal-counter">{fsIndex + 1} / {fsGallery.length}</span>
            )}

            {(fsStamp || fullscreenImage.label) && (
              <div className="mrc-photo-stamp">
                {fullscreenImage.label && <span className="mrc-photo-stamp-label">{fullscreenImage.label}</span>}
                {fullscreenImage.promoter && <span className="mrc-photo-stamp-promoter">👤 {fullscreenImage.promoter}</span>}
                {fsStamp && (
                  <span className="mrc-photo-stamp-when">
                    <span>📅 {fsStamp.date}</span>
                    <span className="mrc-photo-stamp-time">⏱️ {fsStamp.time}</span>
                  </span>
                )}
              </div>
            )}

            {fsGallery && fsIndex > 0 && (
              <button className="mrc-modal-nav mrc-modal-nav-prev" title="قبلی" onClick={fsPrev}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </button>
            )}
            {fsGallery && fsIndex < fsGallery.length - 1 && (
              <button className="mrc-modal-nav mrc-modal-nav-next" title="بعدی" onClick={fsNext}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              </button>
            )}

            {fullscreenImage.submissionId && fullscreenImage.fieldId && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
                {!flagModalOpen ? (
                  <button onClick={() => setFlagModalOpen(true)} className="bg-red-600/90 hover:bg-red-500 text-white px-6 py-2 rounded-full font-bold shadow-lg backdrop-blur flex items-center gap-2 transition-transform hover:scale-105 active:scale-95">
                    <span>⚠️</span> فلگ کردن تصویر
                  </button>
                ) : (
                  <div className="bg-slate-900/95 border border-slate-700/50 p-4 rounded-2xl w-full max-w-md shadow-2xl backdrop-blur-xl animate-fade-in-up">
                    <h3 className="text-white font-bold mb-1 flex items-center gap-2">
                      <span className="text-red-400">⚠️</span> فلگ کردن تصویر
                    </h3>
                    <p className="text-slate-400 text-xs mb-3">فقط در پنل ادمین و گالری دیده می‌شود — پروموتر متوجه نمی‌شود و نیازی به ثبت مجدد عکس نیست. توضیح اختیاری است.</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['تاری تصویر', 'عدم حضور در لوکیشن', 'مشکل کادربندی', 'نور نامناسب'].map(r => (
                        <button key={r} onClick={() => setFlagReason(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${flagReason === r ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300' : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-700'}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={flagReason}
                      onChange={e => setFlagReason(e.target.value)}
                      placeholder="توضیحات تکمیلی (اختیاری)..."
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none h-20 mb-3"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setFlagModalOpen(false); setFlagReason(''); }} className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 text-sm font-semibold transition-colors">
                        انصراف
                      </button>
                      <button onClick={handleFlagImage} disabled={isFlagging} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold shadow-lg disabled:opacity-50 transition-colors flex items-center gap-2">
                        {isFlagging ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                        تایید و ثبت
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MISSION COMPLETED PDF EXPORT TEMPLATE ── */}
      <div id="pdf-export-template" className="pdf-export-container">
        <div className="msc-page" style={{ height: `${missionPageHeight}px` }}>
          {/* A real <img> with explicit width/height attributes, not a CSS
             background-image — a background layer's paint area is derived
             from the element's *computed* box, and under html2canvas's
             foreignObject capture that computed width has, in practice, come
             out fractionally wider than the fixed 750px background-size,
             leaving a sliver of the page's own fallback color exposed past
             the image's right edge. An <img> has its own intrinsic size
             independent of the parent's layout, so it can't drift out of
             sync with it the same way. */}
          {/* ── Right Column (Logo, Title, Summary) ── */}
          <div className="msc-right-col">
            <div className="msc-logo-wrapper">
              <img
                className="msc-logo-img"
                src={pdfCaptureAssets ? pdfCaptureAssets.logo : "/images/vuLogo.png"}
                alt="VU Logo"
              />
            </div>
          </div>

          {/* ── Title (centered across the full page width) ── */}
          <div className="msc-title-centered">
            <div className="msc-title-block">
              <h1 className="msc-title">
                <div className="msc-title-line1">
                  {"MISSION".split('').map((char, index) => <span key={index}>{char}</span>)}
                </div>
                <div className="msc-title-line2">COMPLETED</div>
              </h1>
            </div>
          </div>

          {/* ── Event summary: event name + dates + location — centered under
             the title across the full page width. ── */}
          <div className="msc-summary-positioned">
            <div className="msc-summary-block">
              <p className="msc-event-name" dir={hasArabicScript(selectedEvent?.name) ? 'rtl' : 'ltr'}>{selectedEvent?.name}</p>
              <div className="msc-heading">
                EVENT SUMMARY
              </div>
              <div className="msc-timeline">
                <div className="msc-timeline-item">
                  <span className="msc-timeline-bullet" />
                  <span className="msc-timeline-label">DATES</span>
                  <span className="msc-timeline-value" dir="ltr">{missionDateRangeEn}</span>
                </div>
                <div className="msc-timeline-item">
                  <span className="msc-timeline-bullet" />
                  <span className="msc-timeline-label">LOCATION</span>
                  <span className="msc-timeline-value" dir={hasArabicScript(selectedEvent?.location) ? 'rtl' : 'ltr'}>{selectedEvent?.location || '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Operation summary ── */}
          <div className="msc-op-section">
            <div className="msc-op-bullet" />
            <div className="msc-heading-full">
              <div className="msc-heading">
                OPERATION SUMMARY
              </div>
            </div>
            <div className="msc-stats-row">
              <div className="msc-stat">
                <span className="msc-stat-label">PROMOTERS</span>
                <span className="msc-stat-val">{selectedEvent?.promoter_count || 0}</span>
              </div>
              <div className="msc-stat">
                <span className="msc-stat-label">CAPTAINS</span>
                <span className="msc-stat-val">{selectedEvent?.supervisor_count || 0}</span>
              </div>
              <div className="msc-stat">
                <span className="msc-stat-label">LOGISTICS</span>
                <span className="msc-stat-val">{selectedEvent?.transport_count || 0}</span>
              </div>
              <div className="msc-stat">
                <span className="msc-stat-label">DISTRIBUTED</span>
                <span className="msc-stat-val">{(selectedEvent?.sampling_count || 0).toLocaleString('en-US')}</span>
              </div>
              <div className="msc-stat msc-stat-last">
                <span className="msc-stat-label">DURATION</span>
                <span className="msc-stat-val">{missionDays.length || 1}{(missionDays.length || 1) === 1 ? ' DAY' : ' DAYS'}</span>
              </div>
            </div>
          </div>

          {/* ── Sampled products — only when the admin actually entered a
              count for this export (see the prompt in exportToPDF); when
              skipped, everything below stays at its original position. ── */}
          {missionSampledCount != null && (
            <div className="msc-op-section" style={{ top: '655px' }}>
              <div className="msc-op-bullet" />
              <div className="msc-heading-full">
                <div className="msc-heading">
                  SAMPLED PRODUCTS
                </div>
              </div>
              <div className="msc-stats-row">
                <div className="msc-stat">
                  <span className="msc-stat-label">QUANTITY</span>
                  <span className="msc-stat-val">{missionSampledCount.toLocaleString('en-US')}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── 6 pinned mission photos ── */}
          <div className="msc-photo-grid" style={{ top: `${missionPhotoGridTop}px` }}>
            {missionReportPhotos.map((url, i) => {
              const src = pdfCaptureAssets ? pdfCaptureAssets.photos[i] : url;
              return (
                <div key={i} className="msc-photo-box">
                  {src && <img src={src} alt="" className="msc-photo-img" />}
                </div>
              );
            })}
          </div>

          {/* ── Exact location ── */}
          <div className="msc-location-wrapper" style={{ top: `${missionLocationTop}px` }}>
            <div className="msc-location-label">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </div>
            <div className="msc-location-box">
              {selectedEvent?.report_location_image ? (
                <img
                  src={pdfCaptureAssets ? pdfCaptureAssets.locationImage : selectedEvent.report_location_image}
                  alt="لوکیشن دقیق"
                  className="msc-location-img"
                />
              ) : (
                <span className="msc-location-text" dir={hasArabicScript(selectedEvent?.location_label || selectedEvent?.location) ? 'rtl' : 'ltr'}>
                  {selectedEvent?.location_label || selectedEvent?.location || '—'}
                </span>
              )}
            </div>
          </div>


          {/* ── Client ── */}
          <div className="msc-footer">
            <span className="msc-footer-label">CLIENT</span>
            <span className="msc-footer-value" dir={hasArabicScript(selectedEvent?.client_name) ? 'rtl' : 'ltr'}>{selectedEvent?.client_name || '—'}</span>
          </div>
        </div>
      </div>

      {/* ── BVT PDF EXPORT TEMPLATE ── */}
      {bvtField && bvtStats && (
        <div id="bvt-pdf-export-template" className="pdf-export-container bvt-pdf-container">
          <div className="msc-page bvt-page" style={{ direction: 'ltr', height: `${bvtPageHeight}px` }}>
            <div className="msc-right-col">
              <div className="msc-logo-wrapper">
                <img
                  className="msc-logo-img"
                  src={bvtCaptureAssets ? bvtCaptureAssets.logo : "/images/vuLogo.png"}
                  alt="VU Logo"
                />
              </div>
            </div>

            <div className="msc-title-centered">
              <div className="msc-title-block">
                <h1 className="msc-title">
                  <div className="msc-title-line1">
                    {"MISSION".split('').map((char, index) => <span key={index}>{char}</span>)}
                  </div>
                  <div className="msc-title-line2">COMPLETED</div>
                </h1>
              </div>
            </div>

            <div className="bvt-centered-summary">
              <p className="bvt-event-name-center">{selectedEvent?.name}</p>
              <div className="bvt-summary-row">
                <div className="bvt-summary-item">
                  <span className="bvt-summary-label">تاریخ</span>
                  <span className="bvt-summary-value">{missionDateRangeFa}</span>
                </div>
                <div className="bvt-summary-divider" />
                <div className="bvt-summary-item">
                  <span className="bvt-summary-label">لوکیشن</span>
                  <span className="bvt-summary-value">{selectedEvent?.location || '—'}</span>
                </div>
              </div>
            </div>

            <div className="bvt-op-section" style={{ top: '490px' }}>
              <div className="bvt-op-bullet" />
              <div className="bvt-section-heading">خلاصه عملیات</div>
              <div className="bvt-stats-row">
                <div className="bvt-stat"><span className="bvt-stat-label">پروموتر</span><span className="bvt-stat-val">{selectedEvent?.promoter_count || 0}</span></div>
                <div className="bvt-stat"><span className="bvt-stat-label">کاپتان</span><span className="bvt-stat-val">{selectedEvent?.supervisor_count || 0}</span></div>
                <div className="bvt-stat"><span className="bvt-stat-label">پشتیبانی</span><span className="bvt-stat-val">{selectedEvent?.transport_count || 0}</span></div>
                <div className="bvt-stat"><span className="bvt-stat-label">توزیع شده</span><span className="bvt-stat-val" style={{ fontFamily: 'Poppins' }}>{(bvtStats?.totalSamples || 0).toLocaleString('en-US')}</span></div>
                <div className="bvt-stat"><span className="bvt-stat-label">مدت زمان</span><span className="bvt-stat-val">{missionDays.length || 1} روز</span></div>
              </div>
            </div>

            <div className="bvt-op-section" style={{ top: '630px' }}>
              <div className="bvt-op-bullet" />
              <div className="bvt-section-heading">آمار سمپلینگ BVT</div>
              <div className="bvt-stats-row">
                <div className="bvt-stat"><span className="bvt-stat-label">مجموع دریافت‌کنندگان</span><span className="bvt-stat-val" style={{ fontFamily: 'Poppins' }}>{bvtStats.totalSamples}</span></div>
                <div className="bvt-stat"><span className="bvt-stat-label">مرد / زن</span><span className="bvt-stat-val" style={{ fontFamily: 'Poppins' }}>{bvtStats.genders['مرد'] || 0} / {bvtStats.genders['زن'] || 0}</span></div>
                <div className="bvt-stat"><span className="bvt-stat-label">رده سنی ۱۸-۳۰ / +۳۰</span><span className="bvt-stat-val" style={{ fontFamily: 'Poppins' }}>{bvtStats.ageRanges['18-30'] || 0} / {bvtStats.ageRanges['+30'] || 0}</span></div>
              </div>
            </div>

            {/* Same layout as "آمار سمپلینگ BVT" above, just re-titled and
                scoped to rejected entries only — the breakdown for the
                "دلایل عدم دریافت" table right below it. */}
            <div className="bvt-op-section" style={{ top: '770px' }}>
              <div className="bvt-op-bullet" />
              <div className="bvt-section-heading">آمار عدم دریافت</div>
              <div className="bvt-stats-row">
                <div className="bvt-stat"><span className="bvt-stat-label">مجموع رد شده</span><span className="bvt-stat-val" style={{ fontFamily: 'Poppins' }}>{bvtStats.rejectedTotal}</span></div>
                <div className="bvt-stat"><span className="bvt-stat-label">مرد / زن</span><span className="bvt-stat-val" style={{ fontFamily: 'Poppins' }}>{bvtStats.rejectedGenders['مرد'] || 0} / {bvtStats.rejectedGenders['زن'] || 0}</span></div>
                <div className="bvt-stat"><span className="bvt-stat-label">رده سنی ۱۸-۳۰ / +۳۰</span><span className="bvt-stat-val" style={{ fontFamily: 'Poppins' }}>{bvtStats.rejectedAgeRanges['18-30'] || 0} / {bvtStats.rejectedAgeRanges['+30'] || 0}</span></div>
              </div>
            </div>

            {/* BVT Specific Boxes: Products & Rejects — stacked full-width (not
                side-by-side) so the reject table has room to breathe. */}
            <div className="bvt-extra-stats" ref={bvtExtraStatsRef}>
              <div className="bvt-data-box">
                <div className="bvt-box-heading">محصولات سمپل شده</div>
                {Object.keys(bvtStats.products).length > 0 ? (
                  <div className="bvt-products-grid">
                    {Object.entries(bvtStats.products).map(([key, info]) => {
                      // During capture, only a pre-converted data URI actually
                      // rasterizes — html2canvas's foreignObjectRendering mode
                      // serializes the DOM into an SVG-as-<img>, and a plain
                      // relative/remote <img src> inside that never loads (it
                      // silently renders blank, no error), which is exactly
                      // why every product photo could vanish from the PDF
                      // while still showing fine in the live admin view. So a
                      // failed/skipped data-URI fetch falls to the Cigarette
                      // icon below instead of the raw src, which would just
                      // be an invisible dead end in the actual export.
                      const imgSrc = bvtCaptureAssets ? bvtCaptureAssets.productImages?.[key] : info.product?.image;
                      return (
                        <div key={key} className="bvt-product-cell">
                          {imgSrc ? (
                            <img src={imgSrc} alt="" className="bvt-product-cell-img" />
                          ) : (
                            <Cigarette size={22} className="bvt-product-cell-icon-fallback" />
                          )}
                          <span className="bvt-product-cell-name">{info.name}</span>
                          <span className="bvt-product-cell-count" style={{ fontFamily: 'Poppins' }}>×{info.count}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="bvt-no-data">دادهای موجود نیست</div>}
              </div>
              <div className="bvt-data-box">
                <div className="bvt-box-heading">دلایل عدم دریافت</div>
                {Object.keys(bvtStats.rejects).length > 0 ? (
                  <div className="bvt-reject-table">
                    <div className="bvt-reject-table-row bvt-reject-table-head">
                      <span className="bvt-reject-reason">دلیل</span>
                      <span style={{ fontFamily: 'Poppins' }}>۱۸-۳۰</span>
                      <span style={{ fontFamily: 'Poppins' }}>+۳۰</span>
                      <span>مجموع</span>
                    </div>
                    {Object.entries(bvtStats.rejects).map(([reason, info]) => (
                      <div key={reason} className="bvt-reject-table-row">
                        <span className="bvt-reject-reason" title={reason}>{reason}</span>
                        <span className="bvt-reject-age" style={{ fontFamily: 'Poppins' }}>{info.byAge['18-30'] || 0}</span>
                        <span className="bvt-reject-age" style={{ fontFamily: 'Poppins' }}>{info.byAge['+30'] || 0}</span>
                        <span className="bvt-reject-total" style={{ fontFamily: 'Poppins' }}>{info.total}</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="bvt-no-data">دادهای موجود نیست</div>}
              </div>
            </div>

            {/* Itemized log — every accepted handout, one after another.
                Shown ABOVE the map so the reader sees names before the
                geographical overview. Height is unbounded (depends on how
                many distributions happened), which is why the page height
                itself is measured and set dynamically in exportBvtToPDF
                rather than living at a fixed top offset like the sections
                above. */}
            <div className="bvt-detail-section" ref={bvtDetailSectionRef}>
              <div className="bvt-section-heading" style={{ marginBottom: '14px' }}>جزئیات سیگارهای سمپل شده</div>
              {bvtStats.detailRows.length > 0 ? (
                <div className="bvt-detail-list">
                  {bvtStats.detailRows.map((row) => (
                    <div key={row.id} className="bvt-detail-row">
                      <span className="bvt-detail-main">
                        <span className="bvt-detail-names">
                          <span className={`bvt-detail-target${row.manual ? ' manual' : ''}`} title={row.targetName}>{row.targetName}</span>
                          <ChevronLeft size={11} className="bvt-detail-arrow" />
                          <span className="bvt-detail-given" title={row.recommendedName}>{row.recommendedName}</span>
                          {row.overridden && <span className="bvt-detail-override-tag">انتخاب دستی</span>}
                        </span>
                        {(row.overridden && row.suggestedName) || row.note ? (
                          <span className="bvt-detail-sub">
                            {row.overridden && row.suggestedName && (
                              <span className="bvt-detail-suggested">پیشنهاد سیستم: <span dir="ltr">{row.suggestedName}</span></span>
                            )}
                            {row.note && <span className="bvt-detail-note">توضیحات: {row.note}</span>}
                          </span>
                        ) : null}
                      </span>
                      <span className="bvt-detail-gender">{row.gender || '—'}</span>
                      <span className="bvt-detail-age" style={row.ageRange ? { fontFamily: 'Poppins' } : undefined}>{row.ageRange || '—'}</span>
                      {row.location ? (
                        <a
                          href={row.location}
                          target="_blank"
                          rel="noreferrer"
                          className="bvt-detail-loc-icon"
                          data-bvt-loc-url={row.location}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MapPin size={11} />
                        </a>
                      ) : <span className="bvt-detail-loc-icon empty" />}
                    </div>
                  ))}
                </div>
              ) : <div className="bvt-no-data">دادهای موجود نیست</div>}
            </div>

            {/* Live Map Screenshot — shown AFTER the itemized list */}
            <div className="bvt-map-wrapper" ref={bvtMapWrapperRef}>
              <div className="bvt-map-label">
                <MapPin size={16} /> لوکیشن‌های توزیع
              </div>
              <div className="msc-location-box" style={{ background: '#f8fafc' }}>
                {bvtMapImageUri ? (
                  <img src={bvtMapImageUri} alt="نقشه" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontFamily: 'Vazirmatn', fontSize: '13px' }}>
                    {bvtStats?.clusters?.length > 0 ? 'داده لوکیشن موجود است اما نقشه بارگذاری نشد' : 'هیچ داده لوکیشنی وجود ندارد'}‌
                  </div>
                )}
              </div>
            </div>

            <div className="msc-footer">
              <span className="msc-footer-label">CLIENT</span>
              <span className="msc-footer-value" dir={hasArabicScript(selectedEvent?.client_name) ? 'rtl' : 'ltr'}>{formatClientName(selectedEvent?.client_name) || '—'}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
