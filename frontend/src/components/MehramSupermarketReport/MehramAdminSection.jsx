import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, Camera, Save, Loader2, Store, Phone, PhoneOff, PhoneCall, CheckCircle2, X, ImageOff, AlertTriangle, Package, MessageSquareText, MapPin, ChevronLeft, ChevronRight, ShieldCheck, RotateCcw, Hourglass, Clock, ShieldX, Handshake, Tag } from 'lucide-react';
import VisitDots from './VisitDots';
import { getShelfQuestions, getProductGroups, PRODUCT_STATUSES, MEHRAM_STORES, mehramStateMatches, normCity } from './mehramData';
import { geoVerdict, answerLabel } from './mehramVisits';

const STORE_BY_ID = new Map(MEHRAM_STORES.map((s) => [s.id, s]));
import './mehramAdmin.css';

const fmtTime = (ts) => (ts ? new Date(ts).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '');

// Answer → tone, so a glance at the chips shows what needs attention.
const answerTone = (key, value) => {
  if (!['shelfStatus', 'storeCooperates', 'shelfTalkerInstall', 'shelfTalkerReplace', 'posterReplace'].includes(key)) return ''; // custom questions: neutral
  if (key === 'shelfStatus') return { 'مرتب': 'good', 'نامنظم': 'warn', 'خالی': 'bad', 'آیتم‌های غیر مرتبط': 'warn', 'مرتب است': 'good', 'محصول مهرام دارد': 'good', 'شلف تاکر نیست': 'bad', 'شلف تاکر ندارد': 'bad', 'محصول مهرام ندارد': 'bad', 'محصول مهرام کم دارد': 'warn' }[value] || '';
  // Older reports answered «بله/خیر» before the options became «همکاری می‌کند/نمی‌کند».
  if (key === 'storeCooperates') return value === 'بله' || value === 'همکاری می‌کند' ? 'good' : 'bad';
  if (key === 'shelfTalkerInstall') return value === 'هست' || value === 'بله' ? 'good' : 'bad';
  return value === 'بله' ? 'warn' : 'good'; // "needs replacing?" — yes = action needed
};

const STATUS_TONE = { 'موجود': 'good', 'ناکافی': 'warn', 'موجود نیست': 'bad' };
const isShortage = (status) => status === 'ناکافی' || status === 'موجود نیست';

const PHOTOS = [
  ['storefrontSelfie', 'سلفی با سردر سوپرمارکت'],
  ['posterBack', 'عکس پوستر'],
  ['shelfBefore', 'شلف قبل از مرتب‌سازی'],
  ['shelfAfter', 'شلف بعد از مرتب‌سازی'],
];

// Full-screen viewer with ← → between all photos of the same supermarket.
const Lightbox = ({ items, index, onIndex, onClose }) => {
  const item = items[index];
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
  return createPortal(
    <div className="mha-lightbox" onClick={onClose} role="presentation">
      <button type="button" className="mha-lightbox-close" onClick={onClose} aria-label="بستن"><X size={20} /></button>
      {items.length > 1 && <button type="button" className="mha-lightbox-nav prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="قبلی"><ChevronRight size={26} /></button>}
      <img src={item.url} alt={item.title} onClick={(e) => e.stopPropagation()} />
      {items.length > 1 && <button type="button" className="mha-lightbox-nav next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="بعدی"><ChevronLeft size={26} /></button>}
      <span className="mha-lightbox-title">{item.title}{items.length > 1 ? ` — ${(index + 1).toLocaleString('fa-IR')} از ${items.length.toLocaleString('fa-IR')}` : ''}</span>
      {item.status !== undefined && (
        <span className={`mha-lightbox-status ${STATUS_TONE[item.status] || 'none'}`} onClick={(e) => e.stopPropagation()}>
          موجودی: <b>{item.status || 'ثبت نشده'}</b>
        </span>
      )}
    </div>,
    document.body
  );
};

/**
 * Admin view of ONE promoter's Mehram supermarket reports (one submission).
 * data: the submission's data object. Reads `${field.id}_reports` (saved reports)
 * and `${field.id}_calls` ({ [storeId]: { at, number, count } } — logged when the
 * promoter taps "call seller").
 */
// Store reports live under «<sectionId>_reports». Read every such list, not just
// this section's current id: a section re-created in the builder gets a new id,
// and the reports saved under the old one are still this promoter's real visits.
const isStoreReportList = (v) => Array.isArray(v) && v.some((r) => r && typeof r === 'object' && r.storeId);
export const collectMehram = (field, data) => {
  const reports = [];
  const calls = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    if (!k.endsWith('_reports') || !(k === `${field.id}_reports` || isStoreReportList(v))) return;
    if (Array.isArray(v)) reports.push(...v.filter((r) => r && typeof r === 'object'));
    const c = data[`${k.slice(0, -'_reports'.length)}_calls`];
    if (c && typeof c === 'object') Object.assign(calls, c);
  });
  // Calls logged before the first report was saved.
  const own = data?.[`${field.id}_calls`];
  if (own && typeof own === 'object') Object.assign(calls, own);
  return { reports, calls };
};

export const getMehramStats = (field, data) => {
  const { reports, calls } = collectMehram(field, data);
  const calledReports = reports.filter((r) => calls[r.storeId]).length;
  // Product groups reported as «ناکافی» or «موجود نیست», across all stores.
  const shortages = reports.reduce((n, r) => n + Object.values(r.products || {}).filter(isShortage).length, 0);
  return { reports: reports.length, calls: Object.keys(calls).length, calledReports, shortages };
};

/* Top-of-list summary: how many stores cooperate, and where the shelf talker went up (answers of the whole list). */
const SUMMARY_CARDS = [
  { key: 'storeCooperates', title: 'همکاری فروشگاه', Icon: Handshake, yes: ['بله', 'همکاری می‌کند'], yesLabel: 'همکاری می‌کند', noLabel: 'همکاری نمی‌کند' },
  { key: 'shelfTalkerInstall', title: 'شلف تاکر', Icon: Tag, yes: ['بله', 'هست'], yesLabel: 'نصب شد', noLabel: 'نصب نشد' },
];
const CoopSummary = ({ reports, clientView }) => (
  <div className="mha-coop">
    {SUMMARY_CARDS.map(({ key, title, Icon, yes, yesLabel, noLabel }) => {
      const answered = reports.filter((r) => r.answers?.[key]);
      if (!answered.length) return null;
      const good = answered.filter((r) => yes.includes(r.answers[key]));
      const bad = answered.filter((r) => !yes.includes(r.answers[key]));
      const pct = Math.round((good.length / answered.length) * 100);
      return (
        <div className={`mha-coop-card ${bad.length ? '' : 'all-good'}`} key={key}>
          <div className="mha-coop-top">
            <div className="mha-ring" style={{ '--p': `${pct}%` }}><b>{pct.toLocaleString('fa-IR')}٪</b></div>
            <div className="mha-coop-info">
              <span className="mha-coop-title"><Icon size={15} /> {title}<small>از {answered.length.toLocaleString('fa-IR')} فروشگاه</small></span>
              <div className="mha-coop-pills">
                <span className="good"><CheckCircle2 size={13} /> {yesLabel}<b>{good.length.toLocaleString('fa-IR')}</b></span>
                <span className={bad.length ? 'bad' : 'none'}><X size={13} /> {noLabel}<b>{bad.length.toLocaleString('fa-IR')}</b></span>
              </div>
            </div>
          </div>
          {bad.length > 0 && (
            <div className="mha-coop-stores">
              {bad.map((r, i) => <span key={r.id || `${r.storeId}_${i}`} className="mha-store-tag bad">{r.storeName}</span>)}
            </div>
          )}
        </div>
      );
    })}
  </div>
);

const APPROVAL_UI = {
  approved: { Icon: ShieldCheck, label: 'تایید شده — مهرام می‌بیند', tone: 'good' },
  changed: { Icon: RotateCcw, label: 'ویرایش‌شده بعد از تایید', tone: 'warn' },
  pending: { Icon: Hourglass, label: 'در انتظار تایید — مهرام نمی‌بیند', tone: 'none' },
  rejected: { Icon: ShieldX, label: 'تایید نشد — مهرام نمی‌بیند', tone: 'bad' },
};

const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString('fa-IR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/* Inline «عدم تایید» form — the reason is required so the other admins know why. */
const RejectForm = ({ busy, onSubmit, onCancel }) => {
  const [reason, setReason] = useState('');
  return (
    <div className="mha-reject">
      <textarea
        autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000}
        placeholder="دلیل عدم تایید را بنویسید (برای بقیه‌ی ادمین‌ها نمایش داده می‌شود)..."
      />
      <div className="mha-reject-actions">
        <button type="button" className="mha-reject-btn" disabled={busy || !reason.trim()} onClick={() => onSubmit(reason.trim())}>
          <ShieldX size={15} /> ثبت عدم تایید
        </button>
        <button type="button" className="mha-unapprove-btn" onClick={onCancel}>انصراف</button>
      </div>
    </div>
  );
};

/**
 * `approval` (our admins, client-approval events only): { states: { [reportId]: 'approved'|'changed'|'pending' },
 * canApprove, busy: { [key]: true }, onSet(reportIds, approve, key) } — each supermarket is approved on its own.
 * `clientView`: the client's own account — no location check, no approval controls.
 */
const MehramAdminSection = ({ field, data, approval = null, clientView = false, editor = null, stateFilter = 'all', visitOrder = null }) => {
  const [view, setView] = useState(null);
  // Admin edit of one report: { key, reportId, edits: { photos|productPhotos|answers|notes|products }, busy }
  const [edit, setEdit] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState('');
  const [deleting, setDeleting] = useState(null); // report key whose «حذف کامل» confirmation is open
  const [rejecting, setRejecting] = useState(null); // report key whose «عدم تایید» form is open
  const { reports, calls } = useMemo(() => collectMehram(field, data), [data, field]);
  const reportedIds = new Set(reports.map((r) => r.storeId));
  const callsNoReport = clientView || stateFilter !== 'all' ? [] : Object.values(calls).filter((c) => !reportedIds.has(c.storeId));
  const st = getMehramStats(field, data);
  const groups = getProductGroups(field);
  const questions = getShelfQuestions(field);
  const stateOf = (r) => (approval ? approval.states[String(r.id)] || 'pending' : null);
  // The «تایید شده / در انتظار / تایید نشده» filter works per supermarket report, not per promoter.
  const sorted = useMemo(() => [...reports]
    .filter((r) => !approval || mehramStateMatches(stateOf(r), stateFilter))
    .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)), [reports, approval, stateFilter]);
  // «تایید همه» skips supermarkets an admin explicitly rejected — those need a deliberate decision.
  const pendingIds = approval ? sorted.filter((r) => r.id && ['pending', 'changed'].includes(stateOf(r))).map((r) => String(r.id)) : [];
  const rejectedCount = approval ? sorted.filter((r) => stateOf(r) === 'rejected').length : 0;

  if (!reports.length && !callsNoReport.length) return null;

  return (
    <div className="mha">
      <div className="mha-head">
        <span className="mha-head-ico"><Store size={17} /></span>
        <span className="mha-head-title">{field.title || 'گزارش سوپرمارکت (مهرام)'}</span>
        <div className="mha-stats">
          <span className="mha-stat"><b>{st.reports.toLocaleString('fa-IR')}</b> گزارش</span>
          {!clientView && <span className={`mha-stat ${st.calledReports === st.reports && st.reports > 0 ? 'good' : ''}`}>
            <b>{st.calledReports.toLocaleString('fa-IR')}</b> از {st.reports.toLocaleString('fa-IR')} تماس
          </span>}
          {st.shortages > 0 && <span className="mha-stat bad"><b>{st.shortages.toLocaleString('fa-IR')}</b> کمبود محصول</span>}
          {approval && <span className={`mha-stat ${pendingIds.length || rejectedCount ? 'warn' : 'good'}`}><b>{sorted.filter((r) => stateOf(r) === 'approved').length.toLocaleString('fa-IR')}</b> از {sorted.length.toLocaleString('fa-IR')} تایید شده</span>}
          {rejectedCount > 0 && <span className="mha-stat bad"><b>{rejectedCount.toLocaleString('fa-IR')}</b> تایید نشده</span>}
        </div>
        {approval?.canApprove && pendingIds.length > 0 && (
          <button type="button" className="mha-approve-btn all" disabled={!!approval.busy.all} onClick={() => approval.onSet(pendingIds, true, 'all')}>
            <ShieldCheck size={15} /> تایید همه‌ی {pendingIds.length.toLocaleString('fa-IR')} سوپرمارکت
          </button>
        )}
      </div>

      <CoopSummary reports={reports} clientView={clientView} />

      <div className="mha-list">
        {sorted.map((r, i) => {
          const call = calls[r.storeId];
          const store = STORE_BY_ID.get(r.storeId);
          const state = stateOf(r);
          const ui = state ? APPROVAL_UI[state] : null;
          // Product photos: one per group (new reports) and/or a general shelf photo (older reports, or an explicit one).
          const groupPhotos = groups.filter((g) => r.productPhotos?.[g.key]).map((g) => ({ key: `pg_${g.key}`, label: g.title, url: r.productPhotos[g.key] }));
          const general = r.productsPhoto && !groupPhotos.some((g) => g.url === r.productsPhoto) ? [{ key: 'productsPhoto', label: 'گروه محصولات', url: r.productsPhoto }] : [];
          const key = String(r.id || `${r.storeId}_${i}`);
          const editing = !!editor && edit?.key === key;
          const ed = editing ? edit.edits : null;
          // While editing, every group gets a slot (so a missing photo can be added); edits show before saving.
          const baseSlots = editing
            ? [...PHOTOS.map(([k, label]) => ({ key: k, label, url: r[k] })), ...general, ...groups.map((g) => ({ key: `pg_${g.key}`, label: g.title, url: r.productPhotos?.[g.key] || '' }))]
            : [...PHOTOS.map(([k, label]) => ({ key: k, label, url: r[k] })), ...general, ...groupPhotos];
          if (!editing && !general.length && !groupPhotos.length) baseSlots.push({ key: 'productsPhoto', label: 'گروه محصولات', url: '' });
          const photoSlots = baseSlots.map((x) => (editing && ed.photos && x.key in ed.photos ? { ...x, url: ed.photos[x.key] } : x));
          const gallery = photoSlots.filter((x) => x.url).map((x) => ({ key: x.key, url: x.url, title: `${r.storeName} — ${x.label}`, ...(!clientView && x.key.startsWith('pg_') ? { status: r.products?.[x.key.slice(3)] || '' } : {}) }));
          const answerOf = (q) => answerLabel(q.key, editing && q.key in ed.answers ? ed.answers[q.key] : r.answers?.[q.key]) || undefined;
          const noteOf = (q) => (editing && q.key in ed.notes ? ed.notes[q.key] : r.notes?.[q.key]);
          const productOf = (g) => (editing && g.key in ed.products ? ed.products[g.key] : r.products?.[g.key]);
          const setEd = (part, k, v) => setEdit((e) => ({ ...e, edits: { ...e.edits, [part]: { ...e.edits[part], [k]: v } } }));
          const startEdit = () => setEdit({ key, reportId: r.id, edits: { photos: {}, answers: {}, notes: {}, products: {}, problems: undefined }, busy: '', error: '' });
          const pickPhoto = async (slotKey, file) => {
            setEdit((e) => ({ ...e, busy: slotKey, error: '' }));
            try {
              const url = await editor.upload(file);
              setEdit((e) => ({ ...e, busy: '', edits: { ...e.edits, photos: { ...e.edits.photos, [slotKey]: url } } }));
            } catch (err) {
              setEdit((e) => ({ ...e, busy: '', error: err?.response?.data?.detail || 'خطا در ارسال عکس' }));
            }
          };
          const saveEdit = async () => {
            const patch = {};
            const photos = {}; const productPhotos = {};
            Object.entries(ed.photos).forEach(([k, u]) => { if (k.startsWith('pg_')) productPhotos[k.slice(3)] = u; else photos[k] = u; });
            if (Object.keys(photos).length) patch.photos = photos;
            if (Object.keys(productPhotos).length) patch.productPhotos = productPhotos;
            // A note only stays when its answer still asks for one.
            const notes = { ...ed.notes };
            questions.forEach((q) => { if (q.noteOn && q.key in ed.answers && ed.answers[q.key] !== q.noteOn && r.notes?.[q.key]) notes[q.key] = ''; });
            if (Object.keys(ed.answers).length) patch.answers = ed.answers;
            if (Object.keys(notes).length) patch.notes = notes;
            if (Object.keys(ed.products).length) patch.products = ed.products;
            if (ed.problems !== undefined && ed.problems.trim() !== String(r.problems || '').trim()) patch.problems = ed.problems.trim();
            if (!Object.keys(patch).length) { setEdit(null); return; }
            const missingNote = questions.find((q) => q.noteOn && !q.noteOptional && answerOf(q) === q.noteOn && !String(noteOf(q) || '').trim());
            if (missingNote) { setEdit((e) => ({ ...e, error: `توضیحات «${missingNote.title}» را بنویسید` })); return; }
            setEdit((e) => ({ ...e, busy: 'save', error: '' }));
            try {
              await editor.onSave(r.id, patch);
              setEdit(null);
            } catch (err) {
              setEdit((e) => ({ ...e, busy: '', error: err?.response?.data?.detail || 'خطا در ذخیره تغییرات' }));
            }
          };
          const renderPhoto = ({ key: k, label, url }) => {
            const gi = gallery.findIndex((g) => g.key === k);
                    if (editing) {
                      const busyHere = edit.busy === k;
                      return (
                        <div key={k} className={`mha-photo-edit ${url ? '' : 'empty'} ${ed.photos && k in ed.photos ? 'is-changed' : ''}`}>
                          <div className="mha-photo-edit-frame">
                            {url ? <img src={url} alt={label} /> : <ImageOff size={20} />}
                            {busyHere && <span className="mha-photo-edit-busy"><Loader2 size={20} className="mha-spin" /></span>}
                          </div>
                          <span className="mha-photo-edit-label">{label}</span>
                          <div className="mha-photo-edit-actions">
                            <label className={`mha-mini-btn ${busyHere || edit.busy === 'save' ? 'disabled' : ''}`}>
                              <Camera size={12} /> {url ? 'جایگزین' : 'افزودن'}
                              <input type="file" accept="image/*" hidden disabled={!!edit.busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickPhoto(k, f); }} />
                            </label>
                            {url && <button type="button" className="mha-mini-btn danger" disabled={!!edit.busy} onClick={() => setEd('photos', k, '')}><Trash2 size={12} /> حذف</button>}
                          </div>
                        </div>
                      );
                    }
                    return url ? (
                      <button type="button" key={k} className="mha-photo" onClick={() => setView({ items: gallery, index: gi })}>
                        <img src={url} alt={label} loading="lazy" />
                        <span>{label}</span>
                      </button>
                    ) : (
                      <div key={k} className="mha-photo empty"><ImageOff size={22} /><span>{label}</span><small>ثبت نشده</small></div>
                    );
          };
          const photoGrid = (slots) => (slots.length ? <div className="mha-photos">{slots.map(renderPhoto)}</div> : null);
          const selfieSlots = photoSlots.filter((x) => x.key === 'storefrontSelfie');
          const productSlots = photoSlots.filter((x) => x.key === 'productsPhoto' || x.key.startsWith('pg_'));
          const finalSlots = ['shelfBefore', 'shelfAfter', 'posterBack'].map((k) => photoSlots.find((x) => x.key === k)).filter(Boolean);
          return (
            <article className={`mha-card ${state ? `is-${state}` : ''} ${editing ? 'is-editing' : ''}`} key={key}>
              <div className="mha-card-top">
                <span className="mha-idx">{(i + 1).toLocaleString('fa-IR')}</span>
                <div className="mha-names">
                  <b>{r.storeName}</b>
                  <small><MapPin size={11} /> {normCity(r.city)}{store?.district ? ` · ${store.district}` : ''}{r.submittedAt ? <> · <Clock size={11} /> ثبت {fmtTime(r.submittedAt)}</> : ''}</small>
                  {visitOrder?.get(String(r.id)) && (() => {
                    const vo = visitOrder.get(String(r.id));
                    return (
                      <div className="vd-line" title={`این ${vo.n.toLocaleString('fa-IR')}امین ویزیت این فروشگاه است`}>
                        <span className="vd-chip">ویزیت {vo.n.toLocaleString('fa-IR')}ام</span>
                        <VisitDots count={vo.n} current={vo.n} />
                      </div>
                    );
                  })()}
                </div>
                <div className="mha-chips">
 {editor?.onDelete && r.id && !editing && (
                    <button type="button" className="mha-delete-btn" onClick={() => setDeleting(key)} disabled={!!edit || !!deleting} title="حذف کامل گزارش از دیتابیس"><Trash2 size={14} /> حذف گزارش</button>
                  )}
                  {editor && r.id && !editing && (
                    <button type="button" className="mha-edit-btn" onClick={startEdit} disabled={!!edit} title="ویرایش عکس‌ها و پاسخ‌ها"><Pencil size={14} /> ویرایش</button>
                  )}
                  {clientView ? null : call ? (
                    <span className="mha-call good" title={call.number}>
                      <CheckCircle2 size={14} /> تماس گرفته شد
                      <small>{fmtTime(call.at)}{call.count > 1 ? ` · ${call.count.toLocaleString('fa-IR')}×` : ''}</small>
                    </span>
                  ) : (
                    <span className="mha-call none"><PhoneOff size={14} /> تماس نگرفته</span>
                  )}
                  {!clientView && r.geo && (() => { // reports from before the location check have no geo at all
                    const g = geoVerdict(r.geo, store);
                    const tone = { near: 'good', nostore: 'good', far: 'warn', none: 'none' }[g.state];
                    return <span className={`mha-call ${tone}`} title={r.geo?.accuracy ? `دقت GPS: ${r.geo.accuracy} متر` : undefined}><MapPin size={14} /> {g.label}</span>;
                  })()}
                </div>
              </div>

              {deleting === key && (
                <div className="mha-delete-bar" role="alert">
                  <b><Trash2 size={15} /> این گزارش برای همیشه از دیتابیس حذف شود؟</b>
                  <p>بعد از حذف، «{r.storeName}» در هیچ‌جا (نقشه، شمارنده‌ها، اکسل، نمای مهرام) بازدیدشده حساب نمی‌شود و در برنامه‌ی هفتگی می‌ماند تا دوباره ویزیت شود. بازگشت ندارد.</p>
                  {delError && <span className="mha-edit-error">{delError}</span>}
                  <div>
                    <button type="button" className="mha-delete-confirm" disabled={delBusy} onClick={async () => {
                      setDelBusy(true); setDelError('');
                      try { await editor.onDelete(r.id); setDeleting(null); }
                      catch (err) { setDelError(err?.response?.data?.detail || 'خطا در حذف گزارش'); }
                      finally { setDelBusy(false); }
                    }}>{delBusy ? <Loader2 size={14} className="mha-spin" /> : <Trash2 size={14} />} بله، حذف کن</button>
                    <button type="button" className="mha-cancel-btn" disabled={delBusy} onClick={() => { setDeleting(null); setDelError(''); }}>انصراف</button>
                  </div>
                </div>
              )}

              {editing && (
                <div className="mha-edit-bar">
                  <span className="mha-edit-mode"><Pencil size={13} /> حالت ویرایش</span>
                  <span className="mha-edit-hint">{r.id && state === 'approved' ? (approval?.canApprove ? 'بعد از ذخیره، نسخه‌ی اصلاح‌شده بلافاصله برای مهرام تایید می‌ماند.' : 'بعد از ذخیره، این گزارش باید دوباره تایید شود.') : 'ذخیره‌ی ویرایش فقط تغییرات را در گزارش اعمال می‌کند؛ تایید برای مهرام جداست.'}</span>
                  {edit.error && <span className="mha-edit-error">{edit.error}</span>}
                  <button type="button" className="mha-save-btn" disabled={!!edit.busy} onClick={saveEdit}>
                    {edit.busy === 'save' ? <Loader2 size={15} className="mha-spin" /> : <Save size={15} />} ذخیره ویرایش
                  </button>
                  <button type="button" className="mha-cancel-btn" disabled={edit.busy === 'save'} onClick={() => setEdit(null)}>انصراف</button>
                </div>
              )}

              {approval && ui && (
                <div className={`mha-approval ${ui.tone}`}>
                  <span className="mha-approval-pill"><ui.Icon size={15} /> {ui.label}</span>
                  {approval.canApprove && r.id && rejecting !== key && (
                    <div className="mha-approval-actions">
                      {state !== 'approved' && (
                        <button type="button" className="mha-approve-btn" disabled={!!approval.busy[key]} onClick={() => approval.onSet([String(r.id)], true, key)}>
                          <ShieldCheck size={15} /> {state === 'changed' ? 'تایید نسخه‌ی جدید' : 'تایید'}
                        </button>
                      )}
                      {state !== 'rejected' && (
                        <button type="button" className="mha-deny-btn" disabled={!!approval.busy[key]} onClick={() => setRejecting(key)}>
                          <ShieldX size={15} /> عدم تایید
                        </button>
                      )}
                      {state === 'approved' && (
                        <button type="button" className="mha-unapprove-btn" disabled={!!approval.busy[key]} onClick={() => approval.onSet([String(r.id)], false, key)}>لغو تایید</button>
                      )}
                      {state === 'rejected' && approval.onReset && (
                        <button type="button" className="mha-unapprove-btn" disabled={!!approval.busy[key]} onClick={() => approval.onReset([String(r.id)], key)}
                          title="عدم تایید برداشته می‌شود و گزارش دوباره «در انتظار تایید» می‌شود، بدون اینکه تایید شود">
                          <RotateCcw size={13} /> بازگشت به در انتظار تایید
                        </button>
                      )}
                    </div>
                  )}
                  {(state === 'approved' || state === 'changed') && approval.approvals?.[String(r.id)]?.by && (
                    <div className="mha-reason mha-approved-by">
                      <small>{state === 'changed' ? 'نسخه‌ی قبلی تایید شده توسط' : 'تایید شده توسط'} <b>{approval.approvals[String(r.id)].by}</b>{approval.approvals[String(r.id)].at ? ` · ${fmtWhen(approval.approvals[String(r.id)].at)}` : ''}</small>
                    </div>
                  )}
                  {state === 'rejected' && approval.reviews?.[String(r.id)] && (
                    <div className="mha-reason">
                      <b>دلیل عدم تایید:</b> {approval.reviews[String(r.id)].reason}
                      <small>{approval.reviews[String(r.id)].by}{approval.reviews[String(r.id)].at ? ` · ${fmtWhen(approval.reviews[String(r.id)].at)}` : ''}</small>
                    </div>
                  )}
                  {rejecting === key && (
                    <RejectForm
                      busy={!!approval.busy[key]}
                      onCancel={() => setRejecting(null)}
                      onSubmit={async (reason) => { await approval.onReject([String(r.id)], reason, key); setRejecting(null); }}
                    />
                  )}
                </div>
              )}

              {photoGrid(selfieSlots)}

              {((r.products && Object.keys(r.products).length > 0) || editing) && (
                <>
                  <div className="mha-block-title"><Package size={14} /> وضعیت گروه محصولات</div>
                  <div className="mha-answers products">
                    {groups.map((g) => {
                      const v = productOf(g);
                      if (editing) {
                        return (
                          <div className={`mha-tile editing ${STATUS_TONE[v] || ''}`} key={g.key}>
                            <span className="mha-q">{g.title}</span>
                            <div className="mha-opt-row">
                              {PRODUCT_STATUSES.map((o) => (
                                <button type="button" key={o} className={`mha-opt ${STATUS_TONE[o]} ${v === o ? 'on' : ''}`} onClick={() => setEd('products', g.key, o)}>{o}</button>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className={`mha-tile ${STATUS_TONE[v] || ''}`} key={g.key}>
                          <span className="mha-q">{g.title}</span>
                          <span className={`mha-a ${STATUS_TONE[v] || ''}`}>{v || '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                  {photoGrid(productSlots)}
                </>
              )}
              {!((r.products && Object.keys(r.products).length > 0) || editing) && photoGrid(productSlots.filter((x) => x.url))}
              <div className="mha-block-title">پاسخ‌ها</div>
              {editing && !clientView && (
                <label className="mha-problems-edit">
                  <b><AlertTriangle size={14} /> توضیحات فروشگاه</b>
                  <textarea rows={3} maxLength={1000} value={ed.problems !== undefined ? ed.problems : (r.problems || '')}
                    onChange={(e) => setEdit((x) => ({ ...x, edits: { ...x.edits, problems: e.target.value } }))} placeholder="توضیحات فروشگاه (اختیاری)" />
                </label>
              )}
              {!clientView && !editing && r.problems && (
                <div className="mha-problems"><AlertTriangle size={14} /> <div><b>توضیحات فروشگاه</b><p>{r.problems}</p></div></div>
              )}
              <div className="mha-answers">
                {questions.map((q) => {
                  const v = answerOf(q);
                  const note = noteOf(q);
                  if (editing) {
                    return (
                      <div className={`mha-tile editing ${v ? answerTone(q.key, v) : ''}`} key={q.key}>
                        <span className="mha-q">{q.title}</span>
                        <div className="mha-opt-row">
                          {q.options.map((o) => (
                            <button type="button" key={o} className={`mha-opt ${answerTone(q.key, o)} ${v === o ? 'on' : ''}`} onClick={() => setEd('answers', q.key, o)}>{o}</button>
                          ))}
                        </div>
                        {q.noteOn && v === q.noteOn && (
                          <textarea className="mha-note-input" rows={2} value={note || ''} placeholder={q.noteOptional ? 'توضیحات (اختیاری)' : 'توضیحات'} onChange={(e) => setEd('notes', q.key, e.target.value)} />
                        )}
                      </div>
                    );
                  }
                  return (
                    <div className={`mha-tile ${v ? answerTone(q.key, v) : ''}`} key={q.key}>
                      <span className="mha-q">{q.title}</span>
                      <span className={`mha-a ${v ? answerTone(q.key, v) : ''}`}>{v || '—'}</span>
                      {note && <div className="mha-note"><MessageSquareText size={13} /> {note}</div>}
                    </div>
                  );
                })}
              </div>

              {photoGrid(finalSlots)}
            </article>
          );
        })}
      </div>

      {callsNoReport.length > 0 && (
        <div className="mha-orphans">
          <div className="mha-orphans-title"><AlertTriangle size={14} /> تماس بدون ثبت گزارش</div>
          {callsNoReport.map((c) => (
            <div className="mha-orphan" key={c.storeId}>
              <PhoneCall size={14} />
              <b>{c.storeName}</b>
              <small>{normCity(c.city)} · {fmtTime(c.at)}</small>
            </div>
          ))}
        </div>
      )}

      {view && <Lightbox items={view.items} index={view.index} onIndex={(i) => setView((v) => ({ ...v, index: i }))} onClose={() => setView(null)} />}
    </div>
  );
};

export default MehramAdminSection;
