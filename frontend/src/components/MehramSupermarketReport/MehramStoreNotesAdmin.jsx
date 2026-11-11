import React, { useState } from 'react';
import { MessageSquareText, Pencil, Trash2, Loader2, Send, Check, X, AlertTriangle, Clock } from 'lucide-react';
import { fmtDate, fmtTime } from './mehramVisits';

const STATE = {
  pending: { label: 'منتظر پاسخ پروموتر', tone: 'warn', Icon: Clock },
  accepted: { label: 'تایید شد', tone: 'good', Icon: Check },
  declined: { label: 'عدم تایید', tone: 'bad', Icon: AlertTriangle },
};
const when = (iso) => { const ms = Date.parse(iso || ''); return ms ? `${fmtDate(ms)} ${fmtTime(ms)}` : ''; };

/** Worst state of a store's notes, for the little chip on cards / map popups: declined > pending > accepted. */
export const notesSummary = (notes) => {
  if (!notes?.length) return null;
  const pending = notes.filter((n) => n.status === 'pending').length;
  const declined = notes.filter((n) => n.status === 'declined').length;
  const tone = declined ? 'bad' : pending ? 'warn' : 'good';
  return { tone, count: notes.length, pending, declined };
};

export const NotesChip = ({ notes }) => {
  const s = notesSummary(notes);
  if (!s) return null;
  const label = s.declined ? `${s.declined.toLocaleString('fa-IR')} عدم تایید` : s.pending ? `${s.pending.toLocaleString('fa-IR')} بدون پاسخ` : 'تایید شد';
  return (
    <span className={`mst-anote-chip ${s.tone}`} title={`${s.count.toLocaleString('fa-IR')} نوت برای پروموترها`}>
      <MessageSquareText size={11} /> {s.count.toLocaleString('fa-IR')} نوت · {label}
    </span>
  );
};

/** Admin side of «نوت برای فروشگاه»: write notes the promoters see under the questions of this store and read their answers. */
const StoreNotesAdmin = ({ notes, onAdd, onEdit, onDelete }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null); // { id, text }
  const [deleting, setDeleting] = useState(null);

  const run = async (key, fn) => {
    setBusy(key); setErr('');
    try { await fn(); return true; }
    catch (e) { setErr(e?.response?.data?.detail || 'انجام نشد؛ دوباره تلاش کنید'); return false; }
    finally { setBusy(''); }
  };
  const add = async () => {
    if (!text.trim()) { setErr('متن نوت را بنویسید'); return; }
    if (await run('add', () => onAdd(text.trim()))) setText('');
  };

  return (
    <div className="mst-anotes">
      {notes.length === 0 && <p className="mst-anotes-empty">هنوز نوتی برای این فروشگاه نیست.</p>}
      {notes.map((n) => {
        const st = STATE[n.status] || STATE.pending;
        return (
          <div key={n.id} className={`mst-anote ${st.tone}`}>
            {editing?.id === n.id ? (
              <>
                <textarea rows={3} maxLength={1000} value={editing.text} onChange={(e) => setEditing({ id: n.id, text: e.target.value })} aria-label="ویرایش نوت" />
                <small className="mst-anote-hint">با ویرایش، پاسخ قبلی پروموتر پاک می‌شود و دوباره از او پاسخ خواسته می‌شود.</small>
                <div className="mst-anote-actions">
                  <button type="button" className="mst-btn primary" disabled={busy === `e${n.id}`} onClick={async () => { if (await run(`e${n.id}`, () => onEdit(n.id, editing.text))) setEditing(null); }}>
                    {busy === `e${n.id}` ? <Loader2 size={14} className="mst-spin" /> : <Check size={14} />} ذخیره
                  </button>
                  <button type="button" className="mst-btn ghost" onClick={() => { setEditing(null); setErr(''); }}><X size={14} /> انصراف</button>
                </div>
              </>
            ) : (
              <>
                <p>{n.text}</p>
                <div className="mst-anote-meta">
                  <span className={`mst-anote-state ${st.tone}`}><st.Icon size={12} /> {st.label}</span>
                  {n.status !== 'pending' && n.respondedBy && <span>{n.respondedBy}{n.respondedAt ? ` · ${when(n.respondedAt)}` : ''}</span>}
                  <span className="mst-anote-by">{n.by ? `${n.by} · ` : ''}{when(n.at)}</span>
                </div>
                {n.status === 'declined' && n.reason && <div className="mst-anote-reason"><b>دلیل عدم تایید:</b> {n.reason}</div>}
                <div className="mst-anote-actions">
                  <button type="button" className="mst-anote-icon" onClick={() => { setEditing({ id: n.id, text: n.text }); setErr(''); }} aria-label="ویرایش نوت"><Pencil size={13} /> ویرایش</button>
                  {deleting === n.id ? (
                    <>
                      <button type="button" className="mst-anote-icon danger" disabled={busy === `d${n.id}`} onClick={async () => { if (await run(`d${n.id}`, () => onDelete(n.id))) setDeleting(null); }}>
                        {busy === `d${n.id}` ? <Loader2 size={13} className="mst-spin" /> : <Trash2 size={13} />} حذف شود؟ بله
                      </button>
                      <button type="button" className="mst-anote-icon" onClick={() => setDeleting(null)}>خیر</button>
                    </>
                  ) : (
                    <button type="button" className="mst-anote-icon danger" onClick={() => setDeleting(n.id)} aria-label="حذف نوت"><Trash2 size={13} /> حذف</button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
      <div className="mst-anote-new">
        <textarea rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="نوت برای پروموتری که این فروشگاه را ویزیت می‌کند..." aria-label="نوت جدید" />
        <div className="mst-anote-actions">
          <button type="button" className="mst-btn primary" disabled={busy === 'add'} onClick={add}>
            {busy === 'add' ? <Loader2 size={14} className="mst-spin" /> : <Send size={14} />} ارسال نوت
          </button>
          <small className="mst-anote-hint">نوت پایین سوالات فرمِ همین فروشگاه برای پروموتر نمایش داده می‌شود و او باید تایید یا عدم تایید (با دلیل) بزند.</small>
        </div>
      </div>
      {err && <div className="mst-anote-error"><AlertTriangle size={13} /> {err}</div>}
    </div>
  );
};

export default StoreNotesAdmin;
