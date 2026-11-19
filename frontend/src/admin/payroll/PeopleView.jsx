import React, { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { ChevronDown, Phone, BadgeCheck, Lock, Hourglass, Undo2, Banknote, CheckSquare, Square } from 'lucide-react';
import { payrollApi, apiError, fa, toman, ROLES, ROLE_BY_KEY, roleName, dayLabel, parseAmount, groupDigits } from './payrollUtils';

/** Amount box that saves on blur / Enter (no request when the value did not change). */
function AmountCell({ value, disabled, onSave, allowNegative = false, placeholder }) {
  const [text, setText] = useState(null);
  const shown = text ?? (value ? groupDigits(value) : '');
  const commit = () => {
    if (text === null) return;
    const n = parseAmount(text);
    setText(null);
    if (n !== (value || 0) && (allowNegative || n >= 0)) onSave(n);
  };
  return (
    <input className="pr-amount" inputMode="numeric" disabled={disabled} value={shown}
      placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setText(null); }} />
  );
}

function PersonCard({ person, token, selected, onToggle, onPatch, onApprovePending, onUnapprove, onPayPerson }) {
  const [open, setOpen] = useState(false);
  const unpaid = person.days.filter((w) => !w.paid);
  const selCount = unpaid.filter((w) => selected.has(w.id)).length;
  const allSel = unpaid.length > 0 && selCount === unpaid.length;
  const paidPct = person.total ? (person.paid / person.total) * 100 : 0;

  const save = async (w, patch) => {
    try { onPatch([await payrollApi.update(token, w.id, patch)]); } catch (e) { toast.error(apiError(e, 'خطا در ذخیره')); }
  };

  return (
    <div className={`pr-person ${open ? 'open' : ''} ${person.unpaid > 0 ? 'owed' : person.days.length ? 'settled' : ''}`}>
      <div className="pr-person-head" onClick={() => setOpen((o) => !o)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}>
        <span className="pr-avatar">{person.picture ? <img src={person.picture} alt="" loading="lazy" /> : (person.name || '?').charAt(0)}</span>
        <div className="pr-person-id">
          <b>{person.name || 'بدون نام'}</b>
          <span>
            {person.phone && <><Phone size={11} /> <bdi>{person.phone}</bdi> · </>}
            {person.roles.map((r) => <i key={r} className="pr-role-dot" style={{ background: ROLE_BY_KEY[r]?.color }} title={roleName(r)} />)}
            {fa(person.events.length)} ایونت
          </span>
        </div>
        <div className="pr-person-nums">
          <div><small>روز</small><b>{fa(person.days.length)}</b></div>
          {person.pendingDays.length > 0 && <div className="pend"><small>در انتظار</small><b>{fa(person.pendingDays.length)}</b></div>}
          <div className="paid"><small>پرداخت‌شده</small><b>{toman(person.paid)}</b></div>
          <div className="owe"><small>مانده</small><b>{toman(person.unpaid)}</b></div>
        </div>
        <span className="pr-person-bar"><i style={{ width: `${paidPct}%` }} /></span>
        <ChevronDown size={18} className="pr-chev" />
      </div>

      {open && (
        <div className="pr-person-body">
          <div className="pr-person-actions">
            {unpaid.length > 0 && (
              <>
                <button type="button" className="pr-chip-btn" onClick={() => onToggle(unpaid.map((w) => w.id), !allSel)}>
                  {allSel ? <CheckSquare size={15} /> : <Square size={15} />} {allSel ? 'لغو انتخاب' : 'انتخاب همه‌ی پرداخت‌نشده‌ها'}
                </button>
                <button type="button" className="pr-pay-btn sm" onClick={() => onPayPerson(unpaid.map((w) => w.id))}>
                  <Banknote size={15} /> تسویه کامل · {toman(person.unpaid)}
                </button>
              </>
            )}
            {person.pendingDays.length > 0 && (
              <button type="button" className="pr-chip-btn gold" onClick={() => window.confirm(`${fa(person.pendingDays.length)} روز در انتظار تایید، تایید شود؟`) && onApprovePending(person.pendingDays)}>
                <BadgeCheck size={15} /> تایید {fa(person.pendingDays.length)} روز در انتظار
              </button>
            )}
          </div>

          <div className="pr-days">
            <div className="pr-days-head">
              <span /><span>تاریخ</span><span>ایونت</span><span>نقش</span><span>دستمزد روزانه</span><span>پاداش / کسر</span><span>مبلغ</span><span>وضعیت</span>
            </div>
            {[...person.days, ...person.pendingDays.map((p) => ({ ...p, _pending: true }))]
              .sort((a, b) => a.day.localeCompare(b.day))
              .map((w) => (
                <div key={w._pending ? `p_${w.event_id}_${w.promoter_id}_${w.day}` : w.id}
                  className={`pr-day ${w.paid ? 'paid' : ''} ${w._pending ? 'pending' : ''} ${selected.has(w.id) ? 'sel' : ''}`}>
                  <span>
                    {!w._pending && !w.paid && (
                      <input type="checkbox" checked={selected.has(w.id)} onChange={() => onToggle([w.id])} aria-label="انتخاب برای پرداخت" />
                    )}
                  </span>
                  <span className="pr-day-date">{dayLabel(w.day)}</span>
                  <span className="pr-day-event" title={w.client_name || ''}>{w.event_name}</span>
                  <span>
                    {w._pending || w.paid ? (
                      <span className="pr-role" style={{ '--c': ROLE_BY_KEY[w.role]?.color }}>{roleName(w.role)}</span>
                    ) : (
                      <select className="pr-role-select" value={w.role} style={{ '--c': ROLE_BY_KEY[w.role]?.color }} onChange={(e) => save(w, { role: e.target.value })}>
                        {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                    )}
                  </span>
                  <span>{w._pending ? '—' : <AmountCell value={w.rate} disabled={w.paid} placeholder="تعیین نشده" onSave={(n) => save(w, { rate: n })} />}</span>
                  <span>{w._pending ? '—' : <AmountCell value={w.adjustment} allowNegative disabled={w.paid} placeholder="۰" onSave={(n) => save(w, { adjustment: n })} />}</span>
                  <span className="pr-day-amount">{w._pending ? '—' : toman(w.amount)}</span>
                  <span className="pr-day-status">
                    {w._pending ? (
                      <button type="button" className="pr-tag gold" onClick={() => onApprovePending([w])} title="تایید این روز"><Hourglass size={12} /> تایید کن</button>
                    ) : w.paid ? (
                      <span className="pr-tag paid"><Lock size={12} /> پرداخت شد</span>
                    ) : (
                      <>
                        <span className="pr-tag ok"><BadgeCheck size={12} /> تایید شده</span>
                        <button type="button" className="pr-mini-btn" title="لغو تایید" onClick={() => window.confirm('تایید این روز برداشته شود؟') && onUnapprove(w)}><Undo2 size={13} /></button>
                      </>
                    )}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

const SORTS = {
  owed: (a, b) => b.unpaid - a.unpaid || b.days.length - a.days.length,
  days: (a, b) => b.days.length - a.days.length,
  total: (a, b) => b.total - a.total,
  name: (a, b) => (a.name || '').localeCompare(b.name || '', 'fa'),
};

export default function PeopleView({ token, workdays, pending, selected, onToggle, onPatch, onApprovePending, onUnapprove, onPayPerson }) {
  const [sort, setSort] = useState('owed');
  const people = useMemo(() => {
    const m = new Map();
    const get = (w) => {
      const k = w.person_key || `p:${w.promoter_id}`;
      if (!m.has(k)) m.set(k, { key: k, name: w.person_name, phone: w.phone, picture: w.picture, days: [], pendingDays: [], roles: new Set(), events: new Set(), paid: 0, unpaid: 0, total: 0 });
      const p = m.get(k);
      if (!p.name && w.person_name) p.name = w.person_name;
      if (!p.phone && w.phone) p.phone = w.phone;
      if (!p.picture && w.picture) p.picture = w.picture;
      p.roles.add(w.role); p.events.add(w.event_id);
      return p;
    };
    workdays.forEach((w) => { const p = get(w); p.days.push(w); p.total += w.amount; if (w.paid) p.paid += w.amount; else p.unpaid += w.amount; });
    pending.forEach((w) => get(w).pendingDays.push(w));
    return [...m.values()].map((p) => ({ ...p, roles: [...p.roles], events: [...p.events] })).sort(SORTS[sort]);
  }, [workdays, pending, sort]);

  if (!people.length) {
    return (
      <div className="pr-empty">
        <BadgeCheck size={40} />
        <b>در این بازه روز کاری تاییدشده‌ای نیست</b>
        <span>در تب «گزارش‌ها»ی هر ایونت، روی «تایید روز کاری» بزنید تا روز اینجا بیاید.</span>
      </div>
    );
  }
  return (
    <>
      <div className="pr-list-head">
        <span>{fa(people.length)} نفر</span>
        <div className="pr-seg sm">
          {[['owed', 'بیشترین مانده'], ['days', 'بیشترین روز'], ['total', 'بیشترین کارکرد'], ['name', 'نام']].map(([k, l]) => (
            <button type="button" key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="pr-people">
        {people.map((p) => (
          <PersonCard key={p.key} person={p} token={token} selected={selected} onToggle={onToggle} onPatch={onPatch}
            onApprovePending={onApprovePending} onUnapprove={onUnapprove} onPayPerson={onPayPerson} />
        ))}
      </div>
    </>
  );
}
