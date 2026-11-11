import React, { useState, useRef, useEffect, useMemo } from 'react';
import { IRAN_CITIES, searchCities, normCityName } from '../../utils/iranCities';

/**
 * Searchable city dropdown. By default it offers every city of Iran and also accepts a typed name that is not in
 * the list («افزودن …»). For filters pass `options` (cities that exist in the archive) and `counts`, with allowCustom={false}.
 */
const CityPicker = ({ value, onChange, options = null, counts = null, allowCustom = true, placeholder = 'انتخاب شهر...', clearLabel = 'همه شهرها', className = '' }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const root = useRef(null);
  const inputRef = useRef(null);
  const list = options || IRAN_CITIES;
  const shown = useMemo(() => searchCities(q, list), [q, list]);
  const typed = q.trim();
  const canAdd = allowCustom && typed && !list.some((c) => normCityName(c) === normCityName(typed));
  const rows = [...(value ? [{ clear: true }] : []), ...shown.map((c) => ({ c })), ...(canAdd ? [{ add: typed }] : [])];

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc); };
  }, [open]);
  useEffect(() => { setHi(0); }, [q, open]);

  const pick = (row) => {
    if (!row) return;
    onChange(row.clear ? '' : row.add ?? row.c);
    setOpen(false); setQ('');
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(rows[value ? hi : hi]); }
  };

  return (
    <div className={`cp ${className}`} ref={root}>
      <button type="button" className={`cp-trigger ${value ? 'has' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
        <span>{value || placeholder}</span>
        <svg className={`cp-chev ${open ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
      </button>
      {open && (
        <div className="cp-menu" role="listbox">
          <input ref={inputRef} className="cp-search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="جستجوی شهر..." aria-label="جستجوی شهر" />
          <div className="cp-list">
            {rows.length === 0 && <div className="cp-empty">شهری پیدا نشد</div>}
            {rows.map((row, i) => (
              <div key={row.clear ? '__clear' : row.add ? '__add' : row.c} role="option" aria-selected={!row.clear && !row.add && row.c === value}
                className={`cp-opt ${i === hi ? 'hi' : ''} ${!row.clear && !row.add && row.c === value ? 'sel' : ''} ${row.clear ? 'clear' : ''} ${row.add ? 'add' : ''}`}
                onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(row); }}>
                {row.clear ? `✕ ${clearLabel}` : row.add ? `+ افزودن «${row.add}»` : <><span>{row.c}</span>{counts?.get(row.c) != null && <small>{counts.get(row.c).toLocaleString('fa-IR')}</small>}</>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CityPicker;
