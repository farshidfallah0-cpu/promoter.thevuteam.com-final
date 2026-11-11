import React from 'react';
import { motion } from 'framer-motion';

const TABS = [
  { id: 'event', label: 'رویداد', Glyph: EventGlyph },
  { id: 'schedule', label: 'برنامه', Glyph: ScheduleGlyph },
  { id: 'profile', label: 'پروفایل', Glyph: ProfileGlyph },
];

function EventGlyph({ active }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
      <rect
        x="3.5" y="6" width="17" height="12" rx="3.2"
        fill="currentColor" fillOpacity={active ? 0.16 : 0}
        stroke="currentColor" strokeWidth={active ? 1.5 : 1.7}
        className="transition-all duration-300"
      />
      <line
        x1="9.2" y1="7.4" x2="9.2" y2="16.6"
        stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.3 2.1" strokeLinecap="round"
        opacity={active ? 0.95 : 0.5}
        className="transition-opacity duration-300"
      />
    </svg>
  );
}

function ScheduleGlyph({ active }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
      <rect
        x="4" y="5.2" width="16" height="14.8" rx="3.2"
        fill="currentColor" fillOpacity={active ? 0.14 : 0}
        stroke="currentColor" strokeWidth={active ? 1.5 : 1.7}
        className="transition-all duration-300"
      />
      <path
        d="M8 3.6v3.2M16 3.6v3.2"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
        opacity={active ? 1 : 0.7}
        className="transition-opacity duration-300"
      />
      <line
        x1="4" y1="9.6" x2="20" y2="9.6"
        stroke="currentColor" strokeWidth="1.5"
        opacity={active ? 0.9 : 0.5}
        className="transition-opacity duration-300"
      />
      <circle cx="9.4" cy="14.2" r="1.05" fill="currentColor" opacity={active ? 1 : 0.5} className="transition-opacity duration-300" />
      <circle cx="14.6" cy="14.2" r="1.05" fill="currentColor" opacity={active ? 1 : 0.5} className="transition-opacity duration-300" />
    </svg>
  );
}

function ProfileGlyph({ active }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
      <circle
        cx="12" cy="8.3" r="3.4"
        fill="currentColor" fillOpacity={active ? 0.16 : 0}
        stroke="currentColor" strokeWidth={active ? 1.5 : 1.7}
        className="transition-all duration-300"
      />
      <path
        d="M5.2 19.4c0.7-3.9 3.6-6.1 6.8-6.1s6.1 2.2 6.8 6.1"
        fill="currentColor" fillOpacity={active ? 0.16 : 0}
        stroke="currentColor" strokeWidth={active ? 1.5 : 1.7} strokeLinecap="round"
        className="transition-all duration-300"
      />
    </svg>
  );
}

export default function CrewBottomNav({ active, onChange }) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 flex bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-t border-slate-200/70 dark:border-zinc-800 shadow-[0_-8px_30px_-18px_rgba(15,23,42,0.35)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {TABS.map(({ id, label, Glyph }) => {
        const isActive = active === id;
        return (
          <motion.button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            whileTap={{ scale: 0.93 }}
            className="relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 cursor-pointer outline-none"
          >
            <div className="relative flex items-center justify-center w-11 h-9">
              {isActive && (
                <motion.span
                  layoutId="crew-nav-pill"
                  className="absolute inset-0 rounded-2xl bg-indigo-50 dark:bg-indigo-400/10"
                  transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                />
              )}
              <motion.div
                className="relative z-10 flex items-center justify-center"
                animate={{ y: isActive ? -1 : 0, scale: isActive ? 1.08 : 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              >
                <span className={isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-zinc-500 transition-colors duration-300'}>
                  <Glyph active={isActive} />
                </span>
              </motion.div>
            </div>
            <span
              className={`text-[10px] transition-all duration-300 ${
                isActive
                  ? 'font-bold text-indigo-600 dark:text-indigo-400'
                  : 'font-semibold text-slate-400 dark:text-zinc-500'
              }`}
            >
              {label}
            </span>
          </motion.button>
        );
      })}
    </nav>
  );
}
