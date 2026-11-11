import React from 'react';
import './VisitDots.css';
import { weekStart } from './mehramVisits';

/** The stores are visited for 16 consecutive weeks — one bullet per visit. */
export const VISIT_TARGET = 16;

/**
 * «ویزیت چندم» as 16 bullets: the first `count` are green, and `next` (optional) outlines the bullet the coming visit will fill.
 * `current` (1-based) rings the visit a report card is about. Used by the report cards, the promoter's search list and weekly plan.
 */
const VisitDots = ({ count = 0, next = false, current = 0, size = 'md', className = '' }) => (
  <span className={`vd vd--${size} ${className}`} role="img"
    aria-label={current ? `ویزیت ${current.toLocaleString('fa-IR')} از ${VISIT_TARGET.toLocaleString('fa-IR')}` : `${count.toLocaleString('fa-IR')} ویزیت`}>
    {Array.from({ length: VISIT_TARGET }, (_, n) => (
      <i key={n}
        className={`${count > n ? 'on' : ''} ${current === n + 1 ? 'cur' : ''} ${next && count === n ? 'next' : ''}`}
        title={`ویزیت ${(n + 1).toLocaleString('fa-IR')}`} />
    ))}
    {count > VISIT_TARGET && <em>+{(count - VISIT_TARGET).toLocaleString('fa-IR')}</em>}
  </span>
);

export default VisitDots;

/**
 * {reportId → {n, total}}: n = which visit of its store this report belongs to. A visit is one store in one week
 * (same rule as the store cards), so two reports of a store in the same week share the same number.
 */
export const buildVisitOrder = (reportLists) => {
  const byStore = new Map();
  reportLists.forEach((list) => (list || []).forEach((r) => {
    if (!r || !r.storeId) return;
    const k = String(r.storeId);
    if (!byStore.has(k)) byStore.set(k, []);
    byStore.get(k).push(r);
  }));
  const out = new Map();
  byStore.forEach((rs) => {
    const weeks = [...new Set(rs.map((r) => weekStart(r.submittedAt || 0)))].sort((a, b) => a - b);
    rs.forEach((r) => out.set(String(r.id), { n: weeks.indexOf(weekStart(r.submittedAt || 0)) + 1, total: weeks.length }));
  });
  return out;
};
