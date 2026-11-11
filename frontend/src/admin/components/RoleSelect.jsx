import React, { useState, useRef, useEffect } from 'react';

// Custom-styled dropdown for picking a per-day role. Native <select> popups
// inherit text color from the trigger but the OS renders the open list with
// its own background, which made light-on-dark text unreadable. This owns
// both the trigger and the option list so contrast is guaranteed.
export const RoleSelect = ({ value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const current = options.find(o => o.value === value) || options[0];

  return (
    <div className="role-select" ref={rootRef} onClick={e => e.stopPropagation()}>
      <button type="button" className="role-select-trigger" onClick={() => setOpen(o => !o)}>
        <span>{current?.label}</span>
        <svg className={`role-select-chevron${open ? ' open' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="13" height="13">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="role-select-menu">
          {options.map(opt => (
            <div
              key={opt.value}
              className={`role-select-option${opt.value === value ? ' selected' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              <span>{opt.label}</span>
              {opt.value === value && (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="13" height="13">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
