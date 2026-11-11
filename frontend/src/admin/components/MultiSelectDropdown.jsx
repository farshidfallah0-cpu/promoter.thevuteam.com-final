import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Award } from 'lucide-react';

/** Dropdown list with checkboxes (and a search box) — used to pick several badges at once. options: [{ id, label, image?, color? }] */
const MultiSelectDropdown = ({ options, value, onChange, label, placeholder = 'انتخاب...', mode, onModeChange, modeLabels = ['همه', 'هرکدام'] }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => String(o.label).toLowerCase().includes(t)) : options;
  }, [options, q]);
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const picked = options.filter((o) => value.includes(o.id));

  return (
    <div className="cp msd" ref={root}>
      <button type="button" className={`cp-trigger ${value.length ? 'has' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="msd-label"><Award size={14} strokeWidth={2.2} /> {label}{value.length ? ` (${value.length.toLocaleString('fa-IR')})` : ''}</span>
        <svg className={`cp-chev ${open ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
      </button>
      {open && (
        <div className="cp-menu" role="listbox" aria-multiselectable="true">
          {options.length === 0 ? <div className="cp-empty">هنوز بجی تعریف نشده</div> : (
            <>
              <input className="cp-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی بج..." aria-label="جستجوی بج" autoFocus />
              {onModeChange && value.length > 1 && (
                <div className="msd-mode" role="radiogroup">
                  {[['all', modeLabels[0]], ['any', modeLabels[1]]].map(([k, l]) => (
                    <button type="button" key={k} role="radio" aria-checked={mode === k} className={mode === k ? 'on' : ''} onClick={() => onModeChange(k)}>{l}</button>
                  ))}
                </div>
              )}
              <div className="cp-list">
                {shown.length === 0 && <div className="cp-empty">بجی پیدا نشد</div>}
                {shown.map((o) => (
                  <label key={o.id} className={`cp-opt msd-opt ${value.includes(o.id) ? 'sel' : ''}`}>
                    <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
                    {o.image ? <img src={o.image} alt="" /> : <i style={{ background: o.color || '#f6c016' }} />}
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
              {value.length > 0 && <button type="button" className="cp-opt clear msd-clear" onClick={() => onChange([])}>✕ پاک کردن انتخاب‌ها</button>}
            </>
          )}
        </div>
      )}
      {picked.length > 0 && !open && <div className="msd-picked">{picked.map((o) => <span key={o.id} className="msd-chip">{o.label}<button type="button" onClick={() => toggle(o.id)} aria-label={`حذف ${o.label}`}>×</button></span>)}</div>}
    </div>
  );
};

export default MultiSelectDropdown;
