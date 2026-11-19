import React, { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Save, Plus, Trash2, Info } from 'lucide-react';
import { payrollApi, apiError, ROLES, roleName, toman, parseAmount, groupDigits } from './payrollUtils';

const Money = ({ value, onChange, placeholder = 'تومان' }) => (
  <input className="pr-amount wide" inputMode="numeric" value={groupDigits(value)} placeholder={placeholder} onChange={(e) => onChange(parseAmount(e.target.value))} />
);

export default function RatesView({ token, rates, events, workdays, pending, onSaved }) {
  const [draft, setDraft] = useState(() => ({ ...rates }));
  const [saving, setSaving] = useState(false);
  const [newEv, setNewEv] = useState({ event: '', role: 'promoter', amount: 0 });
  const [newPerson, setNewPerson] = useState({ person: '', amount: 0 });

  const people = useMemo(() => {
    const m = new Map();
    [...workdays, ...pending].forEach((w) => { if (w.person_key && !m.has(w.person_key)) m.set(w.person_key, w.person_name); });
    return [...m.entries()].sort((a, b) => (a[1] || '').localeCompare(b[1] || '', 'fa'));
  }, [workdays, pending]);
  const evName = (id) => events.find((e) => String(e.id) === String(id))?.name || `ایونت ${id}`;
  const personName = (pk) => people.find(([k]) => k === pk)?.[1] || pk;

  const set = (key, amount) => setDraft((d) => ({ ...d, [key]: amount }));
  const remove = (key) => setDraft((d) => { const n = { ...d }; delete n[key]; return n; });
  const changed = useMemo(() => {
    const out = {};
    new Set([...Object.keys(rates), ...Object.keys(draft)]).forEach((k) => {
      const a = rates[k]; const b = draft[k];
      if (b === undefined || b === 0) { if (a !== undefined) out[k] = null; } else if (a !== b) out[k] = b;
    });
    return out;
  }, [rates, draft]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await payrollApi.saveRates(token, changed);
      onSaved(saved); setDraft({ ...saved });
      toast.success('نرخ‌ها ذخیره شد · برای روزهایی که از این به بعد تایید می‌شوند اعمال می‌شود');
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };

  const evKeys = Object.keys(draft).filter((k) => k.startsWith('event:'));
  const personKeys = Object.keys(draft).filter((k) => k.startsWith('person:'));

  return (
    <div className="pr-rates">
      <div className="pr-note"><Info size={16} /><span>دستمزد هر روز هنگام تایید از این نرخ‌ها پر می‌شود؛ اولویت: <b>نرخ شخص</b> ← <b>نرخ نقش در ایونت</b> ← <b>نرخ پیش‌فرض نقش</b>. روزهای قبلاً تاییدشده تغییر نمی‌کنند (از تب پرسنل یا «اعمال نرخ» روی روزهای انتخاب‌شده عوض کنید).</span></div>

      <section className="pr-rate-card">
        <h3>نرخ پیش‌فرض هر نقش <small>دستمزد یک روز کاری</small></h3>
        <div className="pr-rate-roles">
          {ROLES.map((r) => (
            <label key={r.key} className="pr-rate-role" style={{ '--c': r.color }}>
              <span><i />{r.label}</span>
              <Money value={draft[`role:${r.key}`] || 0} onChange={(n) => set(`role:${r.key}`, n)} />
            </label>
          ))}
        </div>
      </section>

      <section className="pr-rate-card">
        <h3>نرخ مخصوص ایونت <small>مثلاً کلاینتی که دستمزد بیشتری دارد</small></h3>
        {evKeys.map((k) => { const [, id, role] = k.split(':'); return (
          <div key={k} className="pr-rate-row"><span>{evName(id)} · {roleName(role)}</span><Money value={draft[k]} onChange={(n) => set(k, n)} /><button type="button" className="pr-mini-btn danger" onClick={() => remove(k)}><Trash2 size={14} /></button></div>
        ); })}
        <div className="pr-rate-row add">
          <select value={newEv.event} onChange={(e) => setNewEv({ ...newEv, event: e.target.value })}>
            <option value="">انتخاب ایونت...</option>
            {events.filter((e) => !e.is_archived).map((e) => <option key={e.id} value={e.id}>{e.name}{e.client_name ? ` (${e.client_name})` : ''}</option>)}
          </select>
          <select value={newEv.role} onChange={(e) => setNewEv({ ...newEv, role: e.target.value })}>{ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
          <Money value={newEv.amount} onChange={(n) => setNewEv({ ...newEv, amount: n })} />
          <button type="button" className="pr-chip-btn" disabled={!newEv.event || !newEv.amount} onClick={() => { set(`event:${newEv.event}:${newEv.role}`, newEv.amount); setNewEv({ event: '', role: 'promoter', amount: 0 }); }}><Plus size={14} /> افزودن</button>
        </div>
      </section>

      <section className="pr-rate-card">
        <h3>نرخ مخصوص شخص <small>بر همه‌ی نرخ‌ها مقدم است</small></h3>
        {personKeys.map((k) => (
          <div key={k} className="pr-rate-row"><span>{personName(k.slice(7))}</span><Money value={draft[k]} onChange={(n) => set(k, n)} /><button type="button" className="pr-mini-btn danger" onClick={() => remove(k)}><Trash2 size={14} /></button></div>
        ))}
        <div className="pr-rate-row add">
          <select value={newPerson.person} onChange={(e) => setNewPerson({ ...newPerson, person: e.target.value })}>
            <option value="">انتخاب شخص (از نفرات این بازه)...</option>
            {people.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <Money value={newPerson.amount} onChange={(n) => setNewPerson({ ...newPerson, amount: n })} />
          <button type="button" className="pr-chip-btn" disabled={!newPerson.person || !newPerson.amount} onClick={() => { set(`person:${newPerson.person}`, newPerson.amount); setNewPerson({ person: '', amount: 0 }); }}><Plus size={14} /> افزودن</button>
        </div>
      </section>

      <div className="pr-rate-save">
        <span>{Object.keys(changed).length ? `${Object.keys(changed).length.toLocaleString('fa-IR')} تغییر ذخیره نشده` : 'همه‌چیز ذخیره شده'}</span>
        <button type="button" className="pr-pay-btn" disabled={!Object.keys(changed).length || saving} onClick={save}><Save size={16} /> {saving ? 'در حال ذخیره...' : 'ذخیره نرخ‌ها'}</button>
      </div>
      {draft['role:promoter'] ? <p className="pr-muted">نمونه: یک روز پروموتر = {toman(draft['role:promoter'])}</p> : null}
    </div>
  );
}
