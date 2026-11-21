import React from 'react';
import './Skeleton.css';

/** One shimmering block. Size it with w/h (px or any CSS length). */
export const Sk = ({ w = '100%', h = 14, r, circle, pill, style, className = '' }) => (
  <span
    aria-hidden="true"
    className={`sk${circle ? ' sk--circle' : ''}${pill ? ' sk--pill' : ''} ${className}`}
    style={{ width: w, height: h, ...(r != null ? { borderRadius: r } : null), ...style }}
  />
);

const stagger = (i) => ({ animationDelay: `${Math.min(i, 10) * 60}ms` });

/** Events table = main card + separate timer card (same as the real page), rows are one fixed height so both line up. */
export const EventsTableSkeleton = ({ rows = 6 }) => (
  <div className="sk-events" role="status" aria-label="در حال بارگذاری ایونت‌ها">
    <div className="sk-card-t sk-card-t--timer">
      <div className="sk-th"><Sk w={40} h={10} /></div>
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk-tr sk-tr--timer" key={i} style={stagger(i)}><Sk w={118} h={34} r={9} /></div>
      ))}
    </div>
    <div className="sk-card-t sk-card-t--main">
      <div className="sk-th sk-th--main"><Sk w={14} h={10} /><Sk w={64} h={10} /><Sk w={44} h={10} /><Sk w={56} h={10} /><Sk w={44} h={10} /><Sk w={60} h={10} /><span /></div>
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk-tr sk-tr--main" key={i} style={stagger(i)}>
          <Sk w={14} h={11} />
          <div className="sk-name">
            <Sk w={38} h={38} r={10} />
            <div><Sk w={`${50 + (i * 13) % 35}%`} h={13} /><Sk w="30%" h={9} /></div>
          </div>
          <div className="sk-cell-c"><Sk w={64} h={22} pill /></div>
          <div className="sk-cell-c"><Sk w={38} h={20} pill /></div>
          <div className="sk-cell-c"><Sk w={62} h={24} pill /></div>
          <div className="sk-cell-c"><Sk w={70} h={12} /></div>
          <div className="sk-cell-c sk-acts">{[0, 1, 2, 3, 4].map(k => <Sk key={k} w={22} h={22} r={6} />)}</div>
        </div>
      ))}
    </div>
    <span className="sk-sr">در حال بارگذاری</span>
  </div>
);

/** Public events directory cards. */
export const EventCardsSkeleton = ({ count = 6 }) => (
  <div className="sk-cards" role="status" aria-label="در حال بارگذاری ایونت‌ها">
    {Array.from({ length: count }, (_, i) => (
      <div className="sk-card" key={i} style={stagger(i)}>
        <Sk w={46} h={46} r={13} />
        <Sk w="62%" h={16} />
        <Sk w="38%" h={11} />
        <Sk w="100%" h={1} />
        <Sk w="80%" h={12} />
        <Sk w="55%" h={12} />
        <Sk w="100%" h={30} r={10} style={{ marginTop: 'auto' }} />
      </div>
    ))}
    <span className="sk-sr">در حال بارگذاری</span>
  </div>
);

/** The events-page header skeleton (mirrors EventsToolbar). */
export const EventsHeaderSkeleton = () => (
  <div className="sk-head" aria-hidden="true">
    <div className="sk-hero">
      <div className="sk-col"><Sk w={150} h={32} r={10} /><Sk w={230} h={12} /></div>
      <div className="sk-stats">{[0, 1, 2, 3].map(i => <Sk key={i} w={98} h={68} r={16} />)}</div>
    </div>
    <div className="sk-bar"><Sk h={44} r={13} style={{ flex: 1 }} /><Sk w={250} h={44} r={13} /><Sk w={132} h={44} r={13} /></div>
    <div className="sk-filters">{[150, 122, 142, 128, 100, 112].map((w, i) => <Sk key={i} w={w} h={38} r={11} />)}</div>
  </div>
);

/** Whole-page skeleton (topbar + header + table) shown while the app boots / checks access. Kept in sync with the static #root markup in index.html. */
export const AppSkeleton = () => (
  <div className="sk-app" role="status" aria-live="polite" aria-label="در حال بارگذاری">
    <div className="sk-top">
      <div className="sk-top-r"><Sk w={30} h={30} r={8} /><Sk w={520} h={34} r={10} className="sk-nav" /></div>
      <div className="sk-top-l"><Sk w={92} h={34} r={10} /></div>
    </div>
    <div className="sk-body">
      <EventsHeaderSkeleton />
      <EventsTableSkeleton rows={5} />
    </div>
    <span className="sk-sr">در حال بارگذاری</span>
  </div>
);
