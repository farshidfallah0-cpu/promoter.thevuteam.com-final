import PageLoader from '../PageLoader';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  Store, Search, X, MapPin, Phone, User, CheckCircle2, Circle, ChevronRight, ChevronLeft, Download,
  Package, AlertTriangle, CalendarDays, Users, TrendingUp, EyeOff, Loader2, MessageSquareText, Clock, Filter, RotateCcw, ImageOff,
  LayoutGrid, Map as MapIcon, BarChart3, CalendarCheck, CheckSquare, Square, LocateFixed, Route as RouteIcon, RefreshCw,
} from 'lucide-react';
import { MEHRAM_STORES, MEHRAM_CITIES, normCity, STORE_INFO_FIELDS, isStoreActiveInWeek, isStoreNew } from './mehramData';
import { StoreDirections } from './MehramSupermarketReport';
import { visitWeekCount, answerLabel,
  weekStart, weekName, weekLabel, fmtDate, fmtDay, fmtTime, fa, STATUS_TONE, isShortage, answerTone,
  isUncooperative, isCooperative, noShelfTalker, VISIT_PHOTOS, visitPhotoList, buildCatalog, geoVerdict, weekDays, dayWeekdayName, dayShort, eventDayStarts,
} from './mehramVisits';
import MehramStoresMap from './MehramStoresMap';
import MehramWeeklyPlan from './MehramWeeklyPlan';
import StoreNotesAdmin, { NotesChip } from './MehramStoreNotesAdmin';
import MehramTrends from './MehramTrends';
import MehramDaily from './MehramDaily';
import './mehramStoresTab.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const PAGE = 48;
const STORE_BY_ID = new Map(MEHRAM_STORES.map((s) => [s.id, s]));
const VISIT_TARGET = 16; // the stores are visited for 16 consecutive weeks

const normalize = (s) => String(s ?? '')
  .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase().replace(/\s+/g, ' ').trim();

const EMPTY_FILTERS = { city: 'all', q: '', status: 'all', district: '', cls: '', promoter: '', issue: '', plan: '', day: '', sort: 'recent' };

const VIEWS = [
  ['cards', 'کارت‌ها', LayoutGrid],
  ['map', 'نقشه', MapIcon],
  ['weekly', 'برنامه‌ی هفتگی', CalendarCheck],
  ['daily', 'برنامه و مسیر روزانه', RouteIcon],
  ['trends', 'روند و گزارش هفتگی', BarChart3],
];

const PLAN_OPTIONS = { in: 'در برنامه', missed: 'در برنامه، انجام نشده', out: 'خارج از برنامه' };

const STATUS_OPTIONS = [
  ['all', 'همه'],
  ['visited', 'بازدید شده'],
  ['notVisited', 'بازدید نشده'],
  ['never', 'هرگز بازدید نشده'],
];

const hasIssue = (row, issue) => {
  if (!issue) return true;
  const vs = row.inWeek;
  if (issue === 'shortage') return vs.some((v) => Object.values(v.products || {}).some(isShortage));
  if (issue === 'uncoop') return vs.some(isUncooperative);
  if (issue === 'coop') return vs.some(isCooperative);
  if (issue === 'noTalker') return vs.some(noShelfTalker);
  if (issue === 'unapproved') return vs.some((v) => v.approved === false);
  if (issue === 'far') return vs.some((v) => geoVerdict(v.geo, row.store).state === 'far');
  return true;
};

const matchesPlan = (row, plan) => {
  if (!plan) return true;
  if (plan === 'in') return !!row.plan;
  if (plan === 'missed') return !!row.plan && !row.inWeek.length;
  if (plan === 'out') return !row.plan;
  return true;
};

/* Location badge for one visit. The client only ever sees the reassuring case —
   doubtful locations are for our admins to judge before approving. */
const GeoTag = ({ visit, store, clientView }) => {
  if (!visit.geo) return null;
  const g = geoVerdict(visit.geo, store);
  if (clientView && g.state !== 'near') return null;
  const tone = { near: 'good', nostore: 'muted', far: 'warn', none: 'bad' }[g.state];
  return (
    <span className={`mst-tag ${tone}`} title={visit.geo.accuracy ? `دقت GPS: ${fa(visit.geo.accuracy)} متر` : undefined}>
      {g.state === 'near' ? <LocateFixed size={12} /> : <AlertTriangle size={12} />} {g.label}
    </span>
  );
};

/* ── Photo slider: ← → / swipe / thumbnails through every photo of the store ── */
const Lightbox = ({ items, index, onIndex, onClose }) => {
  const item = items[index];
  const touchX = useRef(null);
  const go = (d) => onIndex((index + d + items.length) % items.length);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (items.length > 1 && e.key === 'ArrowLeft') go(1);
      else if (items.length > 1 && e.key === 'ArrowRight') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    document.querySelector('.mst-lightbox-strip .is-on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [index]);
  const many = items.length > 1;
  return createPortal(
    <div
      className="mst-lightbox" onClick={onClose} role="presentation"
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touchX.current ?? e.changedTouches[0].clientX);
        touchX.current = null;
        if (many && Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <button type="button" className="mst-lightbox-close" onClick={onClose} aria-label="بستن"><X size={20} /></button>
      {many && <button type="button" className="mst-lightbox-nav prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="قبلی"><ChevronRight size={26} /></button>}
      <img src={item.url} alt={item.title} onClick={(e) => e.stopPropagation()} />
      {many && <button type="button" className="mst-lightbox-nav next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="بعدی"><ChevronLeft size={26} /></button>}
      <span className="mst-lightbox-title">{item.title}{many ? ` — ${fa(index + 1)} از ${fa(items.length)}` : ''}</span>
      {many && (
        <div className="mst-lightbox-strip" onClick={(e) => e.stopPropagation()}>
          {items.map((it, n) => (
            <button type="button" key={it.key} className={n === index ? 'is-on' : ''} onClick={() => onIndex(n)} aria-label={it.title}>
              <img src={it.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
};

/* ── One visit inside the store modal ── */
const VisitCard = ({ visit, catalog, clientView, onPhoto, storeName, store }) => {
  const ev = catalog.byEvent[visit.eventId] || catalog;
  const shortages = Object.values(visit.products || {}).filter(isShortage).length;
  return (
    <article className="mst-visit">
      <header className="mst-visit-head">
        {!clientView && <span className="mst-avatar">{(visit.promoterName || '؟').charAt(0)}</span>}
        <div className="mst-visit-who">
          {clientView
            ? <b>{fmtDay(visit.submittedAt)}</b>
            : <><b>{visit.promoterName}</b>
              <small><Clock size={12} /> {fmtDay(visit.submittedAt)} · ساعت {fmtTime(visit.submittedAt)}</small></>}
          {clientView && <small><Clock size={12} /> ساعت {fmtTime(visit.submittedAt)}</small>}
        </div>
        <div className="mst-visit-tags">
          {!clientView && (visit.calledAt
            ? <span className="mst-tag good"><Phone size={12} /> تماس {fmtTime(visit.calledAt)}</span>
            : <span className="mst-tag muted"><Phone size={12} /> بدون تماس</span>)}
          <GeoTag visit={visit} store={store} clientView={clientView} />
          {shortages > 0 && <span className="mst-tag bad"><Package size={12} /> {fa(shortages)} کمبود</span>}
          {!clientView && visit.approved === false && <span className="mst-tag warn"><EyeOff size={12} /> تایید نشده</span>}
        </div>
      </header>

      <div className="mst-visit-photos">
        {visitPhotoList(visit, ev, clientView).map(([k, label, url]) => (url ? (
          <button type="button" key={k} className="mst-thumb" onClick={() => onPhoto(`${visit.id}|${k}`)}>
            <img src={url} alt={label} loading="lazy" />
            <span>{label}</span>
          </button>
        ) : (
          <div key={k} className="mst-thumb empty"><ImageOff size={16} /><span>{label}</span></div>
        )))}
      </div>

      {ev.questions.some((q) => visit.answers?.[q.key]) && (
        <div className="mst-answers">
          {ev.questions.filter((q) => visit.answers?.[q.key]).map((q) => (
            <div className="mst-answer" key={q.key}>
              <div className="mst-answer-row">
                <span>{q.title}</span>
                <b className={`mst-pill ${answerTone(q.key, visit.answers[q.key])}`}>{answerLabel(q.key, visit.answers[q.key])}</b>
              </div>
              {visit.notes?.[q.key] && <p className="mst-note"><MessageSquareText size={13} /> {visit.notes[q.key]}</p>}
            </div>
          ))}
        </div>
      )}

      {ev.groups.some((g) => visit.products?.[g.key]) && (
        <div className="mst-products">
          <span className="mst-products-title"><Package size={13} /> گروه محصولات</span>
          <div className="mst-products-grid">
            {ev.groups.filter((g) => visit.products?.[g.key]).map((g) => (
              <span key={g.key} className={`mst-product ${STATUS_TONE[visit.products[g.key]] || ''}`}>
                <i />{g.title}<b>{visit.products[g.key]}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {!clientView && visit.problems && (
        <div className="mst-problems">
          <span className="mst-problems-title"><AlertTriangle size={13} /> توضیحات فروشگاه</span>
          <p>{visit.problems}</p>
        </div>
      )}
    </article>
  );
};

/* ── Store modal: full info + visit history grouped by week ── */
const StoreModal = ({ row, catalog, clientView, onClose, notes = [], noteApi = null }) => {
  const [photoKey, setPhotoKey] = useState(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !photoKey) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, photoKey]);

  const { store, all } = row;
  // Every photo of this store across all its visits (newest visit first) — the slider steps through them.
  const gallery = useMemo(() => all.flatMap((v) => {
    const ev = catalog.byEvent[v.eventId] || catalog;
    return visitPhotoList(v, ev, clientView).filter(([, , url]) => url).map(([k, label, url]) => ({
      key: `${v.id}|${k}`, url, title: `${store.name} — ${label} · ${fmtDay(v.submittedAt)}`,
    }));
  }), [all, catalog, clientView, store]);
  const photo = photoKey ? gallery.findIndex((g) => g.key === photoKey) : -1;
  const byWeek = useMemo(() => {
    const m = new Map();
    all.forEach((v) => {
      const w = weekStart(v.submittedAt);
      if (!m.has(w)) m.set(w, []);
      m.get(w).push(v);
    });
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [all]);

  const info = STORE_INFO_FIELDS.filter((f) => f.key !== 'name' && store[f.key]);

  return createPortal(
    <div className="mst-modal-backdrop" onClick={onClose} role="presentation">
      <div className="mst-modal" role="dialog" aria-modal="true" aria-label={store.name} dir="rtl" onClick={(e) => e.stopPropagation()}>
        <header className="mst-modal-head">
          <span className="mst-modal-ico"><Store size={22} /></span>
          <div className="mst-modal-title">
            <h3>{store.name}</h3>
            <div className="mst-modal-sub">
              <span><MapPin size={13} /> {store.city}{store.district ? ` · ${store.district}` : ''}</span>
              {store.customerClass && <span className="mst-class">{store.customerClass}</span>}
              <span className="mst-code">کد {store.id}</span>
            </div>
          </div>
          <button type="button" className="mst-icon-btn" onClick={onClose} aria-label="بستن"><X size={18} /></button>
        </header>

        <div className="mst-modal-body">
          {!clientView && noteApi && (
            <section className="mst-modal-section">
              <h4><MessageSquareText size={15} /> نوت برای پروموتر <small>{notes.length ? `${fa(notes.length)} نوت` : ''}</small></h4>
              <StoreNotesAdmin notes={notes} onAdd={(t) => noteApi.add(store.id, t)} onEdit={noteApi.edit} onDelete={noteApi.remove} />
            </section>
          )}
          <section className="mst-modal-section">
            <h4>اطلاعات فروشگاه</h4>
            <div className="mst-info-grid">
              {info.map((f) => (
                <div key={f.key} className={`mst-info ${f.key === 'address' ? 'wide' : ''}`}>
                  <span>{f.label}</span>
                  {f.kind === 'tel'
                    ? <a href={`tel:${store[f.key]}`} dir="ltr">{store[f.key]}</a>
                    : <b>{store[f.key]}</b>}
                </div>
              ))}
            </div>
            <StoreDirections store={store} />
          </section>

          <section className="mst-modal-section">
            <h4>
              سابقه‌ی بازدید
              <small>{all.length ? `${fa(byWeek.length)} بازدید${all.length > byWeek.length ? ` · ${fa(all.length)} گزارش ثبت‌شده` : ''}` : 'هنوز بازدیدی ثبت نشده'}</small>
            </h4>
            {byWeek.length === 0 && <div className="mst-empty-small"><CalendarDays size={20} /> این فروشگاه هنوز بازدید نشده است.</div>}
            <div className="mst-timeline">
              {byWeek.map(([w, vs]) => (
                <div className="mst-week" key={w}>
                  <div className="mst-week-head">
                    <span className="mst-week-dot" />
                    <b>{weekName(w)}</b>
                    <small>{weekLabel(w)}</small>
                    {!clientView && <span className="mst-week-promoters">{[...new Set(vs.map((v) => v.promoterName))].join('، ')}</span>}
                  </div>
                  {vs.map((v) => (
                    <VisitCard key={v.id} visit={v} catalog={catalog} clientView={clientView} onPhoto={setPhotoKey} storeName={store.name} store={store} />
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      {photo >= 0 && <Lightbox items={gallery} index={photo} onIndex={(n) => setPhotoKey(gallery[n].key)} onClose={() => setPhotoKey(null)} />}
    </div>,
    document.body
  );
};

/* ── Store card ── */
const StoreCard = ({ row, week, clientView, catalog, onOpen, selectable, selected, notes = null }) => {
  const { store, inWeek, all, plan } = row;
  const latest = inWeek[0];
  const visited = inWeek.length > 0;
  const promoters = [...new Set(inWeek.map((v) => v.promoterName))];
  const groups = latest ? (catalog.byEvent[latest.eventId]?.groups || catalog.groups) : [];
  const unapproved = !clientView && inWeek.some((v) => v.approved === false);
  const far = !clientView && inWeek.some((v) => geoVerdict(v.geo, store).state === 'far');
  return (
    <button type="button" className={`mst-card ${visited ? 'is-visited' : ''} ${selectable ? 'is-selectable' : ''} ${selected ? 'is-selected' : ''}`}
      onClick={() => onOpen(row)} aria-pressed={selectable ? selected : undefined}>
      <div className="mst-card-top">
        {selectable
          ? <span className="mst-card-check">{selected ? <CheckSquare size={20} /> : <Square size={20} />}</span>
          : <span className="mst-card-ico"><Store size={18} /></span>}
        <div className="mst-card-names">
          <b>{store.name}</b>
          <small><MapPin size={11} /> {store.city}{store.district ? ` · ${store.district}` : ''}</small>
        </div>
        {isStoreNew(store, week) && <span className="mst-new">تازه اضافه شده</span>}
        {store.customerClass && <span className="mst-class">{store.customerClass}</span>}
      </div>

      <div className="mst-card-meta">
        {store.sellerName && <span><User size={12} /> {store.sellerName}</span>}
        {store.address && <span className="mst-card-addr">{store.address}</span>}
      </div>

      <div className={`mst-card-status ${visited ? 'good' : ''}`}>
        {visited ? <CheckCircle2 size={15} /> : <Circle size={15} />}
        <div>
          <b>{visited ? `بازدید شد ${week === 'all' ? '' : weekName(week)}` : (week === 'all' ? 'هرگز بازدید نشده' : `بازدید نشده ${weekName(week)}`)}</b>
          <small>
            {visited
              ? (clientView ? fmtDay(latest.submittedAt) : `${promoters.join('، ')} · ${fmtDay(latest.submittedAt)}`)
              : (all[0] ? `آخرین بازدید: ${fmtDate(all[0].submittedAt)}${clientView ? '' : ` · ${all[0].promoterName}`}` : (clientView ? 'هنوز بازدیدی ثبت نشده' : 'هنوز هیچ پروموتری سر نزده'))}
          </small>
        </div>
      </div>

      {plan && !clientView && (
        <div className={`mst-card-plan ${visited ? 'done' : ''}`}>
          <CalendarCheck size={13} /> برنامه: <b>{plan.personName}</b>
          {!visited && week !== 'all' && <span>· هنوز انجام نشده</span>}
        </div>
      )}

      {row.dayPlans?.length > 0 && !clientView && (
        <div className="mst-card-days">
          {row.dayPlans.map((p) => (
            <span key={p.day} title={`${dayWeekdayName(p.day)} ${dayShort(p.day)} — ${p.personName}`}>
              <CalendarDays size={11} /> {dayWeekdayName(p.day)} · {p.personName}
            </span>
          ))}
        </div>
      )}

      <div className="mst-card-foot">
        <span className="mst-visits-count"><TrendingUp size={12} /> {fa(visitWeekCount(all))} بازدید</span>
        <span className="mst-dots" title={all.length ? `${visitWeekCount(all).toLocaleString('fa-IR')} بازدید` : 'هنوز بازدیدی ثبت نشده'}>
          {Array.from({ length: VISIT_TARGET }, (_, n) => (
            <i key={n} className={visitWeekCount(all) > n ? 'good' : ''} title={`بازدید ${(n + 1).toLocaleString('fa-IR')}`} />
          ))}
          {visitWeekCount(all) > VISIT_TARGET && <em>+{(visitWeekCount(all) - VISIT_TARGET).toLocaleString('fa-IR')}</em>}
        </span>
        {far && <span className="mst-tag warn"><AlertTriangle size={11} /> خارج از محدوده</span>}
        {!clientView && <NotesChip notes={notes} />}
        {unapproved && <span className="mst-tag warn"><EyeOff size={11} /> تایید نشده</span>}
      </div>
    </button>
  );
};

/**
 * «فروشگاه‌ها» tab of a Mehram event: every store in the list, which ones a
 * promoter visited each week, by whom and what they reported. `clientView` is the
 * client's own account — it only ever receives approved reports from the server
 * and sees nothing about approval; our admins can switch to that same view.
 */
const MehramStoresTab = ({ token, clientView: isClient = false, defaultView = 'cards' }) => {
  const [data, setData] = useState({ loading: true, error: '', events: [], visits: [] });
  const [onlyApproved, setOnlyApproved] = useState(false);
  // «نمای کلاینت» (our admins' preview toggle) hides exactly what the client account doesn't get.
  const clientView = isClient || onlyApproved;
  const [week, setWeek] = useState(() => weekStart(Date.now()));
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [shown, setShown] = useState(PAGE);
  const [openRow, setOpenRow] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [view, setView] = useState(defaultView);
  const [plans, setPlans] = useState(new Map()); // storeId → { personKey, personName } for the selected week
  const [planMode, setPlanMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [people, setPeople] = useState([]);
  const [assignTo, setAssignTo] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const [exportingWeek, setExportingWeek] = useState(null);
  const [dayPlans, setDayPlans] = useState([]); // [{ day, storeId, personKey, personName, position }] for the selected week
  const [planScope, setPlanScope] = useState('week'); // 'week' | 'day'
  const [planEventId, setPlanEventId] = useState(null); // the event whose dates the daily plan uses
  const [planDays, setPlanDays] = useState(() => new Set()); // day starts the next «ثبت در برنامه» applies to
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  // `silent` = refresh in place: the page keeps showing what it has (filters, selection, map view, open cards)
  // and only the data underneath is swapped when the answer arrives. A failed silent refresh just toasts.
  // Notes our admins leave on stores (promoters answer them in their report form). Internal: client accounts never load them.
  const [notes, setNotes] = useState(() => new Map());
  const putNotes = (list) => { const m = new Map(); list.forEach((n) => { if (!m.has(n.storeId)) m.set(n.storeId, []); m.get(n.storeId).push(n); }); setNotes(m); };
  const loadNotes = useCallback(() => {
    if (isClient) return Promise.resolve();
    return axios.get(`${API_URL}/admin/mehram/notes`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => putNotes(res.data || []))
      .catch(() => {});
  }, [token, isClient]);
  useEffect(() => { loadNotes(); }, [loadNotes]);
  const noteApi = useMemo(() => {
    const h = { headers: { Authorization: `Bearer ${token}` } };
    const upsert = (n) => setNotes((m) => { const next = new Map(m); const list = [...(next.get(n.storeId) || [])]; const i = list.findIndex((x) => x.id === n.id); if (i >= 0) list[i] = n; else list.push(n); next.set(n.storeId, list); return next; });
    return {
      add: async (storeId, text) => { const r = await axios.post(`${API_URL}/admin/mehram/notes`, { store_id: storeId, text }, h); upsert(r.data); },
      edit: async (id, text) => { const r = await axios.put(`${API_URL}/admin/mehram/notes/${id}`, { text }, h); upsert(r.data); },
      remove: async (id) => { await axios.delete(`${API_URL}/admin/mehram/notes/${id}`, h); setNotes((m) => { const next = new Map(); m.forEach((list, k) => { const l = list.filter((x) => x.id !== id); if (l.length) next.set(k, l); }); return next; }); },
    };
  }, [token]);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const loadSeq = useRef(0);
  const load = useCallback(async (silent = false) => {
    const seq = ++loadSeq.current;
    if (silent === true) setRefreshing(true);
    else setData((d) => ({ ...d, loading: true, error: '' }));
    try {
      const res = await axios.get(`${API_URL}/admin/mehram/visits`, { headers: { Authorization: `Bearer ${token}` } });
      if (seq !== loadSeq.current) return; // a newer request already answered
      setData({ loading: false, error: '', events: res.data.events || [], visits: (res.data.visits || []).map((v) => ({ ...v, city: normCity(v.city) })) });
      setUpdatedAt(Date.now());
    } catch (e) {
      const msg = e.response?.data?.detail || 'خطا در دریافت اطلاعات فروشگاه‌ها';
      if (silent === true) toast.error(msg);
      else setData((d) => ({ ...d, loading: false, error: msg }));
    } finally {
      if (silent === true && seq === loadSeq.current) setRefreshing(false);
    }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const fetchPlans = useCallback(async (w) => {
    if (w === 'all') return new Map();
    const res = await axios.get(`${API_URL}/admin/mehram/plans?week=${w}`, { headers: { Authorization: `Bearer ${token}` } });
    return new Map((res.data || []).map((p) => [p.storeId, p]));
  }, [token]);
  const reloadPlans = useCallback(() => {
    fetchPlans(week).then(setPlans).catch(() => setPlans(new Map()));
  }, [fetchPlans, week]);
  useEffect(() => { reloadPlans(); setSelected(new Set()); }, [reloadPlans]);

  // Daily plans are keyed by the calendar day, so they live on after an event is archived
  // and later events simply add days to the same history.
  const planEvents = useMemo(() => [...data.events]
    .map((e) => ({ ...e, days: eventDayStarts(e.startDate) }))
    .sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || (b.days[0] || 0) - (a.days[0] || 0)), [data.events]);
  const planEvent = planEvents.find((e) => e.id === planEventId) || planEvents.find((e) => !e.archived && e.days.length) || planEvents.find((e) => e.days.length) || null;
  // Days of the chosen event (3 days, 10 days, a month…); an event without dates falls back to the selected week.
  const dayDays = useMemo(() => (planEvent?.days.length ? planEvent.days : (week === 'all' ? [] : weekDays(week))), [planEvent, week]);
  const dayRangeKey = dayDays.length ? `${dayDays[0]}-${dayDays[dayDays.length - 1]}` : '';

  const reloadDayPlans = useCallback(() => {
    if (!dayRangeKey || clientView) { setDayPlans([]); return Promise.resolve(); }
    const [start, end] = dayRangeKey.split('-');
    return axios.get(`${API_URL}/admin/mehram/day-plans?start=${start}&end=${end}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setDayPlans(res.data || []))
      .catch(() => setDayPlans([]));
  }, [dayRangeKey, token, clientView]);
  useEffect(() => { reloadDayPlans(); setPlanDays(new Set()); }, [reloadDayPlans]);

  // Visits + this week's plan + daily plans, all at once and all in place (nothing is reset).
  const refreshAll = useCallback(() => {
    if (refreshing) return;
    load(true);
    reloadPlans();
    reloadDayPlans();
    loadNotes();
  }, [refreshing, load, reloadPlans, reloadDayPlans, loadNotes]);
  // Coming back to the tab after a while shows fresh numbers without anyone pressing anything.
  const refreshRef = useRef(refreshAll);
  refreshRef.current = refreshAll;
  const updatedRef = useRef(updatedAt);
  updatedRef.current = updatedAt;
  useEffect(() => {
    const onWake = () => { if (!document.hidden && Date.now() - updatedRef.current > 2 * 60 * 1000) refreshRef.current(); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => { document.removeEventListener('visibilitychange', onWake); window.removeEventListener('focus', onWake); };
  }, []);

  useEffect(() => {
    if (!(planMode || view === 'map') || clientView) return;
    // Refetched on every entry into planning (or the map, whose popups plan too): promoters added to the event since last time must show up.
    axios.get(`${API_URL}/admin/mehram/people`, auth).then((res) => setPeople(res.data || [])).catch(() => toast.error('خطا در دریافت لیست پروموترها'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planMode, view]);

  const setF = (patch) => { setFilters((f) => ({ ...f, ...patch })); setShown(PAGE); };

  const catalog = useMemo(() => buildCatalog(data.events), [data.events]);
  const visits = useMemo(
    () => (onlyApproved && !isClient ? data.visits.filter((v) => v.approved) : data.visits).filter((v) => v.submittedAt),
    [data.visits, onlyApproved, isClient]
  );

  const currentWeek = weekStart(Date.now());
  // Visits per week = DIFFERENT stores reported that week (among the stores in the plan that week), so this number is the
  // same one the coverage card shows and a store reported twice still counts once.
  const weeks = useMemo(() => {
    // The current and the selected week stay listed even with no visits (e.g. after
    // switching to the client view), so the selector never loses its value.
    const stores = new Map([[currentWeek, new Set()]]);
    if (week !== 'all') stores.set(week, new Set());
    visits.forEach((v) => {
      const w = weekStart(v.submittedAt);
      const st = STORE_BY_ID.get(String(v.storeId));
      if (st && !isStoreActiveInWeek(st, w)) return;
      if (!stores.has(w)) stores.set(w, new Set());
      stores.get(w).add(v.storeId);
    });
    return [...stores.entries()].map(([w, set]) => [w, set.size]).sort((a, b) => b[0] - a[0]);
  }, [visits, currentWeek, week]);
  const allWeeksVisits = useMemo(() => weeks.reduce((n, [, c]) => n + c, 0), [weeks]);

  const byStore = useMemo(() => {
    const m = new Map();
    visits.forEach((v) => { if (!m.has(v.storeId)) m.set(v.storeId, []); m.get(v.storeId).push(v); });
    m.forEach((vs) => vs.sort((a, b) => b.submittedAt - a.submittedAt));
    return m;
  }, [visits]);

  const dayPlansByStore = useMemo(() => {
    const m = new Map();
    dayPlans.forEach((p) => { if (!m.has(p.storeId)) m.set(p.storeId, []); m.get(p.storeId).push(p); });
    return m;
  }, [dayPlans]);

  const rows = useMemo(() => MEHRAM_STORES.filter((store) => isStoreActiveInWeek(store, week)).map((store) => {
    const all = byStore.get(store.id) || [];
    const inWeek = week === 'all' ? all : all.filter((v) => weekStart(v.submittedAt) === week);
    return { store, all, inWeek, plan: clientView ? null : (plans.get(store.id) || null), dayPlans: dayPlansByStore.get(store.id) || [] };
  }), [byStore, week, plans, dayPlansByStore, clientView]);

  // Every filter except the visit status — KPIs read "X of Y" over this set.
  const base = useMemo(() => {
    const q = normalize(filters.q);
    return rows.filter(({ store, inWeek, plan }) => (
      (filters.city === 'all' || store.city === filters.city)
      && (!filters.district || store.district === filters.district)
      && (!filters.cls || store.customerClass === filters.cls)
      && (!filters.promoter || inWeek.some((v) => v.promoterName === filters.promoter) || plan?.personName === filters.promoter)
      && (!filters.day || dayPlansByStore.get(store.id)?.some((p) => p.day === filters.day))
      && (!q || normalize(`${store.name} ${store.sellerName || ''} ${store.address || ''} ${store.mobile || ''} ${store.landline || ''} ${store.id} ${store.district || ''}`).includes(q))
    )).filter((r) => hasIssue(r, filters.issue) && matchesPlan(r, filters.plan));
  }, [rows, filters, dayPlansByStore]);

  const list = useMemo(() => {
    const out = base.filter((r) => {
      if (filters.status === 'visited') return r.inWeek.length > 0;
      if (filters.status === 'notVisited') return r.inWeek.length === 0;
      if (filters.status === 'never') return r.all.length === 0;
      return true;
    });
    const last = (r) => r.all[0]?.submittedAt || 0;
    const sorters = {
      recent: (a, b) => (b.inWeek[0]?.submittedAt || 0) - (a.inWeek[0]?.submittedAt || 0) || last(b) - last(a),
      name: (a, b) => a.store.name.localeCompare(b.store.name, 'fa'),
      visits: (a, b) => visitWeekCount(b.all) - visitWeekCount(a.all),
      stale: (a, b) => last(a) - last(b),
    };
    return [...out].sort(sorters[filters.sort] || sorters.recent);
  }, [base, filters.status, filters.sort]);

  const kpi = useMemo(() => {
    const visited = base.filter((r) => r.inWeek.length).length;
    const weekVisits = visited; // one per store, so it always matches the coverage card (a store visited twice still counts once)
    const promoters = new Set(base.flatMap((r) => r.inWeek.map((v) => v.promoterName)));
    const shortage = base.filter((r) => hasIssue(r, 'shortage') && r.inWeek.length).length;
    const never = base.filter((r) => !r.all.length).length;
    const planned = base.filter((r) => r.plan).length;
    const plannedDone = base.filter((r) => r.plan && r.inWeek.length).length;
    return { total: base.length, visited, weekVisits, promoters: promoters.size, shortage, never, planned, plannedDone, pct: base.length ? Math.round((visited / base.length) * 100) : 0 };
  }, [base]);

  // City tiles always show the whole city (ignoring the other filters) for the selected week.
  const cityStats = useMemo(() => {
    const m = new Map(MEHRAM_CITIES.map((c) => [c, { total: 0, visited: 0 }]));
    rows.forEach(({ store, inWeek }) => {
      const s = m.get(store.city) || { total: 0, visited: 0 };
      s.total += 1; if (inWeek.length) s.visited += 1;
      m.set(store.city, s);
    });
    return [...m.entries()].filter(([, s]) => s.total > 0);
  }, [rows]);

  const weekPromoters = useMemo(() => {
    const m = new Map();
    rows.forEach(({ store, inWeek, plan }) => {
      if (filters.city !== 'all' && store.city !== filters.city) return;
      // A promoter with planned stores but no visit yet still gets a chip.
      if (plan?.personName && !m.has(plan.personName)) m.set(plan.personName, { stores: new Set(), cities: new Set() });
      inWeek.forEach((v) => {
        const p = m.get(v.promoterName) || { stores: new Set(), cities: new Set() };
        p.stores.add(store.id); p.cities.add(store.city);
        m.set(v.promoterName, p);
      });
    });
    return [...m.entries()].map(([name, p]) => ({ name, stores: p.stores.size, cities: [...p.cities] })).sort((a, b) => b.stores - a.stores);
  }, [rows, filters.city]);

  const districts = useMemo(() => [...new Set(MEHRAM_STORES.filter((s) => filters.city === 'all' || s.city === filters.city).map((s) => s.district).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa')), [filters.city]);
  const classes = useMemo(() => [...new Set(MEHRAM_STORES.map((s) => s.customerClass).filter(Boolean))].sort(), []);

  const weekIdx = week === 'all' ? -1 : weeks.findIndex(([w]) => w === week);
  const periodName = week === 'all' ? 'در همه هفته‌ها' : weekName(week);
  const activeFilterCount = ['city', 'district', 'cls', 'promoter', 'issue', 'plan', 'day'].filter((k) => filters[k] && filters[k] !== 'all').length + (filters.q ? 1 : 0) + (filters.status !== 'all' ? 1 : 0);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const { exportMehramStoresExcel } = await import('./mehramStoresExcel');
      await exportMehramStoresExcel({
        rows: list, scopeRows: base, week, catalog, clientView: clientView || onlyApproved,
        filterLines: describeFilters(filters),
      });
    } catch (e) {
      console.error(e);
      toast.error('خطا در ساخت فایل اکسل');
    } finally {
      setExporting(false);
    }
  };

  const exportWeek = async (w) => {
    setExportingWeek(w);
    try {
      const weekPlans = await fetchPlans(w).catch(() => new Map());
      const weekRows = MEHRAM_STORES
        .filter((st) => isStoreActiveInWeek(st, w) && (filters.city === 'all' || st.city === filters.city))
        .map((store) => {
          const all = byStore.get(store.id) || [];
          return { store, all, inWeek: all.filter((v) => weekStart(v.submittedAt) === w), plan: weekPlans.get(store.id) || null };
        });
      const { exportMehramStoresExcel } = await import('./mehramStoresExcel');
      await exportMehramStoresExcel({
        rows: weekRows, week: w, catalog, clientView: clientView || onlyApproved,
        filterLines: [`گزارش هفتگی · شهر: ${filters.city === 'all' ? 'همه' : filters.city}`],
      });
    } catch (e) {
      console.error(e);
      toast.error('خطا در ساخت فایل اکسل');
    } finally {
      setExportingWeek(null);
    }
  };

  /* Weekly plan (our admins): pick stores, assign them to a promoter for the selected week. */
  const toggleSelect = (row) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(row.store.id)) next.delete(row.store.id); else next.add(row.store.id);
    return next;
  });
  const savePlan = async (personKey) => {
    if (!selected.size) return;
    const person = people.find((p) => p.key === personKey);
    const daily = planScope === 'day';
    if (daily && !planDays.size) return toast.error('حداقل یک روز را انتخاب کنید');
    setPlanBusy(true);
    try {
      if (daily) {
        await axios.put(`${API_URL}/admin/mehram/day-plans`, {
          days: [...planDays], store_ids: [...selected], person_key: personKey || null, person_name: person?.name || null,
        }, auth);
        toast.success(personKey
          ? `${fa(selected.size)} فروشگاه برای ${person?.name} در ${fa(planDays.size)} روز ثبت شد`
          : `${fa(selected.size)} فروشگاه از برنامه‌ی ${fa(planDays.size)} روز حذف شد`);
        await reloadDayPlans();
      } else {
        await axios.put(`${API_URL}/admin/mehram/plans`, {
          week, store_ids: [...selected], person_key: personKey || null, person_name: person?.name || null,
        }, auth);
        toast.success(personKey
          ? `${fa(selected.size)} فروشگاه به برنامه‌ی ${person?.name} در ${weekName(week)} اضافه شد`
          : `${fa(selected.size)} فروشگاه از برنامه‌ی ${weekName(week)} حذف شد`);
        reloadPlans();
      }
      setSelected(new Set());
    } catch (e) {
      toast.error(e.response?.data?.detail || 'خطا در ذخیره‌ی برنامه');
    } finally {
      setPlanBusy(false);
    }
  };
  // Map popup: add one store to (or, with no person, remove it from) the selected week's plan.
  const planStore = async (storeId, personKey) => {
    const person = people.find((p) => p.key === personKey);
    try {
      await axios.put(`${API_URL}/admin/mehram/plans`, {
        week, store_ids: [storeId], person_key: personKey || null, person_name: person?.name || null,
      }, auth);
      toast.success(personKey ? `به برنامه‌ی ${person?.name} در ${weekName(week)} اضافه شد` : `از برنامه‌ی ${weekName(week)} حذف شد`);
      reloadPlans();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'خطا در ذخیره‌ی برنامه');
    }
  };
  // The daily plan belongs to one event: that event's promoters come first, everyone else stays pickable.
  const inPlanEvent = (p) => (planScope === 'day' && planEvent ? (p.eventIds || []).includes(planEvent.id) : !!p.active);
  const eventPeople = people.filter(inPlanEvent);
  const otherPeople = people.filter((p) => !inPlanEvent(p));
  const canPlan = !clientView && (week !== 'all' || dayDays.length > 0);
  // Map route suggestion: select one suggested group and open the plan bar to assign it.
  const pickGroup = (ids) => {
    if (!planMode) { setPlanMode(true); if (week === 'all') setPlanScope('day'); }
    setSelected(new Set(ids));
  };
  const openOrSelect = (row) => (planMode ? toggleSelect(row) : setOpenRow(row));

  if (data.loading) {
    return <PageLoader label="در حال بارگذاری فروشگاه‌ها" />;
  }
  if (data.error) {
    return <div className="mst-state error"><AlertTriangle size={22} /> {data.error} <button type="button" className="mst-btn" onClick={() => load()}>تلاش مجدد</button></div>;
  }

  // The filter bar is shared by the card / map views and the weekly-plan view (it narrows the planned stores too).
  const filtersBlock = (
      <div className="mst-filters">
        <div className="mst-search">
          <Search size={16} />
          <input value={filters.q} onChange={(e) => setF({ q: e.target.value })} placeholder="جستجو: نام فروشگاه، فروشنده، آدرس، تلفن یا کد مشتری..." />
          {filters.q && <button type="button" onClick={() => setF({ q: '' })} aria-label="پاک کردن"><X size={14} /></button>}
        </div>
        <div className="mst-seg" role="radiogroup" aria-label="وضعیت بازدید">
          {STATUS_OPTIONS.map(([k, l]) => (
            <button type="button" key={k} role="radio" aria-checked={filters.status === k} className={filters.status === k ? 'on' : ''} onClick={() => setF({ status: k })}>{l}</button>
          ))}
        </div>
        <div className="mst-selects">
          <Filter size={15} className="mst-selects-ico" />
          <select value={filters.district} onChange={(e) => setF({ district: e.target.value })} aria-label="منطقه">
            <option value="">همه مناطق</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filters.cls} onChange={(e) => setF({ cls: e.target.value })} aria-label="کلاس مشتری">
            <option value="">همه کلاس‌ها</option>
            {classes.map((c) => <option key={c} value={c}>کلاس {c}</option>)}
          </select>
          <select value={filters.issue} onChange={(e) => setF({ issue: e.target.value })} aria-label="مشکلات">
            <option value="">همه وضعیت‌ها</option>
            <option value="shortage">کمبود محصول</option>
            <option value="uncoop">همکاری نمی‌کند</option>
            <option value="coop">همکاری می‌کند</option>
            <option value="noTalker">شلف تاکر نصب نشد</option>
            {!clientView && <option value="far">موقعیت خارج از محدوده‌ی فروشگاه</option>}
            {!clientView && !onlyApproved && <option value="unapproved">تایید نشده</option>}
          </select>
          {week !== 'all' && !clientView && (
            <select value={filters.plan} onChange={(e) => setF({ plan: e.target.value })} aria-label="برنامه">
              <option value="">برنامه: همه</option>
              {Object.entries(PLAN_OPTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          )}
          {!clientView && dayPlans.length > 0 && (
            <select value={filters.day} onChange={(e) => setF({ day: e.target.value ? Number(e.target.value) : '' })} aria-label="روز برنامه">
              <option value="">روز برنامه: همه</option>
              {dayDays.map((d, i) => <option key={d} value={d}>روز {fa(i + 1)} · {dayWeekdayName(d)} {dayShort(d)} — {fa(dayPlans.filter((p) => p.day === d).length)} فروشگاه</option>)}
            </select>
          )}
          {view !== 'weekly' && <select value={filters.sort} onChange={(e) => setF({ sort: e.target.value })} aria-label="مرتب‌سازی">
            <option value="recent">جدیدترین بازدید</option>
            <option value="stale">قدیمی‌ترین بازدید</option>
            <option value="visits">بیشترین بازدید</option>
            <option value="name">نام فروشگاه</option>
          </select>}
          {activeFilterCount > 0 && (
            <button type="button" className="mst-btn ghost" onClick={() => { setFilters(EMPTY_FILTERS); setShown(PAGE); }}>
              <RotateCcw size={14} /> پاک کردن فیلترها ({fa(activeFilterCount)})
            </button>
          )}
        </div>
      </div>
  );

  return (
    <div className={`mst ${planMode ? 'is-planning' : ''}`} dir="rtl">
      {/* Header */}
      <div className="mst-head">
        <div className="mst-head-title">
          <span className="mst-head-ico"><Store size={20} /></span>
          <div>
            <h2>{clientView ? 'گزارش جامع' : 'فروشگاه‌ها'}</h2>
            <p>{fa(rows.length)} فروشگاه در {fa(cityStats.length)} شهر · {clientView ? 'بازدیدهای هفتگی' : 'بازدیدهای هفتگی پروموترها'}</p>
          </div>
        </div>
        <div className="mst-head-actions">
          <button type="button" className={`mst-btn mst-refresh ${refreshing ? 'busy' : ''}`} onClick={refreshAll} disabled={refreshing} title="دریافت گزارش‌ها و برنامه‌ی جدید بدون رفرش صفحه (فیلترها حفظ می‌شوند)">
            <RefreshCw size={15} className={refreshing ? 'mst-spin' : ''} /> بروزرسانی
            <small>{new Date(updatedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</small>
          </button>
          <div className="mst-week-nav">
            <button type="button" className="mst-icon-btn" disabled={week === 'all' || weekIdx >= weeks.length - 1} onClick={() => setWeek(weeks[weekIdx + 1][0])} aria-label="هفته‌ی قبل"><ChevronRight size={17} /></button>
            <select value={week} onChange={(e) => { setWeek(e.target.value === 'all' ? 'all' : Number(e.target.value)); setShown(PAGE); }} aria-label="انتخاب هفته">
              {weeks.map(([w, n]) => <option key={w} value={w}>{weekName(w)}{weekName(w) !== weekLabel(w) ? ` (${weekLabel(w)})` : ''} — {fa(n)} بازدید</option>)}
              <option value="all">همه هفته‌ها — {fa(allWeeksVisits)} بازدید</option>
            </select>
            <button type="button" className="mst-icon-btn" disabled={week === 'all' || weekIdx <= 0} onClick={() => setWeek(weeks[weekIdx - 1][0])} aria-label="هفته‌ی بعد"><ChevronLeft size={17} /></button>
          </div>
          {canPlan && (
            <button type="button" className={`mst-btn ${planMode ? 'on' : ''}`} onClick={() => { setPlanMode((m) => !m); if (week === 'all') setPlanScope('day'); setSelected(new Set()); setView((v) => (v === 'trends' || v === 'daily' || v === 'weekly' ? 'cards' : v)); }}>
              <CalendarCheck size={15} /> {planMode ? 'پایان برنامه‌ریزی' : (week === 'all' ? 'برنامه‌ریزی روزانه' : `برنامه‌ریزی ${weekName(week)}`)}
            </button>
          )}
          <button type="button" className="mst-btn primary" onClick={exportExcel} disabled={exporting || !list.length}>
            {exporting ? <Loader2 size={15} className="mst-spin" /> : <Download size={15} />} خروجی اکسل
          </button>
        </div>
      </div>

      {!isClient && (
        <label className="mst-tgl">
          <input type="checkbox" className="mst-tgl-input" checked={onlyApproved} onChange={(e) => setOnlyApproved(e.target.checked)} />
          <span className="mst-tgl-track" aria-hidden="true"><span className="mst-tgl-knob" /></span>
          <span className="mst-tgl-text">نمای کلاینت — فقط گزارش‌های تاییدشده (همان چیزی که مهرام می‌بیند)</span>
        </label>
      )}

      {/* KPIs */}
      <div className="mst-kpis">
        <div className="mst-kpi main">
          <span className="mst-kpi-label"><CheckCircle2 size={15} /> بازدید شده {periodName}</span>
          <div className="mst-kpi-big"><b>{fa(kpi.visited)}</b> از {fa(kpi.total)} فروشگاه</div>
          <div className="mst-progress"><span style={{ width: `${kpi.pct}%` }} /></div>
          <small>{fa(kpi.pct)}٪ پوشش</small>
        </div>
        <div className="mst-kpi"><span className="mst-kpi-label"><TrendingUp size={15} /> تعداد بازدید</span><b>{fa(kpi.weekVisits)}</b></div>
        {!clientView && <div className="mst-kpi"><span className="mst-kpi-label"><Users size={15} /> پروموترها</span><b>{fa(kpi.promoters)}</b></div>}
        {week !== 'all' && !clientView && (
          <button type="button" className={`mst-kpi clickable ${filters.plan === 'missed' ? 'on' : ''}`} onClick={() => setF({ plan: filters.plan === 'missed' ? '' : 'missed' })}
            title="نمایش فروشگاه‌های در برنامه که هنوز بازدید نشده‌اند">
            <span className="mst-kpi-label plan"><CalendarCheck size={15} /> برنامه‌ی هفته</span>
            <b>{fa(kpi.plannedDone)}<small> از {fa(kpi.planned)}</small></b>
          </button>
        )}
        <button type="button" className={`mst-kpi clickable ${filters.issue === 'shortage' ? 'on' : ''}`} onClick={() => setF({ issue: filters.issue === 'shortage' ? '' : 'shortage' })}>
          <span className="mst-kpi-label bad"><Package size={15} /> کمبود محصول</span><b>{fa(kpi.shortage)}</b>
        </button>
        <button type="button" className={`mst-kpi clickable ${filters.status === 'never' ? 'on' : ''}`} onClick={() => setF({ status: filters.status === 'never' ? 'all' : 'never' })}>
          <span className="mst-kpi-label warn"><AlertTriangle size={15} /> هرگز بازدید نشده</span><b>{fa(kpi.never)}</b>
        </button>
      </div>

      {/* Cities */}
      <div className="mst-cities">
        <button type="button" className={`mst-city ${filters.city === 'all' ? 'on' : ''}`} onClick={() => setF({ city: 'all', district: '' })}>
          <span className="mst-city-name">همه شهرها</span>
          <span className="mst-city-num">{fa(rows.filter((r) => r.inWeek.length).length)}/{fa(rows.length)}</span>
          <span className="mst-city-bar"><i style={{ width: `${rows.length ? (rows.filter((r) => r.inWeek.length).length / rows.length) * 100 : 0}%` }} /></span>
        </button>
        {cityStats.map(([c, s]) => (
          <button type="button" key={c} className={`mst-city ${filters.city === c ? 'on' : ''}`} onClick={() => setF({ city: filters.city === c ? 'all' : c, district: '' })}>
            <span className="mst-city-name">{c}</span>
            <span className="mst-city-num">{fa(s.visited)}/{fa(s.total)}</span>
            <span className="mst-city-bar"><i style={{ width: `${(s.visited / s.total) * 100}%` }} /></span>
          </button>
        ))}
      </div>

      {/* Promoters of the period */}
      {weekPromoters.length > 0 && !clientView && (
        <div className="mst-promoters">
          <span className="mst-promoters-title"><Users size={14} /> پروموترهای {periodName}</span>
          {weekPromoters.map((p) => (
            <button type="button" key={p.name} className={`mst-promoter ${filters.promoter === p.name ? 'on' : ''}`} onClick={() => setF({ promoter: filters.promoter === p.name ? '' : p.name })}>
              <span className="mst-avatar sm">{p.name.charAt(0)}</span>
              <span>{p.name}</span>
              <small>{fa(p.stores)} فروشگاه · {p.cities.join('، ')}</small>
            </button>
          ))}
        </div>
      )}

      {/* View */}
      <div className="mst-views" role="tablist" aria-label="نمایش">
        {VIEWS.filter(([k]) => !(clientView && (k === 'daily' || k === 'weekly'))).map(([k, l, Icon]) => (
          <button type="button" key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''}
            onClick={() => { setView(k); if (k === 'trends' || k === 'daily' || k === 'weekly') { setPlanMode(false); setSelected(new Set()); } }}>
            <Icon size={15} /> {l}
          </button>
        ))}
      </div>

      {view === 'weekly' && !clientView ? (<>
        {filtersBlock}
        <MehramWeeklyPlan token={token} week={week} plans={plans} visits={visits} onChanged={reloadPlans}
          visibleIds={activeFilterCount > 0 ? new Set(list.map((r) => r.store.id)) : null}
          onPlan={() => { setView('cards'); setPlanMode(true); setPlanScope('week'); setSelected(new Set()); }} />
      </>) : view === 'daily' && !clientView ? (
        <MehramDaily
          token={token} days={dayDays} events={planEvents} eventId={planEvent?.id ?? null} onEventChange={(id) => setPlanEventId(id)} visits={visits} dayPlans={dayPlans} onPlansChanged={reloadDayPlans}
          onPlan={() => { setView('cards'); setPlanMode(true); setPlanScope('day'); setSelected(new Set()); }}
        />
      ) : view === 'trends' ? (
        <MehramTrends
          visits={visits} cityFilter={filters.city} groups={catalog.groups} clientView={clientView}
          onExportWeek={exportWeek} exportingWeek={exportingWeek}
        />
      ) : (<>
      {filtersBlock}

      <div className="mst-result-line">{fa(list.length)} فروشگاه {filters.status === 'all' ? '' : `· ${STATUS_OPTIONS.find(([k]) => k === filters.status)[1]}`}</div>

      {list.length === 0 ? (
        <div className="mst-empty"><Search size={26} /> فروشگاهی با این فیلترها پیدا نشد.</div>
      ) : view === 'map' ? (
        <MehramStoresMap clientView={clientView} rows={list} week={week} catalog={catalog} onOpen={openOrSelect} onPickGroup={pickGroup} plans={plans} notes={clientView ? null : notes} onNotes={(r) => setOpenRow(r)} selectMode={planMode} selected={selected} people={people.filter((p) => p.active)} onPlan={planStore} />
      ) : (
        <>
          <div className="mst-grid">
            {list.slice(0, shown).map((r) => (
              <StoreCard key={r.store.id} row={r} week={week} clientView={clientView} catalog={catalog} onOpen={openOrSelect} notes={notes.get(r.store.id) || null}
                selectable={planMode} selected={selected.has(r.store.id)} />
            ))}
          </div>
          {shown < list.length && (
            <button type="button" className="mst-more" onClick={() => setShown((n) => n + PAGE)}>
              نمایش {fa(Math.min(PAGE, list.length - shown))} فروشگاه دیگر ({fa(list.length - shown)} باقی‌مانده)
            </button>
          )}
        </>
      )}
      </>)}

      {planMode && (
        <div className="mst-planbar" role="region" aria-label="برنامه‌ریزی هفته">
          <div className="mst-planbar-info">
            <b>{fa(selected.size)} فروشگاه انتخاب شده</b>
            <small>{planScope === 'day' ? `برنامه‌ی روزانه · ${planEvent?.name || ''}` : `برنامه‌ی هفتگی · ${weekName(week)} (${weekLabel(week)})`} · روی کارت‌ها یا نقاط نقشه بزنید</small>
          </div>
          <button type="button" className="mst-btn ghost" onClick={() => setSelected(new Set(list.map((r) => r.store.id)))}>انتخاب همه‌ی {fa(list.length)} نتیجه</button>
          {selected.size > 0 && <button type="button" className="mst-btn ghost" onClick={() => setSelected(new Set())}>لغو انتخاب</button>}
          <div className="mst-seg mst-scope" role="radiogroup" aria-label="نوع برنامه">
            <button type="button" role="radio" aria-checked={planScope === 'week'} disabled={week === 'all'} className={planScope === 'week' ? 'on' : ''} onClick={() => setPlanScope('week')}>هفتگی</button>
            <button type="button" role="radio" aria-checked={planScope === 'day'} className={planScope === 'day' ? 'on' : ''} onClick={() => setPlanScope('day')}>روزانه</button>
          </div>
          {planScope === 'day' && (
            <div className="mst-daychips" role="group" aria-label="روزهای برنامه">
              <select className="mst-event-pick" value={planEvent?.id ?? ''} onChange={(e) => { setPlanEventId(Number(e.target.value)); setPlanDays(new Set()); }} aria-label="ایونت">
                {planEvents.length === 0 && <option value="">ایونتی وجود ندارد</option>}
                {planEvents.map((e) => <option key={e.id} value={e.id}>{e.name}{e.archived ? ' (آرشیو)' : ''} — {fa(e.days.length)} روز</option>)}
              </select>
              {dayDays.map((d, i) => (
                <button type="button" key={d} className={planDays.has(d) ? 'on' : ''}
                  onClick={() => setPlanDays((prev) => { const n = new Set(prev); if (n.has(d)) n.delete(d); else n.add(d); return n; })}>
                  <small>روز {fa(i + 1)}</small>{dayWeekdayName(d)}<small>{dayShort(d)}</small>
                  {dayPlans.some((p) => p.day === d) && <i>{fa(dayPlans.filter((p) => p.day === d).length)}</i>}
                </button>
              ))}
              <button type="button" className="all" onClick={() => setPlanDays(planDays.size === dayDays.length ? new Set() : new Set(dayDays))}>{planDays.size === dayDays.length ? 'هیچ‌کدام' : 'همه‌ی روزهای ایونت'}</button>
            </div>
          )}
          <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label="پروموتر">
            <option value="">انتخاب پروموتر...</option>
            {eventPeople.length > 0 && (
              <optgroup label={planScope === 'day' && planEvent ? `پروموترهای ${planEvent.name}` : 'پروموترهای ایونت‌های فعال'}>
                {eventPeople.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </optgroup>
            )}
            {otherPeople.length > 0 && (
              <optgroup label="سایر پروموترهای مهرام">
                {otherPeople.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </optgroup>
            )}
          </select>
          <button type="button" className="mst-btn primary" disabled={!selected.size || !assignTo || planBusy || (planScope === 'day' && !planDays.size)} onClick={() => savePlan(assignTo)}>
            {planBusy ? <Loader2 size={15} className="mst-spin" /> : <CalendarCheck size={15} />} ثبت در برنامه
          </button>
          <button type="button" className="mst-btn danger" disabled={!selected.size || planBusy || (planScope === 'day' && !planDays.size)} onClick={() => savePlan(null)}>حذف از برنامه</button>
        </div>
      )}

      {openRow && <StoreModal row={openRow} catalog={catalog} clientView={clientView} onClose={() => setOpenRow(null)} notes={notes.get(openRow.store.id) || []} noteApi={clientView ? null : noteApi} />}
    </div>
  );
};

function describeFilters(f) {
  const issues = { shortage: 'کمبود محصول', uncoop: 'همکاری نمی‌کند', coop: 'همکاری می‌کند', noTalker: 'شلف تاکر نصب نشد', unapproved: 'تایید نشده', far: 'موقعیت خارج از محدوده' };
  const parts = [`شهر: ${f.city === 'all' ? 'همه' : f.city}`];
  if (f.district) parts.push(`منطقه: ${f.district}`);
  if (f.cls) parts.push(`کلاس: ${f.cls}`);
  if (f.status !== 'all') parts.push(`وضعیت: ${STATUS_OPTIONS.find(([k]) => k === f.status)[1]}`);
  if (f.promoter) parts.push(`پروموتر: ${f.promoter}`);
  if (f.issue) parts.push(`فیلتر: ${issues[f.issue]}`);
  if (f.plan) parts.push(`برنامه: ${PLAN_OPTIONS[f.plan]}`);
  if (f.day) parts.push(`روز برنامه: ${dayWeekdayName(f.day)} ${dayShort(f.day)}`);
  if (f.q) parts.push(`جستجو: «${f.q}»`);
  return parts;
}

export default MehramStoresTab;
