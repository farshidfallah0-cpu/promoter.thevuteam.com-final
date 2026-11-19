import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { Banknote, X, AlertTriangle } from 'lucide-react';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { payrollApi, apiError, fa, toman, todayKey, keyOf, fromKey, dayLabel, PAY_METHODS } from './payrollUtils';

export default function PayDialog({ token, rows, onClose, onDone }) {
  const [method, setMethod] = useState(PAY_METHODS[0]);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [paidAt, setPaidAt] = useState(todayKey());
  const [saving, setSaving] = useState(false);

  const people = useMemo(() => {
    const m = new Map();
    rows.forEach((w) => {
      const p = m.get(w.person_key) || { name: w.person_name, phone: w.phone, days: [], amount: 0 };
      p.days.push(w); p.amount += w.amount; m.set(w.person_key, p);
    });
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [rows]);
  const total = rows.reduce((n, w) => n + w.amount, 0);
  const zero = rows.filter((w) => w.amount <= 0).length;

  const submit = async () => {
    setSaving(true);
    try {
      const res = await payrollApi.pay(token, { workday_ids: rows.map((w) => w.id), method, reference, note, paid_at: paidAt });
      toast.success(`${fa(res.length)} پرداخت به مبلغ ${toman(total)} ثبت شد`);
      onDone();
    } catch (e) {
      toast.error(apiError(e, 'خطا در ثبت پرداخت'));
      setSaving(false);
    }
  };

  return createPortal(
    <div className="pr-modal-bg" onClick={onClose}>
      <div className="pr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="pr-modal-head">
          <span className="pr-hero-icon sm"><Banknote size={18} /></span>
          <div><b>ثبت پرداخت</b><span>{fa(rows.length)} روز کاری · {fa(people.length)} نفر</span></div>
          <button type="button" className="pr-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="pr-modal-total"><span>مبلغ کل</span><b>{toman(total)}</b></div>
        {zero > 0 && <div className="pr-warn"><AlertTriangle size={15} /> {fa(zero)} روز مبلغ صفر دارند (دستمزد تعیین نشده).</div>}

        <div className="pr-modal-people">
          {people.map((p) => (
            <div key={p.name + p.phone} className="pr-modal-person">
              <div><b>{p.name}</b>{p.phone && <small><bdi>{p.phone}</bdi></small>}</div>
              <span className="pr-modal-days">{p.days.sort((a, b) => a.day.localeCompare(b.day)).map((w) => dayLabel(w.day, 'D MMMM')).join('، ')}</span>
              <b className="pr-modal-amt">{toman(p.amount)}</b>
            </div>
          ))}
        </div>

        <div className="pr-form">
          <label>روش پرداخت</label>
          <div className="pr-seg">{PAY_METHODS.map((m) => <button type="button" key={m} className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>{m}</button>)}</div>
          <div className="pr-form-row">
            <div>
              <label>تاریخ پرداخت</label>
              <DatePicker calendar={persian} locale={persian_fa} className="bg-dark" value={fromKey(paidAt)} onChange={(v) => v && setPaidAt(keyOf(v))}
                render={(value, open) => <button type="button" className="pr-input-btn" onClick={open}>{dayLabel(paidAt, 'dddd D MMMM YYYY')}</button>} />
            </div>
            <div>
              <label>شماره پیگیری / مرجع</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="اختیاری" />
            </div>
          </div>
          <label>توضیحات</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: علی‌الحساب آبان" />
        </div>

        <div className="pr-modal-foot">
          <button type="button" className="pr-chip-btn" onClick={onClose}>انصراف</button>
          <button type="button" className="pr-pay-btn" disabled={saving} onClick={submit}><Banknote size={17} /> {saving ? 'در حال ثبت...' : `پرداخت شد · ${toman(total)}`}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
