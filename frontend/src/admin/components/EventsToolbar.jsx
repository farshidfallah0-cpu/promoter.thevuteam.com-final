import React, { useState, useRef, useEffect, useMemo } from 'react';
import './eventsToolbar.css';

const fa = (n) => Number(n).toLocaleString('fa-IR');

export const SORTS = [
  { id: 'newest',  label: 'جدیدترین ایونت',     hint: 'آخرین ساخته‌شده' },
  { id: 'oldest',  label: 'قدیمی‌ترین ایونت',    hint: 'اولین ساخته‌شده' },
  { id: 'soonest', label: 'نزدیک‌ترین تاریخ',    hint: 'شروع زودتر' },
  { id: 'latest',  label: 'دورترین تاریخ',       hint: 'شروع دیرتر' },
  { id: 'days',    label: 'بیشترین روز',         hint: 'طولانی‌ترین ایونت' },
  { id: 'name',    label: 'نام (الف تا ی)',      hint: 'مرتب‌سازی الفبایی' },
];

export const PHASES = [
  { id: 'live',     label: 'در حال برگزاری' },
  { id: 'upcoming', label: 'پیش‌رو' },
  { id: 'ended',    label: 'تمام‌شده' },
];

const Icon = ({ d, size = 15, sw = 1.9 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const I = {
  search: <><circle cx="11" cy="11" r="7.5" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  sort: <><path d="M7 4v16M7 4L3 8M7 4l4 4" /><path d="M17 20V4M17 20l-4-4M17 20l4-4" /></>,
  chev: <polyline points="6 9 12 15 18 9" />,
  check: <polyline points="20 6 9 17 4 12" />,
  building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>,
  hourglass: <><path d="M6 2h12M6 22h12" /><path d="M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4" /></>,
  sheet: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></>,
  tag: <><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.2" /></>,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
};

/* Small popover select — closes on outside click / Esc. */
function Pop({ icon, label, value, children, active, align = 'start' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="evh-pop" ref={ref}>
      <button type="button" className={`evh-ctl${active ? ' is-active' : ''}${open ? ' is-open' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <Icon d={icon} />
        <span className="evh-ctl-label">{label}</span>
        <b className="evh-ctl-value">{value}</b>
        <Icon d={I.chev} size={13} />
      </button>
      {open && (
        <div className={`evh-menu evh-menu--${align}`} role="listbox">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export default function EventsToolbar({
  title, subtitle, stats,
  search, setSearch, placeholder = 'جستجوی ایونت، کلاینت یا کد…',
  status, setStatus, statusCounts,
  phase, setPhase, phaseCounts,
  sort, setSort,
  client, setClient, clients,
  flags, setFlags, flagCounts, showFlags,
  onNew, resultCount, totalCount, onReset, showStatus = true,
}) {
  const searchRef = useRef(null);
  // «/» focuses the search box, like most modern dashboards.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const dirty = !!search || status !== 'all' || phase !== 'all' || client !== 'all' || Object.values(flags || {}).some(Boolean);
  const sortMeta = SORTS.find(s => s.id === sort) || SORTS[0];
  const clientLabel = client === 'all' ? 'همه' : client === '__none' ? 'بدون کلاینت' : client;
  const phaseLabel = phase === 'all' ? 'همه' : PHASES.find(p => p.id === phase)?.label;

  const statusTabs = useMemo(() => ([
    { id: 'all', label: 'همه' },
    { id: 'active', label: 'فعال' },
    { id: 'inactive', label: 'غیرفعال' },
  ]), []);

  const statusIdx = Math.max(0, statusTabs.findIndex(t => t.id === status));

  return (
    <section className="evh">
      <div className="evh-hero">
        <div className="evh-hero-text">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {stats && (
          <div className="evh-stats" aria-label="خلاصه ایونت‌ها">
            {stats.map(s => (
              <div key={s.label} className={`evh-stat evh-stat--${s.tone || 'default'}`}>
                <b>{fa(s.value)}</b>
                <span>{s.pulse && s.value > 0 && <i className="evh-live" />}{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="evh-bar">
        <div className={`evh-search${search ? ' has-value' : ''}`}>
          <Icon d={I.search} size={16} />
          <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder={placeholder} aria-label="جستجوی ایونت" />
          {search ? (
            <button type="button" className="evh-clear" onClick={() => setSearch('')} aria-label="پاک کردن جستجو"><Icon d={I.x} size={12} sw={2.4} /></button>
          ) : <kbd>/</kbd>}
        </div>

        {showStatus && (
          <div className="evh-seg" role="tablist" aria-label="وضعیت ایونت" style={{ '--i': statusIdx }}>
            <span className="evh-seg-thumb" aria-hidden="true" />
            {statusTabs.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={status === t.id} className={status === t.id ? 'is-on' : ''} onClick={() => setStatus(t.id)}>
                {t.label}<em>{fa(statusCounts?.[t.id] ?? 0)}</em>
              </button>
            ))}
          </div>
        )}

        {onNew && (
          <button type="button" className="evh-new" onClick={onNew}>
            <Icon d={I.plus} size={16} sw={2.4} />ایونت جدید
          </button>
        )}
      </div>

      <div className="evh-filters">
        <Pop icon={I.sort} label="ترتیب" value={sortMeta.label} active={sort !== 'newest'}>
          {(close) => SORTS.map(s => (
            <button key={s.id} type="button" role="option" aria-selected={sort === s.id} className={`evh-opt${sort === s.id ? ' is-on' : ''}`} onClick={() => { setSort(s.id); close(); }}>
              <span><b>{s.label}</b><small>{s.hint}</small></span>
              {sort === s.id && <Icon d={I.check} size={15} sw={2.4} />}
            </button>
          ))}
        </Pop>

        <Pop icon={I.hourglass} label="زمان" value={phaseLabel} active={phase !== 'all'}>
          {(close) => [{ id: 'all', label: 'همه' }, ...PHASES].map(p => (
            <button key={p.id} type="button" role="option" aria-selected={phase === p.id} className={`evh-opt${phase === p.id ? ' is-on' : ''}`} onClick={() => { setPhase(p.id); close(); }}>
              <span><b>{p.label}</b></span>
              <em>{fa(phaseCounts?.[p.id] ?? 0)}</em>
              {phase === p.id && <Icon d={I.check} size={15} sw={2.4} />}
            </button>
          ))}
        </Pop>

        {clients && clients.length > 0 && (
          <Pop icon={I.building} label="کلاینت" value={clientLabel} active={client !== 'all'}>
            {(close) => (
              <>
                <button type="button" role="option" className={`evh-opt${client === 'all' ? ' is-on' : ''}`} onClick={() => { setClient('all'); close(); }}>
                  <span><b>همه کلاینت‌ها</b></span>{client === 'all' && <Icon d={I.check} size={15} sw={2.4} />}
                </button>
                {clients.map(c => (
                  <button key={c.key} type="button" role="option" className={`evh-opt${client === c.key ? ' is-on' : ''}`} onClick={() => { setClient(c.key); close(); }}>
                    <span className="evh-opt-client">
                      {c.logo ? <img src={c.logo} alt="" /> : <i>{c.name[0]}</i>}
                      <b>{c.name}</b>
                    </span>
                    <em>{fa(c.count)}</em>
                    {client === c.key && <Icon d={I.check} size={15} sw={2.4} />}
                  </button>
                ))}
              </>
            )}
          </Pop>
        )}

        {showFlags && (
          <>
            <span className="evh-sep" aria-hidden="true" />
            {[['pending', 'در انتظار تایید', I.hourglass], ['noSheet', 'بدون شیت', I.sheet], ['priceReview', 'بازنگری قیمت', I.tag]].map(([k, label, ic]) => (
              <button key={k} type="button" className={`evh-chip${flags[k] ? ' is-on' : ''}`} aria-pressed={!!flags[k]} onClick={() => setFlags(f => ({ ...f, [k]: !f[k] }))}>
                <Icon d={ic} size={13} />{label}<em>{fa(flagCounts?.[k] ?? 0)}</em>
              </button>
            ))}
          </>
        )}

        <div className="evh-result" aria-live="polite">
          <span>{resultCount === totalCount ? `${fa(totalCount)} ایونت` : `${fa(resultCount)} از ${fa(totalCount)} ایونت`}</span>
          {dirty && <button type="button" onClick={onReset}>پاک کردن فیلترها</button>}
        </div>
      </div>
    </section>
  );
}
