import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Wallet, Undo2, Lock, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { payrollApi, apiError, toman, roleName } from './payrollUtils';
import './workday.css';

/** Workday approvals of one event, keyed `${promoter_id}_${day}` (the report card's id). */
export function useEventWorkdays(token, eventId, enabled) {
  const [map, setMap] = useState({});
  const [busy, setBusy] = useState({});

  useEffect(() => {
    if (!enabled || !eventId) { setMap({}); return undefined; }
    let alive = true;
    payrollApi.eventWorkdays(token, eventId)
      .then((rows) => { if (alive) setMap(Object.fromEntries(rows.map((w) => [`${w.promoter_id}_${w.day}`, w]))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [token, eventId, enabled]);

  const approve = useCallback(async (items) => {
    const keys = items.map((it) => `${it.promoter_id}_${it.day}`);
    setBusy((b) => ({ ...b, ...Object.fromEntries(keys.map((k) => [k, true])) }));
    try {
      const rows = await payrollApi.approve(token, items);
      setMap((m) => ({ ...m, ...Object.fromEntries(rows.map((w) => [`${w.promoter_id}_${w.day}`, w])) }));
      toast.success(rows.length > 1 ? `${rows.length.toLocaleString('fa-IR')} روز کاری تایید شد` : 'روز کاری تایید شد و به محاسبه عملکرد رفت');
    } catch (e) {
      toast.error(apiError(e, 'خطا در تایید روز کاری'));
    } finally {
      setBusy((b) => { const n = { ...b }; keys.forEach((k) => delete n[k]); return n; });
    }
  }, [token]);

  const unapprove = useCallback(async (w) => {
    const k = `${w.promoter_id}_${w.day}`;
    setBusy((b) => ({ ...b, [k]: true }));
    try {
      await payrollApi.unapprove(token, w.id);
      setMap((m) => { const n = { ...m }; delete n[k]; return n; });
      toast.info('تایید روز کاری برداشته شد');
    } catch (e) {
      toast.error(apiError(e, 'خطا در لغو تایید'));
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[k]; return n; });
    }
  }, [token]);

  return { map, busy, approve, unapprove };
}

/**
 * The «تایید عملکرد روز کاری» strip on a report card. Deliberately looks nothing like the
 * client-report approval (it is a gold «payroll ticket»), so the two are never confused.
 */
export function WorkdayApproveStrip({ workday, busy, onApprove, onUnapprove, role }) {
  if (workday?.paid) {
    return (
      <div className="wd-strip wd-paid" title="این روز پرداخت شده و قفل است">
        <span className="wd-ico"><Lock size={15} /></span>
        <div className="wd-text">
          <b>روز کاری پرداخت شد</b>
          <span>{toman(workday.amount)} · {roleName(workday.role)}</span>
        </div>
      </div>
    );
  }
  if (workday) {
    return (
      <div className="wd-strip wd-approved">
        <span className="wd-ico"><BadgeCheck size={16} /></span>
        <div className="wd-text">
          <b>عملکرد روز کاری تایید شد</b>
          <span>{workday.amount ? toman(workday.amount) : 'دستمزد هنوز تعیین نشده'} · {roleName(workday.role)} · {workday.approved_by}</span>
        </div>
        <button type="button" className="wd-undo" disabled={busy} onClick={() => window.confirm('تایید این روز کاری برداشته شود؟') && onUnapprove(workday)} title="لغو تایید">
          {busy ? <Loader2 size={14} className="wd-spin" /> : <Undo2 size={14} />}
        </button>
      </div>
    );
  }
  return (
    <div className="wd-strip wd-pending">
      <span className="wd-ico"><Wallet size={16} /></span>
      <div className="wd-text">
        <b>عملکرد روز کاری</b>
        <span>برای محاسبه حقوق · {roleName(role)}</span>
      </div>
      <button type="button" className="wd-approve" disabled={busy} onClick={onApprove}>
        {busy ? <Loader2 size={15} className="wd-spin" /> : <BadgeCheck size={15} />}
        تایید روز کاری
      </button>
    </div>
  );
}
