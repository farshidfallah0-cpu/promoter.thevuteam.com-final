import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarCheck, CheckCircle2, Circle, GripVertical, ChevronUp, ChevronDown, Sparkles, Loader2, MapPin, Route as RouteIcon, Pin, PinOff, Filter } from 'lucide-react';
import { MEHRAM_STORES } from './mehramData';
import { fmtDay, fmtTime, fa, weekName, weekLabel, WEEK_MS } from './mehramVisits';
import { orderWithPins, kmBetweenPoints } from './mehramRoutes';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const STORE_BY_ID = new Map(MEHRAM_STORES.map((s) => [s.id, s]));

/** The week's first visit per store (anyone's), so «visited» here means the same as on the map. */
export const weekVisitMap = (visits, week) => {
  const m = new Map();
  [...visits].sort((a, b) => a.submittedAt - b.submittedAt).forEach((v) => {
    if (v.submittedAt >= week && v.submittedAt < week + WEEK_MS && !m.has(v.storeId)) m.set(v.storeId, v);
  });
  return m;
};

const legKm = (a, b) => (a?.lat != null && b?.lat != null ? kmBetweenPoints(a, b) : null);

const Row = ({ id, index, total, num, visit, busy, pinned, onPin, onMove, onTo }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const store = STORE_BY_ID.get(id);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }} className={`mwp-row ${visit ? 'done' : 'todo'} ${pinned ? 'pinned' : ''}`}>
      <button type="button" className="mwp-grip" {...attributes} {...listeners} aria-label="جابه‌جایی با کشیدن" disabled={busy}><GripVertical size={16} /></button>
      <span className="mwp-num">{fa(num)}</span>
      <span className="mwp-ico">{visit ? <CheckCircle2 size={17} /> : <Circle size={17} />}</span>
      <div className="mwp-body">
        <b>{store?.name || id}</b>
        <small><MapPin size={11} /> {store?.city}{store?.district ? ` · ${store.district}` : ''}{visit ? ` · بازدید شد ${fmtDay(visit.submittedAt)} ${fmtTime(visit.submittedAt)}` : ' · هنوز بازدید نشده'}</small>
      </div>
      <div className="mwp-tools">
        {!visit && (
          <button type="button" className={`mwp-pin ${pinned ? 'on' : ''}`} onClick={onPin} aria-pressed={pinned} aria-label={pinned ? 'برداشتن پین' : 'پین کردن در همین جایگاه'} title={pinned ? 'پین شده — «بهترین ترتیب» این فروشگاه را از جایگاهش جابه‌جا نمی‌کند' : 'پین کردن در همین جایگاه'}>
            {pinned ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
        )}
        <button type="button" onClick={() => onMove(-1)} disabled={busy || index === 0} aria-label="یک جا بالاتر"><ChevronUp size={15} /></button>
        <button type="button" onClick={() => onMove(1)} disabled={busy || index === total - 1} aria-label="یک جا پایین‌تر"><ChevronDown size={15} /></button>
        <select value={index + 1} disabled={busy} onChange={(e) => onTo(Number(e.target.value) - 1)} aria-label="انتقال به جایگاه">
          {Array.from({ length: total }, (_, i) => <option key={i} value={i + 1}>جایگاه {fa(i + 1)}</option>)}
        </select>
      </div>
    </li>
  );
};

const PersonPlan = ({ person, order, visitOf, busy, onSave, onlyTodo, pins, onPins, visibleIds }) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));
  const done = order.filter((id) => visitOf.has(id)).length;
  const pinCount = pins.size;
  const togglePin = (id) => onPins(person.key, pins.has(id) ? [...pins].filter((x) => x !== id) : [...pins, id]);
  const km = order.reduce((n, id, i) => (i ? n + (legKm(STORE_BY_ID.get(order[i - 1]), STORE_BY_ID.get(id)) || 0) : 0), 0);
  // With «فقط بازدیدنشده‌ها» the list shows only part of the route: a move there reorders those stores among their
  // own slots and leaves the visited ones exactly where they are.
  // The same goes for the page filters (city, search, class…): they narrow the list, and a move only reshuffles the
  // shown stores among their own slots — the hidden ones keep their place in the route.
  const shown = order.filter((id) => (!visibleIds || visibleIds.has(id)) && (!onlyTodo || !visitOf.has(id)));
  const move = (from, to) => {
    if (to < 0 || to >= shown.length || to === from) return;
    const moved = arrayMove(shown, from, to);
    if (shown.length === order.length) { onSave(person.key, moved); return; }
    const inShown = new Set(shown);
    let k = 0;
    onSave(person.key, order.map((id) => (inShown.has(id) ? moved[k++] : id)));
  };
  const optimise = () => {
    // Stores already visited stay on top; pinned ones keep their slot; the rest are re-chained into the shortest path.
    const doneIds = order.filter((id) => visitOf.has(id));
    const rest = order.filter((id) => !visitOf.has(id)).map((id) => STORE_BY_ID.get(id)).filter(Boolean);
    onSave(person.key, [...doneIds, ...orderWithPins(rest, pins).map((s) => s.id)]);
  };
  return (
    <section className="mdy-person mwp-person">
      <header>
        <span className="mst-avatar">{(person.name || '؟').charAt(0)}</span>
        <div className="mdy-person-name">
          <b>{person.name}</b>
          <small><RouteIcon size={11} /> {fa(order.length)} فروشگاه{km > 0 ? ` · حدود ${fa(Math.round(km))} کیلومتر` : ''}</small>
        </div>
        {pinCount > 0 && (
          <button type="button" className="mst-map-tool" disabled={busy} onClick={() => onPins(person.key, [])} title="برداشتن همه‌ی پین‌ها">
            <PinOff size={13} /> {fa(pinCount)} پین
          </button>
        )}
        <button type="button" className="mst-map-tool" disabled={busy || order.length < 3 || done === order.length} onClick={optimise} title="ترتیب فروشگاه‌های بازدیدنشده را برای کوتاه‌ترین مسیر مرتب می‌کند؛ فروشگاه‌های پین‌شده در جایگاه خودشان می‌مانند">
          {busy ? <Loader2 size={13} className="mst-spin" /> : <Sparkles size={13} />} بهترین ترتیب
        </button>
        <div className="mdy-person-stat"><b>{fa(done)}/{fa(order.length)}</b><small>بازدید شد</small></div>
      </header>
      <div className="mst-progress"><span style={{ width: `${order.length ? Math.round((done / order.length) * 100) : 0}%` }} /></div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (over && active.id !== over.id) move(shown.indexOf(active.id), shown.indexOf(over.id)); }}>
        <SortableContext items={shown} strategy={verticalListSortingStrategy}>
          <ol className="mwp-list">
            {shown.length === 0 && <li className="mwp-leg">{visibleIds && order.some((id) => visibleIds.has(id) === false) ? 'فروشگاهی با این فیلترها در این مسیر نیست' : 'همه‌ی فروشگاه‌های این نفر بازدید شده‌اند'}</li>}
            {shown.map((id, i) => (
              <React.Fragment key={id}>
                {i > 0 && (() => { const d = legKm(STORE_BY_ID.get(shown[i - 1]), STORE_BY_ID.get(id)); return d != null ? <li className="mwp-leg" aria-hidden="true">{fa(d.toFixed(1))} کیلومتر تا فروشگاه بعدی</li> : null; })()}
                <Row id={id} index={i} total={shown.length} num={order.indexOf(id) + 1} visit={visitOf.get(id)} busy={busy} pinned={pins.has(id)} onPin={() => togglePin(id)} onMove={(d) => move(i, i + d)} onTo={(to) => move(i, to)} />
              </React.Fragment>
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  );
};

/**
 * «برنامه‌ی هفتگی»: each promoter's weekly route in visiting order. Drag a store (or use the arrows / the
 * position menu) to move it, pin it to keep its slot when «بهترین ترتیب» re-routes the rest; visited stores turn green. Order is saved on every move.
 */
const MehramWeeklyPlan = ({ token, week, plans, visits, onChanged, onPlan, visibleIds = null }) => {
  const [orders, setOrders] = useState({}); // personKey → [storeId] (local copy, so a drag feels instant)
  const [busyKey, setBusyKey] = useState('');
  const [onlyTodo, setOnlyTodo] = useState(false);
  // Pinned stores per person for this week (kept in this browser): «بهترین ترتیب» never moves them off their slot.
  const pinKey = `mehram-plan-pins:${week}`;
  const [pinMap, setPinMap] = useState({});
  useEffect(() => {
    try { setPinMap(JSON.parse(localStorage.getItem(pinKey) || '{}') || {}); } catch { setPinMap({}); }
  }, [pinKey]);
  const setPins = (personKey, ids) => setPinMap((m) => {
    const next = { ...m, [personKey]: ids };
    try { localStorage.setItem(pinKey, JSON.stringify(next)); } catch { /* storage unavailable: pins last for this visit only */ }
    return next;
  });
  const visitOf = useMemo(() => (week === 'all' ? new Map() : weekVisitMap(visits, week)), [visits, week]);

  const people = useMemo(() => {
    const m = new Map();
    plans.forEach((p, storeId) => {
      if (!m.has(p.personKey)) m.set(p.personKey, { key: p.personKey, name: p.personName, ids: [] });
      m.get(p.personKey).ids.push(storeId);
    });
    return [...m.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fa'));
  }, [plans]);
  useEffect(() => { setOrders(Object.fromEntries(people.map((p) => [p.key, p.ids]))); }, [people]);

  const save = async (personKey, ids) => {
    const before = orders[personKey];
    setOrders((o) => ({ ...o, [personKey]: ids }));
    setBusyKey(personKey);
    try {
      await axios.put(`${API_URL}/admin/mehram/plans/order`, { week, person_key: personKey, store_ids: ids }, { headers: { Authorization: `Bearer ${token}` } });
      onChanged?.();
    } catch (e) {
      setOrders((o) => ({ ...o, [personKey]: before }));
      toast.error(e.response?.data?.detail || 'خطا در ذخیره‌ی ترتیب');
    } finally {
      setBusyKey('');
    }
  };

  if (week === 'all') return <div className="mst-empty"><CalendarCheck size={26} /> برای دیدن برنامه‌ی هفتگی، یک هفته‌ی مشخص را انتخاب کنید.</div>;
  if (!people.length) {
    return (
      <div className="mst-empty">
        <CalendarCheck size={26} /> برای {weekName(week)} ({weekLabel(week)}) برنامه‌ای ثبت نشده است.
        {onPlan && <button type="button" className="mst-btn primary" onClick={onPlan}><CalendarCheck size={15} /> ساخت برنامه‌ی هفتگی</button>}
      </div>
    );
  }
  return (
    <div className="mdy">
      <div className="mwp-filter" role="group" aria-label="فیلتر">
        <button type="button" className={`mst-map-tool ${onlyTodo ? 'on' : ''}`} aria-pressed={onlyTodo} onClick={() => setOnlyTodo((v) => !v)}>
          <Circle size={13} /> فقط بازدیدنشده‌ها
        </button>
      </div>
      <p className="mdy-note"><CalendarCheck size={12} /> ترتیب فروشگاه‌ها را با کشیدن، فلش‌ها یا منوی «جایگاه» عوض کنید؛ بلافاصله ذخیره می‌شود و پروموتر همین ترتیب را در برنامه‌اش می‌بیند. با 📌 هر فروشگاه را در جایگاه فعلی‌اش پین کنید؛ «بهترین ترتیب» بقیه را بر اساس کوتاه‌ترین مسیر، دور از جایگاه پین‌ها می‌چیند.</p>
      {visibleIds && (() => {
        const n = people.reduce((t, p) => t + (orders[p.key] || p.ids).filter((id) => visibleIds.has(id)).length, 0);
        return <p className="mdy-note"><Filter size={12} /> فیلترهای صفحه روی برنامه‌ی هفتگی هم اعمال شده است — {fa(n)} فروشگاه از برنامه با فیلترها می‌خواند.</p>;
      })()}
      <div className="mdy-people">
        {people.filter((p) => !visibleIds || (orders[p.key] || p.ids).some((id) => visibleIds.has(id))).map((p) => (
          <PersonPlan key={p.key} visibleIds={visibleIds} person={p} order={orders[p.key] || p.ids} visitOf={visitOf} busy={busyKey === p.key} onSave={save} onlyTodo={onlyTodo} pins={new Set((pinMap[p.key] || []).filter((id) => (orders[p.key] || p.ids).includes(id)))} onPins={setPins} />
        ))}
      </div>
    </div>
  );
};

export default MehramWeeklyPlan;
