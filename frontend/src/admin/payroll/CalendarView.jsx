import React, { useMemo, useState } from 'react';
import { LayoutGrid, Table2 } from 'lucide-react';
import { fa, toman, tomanShort, fromKey, todayKey, roleName, ROLE_BY_KEY } from './payrollUtils';

const WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

export default function CalendarView({ days, monthMode, month, workdays, pending, selected, onToggle }) {
  const [mode, setMode] = useState('grid');
  const today = todayKey();
  const dayInfo = useMemo(() => Object.fromEntries(days.map((k) => {
    const d = fromKey(k);
    return [k, { n: d.day, wd: d.weekDay.index, label: d.format('dddd D MMMM') }];
  })), [days]);

  // person -> day -> { rows, pending }
  const { people, totals } = useMemo(() => {
    const m = new Map();
    const t = Object.fromEntries(days.map((k) => [k, { amount: 0, people: new Set(), pending: 0 }]));
    const get = (w) => {
      const k = w.person_key || `p:${w.promoter_id}`;
      if (!m.has(k)) m.set(k, { key: k, name: w.person_name, cells: {}, total: 0, unpaid: 0 });
      return m.get(k);
    };
    workdays.forEach((w) => {
      const p = get(w);
      (p.cells[w.day] ||= { rows: [], pending: [] }).rows.push(w);
      p.total += w.amount; if (!w.paid) p.unpaid += w.amount;
      if (t[w.day]) { t[w.day].amount += w.amount; t[w.day].people.add(p.key); }
    });
    pending.forEach((w) => {
      const p = get(w);
      (p.cells[w.day] ||= { rows: [], pending: [] }).pending.push(w);
      if (t[w.day]) t[w.day].pending += 1;
    });
    return { people: [...m.values()].sort((a, b) => b.unpaid - a.unpaid || b.total - a.total), totals: t };
  }, [days, workdays, pending]);

  const legend = (
    <div className="pr-cal-legend">
      <span><i className="c-unpaid" /> تایید شده · پرداخت‌نشده</span>
      <span><i className="c-paid" /> پرداخت شده</span>
      <span><i className="c-pending" /> گزارش دارد · در انتظار تایید</span>
      <span><i className="c-sel" /> انتخاب برای پرداخت</span>
    </div>
  );

  return (
    <div className="pr-cal">
      <div className="pr-list-head">
        {legend}
        <div className="pr-seg sm">
          <button type="button" className={mode === 'grid' ? 'on' : ''} onClick={() => setMode('grid')}><Table2 size={14} /> جدول نفرات</button>
          {monthMode && <button type="button" className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}><LayoutGrid size={14} /> تقویم ماه</button>}
        </div>
      </div>

      {mode === 'month' && monthMode ? (
        <div className="pr-month">
          {WEEK.map((w, i) => <div key={w} className={`pr-month-wd ${i === 6 ? 'fri' : ''}`}>{w}</div>)}
          {Array.from({ length: month.firstWeekDay }).map((_, i) => <div key={`b${i}`} className="pr-month-blank" />)}
          {days.map((k) => {
            const t = totals[k];
            const names = people.filter((p) => p.cells[k]?.rows.length).map((p) => p.name);
            return (
              <div key={k} className={`pr-month-day ${dayInfo[k].wd === 6 ? 'fri' : ''} ${k === today ? 'today' : ''} ${t.people.size ? 'has' : ''}`} title={`${dayInfo[k].label}\n${names.join('، ')}`}>
                <span className="pr-month-n">{fa(dayInfo[k].n)}</span>
                {t.people.size > 0 && <b>{fa(t.people.size)} نفر</b>}
                {t.amount > 0 && <span className="pr-month-amt">{tomanShort(t.amount)}</span>}
                {t.pending > 0 && <span className="pr-month-pend">{fa(t.pending)} در انتظار</span>}
                <div className="pr-month-avatars">{names.slice(0, 4).map((n, i) => <i key={i}>{(n || '?').charAt(0)}</i>)}{names.length > 4 && <i>+{fa(names.length - 4)}</i>}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="pr-grid-wrap">
          <table className="pr-grid">
            <thead>
              <tr>
                <th className="pr-grid-name">نام</th>
                {days.map((k) => (
                  <th key={k} className={`${dayInfo[k].wd === 6 ? 'fri' : ''} ${k === today ? 'today' : ''}`} title={dayInfo[k].label}>
                    <small>{WEEK[dayInfo[k].wd]}</small>{fa(dayInfo[k].n)}
                  </th>
                ))}
                <th className="pr-grid-sum">مانده</th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 && <tr><td colSpan={days.length + 2} className="pr-grid-empty">در این بازه داده‌ای نیست</td></tr>}
              {people.map((p) => (
                <tr key={p.key}>
                  <td className="pr-grid-name">{p.name}</td>
                  {days.map((k) => {
                    const c = p.cells[k];
                    if (!c) return <td key={k} className={dayInfo[k].wd === 6 ? 'fri' : ''} />;
                    const unpaid = c.rows.filter((w) => !w.paid);
                    const sel = unpaid.length > 0 && unpaid.every((w) => selected.has(w.id));
                    const cls = c.rows.length ? (unpaid.length ? 'c-unpaid' : 'c-paid') : 'c-pending';
                    const amount = c.rows.reduce((n, w) => n + w.amount, 0);
                    const tip = [
                      dayInfo[k].label,
                      ...c.rows.map((w) => `${w.event_name} · ${roleName(w.role)} · ${toman(w.amount)}${w.paid ? ' · پرداخت شد' : ''}`),
                      ...c.pending.map((w) => `${w.event_name} · در انتظار تایید`),
                    ].join('\n');
                    return (
                      <td key={k} className={dayInfo[k].wd === 6 ? 'fri' : ''}>
                        <button type="button" className={`pr-cell ${cls} ${sel ? 'c-sel' : ''}`} title={tip} disabled={!unpaid.length}
                          style={c.rows[0] ? { '--rc': ROLE_BY_KEY[c.rows[0].role]?.color } : undefined}
                          onClick={() => unpaid.length && onToggle(unpaid.map((w) => w.id), !sel)}>
                          {c.rows.length ? tomanShort(amount).replace(' هزار', 'k') : '•'}
                        </button>
                      </td>
                    );
                  })}
                  <td className="pr-grid-sum">{p.unpaid ? tomanShort(p.unpaid) : '✓'}</td>
                </tr>
              ))}
            </tbody>
            {people.length > 0 && (
              <tfoot>
                <tr>
                  <td className="pr-grid-name">جمع روز</td>
                  {days.map((k) => <td key={k} className={dayInfo[k].wd === 6 ? 'fri' : ''}>{totals[k].amount ? tomanShort(totals[k].amount) : ''}</td>)}
                  <td className="pr-grid-sum">{tomanShort(people.reduce((n, p) => n + p.unpaid, 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
