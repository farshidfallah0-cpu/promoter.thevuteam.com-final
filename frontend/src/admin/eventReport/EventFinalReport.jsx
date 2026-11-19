import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { buildForm, fmtJalali, toEn, toFa, parseCount, fmtCount, RATINGS, uniquePeople } from './reportUtils';
import FinalReportPdf from './FinalReportPdf';
import { exportReportPdf, fetchAsDataUri, loadPdfFontCss } from './reportPdf';
import { exportReportExcel } from './reportExcel';
import './eventFinalReport.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const Section = ({ n, title, hint, children, accent = '#7c5cff' }) => (
  <section className="efr-section" style={{ '--acc': accent }}>
    <header className="efr-section-head">
      <span className="efr-section-n">{toFa(n)}</span>
      <div>
        <h3>{title}</h3>
        {hint && <p>{hint}</p>}
      </div>
    </header>
    <div className="efr-section-body">{children}</div>
  </section>
);

const CountInput = ({ value, onChange, placeholder, suffix }) => (
  <div className="efr-count">
    <input type="text" inputMode="numeric" dir="ltr" className="efr-input"
      value={fmtCount(value)} placeholder={placeholder || '—'}
      onChange={e => onChange(parseCount(e.target.value))} />
    {suffix && <span className="efr-count-suffix">{suffix}</span>}
  </div>
);

// Plain 24h "HH:MM" text field (native time inputs show AM/PM on some systems).
const TimeInput = ({ value, onChange, label }) => {
  const norm = (raw) => {
    const d = toEn(raw).replace(/[^0-9]/g, '').slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
  };
  const fix = () => {
    const m = /^(\d{1,2}):?(\d{0,2})$/.exec(value || '');
    if (!m) return;
    const h = Math.min(23, Number(m[1])), mi = Math.min(59, Number(m[2] || 0));
    onChange(`${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`);
  };
  return <input type="text" inputMode="numeric" dir="ltr" className="efr-input efr-time" placeholder="15:00" aria-label={label}
    value={value} onChange={e => onChange(norm(e.target.value))} onBlur={fix} maxLength={5} />;
};

const Field = ({ label, required, children, sub }) => (
  <label className="efr-field">
    <span className="efr-label">{label}{required && <em> *</em>}</span>
    {children}
    {sub && <span className="efr-sub">{sub}</span>}
  </label>
);

export default function EventFinalReport({ event, token, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(null);
  const [form, setForm] = useState(null);
  const [savedJson, setSavedJson] = useState('');
  const [meta, setMeta] = useState({});
  const [busy, setBusy] = useState(''); // 'save' | 'pdf' | 'excel'
  const [pdfAssets, setPdfAssets] = useState(null);
  const [summaryError, setSummaryError] = useState(false);
  const [newName, setNewName] = useState({});
  const pdfRef = useRef(null);
  const summaryRef = useRef(null);
  const itemRefs = useRef([]);
  const focusItem = useRef(null); // row to focus once it has rendered
  useEffect(() => {
    if (focusItem.current !== null) { itemRefs.current[focusItem.current]?.focus(); focusItem.current = null; }
  });
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/admin/events/${event.id}/final-report`, { headers })
      .then(res => {
        if (!alive) return;
        const f = buildForm(res.data.auto, res.data.saved);
        setAuto(res.data.auto);
        setForm(f);
        setSavedJson(JSON.stringify(f));
        setMeta({ by: res.data.updated_by, at: res.data.updated_at });
      })
      .catch(() => { toast.error('خطا در دریافت اطلاعات ایونت'); onClose(); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  // Esc closes; lock page scroll while open.
  const dirty = form && JSON.stringify(form) !== savedJson;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const requestClose = () => {
    if (dirtyRef.current && !window.confirm('تغییرات ذخیره نشده‌اند. بدون ذخیره بسته شود؟')) return;
    onClose();
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) requestClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const allNames = useMemo(() => {
    const s = new Set();
    (auto?.promoters || []).forEach(d => d.people.forEach(p => s.add(p.name)));
    Object.values(form?.promoters || {}).forEach(list => list.forEach(p => p.name && s.add(p.name)));
    return [...s];
  }, [auto, form?.promoters]);

  if (loading || !form) {
    return createPortal(
      <div className="efr-overlay"><div className="efr-loading"><span className="efr-spinner" />در حال آماده‌سازی گزارش…</div></div>,
      document.body
    );
  }

  // ── days ──
  const updateDay = (i, patch) => set('days', form.days.map((d, k) => k === i ? { ...d, ...patch } : d));
  const removeDay = (i) => {
    const d = form.days[i];
    const hasPeople = (form.promoters[d.date] || []).length > 0;
    if (hasPeople && !window.confirm(`روز ${fmtJalali(d.date).full} و پروموترهایش حذف شود؟`)) return;
    const promoters = { ...form.promoters };
    if (!form.days.some((x, k) => k !== i && x.date === d.date)) delete promoters[d.date];
    setForm(f => ({ ...f, days: f.days.filter((_, k) => k !== i), promoters }));
  };
  const addDay = (dateObj) => {
    if (!dateObj) return;
    const date = toEn(dateObj.format('YYYY/MM/DD'));
    if (form.days.some(d => d.date === date)) { toast.info('این روز قبلاً اضافه شده'); return; }
    const last = form.days[form.days.length - 1];
    const days = [...form.days, { date, start: last?.start || '', end: last?.end || '' }].sort((a, b) => a.date.localeCompare(b.date));
    setForm(f => ({ ...f, days }));
  };

  // ── promoters ──
  const setPeople = (date, list) => set('promoters', { ...form.promoters, [date]: list });
  const addPerson = (date) => {
    const name = (newName[date] || '').trim();
    if (!name) return;
    const list = form.promoters[date] || [];
    if (list.some(p => p.name.trim() === name)) { toast.info('این نام در این روز هست'); return; }
    setPeople(date, [...list, { name, role: 'promoter' }]);
    setNewName(n => ({ ...n, [date]: '' }));
  };
  const copyPrevDay = (i) => {
    const prev = form.days[i - 1];
    if (!prev) return;
    const cur = form.promoters[form.days[i].date] || [];
    const extra = (form.promoters[prev.date] || []).filter(p => !cur.some(c => c.name === p.name));
    setPeople(form.days[i].date, [...cur, ...extra.map(p => ({ ...p }))]);
  };

  // ── returned items ──
  const items = form.returned_items;
  const setItem = (i, patch) => set('returned_items', items.map((it, k) => k === i ? { ...it, ...patch } : it));
  const addItem = (focus = true) => {
    set('returned_items', [...items, { name: '', qty: '' }]);
    if (focus) focusItem.current = items.length;
  };

  const validate = () => {
    if (!form.summary.trim()) {
      setSummaryError(true);
      summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => summaryRef.current?.focus(), 350);
      toast.error('«گزارش کلی» اجباری است');
      return false;
    }
    return true;
  };

  const clean = () => ({
    ...form,
    returned_items: form.returned_items.filter(it => it.name.trim()).map(it => ({ name: it.name.trim(), qty: it.qty })),
    promoters: Object.fromEntries(Object.entries(form.promoters).map(([d, l]) => [d, l.filter(p => p.name.trim())])),
  });

  const save = async () => {
    if (!validate()) return false;
    setBusy('save');
    try {
      const data = clean();
      const res = await axios.put(`${API_URL}/admin/events/${event.id}/final-report`, { data }, { headers });
      setForm(data);
      setSavedJson(JSON.stringify(data));
      setMeta({ by: 'شما', at: res.data.updated_at });
      onSaved?.(event.id);
      toast.success('گزارش ایونت ذخیره شد');
      return true;
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'خطا در ذخیره گزارش');
      return false;
    } finally {
      setBusy('');
    }
  };

  const downloadExcel = async () => {
    if (!validate()) return;
    setBusy('excel');
    try { await exportReportExcel(clean()); toast.success('فایل اکسل دانلود شد'); }
    catch (e) { console.error(e); toast.error('خطا در ساخت اکسل'); }
    finally { setBusy(''); }
  };

  const downloadPdf = async () => {
    if (!validate()) return;
    setBusy('pdf');
    try {
      // Images inside the foreignObject capture must be data URIs.
      const [vuLogo, clientLogo, fontCss] = await Promise.all([
        fetchAsDataUri('/images/vuLogo.png'),
        fetchAsDataUri(auto?.client_logo),
        loadPdfFontCss(),
      ]);
      setPdfAssets({ vuLogo, clientLogo, fontCss });
      await new Promise(r => setTimeout(r, 120));
      await exportReportPdf(pdfRef.current, clean(), fontCss);
      toast.success('فایل PDF دانلود شد');
    } catch (e) {
      console.error(e);
      toast.error('خطا در ساخت PDF');
    } finally {
      setPdfAssets(null);
      setBusy('');
    }
  };

  const sampledFromSystem = auto?.sampled;
  const lastSaved = meta.at ? new Date(meta.at).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return createPortal(
    <div className="efr-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) requestClose(); }}>
      <div className="efr-modal" dir="rtl" role="dialog" aria-label="گزارش ایونت">
        <header className="efr-head">
          <div className="efr-head-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></svg>
          </div>
          <div className="efr-head-text">
            <h2>گزارش ایونت</h2>
            <p>{form.name}{form.client_name ? ` · ${form.client_name}` : ''}</p>
          </div>
          <div className="efr-head-status">
            {dirty ? <span className="efr-pill is-dirty">تغییرات ذخیره نشده</span>
              : lastSaved ? <span className="efr-pill is-saved">ذخیره‌شده · {lastSaved}{meta.by ? ` · ${meta.by}` : ''}</span>
                : <span className="efr-pill">هنوز ذخیره نشده</span>}
          </div>
          <button className="efr-close" onClick={requestClose} disabled={!!busy} title="بستن">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="efr-body">
          <div className="efr-autonote">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
            اطلاعاتی که در سایت بود (نام، روزها، ساعت‌ها، پروموترها و سمپلینگ) خودکار پر شده؛ همه‌چیز قابل ویرایش است.
          </div>

          <Section n={1} title="اطلاعات ایونت" accent="#7c5cff">
            <div className="efr-grid efr-grid-3">
              <Field label="اسم ایونت"><input className="efr-input" value={form.name} onChange={e => set('name', e.target.value)} /></Field>
              <Field label="کلاینت"><input className="efr-input" value={form.client_name || ''} onChange={e => set('client_name', e.target.value)} /></Field>
              <Field label="محل برگزاری"><input className="efr-input" value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="مثلاً اواپلت" /></Field>
            </div>
          </Section>

          <Section n={2} title="روزها، ساعت برگزاری و پروموترها" hint="برای هر روز ساعت و نام کسانی که سرکار بودند" accent="#f5c118">
            <div className="efr-days">
              {form.days.length === 0 && <div className="efr-empty">روزی ثبت نشده — از دکمه‌ی پایین روز اضافه کنید</div>}
              {form.days.map((d, i) => {
                const j = fmtJalali(d.date);
                const people = form.promoters[d.date] || [];
                return (
                  <div className="efr-day" key={d.date}>
                    <div className="efr-day-head">
                      <span className="efr-day-badge">روز {toFa(i + 1)}</span>
                      <span className="efr-day-date"><b>{j.weekday}</b> {j.full}</span>
                      <div className="efr-day-time">
                        <TimeInput value={d.start} onChange={v => updateDay(i, { start: v })} label="شروع" />
                        <span>تا</span>
                        <TimeInput value={d.end} onChange={v => updateDay(i, { end: v })} label="پایان" />
                      </div>
                      <button className="efr-icon-btn is-danger" title="حذف روز" onClick={() => removeDay(i)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                      </button>
                    </div>
                    <div className="efr-people">
                      {people.map((p, k) => (
                        <span key={k} className={`efr-person ${p.role === 'supervisor' ? 'is-sup' : ''}`}>
                          <button type="button" className="efr-person-role" title={p.role === 'supervisor' ? 'سوپروایزر (کلیک: پروموتر)' : 'پروموتر (کلیک: سوپروایزر)'}
                            onClick={() => setPeople(d.date, people.map((x, q) => q === k ? { ...x, role: x.role === 'supervisor' ? 'promoter' : 'supervisor' } : x))}>
                            {p.role === 'supervisor' ? '★' : '☆'}
                          </button>
                          {p.name}
                          <button type="button" className="efr-person-x" title="حذف" onClick={() => setPeople(d.date, people.filter((_, q) => q !== k))}>×</button>
                        </span>
                      ))}
                      <span className="efr-person-add">
                        <input list="efr-names" className="efr-input" placeholder="+ نام پروموتر" value={newName[d.date] || ''}
                          onChange={e => setNewName(n => ({ ...n, [d.date]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPerson(d.date); } }} />
                        <button type="button" className="efr-mini-btn" onClick={() => addPerson(d.date)} disabled={!(newName[d.date] || '').trim()}>افزودن</button>
                      </span>
                      {i > 0 && people.length === 0 && (form.promoters[form.days[i - 1].date] || []).length > 0 && (
                        <button type="button" className="efr-link-btn" onClick={() => copyPrevDay(i)}>کپی تیم روز قبل</button>
                      )}
                    </div>
                  </div>
                );
              })}
              <datalist id="efr-names">{allNames.map(n => <option key={n} value={n} />)}</datalist>
            </div>
            <div className="efr-row-actions">
              <DatePicker calendar={persian} locale={persian_fa} portal zIndex={100000} calendarPosition="bottom-right"
                onChange={addDay} value={null}
                render={(_, open) => <button type="button" className="efr-add-btn" onClick={open}>+ افزودن روز</button>} />
              <span className="efr-sub">جمع: {toFa(uniquePeople(form))} نفر · ستاره = سوپروایزر</span>
            </div>
          </Section>

          <Section n={3} title="محصول و حمل‌ونقل" accent="#10b981">
            <div className="efr-grid efr-grid-4">
              <Field label="تعداد محصول ارسال‌شده"><CountInput value={form.products_sent} onChange={v => set('products_sent', v)} placeholder="مثلاً ۳۵۰" /></Field>
              <Field label="تعداد محصول سمپل‌شده"
                sub={sampledFromSystem !== null && sampledFromSystem !== undefined ? (
                  <>از سیستم: {fmtCount(sampledFromSystem) || '۰'}
                    {form.sampled !== sampledFromSystem && <button type="button" className="efr-link-btn" onClick={() => set('sampled', sampledFromSystem)}>بازگردانی</button>}</>
                ) : 'این ایونت فیلد سمپلینگ ندارد؛ دستی وارد کنید'}>
                <CountInput value={form.sampled} onChange={v => set('sampled', v)} placeholder="مثلاً ۱۰۰" />
              </Field>
              <Field label="ماشین ارسال وسایل"><CountInput value={form.cars_send} onChange={v => set('cars_send', v)} suffix="ماشین" /></Field>
              <Field label="ماشین برگشت اقلام"><CountInput value={form.cars_return} onChange={v => set('cars_return', v)} suffix="ماشین" /></Field>
            </div>
          </Section>

          <Section n={4} title="لیست وسایل برگشتی" hint="هر وسیله را جدا وارد کنید — Enter ردیف بعدی را باز می‌کند" accent="#3b82f6">
            <div className="efr-items">
              {items.length === 0 && <div className="efr-empty">هنوز وسیله‌ای اضافه نشده</div>}
              {items.map((it, i) => (
                <div className="efr-item" key={i}>
                  <span className="efr-item-n">{toFa(i + 1)}</span>
                  <input ref={el => { itemRefs.current[i] = el; }} className="efr-input" placeholder="نام وسیله" value={it.name}
                    onChange={e => setItem(i, { name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (i === items.length - 1) addItem(); else itemRefs.current[i + 1]?.focus(); } }} />
                  <CountInput value={it.qty} onChange={v => setItem(i, { qty: v })} placeholder="تعداد" />
                  <button className="efr-icon-btn is-danger" title="حذف" onClick={() => set('returned_items', items.filter((_, k) => k !== i))}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="efr-row-actions">
              <button type="button" className="efr-add-btn" onClick={() => addItem()}>+ افزودن وسیله</button>
            </div>
          </Section>

          <Section n={5} title="ارزیابی ایونت" accent="#ec4899">
            <Field label="نحوه برگزاری ایونت">
              <div className="efr-rating">
                {RATINGS.map(r => (
                  <button type="button" key={r.key} className={`efr-rating-btn ${form.rating === r.key ? 'on' : ''}`} style={{ '--c': r.color }}
                    onClick={() => set('rating', form.rating === r.key ? '' : r.key)}>{r.label}</button>
                ))}
              </div>
            </Field>
            <div className="efr-grid efr-grid-3 efr-mt">
              <Field label="بازه سنی مخاطبین">
                <div className="efr-age">
                  <CountInput value={form.age_from} onChange={v => set('age_from', v)} placeholder="از" />
                  <span>تا</span>
                  <CountInput value={form.age_to} onChange={v => set('age_to', v)} placeholder="تا" />
                  <span>سال</span>
                </div>
              </Field>
              <Field label="تخمین تعداد مخاطبین"><CountInput value={form.audience_estimate} onChange={v => set('audience_estimate', v)} suffix="نفر" /></Field>
            </div>
            <Field label="مخاطب هدف" sub="خوب بود یا ضعیف؟ مخاطب‌ها مناسب برند بودند یا نه؟">
              <textarea className="efr-input efr-textarea" rows={2} value={form.audience_fit} onChange={e => set('audience_fit', e.target.value)}
                placeholder="مثلاً: خوب بود ولی بازه سنی بالای ۳۰ سال بودند" />
            </Field>
            <div className="efr-grid efr-grid-2">
              <Field label="مشکلات پیش‌آمده">
                <textarea className="efr-input efr-textarea" rows={3} value={form.problems} onChange={e => set('problems', e.target.value)} placeholder="اگر مشکلی بود بنویسید" />
              </Field>
              <Field label="موارد پیش‌آمده در ایونت">
                <textarea className="efr-input efr-textarea" rows={3} value={form.incidents} onChange={e => set('incidents', e.target.value)} placeholder="مثلاً: موردی نبوده" />
              </Field>
            </div>
          </Section>

          <Section n={6} title="گزارش کلی" hint="اجباری — حدود یک پاراگراف" accent="#ef4444">
            <textarea ref={summaryRef} className={`efr-input efr-textarea efr-summary ${summaryError ? 'has-error' : ''}`} rows={6}
              value={form.summary} onChange={e => { set('summary', e.target.value); if (e.target.value.trim()) setSummaryError(false); }}
              placeholder="جمع‌بندی کلی ایونت: روند برگزاری، استقبال، نکات مهم برای دفعه‌ی بعد…" />
            <div className="efr-summary-foot">
              {summaryError ? <span className="efr-err">نوشتن گزارش کلی اجباری است</span> : <span />}
              <span className="efr-sub">{toFa(form.summary.trim().length)} کاراکتر</span>
            </div>
          </Section>
        </div>

        <footer className="efr-foot">
          <button className="efr-btn efr-btn-ghost" onClick={requestClose} disabled={!!busy}>بستن</button>
          <div className="efr-foot-right">
            <button className="efr-btn efr-btn-excel" onClick={downloadExcel} disabled={!!busy}>
              {busy === 'excel' ? <span className="efr-spinner" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13l4 5M12 13l-4 5" /></svg>}
              اکسل
            </button>
            <button className="efr-btn efr-btn-pdf" onClick={downloadPdf} disabled={!!busy}>
              {busy === 'pdf' ? <span className="efr-spinner" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>}
              PDF
            </button>
            <button className="efr-btn efr-btn-primary" onClick={save} disabled={!!busy || (!dirty && !!meta.at)}>
              {busy === 'save' ? <span className="efr-spinner" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
              ذخیره گزارش
            </button>
          </div>
        </footer>
      </div>

      {busy === 'pdf' && <div className="efr-pdf-busy"><span className="efr-spinner" />در حال ساخت PDF…</div>}
      {/* Off-screen A4 template, mounted only while exporting */}
      {busy === 'pdf' && pdfAssets && createPortal(
        <div className="efr-pdf-stage"><FinalReportPdf ref={pdfRef} form={clean()} assets={pdfAssets} /></div>,
        document.body
      )}
    </div>,
    document.body
  );
}
