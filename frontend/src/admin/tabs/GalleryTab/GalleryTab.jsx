import { getProductGroups } from '../../../components/MehramSupermarketReport/mehramData';
import React, { useState, useMemo, useEffect } from 'react';
import { toast } from 'react-toastify';
import { EventCalendarBar } from '../../components/EventCalendarBar';
import './gallery.css';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const MAX_REPORT_PHOTOS = 6;

// ── Helpers (same as ReportsTab) ──
const faToEnDigits = (str) => String(str || '').replace(/[۰-۹]/g, d =>
  "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));

function getEventDaysList(selectedEvent) {
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
        if (/^\d{4}-\d{2}-\d{2}$/.test(normPart)) {
          const dObj = new Date(normPart);
          if (!isNaN(dObj.getTime())) {
            label = dObj.toLocaleDateString('fa-IR');
            dayOfWeek = dObj.toLocaleDateString('fa-IR', { weekday: 'long' });
          }
        }
        dayList.push({
          id: normPart,
          dayNum: idx + 1,
          dateKey: normPart,
          rawPart: part,
          label: `روز ${idx + 1} (${dayOfWeek ? dayOfWeek + ' ' : ''}${label})`,
        });
      }
    });
  }
  return dayList;
}

// Supermarket (Mehram) report photos: every store report carries these five.
const MEHRAM_PHOTOS = [
  ['storefrontSelfie', 'سلفی با سردر'],
  ['posterBack', 'عکس پوستر'],
  ['shelfBefore', 'شلف قبل از مرتب‌سازی'],
  ['shelfAfter', 'شلف بعد از مرتب‌سازی'],
  ['productsPhoto', 'گروه محصولات'],
];

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

// ── Icons ──
const ICONS = {
  image: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>,
  layers: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  filter: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  reset: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
  download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  flag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  calendarDays: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><rect x="8" y="14" width="2" height="2" rx=".5"/><rect x="14" y="14" width="2" height="2" rx=".5"/></svg>,
  reportAdd: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h6m-6 3.75h4.5M10.5 3.75h3a1.5 1.5 0 011.5 1.5v.75H9v-.75a1.5 1.5 0 011.5-1.5z" /><path d="M6.75 6h10.5a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5v-12a1.5 1.5 0 011.5-1.5z" /></svg>,
  reportCheck: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.75l6 6 9-13.5" /></svg>,
};

function KpiCard({ icon, label, value, color }) {
  return (
    <div className="r-kpi-card" style={{ '--accent': color }}>
      <div className="r-kpi-glow" />
      <div className="r-kpi-icon-badge" style={{ background: `${color}1f`, color }}>{icon}</div>
      <div className="r-kpi-body">
        <span className="r-kpi-val">{value}</span>
        <span className="r-kpi-label">{label}</span>
      </div>
      <div className="r-kpi-accent" style={{ background: color }} />
    </div>
  );
}

export const GalleryTab = ({ selectedEvent, submissions, users, currentUser, token, onUpdateEvent }) => {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [filterPromoter, setFilterPromoter] = useState('all');
  const [filterField, setFilterField] = useState('all');
  const [filterDateRange, setFilterDateRange] = useState('all');
  const [filterFlagged, setFilterFlagged] = useState('all'); // 'all' | 'flagged' | 'unflagged'
  const [localFlags, setLocalFlags] = useState({});
  const [flagPrompt, setFlagPrompt] = useState(null);
  const [activeFlagDetails, setActiveFlagDetails] = useState(null);
  const [reportPhotos, setReportPhotos] = useState(selectedEvent?.report_photos || []);
  const [reportSaving, setReportSaving] = useState(false);

  // Re-sync whenever the admin switches to a different event.
  useEffect(() => {
    setReportPhotos(selectedEvent?.report_photos || []);
  }, [selectedEvent?.id]);

  const toggleReportPhoto = async (photo, e) => {
    if (e) e.stopPropagation();
    if (!selectedEvent) return;
    const url = photo.url;
    const alreadyIn = reportPhotos.includes(url);
    if (!alreadyIn && reportPhotos.length >= MAX_REPORT_PHOTOS) {
      toast.error(`حداکثر ${MAX_REPORT_PHOTOS} عکس برای گزارش PDF قابل انتخاب است`);
      return;
    }
    const next = alreadyIn ? reportPhotos.filter(u => u !== url) : [...reportPhotos, url];
    const previous = reportPhotos;
    setReportPhotos(next);
    setReportSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/events/${selectedEvent.id}/report-photos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ photos: next })
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setReportPhotos(data.report_photos || next);
      onUpdateEvent?.({ report_photos: data.report_photos || next });
      toast.success(alreadyIn ? 'از گزارش PDF حذف شد' : 'به گزارش PDF اضافه شد');
    } catch (err) {
      console.error('Failed to update report photos', err);
      setReportPhotos(previous);
      toast.error('خطا در بروزرسانی عکس‌های گزارش');
    } finally {
      setReportSaving(false);
    }
  };

  // Client account (mahram-admin): photos are labelled generically, never with the promoter's name.
  const isClient = !!currentUser?.admin_client && !currentUser?.is_admin;
  const getPromoterName = (promoterId, fallbackName) => {
    if (isClient) return 'ارسالی از پروموتر';
    const user = (users || []).find(u => String(u.id) === String(promoterId));
    if (user) return user.full_name || user.username;
    if (fallbackName && typeof fallbackName === 'string') return fallbackName;
    if (typeof promoterId === 'string' && isNaN(Number(promoterId))) return promoterId;
    return 'ناشناس';
  };

  const getPromoterAvatar = (promoterId) => {
    if (isClient) return null;
    const user = (users || []).find(u => String(u.id) === String(promoterId));
    return user?.profile_picture || null;
  };

  // ── Event Days (Calendar) ──
  const eventDays = useMemo(() => getEventDaysList(selectedEvent), [selectedEvent]);

  useEffect(() => {
    if (eventDays.length > 0) {
      const todayIso = new Date().toISOString().split('T')[0];
      const matchToday = eventDays.find(d => d.id === todayIso);
      setFilterDateRange(matchToday ? matchToday.id : 'all');
    } else {
      setFilterDateRange('all');
    }
  }, [selectedEvent?.id, eventDays.length]);

  // ── Date-filtered submissions ──
  const dateFilteredSubmissions = useMemo(() => {
    if (filterDateRange === 'all') return submissions || [];
    const selectedDayObj = eventDays.find(d => d.id === filterDateRange);
    if (selectedDayObj) {
      return (submissions || []).filter(s => matchesDay(s, selectedDayObj));
    }
    return (submissions || []).filter(s => (s.first_submitted_at || s.submitted_at || '').slice(0, 10) === filterDateRange);
  }, [submissions, filterDateRange, eventDays]);

  // Day counts for badges
  const dayCounts = useMemo(() => {
    const counts = { all: (submissions || []).length };
    eventDays.forEach(day => {
      counts[day.id] = (submissions || []).filter(s => matchesDay(s, day)).length;
    });
    return counts;
  }, [submissions, eventDays]);

  // ── Extract all photos ──
  const allPhotos = useMemo(() => {
    if (!selectedEvent) return [];
    
    const fields = selectedEvent.fields || [];
    const photoFields = fields.filter(f => ['camera_checkin', 'camera_checkout', 'camera', 'image', 'photos'].includes(f.type));

    const photosList = [];

    dateFilteredSubmissions.forEach(s => {
      const promoterName = getPromoterName(s.promoter_id, s.promoter_name);
      const promoterAvatar = getPromoterAvatar(s.promoter_id);
      const submitDateRaw = s.first_submitted_at || s.submitted_at;
      const dateObj = submitDateRaw ? new Date(submitDateRaw) : null;
      const timeStr = dateObj ? dateObj.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '-';
      const dateStr = dateObj ? dateObj.toLocaleDateString('fa-IR') : '-';
      const timestamp = dateObj ? dateObj.getTime() : 0;

      // Main photo fields
      photoFields.forEach(f => {
        const val = s.data && s.data[f.id];
        if (val) {
          const arr = Array.isArray(val) ? val : [val];
          arr.forEach(url => {
            if (typeof url === 'string' && url.trim() !== '') {
              photosList.push({
                id: `${s.id}_${f.id}_${url}`,
                submissionId: s.id,
                url, promoterName, promoterAvatar, promoterId: s.promoter_id,
                fieldLabel: f.label || f.title || (f.type === 'camera_checkin' ? 'تصویر ورود' : f.type === 'camera_checkout' ? 'تصویر خروج' : f.type === 'photos' ? 'تصاویر چیدمان' : 'تصویر'),
                fieldId: f.id,
                isFlagged: s.data._flags?.[f.id]?.status === 'flagged',
                flagReason: s.data._flags?.[f.id]?.reason || '',
                timeStr, dateStr, timestamp
              });
            }
          });
        }
      });

      // Robust Checklist photos extraction
      if (s.data) {
        Object.keys(s.data).forEach(key => {
          if (key.includes('_photo_')) {
            const match = key.match(/^(.*?)_photo_(\d+)$/);
            if (match) {
              const baseFieldId = match[1];
              const idx = parseInt(match[2], 10);
              
              // Try to find the related field title
              const relatedField = fields.find(f => f.id === baseFieldId);
              const items = relatedField?.checklistItems || [
                { title: 'هماهنگی وسایل و استند و... در نقطه صفر' },
                { title: 'ثبت نام در پنل و آپلود عکس‌ها' },
                { title: 'نظافت و جمع آوری سمپلینگ' }
              ];
              const item = items[idx] || { title: `آیتم ${idx + 1}` };
              const itemTitle = typeof item === 'string' ? item : (item.title || `آیتم ${idx + 1}`);

              const pVal = s.data[key];
              if (pVal) {
                const arr = Array.isArray(pVal) ? pVal : [pVal];
                arr.forEach(url => {
                  if (typeof url === 'string' && url.trim() !== '') {
                    photosList.push({
                      id: `${s.id}_cl_${idx}_${url}`,
                      submissionId: s.id,
                      url, promoterName, promoterAvatar, promoterId: s.promoter_id,
                      fieldLabel: `📋 ${itemTitle}`,
                      fieldId: key,
                      isFlagged: s.data._flags?.[key]?.status === 'flagged',
                      flagReason: s.data._flags?.[key]?.reason || '',
                      timeStr, dateStr, timestamp
                    });
                  }
                });
              }
            }
          }
        });

        // Mehram store reports: selfie at the storefront, poster, shelf before/after, product-group photo.
        Object.entries(s.data).forEach(([key, list]) => {
          if (!key.endsWith('_reports') || !Array.isArray(list)) return;
          list.forEach((r, ri) => {
            if (!r || typeof r !== 'object' || !r.storeId) return;
            const mehramField = fields.find(f => f.type === 'mehram_supermarket_report');
            const groups = getProductGroups(mehramField);
            const perGroup = groups.filter(g => r.productPhotos?.[g.key]).map(g => [`pg_${g.key}`, g.title, r.productPhotos[g.key]]);
            const general = r.productsPhoto && !perGroup.some(([, , u]) => u === r.productsPhoto) ? [['productsPhoto', 'گروه محصولات', r.productsPhoto]] : [];
            const slots = [...MEHRAM_PHOTOS.filter(([pk]) => pk !== 'productsPhoto' && !(currentUser?.admin_client && !currentUser?.is_admin && pk === 'storefrontSelfie')).map(([pk, label]) => [pk, label, r[pk]]), ...general, ...perGroup];
            slots.forEach(([pk, label, url]) => {
              if (typeof url !== 'string' || !url.trim()) return;
              const when = r.submittedAt ? new Date(r.submittedAt) : dateObj;
              photosList.push({
                id: `${s.id}_mh_${r.id || ri}_${pk}_${url}`,
                submissionId: s.id,
                url, promoterName, promoterAvatar, promoterId: s.promoter_id,
                fieldLabel: `🏪 ${r.storeName || r.storeId} — ${label}`,
                groupLabel: `🏪 ${pk.startsWith('pg_') || pk === 'productsPhoto' ? 'گروه محصولات' : label}`,
                fieldId: `mehram_${pk.startsWith('pg_') || pk === 'productsPhoto' ? 'products' : pk}`,
                isFlagged: false,
                flagReason: '',
                timeStr: when ? when.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : timeStr,
                dateStr: when ? when.toLocaleDateString('fa-IR') : dateStr,
                timestamp: when ? when.getTime() : timestamp,
              });
            });
          });
        });
      }
    });

    // (added below, inside the submissions loop)
    const uniquePhotosMap = new Map();
    photosList.forEach(p => {
      if (!uniquePhotosMap.has(p.url)) {
        uniquePhotosMap.set(p.url, p);
      } else {
        if (p.timestamp > uniquePhotosMap.get(p.url).timestamp) {
          uniquePhotosMap.set(p.url, p);
        }
      }
    });

    return Array.from(uniquePhotosMap.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [selectedEvent, dateFilteredSubmissions, users]);

  // Filters
  const availablePromoters = useMemo(() => {
    const unique = new Map();
    allPhotos.forEach(p => { if (p.promoterId) unique.set(p.promoterId, p.promoterName); });
    
    // Always add active promoters from users list who have submissions
    if (submissions) {
      submissions.forEach(s => {
        if (s.promoter_id) {
          unique.set(s.promoter_id, getPromoterName(s.promoter_id, s.promoter_name));
        }
      });
    }
    return Array.from(unique.entries()).map(([id, name]) => ({ id, name }));
  }, [allPhotos, submissions, users]);

  const availableFields = useMemo(() => {
    const unique = new Map();
    
    // 1. Add all possible photo fields from the event schema
    if (selectedEvent && selectedEvent.fields) {
      selectedEvent.fields.forEach(f => {
        if (['camera_checkin', 'camera_checkout', 'camera', 'image', 'photos'].includes(f.type)) {
          unique.set(f.id, f.label || f.title || (f.type === 'camera_checkin' ? 'تصویر ورود' : f.type === 'camera_checkout' ? 'تصویر خروج' : f.type === 'photos' ? 'تصاویر چیدمان' : 'تصویر'));
        }
        
        if (f.type === 'advanced_checklist') {
          const items = f.checklistItems || [
            { title: 'هماهنگی وسایل و استند و... در نقطه صفر' },
            { title: 'ثبت نام در پنل و آپلود عکس‌ها' },
            { title: 'نظافت و جمع آوری سمپلینگ' }
          ];
          items.forEach((item, idx) => {
            if (typeof item === 'object' && item.attachPhoto) {
              const itemTitle = item.title || `آیتم ${idx + 1}`;
              unique.set(`${f.id}_photo_${idx}`, `📋 ${itemTitle}`);
            }
          });
        }
      });
    }

    // 2. Add any dynamic fields that actually have photos
    allPhotos.forEach(p => { 
 if (p.fieldId && !unique.has(p.fieldId)) {
        unique.set(p.fieldId, p.groupLabel || p.fieldLabel); 
      }
    });

    return Array.from(unique.entries()).map(([id, label]) => ({ id, label }));
  }, [allPhotos, selectedEvent]);

  const filteredPhotos = useMemo(() => {
    return allPhotos.filter(p => {
      if (filterPromoter !== 'all' && String(p.promoterId) !== String(filterPromoter)) return false;
      if (filterField !== 'all' && String(p.fieldId) !== String(filterField)) return false;
      if (filterFlagged !== 'all') {
        const isFlagged = p.isFlagged || localFlags[p.id] !== undefined;
        if (filterFlagged === 'flagged' && !isFlagged) return false;
        if (filterFlagged === 'unflagged' && isFlagged) return false;
      }
      return true;
    });
  }, [allPhotos, filterPromoter, filterField, filterFlagged, localFlags]);

  const hasActiveFilters = filterPromoter !== 'all' || filterField !== 'all' || filterDateRange !== 'all' || filterFlagged !== 'all';

  // Keep the lightbox pointed at a valid photo if filters change while it's open
  // (e.g. the list shrinks below the current index) instead of showing a stale/blank slide.
  useEffect(() => {
    if (lightboxIndex === null) return;
    if (filteredPhotos.length === 0) { setLightboxIndex(null); return; }
    if (lightboxIndex > filteredPhotos.length - 1) setLightboxIndex(filteredPhotos.length - 1);
  }, [filteredPhotos, lightboxIndex]);

  const lightboxPhoto = lightboxIndex !== null ? filteredPhotos[lightboxIndex] : null;
  const goPrev = () => setLightboxIndex(i => (i > 0 ? i - 1 : i));
  const goNext = () => setLightboxIndex(i => (i < filteredPhotos.length - 1 ? i + 1 : i));

  // Arrow-key / Escape navigation while the lightbox is open
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      else if (e.key === 'ArrowLeft') goNext();
      else if (e.key === 'ArrowRight') goPrev();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex, filteredPhotos.length]);

  const handleDownload = async (url, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = url.split('/').pop() || 'image.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleFlagClick = (photo, e) => {
    if (e) e.stopPropagation();
    
    const localReason = localFlags[photo.id];
    const isCurrentlyFlagged = photo.isFlagged || localReason !== undefined;
    const currentReason = localReason !== undefined ? localReason : photo.flagReason;

    if (isCurrentlyFlagged) {
      setActiveFlagDetails({ photo, reason: currentReason });
    } else {
      setFlagPrompt(photo);
    }
  };

  const confirmFlag = async (reason) => {
    const photo = flagPrompt;
    if (!photo) return;
    // "ADMIN_ONLY" prefix keeps the flag (and its reason) invisible to the
    // promoter's own form — see EventForm.jsx's startsWith('ADMIN_ONLY') check.
    const fullReason = reason ? `ADMIN_ONLY: ${reason}` : 'ADMIN_ONLY';
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/admin/events/${selectedEvent.id}/submissions/${photo.submissionId}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ field_id: photo.fieldId, url: photo.url, reason: fullReason })
      });
      if (res.ok) {
        setLocalFlags(prev => ({ ...prev, [photo.id]: fullReason }));
        setFlagPrompt(null);
      }
    } catch (err) {
      console.error('Failed to flag image', err);
    }
  };

  const confirmUnflag = async () => {
    const photo = activeFlagDetails?.photo;
    if (!photo) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/admin/events/${selectedEvent.id}/submissions/${photo.submissionId}/unflag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ field_id: photo.fieldId, url: photo.url, reason: "" })
      });
      if (res.ok) {
        setLocalFlags(prev => {
          const newFlags = { ...prev };
          delete newFlags[photo.id];
          return newFlags;
        });
        // Also mutate photo state if needed, but localFlags being undefined will reset the style
        photo.isFlagged = false; 
        setActiveFlagDetails(null);
      }
    } catch (err) {
      console.error('Failed to unflag image', err);
    }
  };

  return (
    <div className="reports-container gallery-tab-container">
      {/* ── EXECUTIVE CALENDAR BAR ── */}
      <EventCalendarBar selectedEvent={selectedEvent} />

      {/* ── KPI STRIP ── */}
      <div className="reports-kpi-strip">
        <KpiCard icon={ICONS.image} label="کل تصاویر" value={allPhotos.length} color="#6366f1" />
        {!isClient && <KpiCard icon={ICONS.users} label="پروموتر فعال" value={availablePromoters.length} color="#8b5cf6" />}
        <KpiCard icon={ICONS.layers} label="بخش‌های تصویری" value={availableFields.length} color="#10b981" />
        <KpiCard icon={ICONS.flag} label="عکس‌های فلگ شده" value={allPhotos.filter(p => p.isFlagged || localFlags[p.id] !== undefined).length} color="#ef4444" />
        <KpiCard icon={ICONS.filter} label="نتایج فیلتر" value={filteredPhotos.length} color="#06b6d4" />
        <KpiCard icon={ICONS.reportAdd} label="عکس‌های گزارش PDF" value={`${reportPhotos.length}/${MAX_REPORT_PHOTOS}`} color="#f59e0b" />
      </div>

      {/* ── FILTER BAR ── */}
      <div className="reports-search-filter-bar">
        <select className="reports-select-dropdown" value={filterDateRange} onChange={(e) => setFilterDateRange(e.target.value)}>
          <option value="all">همه روزها</option>
          {eventDays.map(d => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>

        {!isClient && <select className="reports-select-dropdown" value={filterPromoter} onChange={(e) => setFilterPromoter(e.target.value)}>
          <option value="all">همه پروموترها ({availablePromoters.length})</option>
          {availablePromoters.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>}

        <select className="reports-select-dropdown" value={filterField} onChange={(e) => setFilterField(e.target.value)}>
          <option value="all">همه بخش‌ها ({availableFields.length})</option>
          {availableFields.map(f => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>

        <select className="reports-select-dropdown" value={filterFlagged} onChange={(e) => setFilterFlagged(e.target.value)}>
          <option value="all">همه عکس‌ها</option>
          <option value="flagged">عکس‌های فلگ شده 🚩</option>
          <option value="unflagged">عکس‌های تایید شده ✅</option>
        </select>

        {hasActiveFilters && (
          <button className="reports-reset-btn" onClick={() => { setFilterPromoter('all'); setFilterField('all'); setFilterDateRange('all'); setFilterFlagged('all'); }}>
            {ICONS.reset} پاک‌کردن فیلتر
          </button>
        )}
      </div>

      {/* ── GALLERY GRID ── */}
      {filteredPhotos.length === 0 ? (
        <div className="reports-empty-card">
          <div className="rec-icon">🖼️</div>
          <h3>هیچ عکسی برای این فیلترها یافت نشد</h3>
          <p>ممکن است هنوز عکسی ارسال نشده باشد.</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {filteredPhotos.map((photo, index) => {
            const reportIdx = reportPhotos.indexOf(photo.url);
            const inReport = reportIdx !== -1;
            return (
            <div key={photo.id} className="gallery-card" onClick={() => setLightboxIndex(index)}>
              <div className="gallery-card-img-wrap">
                <img src={photo.url} alt={photo.fieldLabel} loading="lazy" decoding="async" />
                <div className="gallery-card-overlay">
                  <span className="gallery-zoom-icon">🔍</span>
                </div>
                {inReport && <span className="gallery-card-report-badge">{reportIdx + 1}</span>}
                <span className="gallery-card-type-badge">{photo.fieldLabel}</span>
                <div className="gallery-card-actions">
                  <button
                    className={`gallery-card-report ${inReport ? 'active' : ''}`}
                    title={inReport ? 'حذف از گزارش PDF' : 'افزودن به گزارش PDF (حداکثر ۶ عکس)'}
                    disabled={reportSaving}
                    onClick={(e) => toggleReportPhoto(photo, e)}
                  >
                    {inReport ? ICONS.reportCheck : ICONS.reportAdd}
                  </button>
                  <button
                    className={`gallery-card-flag ${photo.isFlagged || localFlags[photo.id] !== undefined ? 'flagged' : ''}`}
                    title="مشاهده دلیل / فلگ کردن (فقط پنل)"
                    onClick={(e) => handleFlagClick(photo, e)}
                  >
                    {ICONS.flag}
                  </button>
                  <button className="gallery-card-download" title="دانلود تصویر" onClick={(e) => handleDownload(photo.url, e)}>
                    {ICONS.download}
                  </button>
                </div>
              </div>
              <div className="gallery-card-footer">
                <div className="gallery-card-user">
                  <div className="gallery-card-avatar">
                    {photo.promoterAvatar ? <img src={photo.promoterAvatar} alt="" /> : photo.promoterName.charAt(0)}
                  </div>
                  <span className="gallery-card-name">{photo.promoterName}</span>
                </div>
                <div className="gallery-card-meta">
                  <span>⏱️ {photo.timeStr}</span>
                  <span>{photo.dateStr}</span>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* ── LIGHTBOX SLIDER ── */}
      {lightboxPhoto && (
        <div className="gallery-lightbox-overlay" onClick={() => setLightboxIndex(null)}>
          <div className="gallery-lightbox" onClick={e => e.stopPropagation()}>
            <button className="gallery-lightbox-close" onClick={() => setLightboxIndex(null)}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <span className="gallery-lightbox-counter">{lightboxIndex + 1} / {filteredPhotos.length}</span>

            <div className="gallery-lightbox-stage">
              {lightboxIndex > 0 && (
                <button className="gallery-lightbox-nav gallery-lightbox-nav-prev" title="قبلی" onClick={goPrev}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </button>
              )}

              <img src={lightboxPhoto.url} className="gallery-lightbox-img" alt={lightboxPhoto.fieldLabel} />

              {lightboxIndex < filteredPhotos.length - 1 && (
                <button className="gallery-lightbox-nav gallery-lightbox-nav-next" title="بعدی" onClick={goNext}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                </button>
              )}
            </div>

            <div className="gallery-lightbox-footer">
              <div className="gallery-lightbox-user">
                <div className="gallery-lightbox-avatar">
                  {lightboxPhoto.promoterAvatar ? <img src={lightboxPhoto.promoterAvatar} alt="" /> : lightboxPhoto.promoterName.charAt(0)}
                </div>
                <div className="gallery-lightbox-user-info">
                  <span className="gallery-lightbox-user-name">{lightboxPhoto.promoterName}</span>
                  <span className="gallery-lightbox-field-label">{lightboxPhoto.fieldLabel}</span>
                </div>
              </div>
              <div className="gallery-lightbox-meta">
                <span>📅 {lightboxPhoto.dateStr}</span>
                <span>⏱️ {lightboxPhoto.timeStr}</span>
              </div>
              <button
                className={`gallery-modal-report-btn ${reportPhotos.includes(lightboxPhoto.url) ? 'active' : ''}`}
                disabled={reportSaving}
                onClick={(e) => toggleReportPhoto(lightboxPhoto, e)}
              >
                {reportPhotos.includes(lightboxPhoto.url) ? ICONS.reportCheck : ICONS.reportAdd}
                {reportPhotos.includes(lightboxPhoto.url) ? 'در گزارش PDF' : 'افزودن به گزارش PDF'}
              </button>
              <button className="gallery-modal-dl-btn" onClick={() => handleDownload(lightboxPhoto.url)}>
                {ICONS.download} دانلود
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── FLAG REASON PROMPT MODAL ── */}
      {flagPrompt && (
        <div className="mrc-modal-overlay" onClick={() => setFlagPrompt(null)}>
          <div className="gallery-flag-modal" onClick={e => e.stopPropagation()}>
            <div className="gallery-flag-modal-header">
              <div className="gallery-flag-modal-icon">
                {ICONS.flag}
              </div>
              <div>
                <h3 className="gallery-flag-modal-title">فلگ کردن تصویر</h3>
                <p className="gallery-flag-modal-subtitle">فقط در پنل ادمین دیده می‌شود — توضیح اختیاری است</p>
              </div>
            </div>
            <textarea
              id="flag-reason-input"
              className="gallery-flag-modal-textarea"
              placeholder="دلیل فلگ کردن این عکس را بنویسید (اختیاری)..."
              autoFocus
            />
            <div className="gallery-flag-modal-actions">
              <button 
                className="gallery-flag-cancel-btn"
                onClick={() => setFlagPrompt(null)}
              >انصراف</button>
              <button
                className="gallery-flag-confirm-btn"
                onClick={() => {
                  const val = document.getElementById('flag-reason-input').value.trim();
                  confirmFlag(val);
                }}
              >
                {ICONS.flag} ثبت و فلگ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ACTIVE FLAG DETAILS MODAL ── */}
      {activeFlagDetails && (
        <div className="mrc-modal-overlay" onClick={() => setActiveFlagDetails(null)}>
          <div className="gallery-flag-modal" onClick={e => e.stopPropagation()}>
            <div className="gallery-flag-modal-header">
              <div className="gallery-flag-modal-icon flagged">
                {ICONS.flag}
              </div>
              <div>
                <h3 className="gallery-flag-modal-title">توضیحات فلگ</h3>
                <p className="gallery-flag-modal-subtitle">ثبت شده توسط: {currentUser?.full_name || currentUser?.username || 'ادمین'} · {activeFlagDetails.photo.dateStr}</p>
              </div>
            </div>
            <div className="gallery-flag-reason-box">
              {activeFlagDetails.reason.replace(/^ADMIN_ONLY:?\s*/, '') || 'بدون توضیح'}
            </div>
            <div className="gallery-flag-modal-actions">
              <button 
                className="gallery-flag-cancel-btn"
                onClick={() => setActiveFlagDetails(null)}
              >بستن</button>
              <button 
                className="gallery-flag-confirm-btn"
                style={{ background: '#334155' }}
                onClick={confirmUnflag}
              >
                حذف فلگ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
