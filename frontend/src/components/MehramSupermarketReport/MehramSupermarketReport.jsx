import React, { useState, useMemo, useRef, useEffect, useCallback, Suspense } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createPortal } from 'react-dom';
import axios from 'axios';
import {
  Store, Search, X, Info, MapPin, Phone, User, Camera, Check, ChevronDown, RotateCcw,
  Loader2, ClipboardList, Trash2, Pencil, CheckCircle2, StickyNote, Building2, Navigation, Plus, Package,
  CalendarCheck, LocateFixed, AlertTriangle, MessageSquareText, GripVertical, ChevronUp, MapIcon,
} from 'lucide-react';
import { startLocationService, waitForFix, getFailureReason } from '../../utils/locationService';
import VisitDots from './VisitDots';
const MehramMyRouteMap = React.lazy(() => import('./MehramMyRouteMap'));
import { geoVerdict, weekStart, answerLabel } from './mehramVisits';
import { normCity, MEHRAM_CITIES, MEHRAM_STORES, isStoreActiveInWeek, STORE_INFO_FIELDS, PRODUCT_STATUSES, getShelfQuestions, getProductGroups } from './mehramData';
import './mehram.css';

const INFO_ICONS = {
  store: Store, user: User, phone: Phone, city: Building2, pin: MapPin, note: StickyNote,
};

const faToEn = (s) => String(s ?? '')
  .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

const normalize = (s) => faToEn(s).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const EMPTY_DRAFT = { storefrontSelfie: '', posterBack: '', shelfBefore: '', shelfAfter: '', productsPhoto: '', answers: {}, notes: {}, products: {}, productPhotos: {}, problems: '', geo: null };
const PHOTO_KEYS = ['storefrontSelfie', 'posterBack', 'shelfBefore', 'shelfAfter', 'productsPhoto'];
const STATUS_TONE = { 'موجود': 'good', 'ناکافی': 'warn', 'موجود نیست': 'bad' };

/* ── Directions: open the store's exact pin in Neshan / Balad / Google Maps ── */
// Neshan: official app link (nshn.ir) — the old neshan.org/maps/@… link only opened the app without the point.
// «geo:» is the Android standard: the phone offers every installed map app (Neshan, Balad, …) at the exact pin.
const MAP_APPS = [
  { key: 'neshan', label: 'نشان', url: (lat, lng) => `https://nshn.ir/?lat=${lat}&lng=${lng}` },
  { key: 'balad', label: 'بلد', url: (lat, lng) => `https://balad.ir/location?latitude=${lat}&longitude=${lng}&zoom=17` },
  { key: 'google', label: 'گوگل مپ', url: (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` },
];

export const StoreDirections = ({ store }) => {
  const [copied, setCopied] = useState(false);
  if (store?.lat == null || store?.lng == null) return null;
  const coords = `${store.lat},${store.lng}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(coords); } catch {
      const t = document.createElement('textarea'); t.value = coords; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* ignore */ } t.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="mhr-directions">
      <span className="mhr-directions-title"><Navigation size={14} /> مسیریابی تا سوپرمارکت</span>
      <div className="mhr-directions-btns">
        {MAP_APPS.map((m) => (
          <a key={m.key} className={`mhr-map-btn mhr-map-btn--${m.key}`} href={m.url(store.lat, store.lng)} target="_blank" rel="noreferrer">
            <MapPin size={14} /> {m.label}
          </a>
        ))}
        <a className="mhr-map-btn mhr-map-btn--geo" href={`geo:${coords}?q=${coords}(${encodeURIComponent(store.name || 'سوپرمارکت')})`}>
          <Navigation size={14} /> برنامه‌ی گوشی
        </a>
        <button type="button" className="mhr-map-btn mhr-map-btn--copy" onClick={copy}>
          {copied ? <Check size={14} /> : <MapPin size={14} />} {copied ? 'کپی شد' : 'کپی مختصات'}
        </button>
      </div>
    </div>
  );
};

/* ── Store info modal ── */
const PROMOTER_INFO_KEYS = ['sellerName', 'mobile', 'landline', 'district', 'address', 'town'];
const StoreInfoModal = ({ store, called, onCall, onClose }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // Promoters only need who / where / how to reach the store; the rest (class, route, postal code…) stays in the admin views.
  const rows = STORE_INFO_FIELDS.filter((f) => PROMOTER_INFO_KEYS.includes(f.key) && store[f.key]);

  return createPortal(
    <div className="mhr-modal-backdrop" onClick={onClose} role="presentation">
      <div className="mhr-modal" role="dialog" aria-modal="true" aria-label={store.name} dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="mhr-modal-head">
          <span className="mhr-modal-badge"><Store size={22} /></span>
          <div className="mhr-modal-titles">
            <h3>{store.name}</h3>
            <span>{store.city}</span>
          </div>
          <button type="button" className="mhr-icon-btn" onClick={onClose} aria-label="بستن"><X size={18} /></button>
        </div>
        <div className="mhr-modal-body">
          {rows.map((f) => {
            const Icon = INFO_ICONS[f.icon] || Info;
            const v = store[f.key];
            let value = <span>{v}</span>;
            if (f.kind === 'tel') value = <a href={`tel:${v}`} dir="ltr" className="mhr-info-link" onClick={() => onCall(v)}>{v}</a>;
            if (f.kind === 'link') value = <a href={v} target="_blank" rel="noreferrer" className="mhr-info-link"><Navigation size={13} /> باز کردن در نقشه</a>;
            return (
              <div className="mhr-info-row" key={f.key}>
                <span className="mhr-info-ico"><Icon size={16} /></span>
                <div className="mhr-info-text">
                  <span className="mhr-info-label">{f.label}</span>
                  <div className="mhr-info-value">{value}</div>
                </div>
              </div>
            );
          })}
          <StoreDirections store={store} />
        </div>
        {(store.mobile || store.landline) && (
          <a className="mhr-call-btn" href={`tel:${store.mobile || store.landline}`} onClick={() => onCall(store.mobile || store.landline)}>
            <Phone size={16} /> تماس با فروشنده
          </a>
        )}
        {called && (
          <div className="mhr-called-note"><CheckCircle2 size={15} /> تماس با این فروشنده در گزارش ثبت شد</div>
        )}
      </div>
    </div>,
    document.body
  );
};

/* ── Camera-only photo slot ── */
const PhotoSlot = ({ label, hint, url, busy, progress, error, onPick, onClear, facing = 'environment', compact = false }) => {
  const inputRef = useRef(null);
  const openCamera = () => inputRef.current?.click();
  return (
    <div className={`mhr-photo ${url ? 'is-done' : ''} ${compact ? 'mhr-photo--compact' : ''}`}>
      <span className="mhr-photo-label">{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={facing}
        className="mhr-hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }}
      />
      <div className="mhr-photo-frame">
        {url ? (
          <>
            <img src={url} alt={label} />
            <span className="mhr-photo-check" title="عکس ارسال شد"><Check size={16} strokeWidth={3} /></span>
            <button type="button" className="mhr-photo-retake" onClick={openCamera} disabled={busy}>
              <RotateCcw size={13} /> گرفتن مجدد
            </button>
          </>
        ) : busy ? (
          <div className="mhr-photo-busy">
            <Loader2 size={24} className="mhr-spin" />
            <span>{progress != null ? `${progress.toLocaleString('fa-IR')}٪` : 'در حال ارسال...'}</span>
          </div>
        ) : (
          <button type="button" className="mhr-photo-empty" onClick={openCamera}>
            <span className="mhr-photo-cam"><Camera size={22} /></span>
            <span className="mhr-photo-cta">گرفتن عکس</span>
            {hint && <span className="mhr-photo-hint">{hint}</span>}
          </button>
        )}
        {url && busy && (
          <div className="mhr-photo-busy mhr-photo-busy--over"><Loader2 size={24} className="mhr-spin" /></div>
        )}
      </div>
      {error && <span className="mhr-photo-error">{error}</span>}
      {url && !busy && (
        <button type="button" className="mhr-photo-clear" onClick={onClear}>حذف عکس</button>
      )}
    </div>
  );
};

/* Small square camera tile for one product group (camera only). */
const MiniPhoto = ({ label, url, busy, progress, error, onPick, onClear }) => {
  const inputRef = useRef(null);
  return (
    <div className={`mhr-mini ${url ? 'is-done' : ''} ${error ? 'has-error' : ''}`}>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="mhr-hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
      <button type="button" className="mhr-mini-tile" onClick={() => inputRef.current?.click()} disabled={busy} aria-label={url ? `گرفتن مجدد ${label}` : `عکس ${label}`}>
        {url ? <img src={url} alt={label} /> : busy ? (
          <span className="mhr-mini-busy"><Loader2 size={18} className="mhr-spin" />{progress != null ? `${progress.toLocaleString('fa-IR')}٪` : ''}</span>
        ) : (
          <span className="mhr-mini-empty"><Camera size={20} /><small>عکس</small></span>
        )}
        {url && !busy && <span className="mhr-mini-check"><Check size={11} strokeWidth={3} /></span>}
        {url && busy && <span className="mhr-mini-busy over"><Loader2 size={18} className="mhr-spin" /></span>}
      </button>
      {url && !busy && <button type="button" className="mhr-mini-del" onClick={onClear}>حذف</button>}
      {error && <span className="mhr-mini-err">{error}</span>}
    </div>
  );
};

const NOTE_STATE = {
  pending: { label: 'منتظر پاسخ شما', tone: 'warn' },
  accepted: { label: 'تایید کردید', tone: 'good' },
  declined: { label: 'عدم تایید کردید', tone: 'bad' },
};

/** Notes the admins left on this store. The promoter answers each one: تایید, or عدم تایید with a (required) reason. */
const StoreNotesBlock = ({ notes, onRespond }) => {
  const [declining, setDeclining] = useState(null); // note id whose «عدم تایید» form is open
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  if (!notes.length) return null;
  const answer = async (n, status) => {
    if (status === 'declined' && !reason.trim()) { setErr('دلیل عدم تایید را بنویسید'); return; }
    setBusy(n.id); setErr('');
    try {
      await onRespond(n.id, status, reason.trim());
      setDeclining(null); setReason('');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'ثبت پاسخ انجام نشد؛ دوباره تلاش کنید');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mhr-block mhr-notes">
      <div className="mhr-block-title"><MessageSquareText size={15} /> نوت ادمین برای این فروشگاه</div>
      {notes.map((n) => {
        const st = NOTE_STATE[n.status] || NOTE_STATE.pending;
        return (
          <div key={n.id} className={`mhr-note-card ${st.tone}`}>
            <p>{n.text}</p>
            <div className="mhr-note-meta">
              <span className={`mhr-note-state ${st.tone}`}>{st.label}</span>
              {n.status === 'declined' && n.reason && <span className="mhr-note-reason">دلیل: {n.reason}</span>}
            </div>
            {declining === n.id ? (
              <div className="mhr-note-form">
                <textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="دلیل عدم تایید (الزامی)" aria-label="دلیل عدم تایید" autoFocus />
                <div className="mhr-note-actions">
                  <button type="button" className="mhr-note-btn bad" disabled={busy === n.id} onClick={() => answer(n, 'declined')}>
                    {busy === n.id ? <Loader2 size={14} className="mhr-spin" /> : null} ثبت عدم تایید
                  </button>
                  <button type="button" className="mhr-note-btn ghost" disabled={busy === n.id} onClick={() => { setDeclining(null); setReason(''); setErr(''); }}>انصراف</button>
                </div>
              </div>
            ) : (
              <div className="mhr-note-actions">
                {n.status !== 'accepted' && (
                  <button type="button" className="mhr-note-btn good" disabled={busy === n.id} onClick={() => answer(n, 'accepted')}>
                    {busy === n.id ? <Loader2 size={14} className="mhr-spin" /> : <Check size={14} strokeWidth={3} />} تایید
                  </button>
                )}
                {n.status !== 'declined' && (
                  <button type="button" className="mhr-note-btn bad" disabled={busy === n.id} onClick={() => { setDeclining(n.id); setReason(''); setErr(''); }}>عدم تایید</button>
                )}
                {n.status !== 'pending' && <small className="mhr-note-by">پاسخ فعلی را می‌توانید عوض کنید</small>}
              </div>
            )}
          </div>
        );
      })}
      {err && <span className="mhr-photo-error">{err}</span>}
    </div>
  );
};

/* One stop of the promoter's route: drag handle + the store (opens its report) + up / down arrows. */
const PlanRow = ({ s, n, total, done, onPick, onMove, busy, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.65 : 1, zIndex: isDragging ? 5 : 'auto' }}
      className={`mhr-plan-row ${done ? 'is-done' : ''}`}>
      <button type="button" className="mhr-plan-grip" {...attributes} {...listeners} aria-label="جابه‌جایی با کشیدن" disabled={busy}><GripVertical size={16} /></button>
      <button type="button" className={`mhr-plan-item ${done ? 'is-done' : ''}`} onClick={() => onPick(s)}>
        <span className="mhr-plan-n">{done ? <CheckCircle2 size={14} /> : n.toLocaleString('fa-IR')}</span>
        <span><b>{s.name}</b><small>{s.city}{s.district ? ` · ${s.district}` : ''}</small>{children}</span>
      </button>
      <div className="mhr-plan-arrows">
        <button type="button" onClick={() => onMove(-1)} disabled={busy || n === 1} aria-label="یک جا بالاتر"><ChevronUp size={15} /></button>
        <button type="button" onClick={() => onMove(1)} disabled={busy || n === total} aria-label="یک جا پایین‌تر"><ChevronDown size={15} /></button>
      </div>
    </div>
  );
};

/**
 * Promoter-facing Mehram supermarket report.
 * Flow: button → city → store (search + info modal) → call seller → storefront selfie → photos + shelf questions → save.
 *
 * Talks to the form only through the generic (fieldId, value) writer, like the
 * BVT components: `${field.id}_reports` holds the array of saved reports (one
 * per store — saving a store again replaces its report) and `field.id` itself
 * holds the count. `uploadImage(file, onProgress)` must resolve to a public URL.
 */
// `hideSelfie`: a view-only account of the client (they see the form, not the storefront selfie step).
const MehramSupermarketReport = ({ field, reports, calls, onChange, uploadImage, token, hideSelfie = false }) => {
  const cities = [...new Set((field?.mehramCities?.length ? field.mehramCities : MEHRAM_CITIES).map(normCity))];
  const allStores = field?.mehramStores?.length ? field.mehramStores : MEHRAM_STORES.filter((s) => isStoreActiveInWeek(s, weekStart(Date.now())));
  const questions = getShelfQuestions(field);
  const productGroups = getProductGroups(field);
  const saved = Array.isArray(reports) ? reports : [];
  const callMap = calls && typeof calls === 'object' ? calls : {};

  const [open, setOpen] = useState(false);
  const [city, setCity] = useState('');
  const [cityOpen, setCityOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [storeId, setStoreId] = useState('');
  const [infoStore, setInfoStore] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState({});
  const [progress, setProgress] = useState({});
  const [photoErr, setPhotoErr] = useState({});
  const [showErrors, setShowErrors] = useState(false);
  const [justSaved, setJustSaved] = useState('');
  const cityRef = useRef(null);
  const cityListRef = useRef(null);
  const [cityPos, setCityPos] = useState(null);
  const formRef = useRef(null);
  const [geoBusy, setGeoBusy] = useState(false);
  // This week's stores planned for this promoter (set by our admins).
  // When the admins made a plan for today (multi-day events) it replaces the weekly list.
  const [plan, setPlan] = useState({ storeIds: [], doneStoreIds: [], day: 0, dayStoreIds: [], dayDoneStoreIds: [] });
  const loadPlan = useCallback(() => {
    if (!token) return Promise.resolve();
    return axios.get(`${API_URL}/mehram/my-plan`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setPlan({
        storeIds: res.data.storeIds || [], doneStoreIds: res.data.doneStoreIds || [],
        day: res.data.day || 0, dayStoreIds: res.data.dayStoreIds || [], dayDoneStoreIds: res.data.dayDoneStoreIds || [],
      }))
      .catch(() => {}); // no plan = the plain flow
  }, [token]);
  useEffect(() => { loadPlan(); }, [loadPlan]);
  const [mapOpen, setMapOpen] = useState(() => { try { return localStorage.getItem('mhr-plan-map') !== '0'; } catch { return true; } });
  const toggleMap = () => setMapOpen((v) => { try { localStorage.setItem('mhr-plan-map', v ? '0' : '1'); } catch { /* storage unavailable */ } return !v; });
  const [planErr, setPlanErr] = useState('');
  const [planSaving, setPlanSaving] = useState(0);
  const reorderChain = useRef(Promise.resolve());
  const planSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));

  // How many times every store has been visited so far (all promoters, all weeks) → «ویزیت چندم».
  const [visitCounts, setVisitCounts] = useState({});
  const [visitedThisWeek, setVisitedThisWeek] = useState(() => new Set());
  // Notes the admins left on stores (answered by the promoter below the questions of that store).
  const [notesByStore, setNotesByStore] = useState({});
  const loadNotes = useCallback(() => {
    if (!token) return;
    axios.get(`${API_URL}/mehram/store-notes`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const m = {};
        (res.data || []).forEach((n) => { (m[n.storeId] ||= []).push(n); });
        setNotesByStore(m);
      })
      .catch(() => {}); // no notes = nothing extra to show
  }, [token]);
  useEffect(() => { loadNotes(); }, [loadNotes]);
  const respondNote = async (id, status, reason) => {
    const res = await axios.post(`${API_URL}/mehram/store-notes/${id}/respond`, { status, reason }, { headers: { Authorization: `Bearer ${token}` } });
    setNotesByStore((m) => {
      const next = { ...m };
      const sid = res.data.storeId;
      next[sid] = (next[sid] || []).map((n) => (n.id === id ? res.data : n));
      return next;
    });
  };
  const loadVisitCounts = useCallback(() => {
    if (!token) return;
    axios.get(`${API_URL}/mehram/visit-counts`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => { setVisitCounts(res.data?.counts || {}); setVisitedThisWeek(new Set(res.data?.thisWeek || [])); })
      .catch(() => {}); // no counts = the rows simply show no visit number
  }, [token]);
  useEffect(() => { loadVisitCounts(); }, [loadVisitCounts]);

  useEffect(() => {
    const onDoc = (e) => {
      if (cityRef.current?.contains(e.target) || cityListRef.current?.contains(e.target)) return;
      setCityOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // The list is portaled to <body> (position: fixed) so no ancestor's stacking
  // context / overflow can paint the following sections on top of it.
  const placeCityList = () => {
    const el = cityRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 16;
    const above = r.top - 16;
    const up = below < 180 && above > below;
    const maxH = Math.max(140, Math.min(300, up ? above : below));
    setCityPos({ left: r.left, width: r.width, maxH, ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
  };

  useEffect(() => {
    if (!cityOpen) return undefined;
    placeCityList();
    const close = (e) => { if (!cityListRef.current?.contains(e.target)) setCityOpen(false); };
    window.addEventListener('resize', placeCityList);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('resize', placeCityList); window.removeEventListener('scroll', close, true); };
  }, [cityOpen]);

  const store = useMemo(() => allStores.find((s) => s.id === storeId) || null, [allStores, storeId]);
  const reportedIds = useMemo(() => new Set(saved.map((r) => r.storeId)), [saved]);
  const dayMode = plan.dayStoreIds.length > 0;
  const activePlanIds = dayMode ? plan.dayStoreIds : plan.storeIds;
  const plannedIds = useMemo(() => new Set(activePlanIds), [activePlanIds]);
  const planStores = useMemo(() => activePlanIds.map((id) => allStores.find((s) => s.id === id)).filter(Boolean), [activePlanIds, allStores]);
  // Reordering the route: the list and the map change at once (optimistic), the new order is saved right away so the
  // admins' weekly-plan tab shows the same order. Saves are chained, so quick moves reach the server in the order they were made.
  const reorderPlan = (movedIds) => {
    const scope = dayMode ? 'day' : 'week';
    const rest = activePlanIds.filter((id) => !movedIds.includes(id));
    const ids = [...movedIds, ...rest];
    setPlan((p) => (dayMode ? { ...p, dayStoreIds: ids } : { ...p, storeIds: ids }));
    setPlanErr('');
    setPlanSaving((n) => n + 1);
    reorderChain.current = reorderChain.current
      .then(() => axios.put(`${API_URL}/mehram/my-plan/order`, { scope, store_ids: ids }, { headers: { Authorization: `Bearer ${token}` } }))
      .catch(() => { setPlanErr('ذخیره‌ی ترتیب انجام نشد؛ اینترنت را بررسی کنید.'); return loadPlan(); })
      .finally(() => setPlanSaving((n) => n - 1));
  };
  const movePlan = (from, to) => {
    if (to < 0 || to >= planStores.length || to === from) return;
    reorderPlan(arrayMove(planStores.map((s) => s.id), from, to));
  };
  // The admins can change the route while the page is open: pick their change up when the promoter comes back to the tab.
  useEffect(() => {
    const onWake = () => { if (!document.hidden && planSaving === 0) loadPlan(); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => { document.removeEventListener('visibilitychange', onWake); window.removeEventListener('focus', onWake); };
  }, [loadPlan, planSaving]);

  const reportedToday = useMemo(() => new Set(saved.filter((r) => (r.submittedAt || 0) >= plan.day).map((r) => r.storeId)), [saved, plan.day]);
  const planDone = (id) => (dayMode
    ? reportedToday.has(id) || plan.dayDoneStoreIds.includes(id)
    : reportedIds.has(id) || plan.doneStoreIds.includes(id));

  // «ویزیت چندم»: a store not reported yet this week is about to get visit count+1; a reported one already counts.
  const visitInfo = (s) => {
    const done = planDone(s.id) || reportedIds.has(s.id) || visitedThisWeek.has(s.id);
    const count = done ? Math.max(visitCounts[s.id] || 0, 1) : (visitCounts[s.id] || 0);
    const n = done ? count : count + 1;
    return { done, count, n };
  };
  const VisitLine = ({ s }) => {
    const { done, count, n } = visitInfo(s);
    return (
      <span className="vd-line">
        <span className={`vd-chip ${done ? '' : 'next'}`}>{!done && count === 0 ? 'اولین ویزیت' : `ویزیت ${n.toLocaleString('fa-IR')}ام`}</span>
        <VisitDots count={count} next={!done} size="sm" />
      </span>
    );
  };

  const NoteChip = ({ s }) => {
    const ns = notesByStore[s.id];
    if (!ns?.length) return null;
    const pending = ns.filter((n) => n.status === 'pending').length;
    const tone = pending ? 'warn' : ns.some((n) => n.status === 'declined') ? 'bad' : 'good';
    return <span className={`mhr-note-chip ${tone}`}><MessageSquareText size={11} /> {pending ? `${pending.toLocaleString('fa-IR')} نوت بدون پاسخ` : 'نوت'}</span>;
  };

  const cityStores = useMemo(() => {
    const q = normalize(query);
    return allStores
      .filter((s) => s.city === city)
      .filter((s) => !q || normalize(`${s.name} ${s.sellerName || ''} ${s.address || ''} ${s.mobile || ''} ${s.landline || ''}`).includes(q))
      // This week's planned stores first, in the order the admins added them.
      .sort((a, b) => {
        const ia = activePlanIds.indexOf(a.id); const ib = activePlanIds.indexOf(b.id);
        return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib) || 0;
      });
  }, [allStores, city, query, activePlanIds]);

  const resetFlow = () => {
    setCity(''); setQuery(''); setStoreId(''); setDraft(EMPTY_DRAFT);
    setBusy({}); setProgress({}); setPhotoErr({}); setShowErrors(false); setCityOpen(false);
  };

  const closePanel = () => { setOpen(false); resetFlow(); };

  const pickCity = (c) => {
    setCity(c); setCityOpen(false); setQuery(''); setStoreId(''); setDraft(EMPTY_DRAFT);
    setShowErrors(false); setPhotoErr({});
  };

  const pickStore = (s) => {
    startLocationService(); // warm the GPS up before the selfie
    setStoreId(s.id);
    setShowErrors(false); setPhotoErr({});
    const prev = saved.find((r) => r.storeId === s.id);
    setDraft(prev
      ? {
        storefrontSelfie: prev.storefrontSelfie || '', posterBack: prev.posterBack, shelfBefore: prev.shelfBefore, shelfAfter: prev.shelfAfter,
        productsPhoto: prev.productsPhoto || '', productPhotos: { ...(prev.productPhotos || {}) }, answers: { ...prev.answers }, notes: { ...prev.notes }, products: { ...prev.products }, problems: prev.problems || '',
        geo: prev.geo || null,
      }
      : EMPTY_DRAFT);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  // Where the promoter stood when the storefront selfie was taken — compared to
  // the store's own coordinates on every dashboard. Never blocks the report.
  const captureGeo = async () => {
    setGeoBusy(true);
    const fix = await waitForFix(20000);
    setDraft((d) => ({
      ...d,
      geo: fix
        ? { lat: fix.lat, lng: fix.lng, accuracy: Math.round(fix.accuracy), at: Date.now() }
        : { error: getFailureReason().reason, at: Date.now() },
    }));
    setGeoBusy(false);
  };

  const pickPlanned = (s) => {
    setOpen(true);
    setCity(s.city);
    setQuery('');
    pickStore(s);
  };

  const uploadPhoto = async (slot, file) => {
    setBusy((p) => ({ ...p, [slot]: true }));
    setProgress((p) => ({ ...p, [slot]: 0 }));
    setPhotoErr((p) => ({ ...p, [slot]: '' }));
    try {
      const url = await uploadImage(file, (pct) => setProgress((p) => ({ ...p, [slot]: pct })));
      // «pg_<groupKey>» = the photo of one product group.
      setDraft((d) => (slot.startsWith('pg_') ? { ...d, productPhotos: { ...d.productPhotos, [slot.slice(3)]: url } } : { ...d, [slot]: url }));
    } catch (err) {
      setPhotoErr((p) => ({ ...p, [slot]: err?.message || 'خطا در ارسال عکس — دوباره تلاش کنید' }));
    } finally {
      setBusy((p) => ({ ...p, [slot]: false }));
    }
  };

  const anyBusy = Object.values(busy).some(Boolean);
  const missingPhotos = PHOTO_KEYS.filter((k) => k !== 'productsPhoto' && !(hideSelfie && k === 'storefrontSelfie') && !draft[k]);
  // One photo per product group.
  // Every group needs its photo, even an out-of-stock one (the empty shelf).
  const missingProductPhotos = productGroups.filter((g) => !draft.productPhotos?.[g.key]);
  // Calling the seller is optional — it never blocks the report.
  const hasPhone = !!(store?.mobile || store?.landline);
  const callDone = !!store && !!callMap[store.id];
  const needsNote = (q) => !!q.noteOn && draft.answers[q.key] === q.noteOn;
  const missingAnswers = questions.filter((q) => !draft.answers[q.key]);
  const missingNotes = questions.filter((q) => needsNote(q) && !q.noteOptional && !String(draft.notes[q.key] || '').trim());
  const missingProducts = productGroups.filter((g) => !draft.products[g.key]);
  const canSave = !!store && !anyBusy && missingPhotos.length === 0 && missingAnswers.length === 0
    && missingNotes.length === 0 && missingProducts.length === 0 && missingProductPhotos.length === 0;
  // Spell out what is still missing instead of one generic sentence.
  const PHOTO_LABELS = { storefrontSelfie: 'سلفی با سردر', posterBack: 'عکس پوستر', shelfBefore: 'عکس شلف قبل', shelfAfter: 'عکس شلف بعد' };
  const missingList = [
    ...missingPhotos.map((k) => PHOTO_LABELS[k]),
    ...missingAnswers.map((q) => `پاسخ «${q.title}»`),
    ...missingNotes.map((q) => `توضیحات «${q.title}»`),
    ...missingProducts.map((g) => `وضعیت «${g.title}»`),
    ...missingProductPhotos.map((g) => `عکس «${g.title}»`),
  ].filter(Boolean);

  const persist = (next) => {
    onChange(`${field.id}_reports`, next);
    onChange(field.id, next.length);
  };

  // Tapping any call link in the info modal logs a call for that store (kept
  // even if the promoter never saves a report) — admins see it as a green tick.
  const recordCall = (s, number) => {
    const prev = callMap[s.id];
    onChange(`${field.id}_calls`, {
      ...callMap,
      [s.id]: {
        storeId: s.id, storeName: s.name, city: s.city, number,
        firstAt: prev?.firstAt || Date.now(), at: Date.now(), count: (prev?.count || 0) + 1,
      },
    });
  };

  const saveReport = () => {
    if (!canSave) { setShowErrors(true); return; }
    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      city: store.city,
      storeId: store.id,
      storeName: store.name,
      storefrontSelfie: draft.storefrontSelfie,
      posterBack: draft.posterBack,
      shelfBefore: draft.shelfBefore,
      shelfAfter: draft.shelfAfter,
      // `productsPhoto` stays filled (admin views, gallery, exports read it); `productPhotos` holds one photo per group.
      productsPhoto: Object.values(draft.productPhotos || {}).find(Boolean) || draft.productsPhoto || '',
      productPhotos: Object.fromEntries(Object.entries(draft.productPhotos || {}).filter(([, u]) => u)),
      answers: { ...draft.answers },
      // Only keep explanations whose answer still asks for one.
      notes: Object.fromEntries(questions.filter(needsNote).map((q) => [q.key, String(draft.notes[q.key] || '').trim()]).filter(([, t]) => t)),
      products: Object.fromEntries(productGroups.map((g) => [g.key, draft.products[g.key]])),
      // Optional: whatever went wrong at this store (never required to save).
      problems: String(draft.problems || '').trim(),
      geo: draft.geo || null,
      calledAt: callMap[store.id]?.at || null,
      submittedAt: Date.now(),
    };
    persist([...saved.filter((r) => r.storeId !== store.id), entry]);
    setJustSaved(store.name);
    setTimeout(loadVisitCounts, 1800); // the report is synced to the server a moment after saving
    setTimeout(() => setJustSaved(''), 4000);
    closePanel();
  };

  const editSaved = (r) => {
    setOpen(true);
    setCity(normCity(r.city));
    const s = allStores.find((x) => x.id === r.storeId);
    if (s) pickStore(s);
  };

  const deleteSaved = (r) => {
    if (!window.confirm(`گزارش «${r.storeName}» حذف شود؟`)) return;
    persist(saved.filter((x) => x.id !== r.id));
  };

  const answered = questions.length - missingAnswers.length;
  const photosDone = (PHOTO_KEYS.length - 1 - (hideSelfie ? 1 : 0) - missingPhotos.length) + (productGroups.length - missingProductPhotos.length);
  const productsDone = productGroups.length - missingProducts.length;
  const totalSteps = (PHOTO_KEYS.length - 1 - (hideSelfie ? 1 : 0)) + productGroups.length + questions.length + productGroups.length;
  const doneSteps = photosDone + answered + productsDone;

  return (
    <div className="mhr-field" dir="rtl">
      {justSaved && (
        <div className="mhr-toast"><CheckCircle2 size={18} /> گزارش «{justSaved}» ثبت شد</div>
      )}

      {planStores.length > 0 && (
        <div className="mhr-plan">
          <div className="mhr-plan-head">
            <span className="mhr-plan-ico"><CalendarCheck size={18} /></span>
            <div>
              <b>{dayMode ? 'برنامه‌ی امروز شما' : 'برنامه‌ی این هفته‌ی شما'}</b>
              <small>{planStores.filter((s) => planDone(s.id)).length.toLocaleString('fa-IR')} از {planStores.length.toLocaleString('fa-IR')} فروشگاه انجام شده</small>
            </div>
          </div>
          <div className="mhr-plan-bar"><span style={{ width: `${(planStores.filter((s) => planDone(s.id)).length / planStores.length) * 100}%` }} /></div>
          <button type="button" className="mhr-plan-maptoggle" onClick={toggleMap} aria-expanded={mapOpen}>
            <MapIcon size={14} /> {mapOpen ? 'پنهان کردن نقشه‌ی مسیر' : 'نمایش نقشه‌ی مسیر'}
          </button>
          {mapOpen && (
            <Suspense fallback={<div className="mhr-plan-maploading"><Loader2 size={16} className="mhr-spin" /> در حال بارگذاری نقشه...</div>}>
              <MehramMyRouteMap stops={planStores.map((s) => ({ store: s, done: planDone(s.id) }))} onPick={pickPlanned} />
            </Suspense>
          )}
          <small className="mhr-plan-hint">ترتیب مسیر را با کشیدن یا فلش‌ها عوض کنید؛ نقشه و ترتیب برنامه همان لحظه تغییر می‌کند.{planSaving > 0 ? ' در حال ذخیره...' : ''}</small>
          {planErr && <small className="mhr-plan-err">{planErr}</small>}
          <DndContext sensors={planSensors} collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => { if (over && active.id !== over.id) { const ids = planStores.map((s) => s.id); movePlan(ids.indexOf(active.id), ids.indexOf(over.id)); } }}>
            <SortableContext items={planStores.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="mhr-plan-list">
                {planStores.map((s, i) => (
                  <PlanRow key={s.id} s={s} n={i + 1} total={planStores.length} done={planDone(s.id)} onPick={pickPlanned} onMove={(d) => movePlan(i, i + d)} busy={false}>
                    <VisitLine s={s} />
                    <NoteChip s={s} />
                  </PlanRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {!open && (
        <button type="button" className="mhr-start-btn" onClick={() => setOpen(true)}>
          <span className="mhr-start-ico"><ClipboardList size={22} /></span>
          <span className="mhr-start-text">
            <b>ثبت گزارش سوپرمارکت</b>
            <small>{saved.length ? `${saved.length.toLocaleString('fa-IR')} گزارش ثبت شده — گزارش جدید اضافه کن` : 'شهر و سوپرمارکت را انتخاب کن و گزارش بده'}</small>
          </span>
          <Plus size={20} />
        </button>
      )}

      {open && (
        <div className="mhr-panel">
          <div className="mhr-panel-head">
            <span className="mhr-panel-title"><ClipboardList size={17} /> گزارش سوپرمارکت</span>
            <button type="button" className="mhr-icon-btn" onClick={closePanel} aria-label="بستن"><X size={18} /></button>
          </div>

          {/* Step 1 — city */}
          <div className="mhr-step">
            <div className="mhr-step-title"><span className="mhr-step-num">۱</span> انتخاب شهر</div>
            <div className="mhr-select" ref={cityRef}>
              <button type="button" className={`mhr-select-btn ${cityOpen ? 'is-open' : ''}`} onClick={() => setCityOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={cityOpen}>
                <MapPin size={16} />
                <span className={city ? '' : 'mhr-placeholder'}>{city || 'شهر را انتخاب کنید'}</span>
                <ChevronDown size={16} className="mhr-chev" />
              </button>
              {cityOpen && cityPos && createPortal(
                <ul
                  ref={cityListRef}
                  className="mhr-select-list"
                  role="listbox"
                  dir="rtl"
                  style={{ left: cityPos.left, width: cityPos.width, top: cityPos.top, bottom: cityPos.bottom, maxHeight: cityPos.maxH }}
                >
                  {cities.map((c) => (
                    <li key={c}>
                      <button type="button" role="option" aria-selected={c === city} className={c === city ? 'is-active' : ''} onClick={() => pickCity(c)}>
                        <span>{c}</span>
                        {c === city && <Check size={15} />}
                      </button>
                    </li>
                  ))}
                </ul>,
                document.body
              )}
            </div>
          </div>

          {/* Step 2 — store */}
          {city && (
            <div className="mhr-step">
              <div className="mhr-step-title"><span className="mhr-step-num">۲</span> انتخاب سوپرمارکت</div>
              {store ? (
                <div className="mhr-chosen">
                  <span className="mhr-chosen-ico"><Store size={18} /></span>
                  <div className="mhr-chosen-text">
                    <b>{store.name}</b>
                    <small>{store.sellerName || store.address}</small>
                  </div>
                  <button type="button" className="mhr-icon-btn" onClick={() => setInfoStore(store)} aria-label="اطلاعات سوپرمارکت"><Info size={17} /></button>
                  <button type="button" className="mhr-link-btn" onClick={() => { setStoreId(''); setDraft(EMPTY_DRAFT); }}>تغییر</button>
                </div>
              ) : null}
              {store && <StoreDirections store={store} />}
              {!store && (
                <>
                  <div className="mhr-search">
                    <Search size={16} className="mhr-search-ico" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="جستجوی سوپرمارکت (نام، فروشنده، آدرس...)"
                      aria-label="جستجوی سوپرمارکت"
                    />
                    {query && (
                      <button type="button" className="mhr-search-clear" onClick={() => setQuery('')} aria-label="پاک کردن"><X size={13} /></button>
                    )}
                  </div>
                  <div className="mhr-store-list">
                    {cityStores.length === 0 && (
                      <div className="mhr-empty">{query ? 'موردی یافت نشد' : 'سوپرمارکتی برای این شهر ثبت نشده'}</div>
                    )}
                    {cityStores.map((s) => (
                      <div key={s.id} className="mhr-store-row">
                        <button type="button" className="mhr-store-main" onClick={() => pickStore(s)}>
                          <span className="mhr-store-ico"><Store size={18} /></span>
                          <span className="mhr-store-text">
                            <b>{s.name}</b>
                            <small>{s.sellerName ? `${s.sellerName} · ` : ''}{s.address}</small>
                            <VisitLine s={s} />
                            <NoteChip s={s} />
                          </span>
                          {plannedIds.has(s.id) && !planDone(s.id) && <span className="mhr-plan-chip"><CalendarCheck size={11} /> برنامه</span>}
                          {callMap[s.id] && <span className="mhr-call-chip" title="تماس گرفته شد"><Phone size={11} /> <Check size={11} strokeWidth={3} /></span>}
                          {reportedIds.has(s.id) && <span className="mhr-done-chip"><Check size={12} strokeWidth={3} /> ثبت شده</span>}
                        </button>
                        <button type="button" className="mhr-info-btn" onClick={() => setInfoStore(s)} aria-label={`اطلاعات ${s.name}`}>
                          <Info size={17} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3 — report */}
          {store && (
            <div className="mhr-step" ref={formRef}>
              <div className="mhr-step-title">
                <span className="mhr-step-num">۳</span> گزارش
                <span className="mhr-progress-pill">{doneSteps.toLocaleString('fa-IR')} از {totalSteps.toLocaleString('fa-IR')}</span>
              </div>

              {(notesByStore[store.id] || []).some((n) => n.status === 'pending') && (
                <div className="mhr-notes-banner"><MessageSquareText size={15} /> ادمین برای این فروشگاه نوت گذاشته؛ پایین سوالات ببینید و تایید یا عدم تایید کنید.</div>
              )}
              <div className="mhr-visit-banner">
                <span>این فروشگاه تا الان <b>{(visitCounts[store.id] || 0).toLocaleString('fa-IR')}</b> بار ویزیت شده</span>
                <VisitLine s={store} />
              </div>

              <div className={`mhr-block mhr-call-block ${callDone ? 'is-done' : ''}`}>
                {!hasPhone ? (
                  <div className="mhr-call-line"><Phone size={14} /> <span>برای این فروشگاه شماره‌ای ثبت نشده</span></div>
                ) : (
                  <div className="mhr-call-line">
                    <span className="mhr-call-who"><Phone size={14} /> {store.sellerName ? <b>{store.sellerName}</b> : 'تماس با فروشنده'} <small>(اختیاری)</small></span>
                    {store.mobile && (
                      <a className="mhr-call-chipbtn" href={`tel:${store.mobile}`} onClick={() => recordCall(store, store.mobile)} aria-label="تماس با موبایل">
                        موبایل <span dir="ltr">{store.mobile}</span>
                      </a>
                    )}
                    {store.landline && (
                      <a className="mhr-call-chipbtn alt" href={`tel:${store.landline}`} onClick={() => recordCall(store, store.landline)} aria-label="تماس با تلفن">
                        تلفن <span dir="ltr">{store.landline}</span>
                      </a>
                    )}
                    {callDone && <span className="mhr-call-ok"><CheckCircle2 size={14} /> ثبت شد</span>}
                  </div>
                )}
              </div>

              {!hideSelfie && (
              <div className={`mhr-block mhr-block--selfie ${(draft.storefrontSelfie) ? 'is-done' : ''}`}>
                <div className="mhr-block-title">عکس سلفی با سردر سوپرمارکت</div>
                <PhotoSlot
                  label="سلفی با سردر سوپرمارکت"
                  hint="سلفی با دوربین جلو، سردر فروشگاه پشت سرتان دیده شود"
                  facing="user"
                  url={draft.storefrontSelfie}
                  busy={!!busy.storefrontSelfie}
                  progress={progress.storefrontSelfie}
                  error={photoErr.storefrontSelfie || (showErrors && !draft.storefrontSelfie ? 'این عکس الزامی است' : '')}
                  onPick={(f) => { captureGeo(); uploadPhoto('storefrontSelfie', f); }}
                  onClear={() => setDraft((d) => ({ ...d, storefrontSelfie: '', geo: null }))}
                />
                {(geoBusy || draft.geo) && (() => {
                  if (geoBusy) return <div className="mhr-geo"><Loader2 size={15} className="mhr-spin" /> در حال ثبت موقعیت شما...</div>;
                  const g = geoVerdict(draft.geo, store);
                  return (
                    <div className={`mhr-geo ${g.state}`}>
                      {g.state === 'near' || g.state === 'nostore' ? <LocateFixed size={15} /> : <AlertTriangle size={15} />}
                      <span>
                        {g.state === 'far' ? `فاصله‌ی شما تا این فروشگاه ${g.label.replace(' دورتر از فروشگاه', '')} است — مطمئن شوید جلوی همین فروشگاه هستید` : g.label}
                        {g.state === 'none' && ' — GPS گوشی را روشن کنید'}
                      </span>
                      {g.state !== 'near' && (
                        <button type="button" className="mhr-link-btn" onClick={captureGeo}>ثبت دوباره‌ی موقعیت</button>
                      )}
                    </div>
                  );
                })()}
              </div>
              )}

              {productGroups.length > 0 && (
              <div className={`mhr-block mhr-block--groups ${(productGroups.length > 0 && missingProductPhotos.length === 0 && missingProducts.length === 0) ? 'is-done' : ''}`}>
                <div className="mhr-block-title"><Package size={15} /> گروه محصولات</div>
                <p className="mhr-block-hint">برای هر گروه وضعیت موجودی را انتخاب کنید و از قفسه‌ی همان گروه یک عکس بگیرید (حتی اگر موجود نیست).</p>
                <div className="mhr-pgs">
                  {productGroups.map((g, gi) => {
                    const val = draft.products[g.key];
                    const photo = draft.productPhotos?.[g.key];
                    const slot = `pg_${g.key}`;
                    const complete = !!val && !!photo;
                    const incomplete = showErrors && !complete;
                    return (
                      <div key={g.key} className={`mhr-pg ${complete ? 'is-done' : ''} ${incomplete ? 'is-missing' : ''}`}>
                        <div className="mhr-pg-main">
                          <div className="mhr-pg-title">
                            <span className="mhr-q-num">{complete ? <Check size={13} strokeWidth={3} /> : (gi + 1).toLocaleString('fa-IR')}</span>
                            <b>{g.title}</b>
                          </div>
                          <div className="mhr-opts mhr-opts--3" role="radiogroup" aria-label={g.title}>
                            {PRODUCT_STATUSES.map((o) => (
                              <button
                                key={o}
                                type="button"
                                role="radio"
                                aria-checked={val === o}
                                className={`mhr-opt mhr-opt--${STATUS_TONE[o]} ${val === o ? 'is-on' : ''}`}
                                onClick={() => setDraft((d) => ({ ...d, products: { ...d.products, [g.key]: o } }))}
                              >
                                {o}
                              </button>
                            ))}
                          </div>
                          {showErrors && !complete && (
                            <span className="mhr-photo-error">{!val ? 'وضعیت را انتخاب کنید' : 'عکس این گروه لازم است'}</span>
                          )}
                        </div>
                        <MiniPhoto
                          label={g.title}
                          url={photo}
                          busy={!!busy[slot]}
                          progress={progress[slot]}
                          error={photoErr[slot]}
                          onPick={(f) => uploadPhoto(slot, f)}
                          onClear={() => setDraft((d) => ({ ...d, productPhotos: { ...d.productPhotos, [g.key]: '' } }))}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              )}

              {questions.length > 0 && (
              <div className={`mhr-block mhr-block--questions ${(questions.length > 0 && missingAnswers.length === 0 && missingNotes.length === 0) ? 'is-done' : ''}`}>
                <div className="mhr-block-title">سوالات فروشگاه</div>
                <div className="mhr-questions">
                  {/* Free text about the store comes first, above «همکاری فروشگاه». Saved as `problems`. */}
                  <div className={`mhr-q ${String(draft.problems || '').trim() ? 'is-answered' : ''}`}>
                    <div className="mhr-q-head">
                      <span className="mhr-q-num"><MessageSquareText size={13} /></span>
                      <span className="mhr-q-title">توضیحات فروشگاه <small className="mhr-optional">(اختیاری)</small></span>
                    </div>
                    <div className="mhr-note">
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={draft.problems || ''}
                        onChange={(e) => setDraft((d) => ({ ...d, problems: e.target.value }))}
                        placeholder="اگر نکته یا مشکلی درباره‌ی این فروشگاه هست اینجا بنویسید؛ در غیر این صورت خالی بگذارید"
                        aria-label="توضیحات فروشگاه"
                      />
                    </div>
                  </div>
                  {questions.map((q, qi) => {
                    const val = draft.answers[q.key];
                    const missing = showErrors && !val;
                    return (
                      <div key={q.key} className={`mhr-q ${val ? 'is-answered' : ''} ${missing ? 'is-missing' : ''}`}>
                        <div className="mhr-q-head">
                          <span className="mhr-q-num">{val ? <Check size={13} strokeWidth={3} /> : (qi + 1).toLocaleString('fa-IR')}</span>
                          <span className="mhr-q-title">{q.title}</span>
                        </div>
                        <div className={`mhr-opts mhr-opts--${q.options.length}`} role="radiogroup" aria-label={q.title}>
                          {q.options.map((o) => (
                            <button
                              key={o}
                              type="button"
                              role="radio"
                              aria-checked={val === o}
                              className={`mhr-opt ${val === o ? 'is-on' : ''}`}
                              onClick={() => setDraft((d) => ({ ...d, answers: { ...d.answers, [q.key]: o } }))}
                            >
                              {o}
                            </button>
                          ))}
                        </div>
                        {needsNote(q) && (
                          <div className="mhr-note">
                            <textarea
                              rows={2}
                              value={draft.notes[q.key] || ''}
                              onChange={(e) => setDraft((d) => ({ ...d, notes: { ...d.notes, [q.key]: e.target.value } }))}
                              placeholder={q.noteOptional ? 'توضیحات کوتاه (اختیاری)' : 'توضیحات (الزامی) — دلیل را بنویسید'}
                              aria-label={`توضیحات ${q.title}`}
                            />
                            {showErrors && !q.noteOptional && !String(draft.notes[q.key] || '').trim() && <span className="mhr-photo-error">نوشتن توضیحات الزامی است</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              )}

              <StoreNotesBlock notes={notesByStore[store.id] || []} onRespond={respondNote} />

              <div className={`mhr-block mhr-block--shelf ${(draft.shelfBefore && draft.shelfAfter) ? 'is-done' : ''}`}>
                <div className="mhr-block-title">عکس شلف قبل و بعد از مرتب‌سازی</div>
                <div className="mhr-photo-pair">
                  <PhotoSlot
                    label="قبل از مرتب‌سازی"
                    hint="فقط با دوربین"
                    url={draft.shelfBefore}
                    busy={!!busy.shelfBefore}
                    progress={progress.shelfBefore}
                    error={photoErr.shelfBefore || (showErrors && !draft.shelfBefore ? 'الزامی است' : '')}
                    onPick={(f) => uploadPhoto('shelfBefore', f)}
                    onClear={() => setDraft((d) => ({ ...d, shelfBefore: '' }))}
                  />
                  <PhotoSlot
                    label="بعد از مرتب‌سازی"
                    hint="فقط با دوربین"
                    url={draft.shelfAfter}
                    busy={!!busy.shelfAfter}
                    progress={progress.shelfAfter}
                    error={photoErr.shelfAfter || (showErrors && !draft.shelfAfter ? 'الزامی است' : '')}
                    onPick={(f) => uploadPhoto('shelfAfter', f)}
                    onClear={() => setDraft((d) => ({ ...d, shelfAfter: '' }))}
                  />
                </div>
              </div>

              <div className={`mhr-block mhr-block--poster ${(draft.posterBack) ? 'is-done' : ''}`}>
                <div className="mhr-block-title">عکس پوستر</div>
                <PhotoSlot
                  label="عکس پوستر"
                  hint="فقط با دوربین"
                  url={draft.posterBack}
                  busy={!!busy.posterBack}
                  progress={progress.posterBack}
                  error={photoErr.posterBack || (showErrors && !draft.posterBack ? 'این عکس الزامی است' : '')}
                  onPick={(f) => uploadPhoto('posterBack', f)}
                  onClear={() => setDraft((d) => ({ ...d, posterBack: '' }))}
                />
              </div>

              {showErrors && !canSave && !anyBusy && (
                <div className="mhr-error-bar">
                  <b>این موارد هنوز کامل نیست:</b>
                  <ul>{missingList.map((m) => <li key={m}>{m}</li>)}</ul>
                </div>
              )}
              <button type="button" className="mhr-save-btn" onClick={saveReport} disabled={anyBusy}>
                {anyBusy ? <><Loader2 size={16} className="mhr-spin" /> در حال ارسال عکس...</> : <><CheckCircle2 size={17} /> ثبت گزارش این سوپرمارکت</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Saved reports */}
      {saved.length > 0 && (
        <div className="mhr-saved">
          <div className="mhr-saved-title">گزارش‌های ثبت‌شده <span>{saved.length.toLocaleString('fa-IR')}</span></div>
          {[...saved].reverse().map((r) => (
            <div className="mhr-saved-card" key={r.id}>
              <div className="mhr-saved-head">
                <span className="mhr-store-ico"><Store size={16} /></span>
                <div className="mhr-saved-names"><b>{r.storeName}</b><small>{normCity(r.city)}</small></div>
                {callMap[r.storeId] && <span className="mhr-call-chip"><Phone size={11} /> تماس <Check size={11} strokeWidth={3} /></span>}
                <button type="button" className="mhr-icon-btn" onClick={() => editSaved(r)} aria-label="ویرایش"><Pencil size={15} /></button>
                <button type="button" className="mhr-icon-btn danger" onClick={() => deleteSaved(r)} aria-label="حذف"><Trash2 size={15} /></button>
              </div>
              <div className="mhr-thumbs">
                {[['سلفی', r.storefrontSelfie], ['پوستر', r.posterBack], ['قبل', r.shelfBefore], ['بعد', r.shelfAfter], ['محصولات', r.productsPhoto]].filter(([, u]) => u).map(([l, u]) => (
                  <a key={l} href={u} target="_blank" rel="noreferrer" className="mhr-thumb"><img src={u} alt={l} loading="lazy" /><span>{l}</span></a>
                ))}
              </div>
              {r.problems && <p className="mhr-saved-problems"><AlertTriangle size={12} /> {r.problems}</p>}
              <div className="mhr-saved-answers">
                {questions.filter((q) => r.answers?.[q.key]).map((q) => (
                  <span key={q.key} className="mhr-answer-chip">{q.title.replace('آیا ', '').replace(' دارد؟', '').replace('؟', '')}: <b>{answerLabel(q.key, r.answers?.[q.key])}</b></span>
                ))}
                {productGroups.filter((g) => r.products?.[g.key]).map((g) => (
                  <span key={g.key} className={`mhr-answer-chip mhr-answer-chip--${STATUS_TONE[r.products[g.key]] || ''}`}>{g.title}: <b>{r.products[g.key]}</b></span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {infoStore && (
        <StoreInfoModal
          store={infoStore}
          called={!!callMap[infoStore.id]}
          onCall={(n) => recordCall(infoStore, n)}
          onClose={() => setInfoStore(null)}
        />
      )}
    </div>
  );
};

export default MehramSupermarketReport;
