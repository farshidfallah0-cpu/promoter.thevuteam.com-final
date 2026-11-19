import React, { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Receipt, Ban, ChevronDown } from 'lucide-react';
import { payrollApi, apiError, fa, toman, jalali, dayLabel, roleName } from './payrollUtils';

export default function PaymentsView({ token, payments, workdays, onChanged }) {
  const [showCancelled, setShowCancelled] = useState(false);
  const [open, setOpen] = useState(null);
  const daysOf = useMemo(() => {
    const m = new Map();
    workdays.forEach((w) => { if (w.payment_id) { if (!m.has(w.payment_id)) m.set(w.payment_id, []); m.get(w.payment_id).push(w); } });
    return m;
  }, [workdays]);
  const list = payments.filter((p) => showCancelled || !p.cancelled_at);
  const total = list.filter((p) => !p.cancelled_at).reduce((n, p) => n + p.amount, 0);

  const cancel = async (p) => {
    if (!window.confirm(`پرداخت ${toman(p.amount)} به ${p.person_name} لغو شود؟ روزهای آن دوباره «پرداخت‌نشده» می‌شوند.`)) return;
    try { await payrollApi.cancelPayment(token, p.id); toast.info('پرداخت لغو شد'); onChanged(); } catch (e) { toast.error(apiError(e)); }
  };

  if (!payments.length) return <div className="pr-empty"><Receipt size={40} /><b>در این بازه پرداختی ثبت نشده</b><span>روزها را انتخاب کنید و «ثبت پرداخت» را بزنید.</span></div>;
  return (
    <>
      <div className="pr-list-head">
        <span>{fa(list.filter((p) => !p.cancelled_at).length)} پرداخت · {toman(total)}</span>
        <label className="pr-check"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> نمایش لغوشده‌ها</label>
      </div>
      <div className="pr-payments">
        {list.map((p) => {
          const days = (daysOf.get(p.id) || []).sort((a, b) => a.day.localeCompare(b.day));
          return (
            <div key={p.id} className={`pr-payment ${p.cancelled_at ? 'cancelled' : ''}`}>
              <div className="pr-payment-main" onClick={() => setOpen(open === p.id ? null : p.id)} role="button" tabIndex={0}>
                <span className="pr-payment-ico"><Receipt size={18} /></span>
                <div className="pr-payment-who">
                  <b>{p.person_name}</b>
                  <span>{jalali(new Date(p.paid_at)).format('dddd D MMMM YYYY')} · {p.method || 'روش نامشخص'}{p.reference ? ` · پیگیری ${p.reference}` : ''}</span>
                </div>
                <div className="pr-payment-amt">
                  <b>{toman(p.amount)}</b>
                  <span>{fa(p.days_count)} روز · {p.paid_by}</span>
                </div>
                {p.cancelled_at ? <span className="pr-tag">لغو شد</span> : (
                  <button type="button" className="pr-mini-btn danger" title="لغو پرداخت" onClick={(e) => { e.stopPropagation(); cancel(p); }}><Ban size={14} /></button>
                )}
                <ChevronDown size={16} className={`pr-chev ${open === p.id ? 'up' : ''}`} />
              </div>
              {open === p.id && (
                <div className="pr-payment-days">
                  {p.note && <p className="pr-payment-note">📝 {p.note}</p>}
                  {days.length ? days.map((w) => (
                    <span key={w.id}>{dayLabel(w.day, 'D MMMM')} · {w.event_name} · {roleName(w.role)} · <b>{toman(w.amount)}</b></span>
                  )) : <span className="muted">{p.cancelled_at ? 'روزهای این پرداخت آزاد شده‌اند.' : 'روزهای این پرداخت خارج از بازه‌ی انتخاب‌شده هستند.'}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
