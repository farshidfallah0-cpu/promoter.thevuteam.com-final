import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Phone, MapPin, Navigation, History, CheckSquare, CalendarCheck, CalendarX, Loader2, Route as RouteIcon, Maximize2, X, Pin, RotateCcw, ListOrdered, Eye, EyeOff, MessageSquareText } from 'lucide-react';
import { MEHRAM_STORES } from './mehramData';
import { NotesChip } from './MehramStoreNotesAdmin';
import { suggestRoutes, kmBetweenPoints } from './mehramRoutes';
import { visitWeekCount, fmtDate, fmtDay, fmtTime, fa, weekName, noShelfTalker, STATUS_TONE } from './mehramVisits';

/*
 * Stores map — one dot per store (the stores the current filters show), coloured
 * by its state in the selected week. Status colours are the fixed status palette
 * and always come with a label in the legend and the popup, never colour alone.
 */
export const MAP_STATES = [
  { key: 'noTalker', label: 'بازدید شده — شلف تاکر نصب نشده', color: '#0ca30c', ring: '#ef4444' },
  { key: 'visited', label: 'بازدید شده', color: '#0ca30c' },
  { key: 'planned', label: 'در برنامه — هنوز بازدید نشده', color: '#2a78d6' },
  { key: 'plannedNever', label: 'در برنامه — هرگز بازدید نشده', color: '#2a78d6', ring: '#facc15' },
  { key: 'idle', label: 'بازدید نشده (قبلاً بازدید شده)', color: '#111827' },
  { key: 'never', label: 'هرگز بازدید نشده', color: '#facc15' },
];
const COLOR = Object.fromEntries(MAP_STATES.map((s) => [s.key, s.color]));
const RING_OF = Object.fromEntries(MAP_STATES.filter((s) => s.ring).map((s) => [s.key, s.ring]));

// A visited store is always green; a red ring only means the shelf talker was not installed, so «visited» reads at a glance.
// Stores far from their city's centre (the sheet lists a few under the wrong city) are flagged instead of being trusted blindly.
const medianOf = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const CITY_CENTER = (() => {
  const by = {};
  MEHRAM_STORES.forEach((s) => { if (s.lat != null && s.lng != null) (by[s.city] ||= []).push(s); });
  return Object.fromEntries(Object.entries(by).map(([c, l]) => [c, [medianOf(l.map((s) => s.lat)), medianOf(l.map((s) => s.lng))]]));
})();
const kmBetween = (a, b, c, d) => {
  const r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const OUT_OF_AREA_KM = 40;
const distFromCity = (st) => {
  const c = CITY_CENTER[st.city];
  return c && st.lat != null ? kmBetween(c[0], c[1], st.lat, st.lng) : 0;
};
const DRAW_ORDER = { idle: 0, never: 1, planned: 2, plannedNever: 3, visited: 4, noTalker: 5 }; // important dots on top

export const storeMapState = (row) => {
  if (row.inWeek.length) return row.inWeek.some(noShelfTalker) ? 'noTalker' : 'visited';
  // Not visited in the shown period: «never» = no report at all, ever (new list or old, it makes no difference); «idle» = visited in earlier weeks.
  const never = row.all.length === 0;
  if (row.plan) return never ? 'plannedNever' : 'planned';
  return never ? 'never' : 'idle';
};

const TEHRAN = [35.7, 51.39];

// Frame the stores once when the map first has points, and again only when asked (refit changes).
// Filters must NOT move the map: the admin analyses the day's plan in the view he set up.
// The view the admin set (pan/zoom) outlives the map itself: a filter with no results unmounts it, and
// switching tabs does too — coming back must not reset what he was analysing.
let savedView = null;
function RememberView() {
  const map = useMap();
  useEffect(() => {
    const save = () => { const c = map.getCenter(); savedView = { center: [c.lat, c.lng], zoom: map.getZoom() }; };
    map.on('moveend', save);
    return () => map.off('moveend', save);
  }, [map]);
  return null;
}

function FitToStores({ points, refit }) {
  const map = useMap();
  const framed = React.useRef(!!savedView);
  const fit = () => map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 });
  useEffect(() => {
    if (!points.length || framed.current) return;
    framed.current = true;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length > 0]);
  useEffect(() => {
    if (refit && points.length) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refit]);
  return null;
}

const ROUTE_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5'];
const ROUTE_SIZES = [10, 15, 20, 25, 30];
const numIcon = (n, color, pinned) => L.divIcon({
  className: `mst-route-num${pinned ? ' is-pinned' : ''}`,
  html: `<span style="background:${color}">${n.toLocaleString('fa-IR')}</span>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const planIcon = (n, color, done) => L.divIcon({
  className: `mst-route-num mst-plan-num${done ? ' is-done' : ''}`,
  html: `<span style="background:${color}">${n.toLocaleString('fa-IR')}</span>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

/* The weekly plan as it is saved: one coloured line per promoter through the stops in plan order, numbered 1…N
   (the number is the stop's place in the whole route, so a filter that hides some stores leaves gaps, never renumbers). */
function PlanRouteLayer({ groups, hidden, focus }) {
  const map = useMap();
  useEffect(() => {
    const g = groups.find((x) => x.key === focus?.key);
    if (g && g.stops.length) map.fitBounds(L.latLngBounds(g.stops.map((x) => [x.row.store.lat, x.row.store.lng])), { padding: [60, 60], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  return groups.filter((g) => !hidden.has(g.key)).map((g) => (
    <React.Fragment key={g.key}>
      <Polyline positions={g.stops.map((x) => [x.row.store.lat, x.row.store.lng])} pathOptions={{ color: g.color, weight: 3.5, opacity: 0.85, dashArray: '8 6' }} interactive={false} />
      {g.stops.map((x) => (
        <Marker key={x.row.store.id} position={[x.row.store.lat, x.row.store.lng]} icon={planIcon(x.n, g.color, x.row.inWeek.length > 0)} zIndexOffset={600}>
          <Tooltip direction="top" offset={[0, -12]}>{g.name} · {fa(x.n)}. {x.row.store.name}{x.row.inWeek.length > 0 ? ' ✓ بازدید شد' : ''}</Tooltip>
        </Marker>
      ))}
    </React.Fragment>
  ));
}

/* Suggested route groups: a line through the stops in visiting order, numbered 1…N. */
function RouteLayer({ groups, focus, pins, onPin }) {
  const map = useMap();
  useEffect(() => {
    const g = groups[focus?.i];
    if (g) map.fitBounds(L.latLngBounds(g.stops.map((x) => [x.lat, x.lng])), { padding: [60, 60], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  return groups.map((g, gi) => {
    const color = ROUTE_COLORS[gi % ROUTE_COLORS.length];
    return (
      <React.Fragment key={gi}>
        <Polyline positions={g.stops.map((x) => [x.lat, x.lng])} pathOptions={{ color, weight: 3.5, opacity: 0.85 }} interactive={false} />
        {g.stops.map((x, i) => (
          <Marker key={`${x.id}_${pins.includes(x.id)}`} position={[x.lat, x.lng]} icon={numIcon(i + 1, color, pins.includes(x.id))} zIndexOffset={pins.includes(x.id) ? 800 : 500} eventHandlers={{ click: () => onPin(x.id) }}>
            <Tooltip direction="top" offset={[0, -10]}>{x.name} — {pins.includes(x.id) ? 'ثابت‌شده (برای برداشتن بزنید)' : 'برای شروع/ادامه‌ی مسیر از اینجا بزنید'}</Tooltip>
          </Marker>
        ))}
      </React.Fragment>
    );
  });
}

const RING = '#0f172a'; // dark outline keeps every dot readable on the light map tiles

/* Add the store to / remove it from the selected week's plan straight from its popup. */
const PopupPlan = ({ row, week, people, onPlan }) => {
  const [person, setPerson] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (key) => { setBusy(true); try { await onPlan(row.store.id, key); } finally { setBusy(false); } };
  return (
    <div className="mst-pop-planbox">
      <b><CalendarCheck size={13} /> برنامه‌ی هفتگی · {weekName(week)}</b>
      <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="پروموتر">
        <option value="">{row.plan ? `تغییر پروموتر (فعلی: ${row.plan.personName})...` : 'انتخاب پروموتر...'}</option>
        {people.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
      </select>
      <div className="mst-pop-actions">
        <button type="button" className="main" disabled={!person || busy} onClick={() => run(person)}>
          {busy ? <Loader2 size={14} className="mst-spin" /> : <CalendarCheck size={14} />} {row.plan ? 'تغییر در برنامه' : 'افزودن به برنامه‌ی هفتگی'}
        </button>
        {row.plan && (
          <button type="button" className="del" disabled={busy} onClick={() => run(null)}><CalendarX size={14} /> حذف از برنامه‌ی هفتگی</button>
        )}
      </div>
    </div>
  );
};

const MehramStoresMap = ({ rows, week, onOpen, selectMode = false, selected, catalog = null, clientView = false, people = [], onPlan = null, onPickGroup = null, plans = null, notes = null, onNotes = null }) => {
  const [refit, setRefit] = useState(0);
  const [routeOn, setRouteOn] = useState(false);
  const [routeSize, setRouteSize] = useState(20);
  const [focus, setFocus] = useState(null);
  const [pins, setPins] = useState([]); // stores the user fixed in the suggested routes, in click order
  // «مسیرهای برنامه‌ی هفتگی»: the saved weekly routes drawn on the map (exclusive with the route suggestion).
  const [planOn, setPlanOn] = useState(false);
  const [planHidden, setPlanHidden] = useState(() => new Set());
  const [planFocus, setPlanFocus] = useState(null);
  // Click a number: it becomes the next fixed stop (1st click = start of its route); click a fixed one again to release it and the ones after it.
  const onPin = (id) => setPins((p) => (p.includes(id) ? p.slice(0, p.indexOf(id)) : [...p, id]));
  const located = useMemo(() => rows
    .filter((r) => r.store.lat != null && r.store.lng != null)
    .map((r) => ({ row: r, state: storeMapState(r) }))
    .sort((a, b) => DRAW_ORDER[a.state] - DRAW_ORDER[b.state]), [rows]);
  const counts = useMemo(() => {
    const c = { noTalker: 0, visited: 0, planned: 0, plannedNever: 0, idle: 0, never: 0 };
    located.forEach((p) => { c[p.state] += 1; });
    return c;
  }, [located]);
  // Framing ignores stores that are far outside their city, so one stray pin can't zoom the map out over half the country.
  const points = useMemo(() => {
    const near = located.filter((p) => distFromCity(p.row.store) <= OUT_OF_AREA_KM);
    return (near.length ? near : located).map((p) => [p.row.store.lat, p.row.store.lng]);
  }, [located]);
  const missing = rows.length - located.length;
  const planGroups = useMemo(() => {
    if (!planOn || !plans || !plans.size) return [];
    const rowById = new Map(located.map((p) => [p.row.store.id, p.row]));
    const by = new Map();
    plans.forEach((p, storeId) => {
      if (!by.has(p.personKey)) by.set(p.personKey, { key: p.personKey, name: p.personName || '—', ids: [] });
      by.get(p.personKey).ids.push(storeId);
    });
    return [...by.values()].sort((a, b) => a.name.localeCompare(b.name, 'fa')).map((g, gi) => {
      // Saved order (position) when every stop has one, else the order the server listed them.
      const ordered = g.ids.every((id) => plans.get(id).position != null) ? [...g.ids].sort((a, b) => plans.get(a).position - plans.get(b).position) : g.ids;
      const stops = ordered.map((id, i) => ({ n: i + 1, row: rowById.get(id) })).filter((x) => x.row);
      const km = stops.reduce((t, x, i) => (i ? t + kmBetweenPoints(stops[i - 1].row.store, x.row.store) : 0), 0);
      return { key: g.key, name: g.name, color: ROUTE_COLORS[gi % ROUTE_COLORS.length], total: ordered.length, stops, km, done: stops.filter((x) => x.row.inWeek.length > 0).length };
    });
  }, [planOn, plans, located]);
  // Suggestion candidates: stores the current filters show that nobody visited or planned yet (and sit inside their city).
  const routes = useMemo(() => {
    if (!routeOn) return [];
    const cand = located.filter((p) => (p.state === 'idle' || p.state === 'never') && distFromCity(p.row.store) <= OUT_OF_AREA_KM)
      .map((p) => ({ id: p.row.store.id, city: p.row.store.city, lat: p.row.store.lat, lng: p.row.store.lng, name: p.row.store.name }));
    return suggestRoutes(cand, routeSize, pins);
  }, [routeOn, routeSize, located, pins]);

  return (
    <div className="mst-map-wrap">
      <div className="mst-map-legend" role="list" aria-label="راهنمای نقشه">
        {MAP_STATES.filter((s) => !(clientView && (s.key === 'planned' || s.key === 'plannedNever'))).map((s) => (
          <span key={s.key} role="listitem" className="mst-legend-item">
            <i style={{ background: s.color, ...(s.ring ? { boxShadow: `0 0 0 2.5px ${s.ring}` } : {}) }} />{s.label}<b>{fa(counts[s.key])}</b>
          </span>
        ))}
        {missing > 0 && <span className="mst-legend-note">{fa(missing)} فروشگاه بدون لوکیشن</span>}
        <button type="button" className="mst-map-tool" onClick={() => setRefit((n) => n + 1)} title="قاب‌بندی مجدد روی فروشگاه‌های فیلترشده"><Maximize2 size={13} /> قاب‌بندی مجدد</button>
        {!clientView && onPickGroup && (
          <span className="mst-route-ctl">
            <button type="button" className={`mst-map-tool ${routeOn ? 'on' : ''}`} onClick={() => { setRouteOn((v) => !v); setFocus(null); setPins([]); setPlanOn(false); }}>
              {routeOn ? <X size={13} /> : <RouteIcon size={13} />} {routeOn ? 'لغو پیشنهاد مسیر' : 'پیشنهاد مسیر هفتگی'}
            </button>
            <button type="button" className={`mst-map-tool ${planOn ? 'on' : ''}`} onClick={() => { setPlanOn((v) => !v); setRouteOn(false); setFocus(null); setPins([]); setPlanFocus(null); }}
              title="نمایش مسیرهای ثبت‌شده در برنامه‌ی هفتگی روی نقشه، با شماره‌ی ترتیب بازدید">
              {planOn ? <X size={13} /> : <ListOrdered size={13} />} {planOn ? 'بستن مسیرهای برنامه' : 'نمایش مسیرهای برنامه‌ی هفتگی'}
            </button>
            {routeOn && (
              <select value={routeSize} onChange={(e) => { setRouteSize(Number(e.target.value)); setFocus(null); setPins([]); }} aria-label="تعداد فروشگاه در هر مسیر">
                {ROUTE_SIZES.map((n) => <option key={n} value={n}>{fa(n)} فروشگاه در هر مسیر</option>)}
              </select>
            )}
          </span>
        )}
      </div>
      {routeOn && (
        <div className="mst-route-panel">
          {routes.length === 0 ? <small>فروشگاه بازدیدنشده‌ی بدون برنامه با این فیلترها نیست.</small> : (
            <>
              <small>{fa(routes.reduce((n, g) => n + g.stops.length, 0))} فروشگاه بازدیدنشده و بدون برنامه، در {fa(routes.length)} مسیر. شماره‌ها ترتیب بازدید است.</small>
              {pins.length > 0 && (
                <small className="mst-route-tip">
                  <button type="button" className="mst-map-tool" onClick={() => setPins([])}><RotateCcw size={12} /> پیشنهاد اولیه ({fa(pins.length)} ثابت)</button>
                </small>
              )}
              <div className="mst-route-list">
                {routes.map((g, gi) => (
                  <div key={gi} className="mst-route-item" style={{ '--c': ROUTE_COLORS[gi % ROUTE_COLORS.length] }}>
                    <button type="button" className="mst-route-focus" onClick={() => setFocus({ i: gi, t: Date.now() })}>
                      <i />مسیر {fa(gi + 1)} · {g.city}<small>{fa(g.stops.length)} فروشگاه · حدود {fa(Math.round(g.km))} کیلومتر</small>
                    </button>
                    <button type="button" className="mst-map-tool" onClick={() => onPickGroup(g.stops.map((x) => x.id))}><CheckSquare size={13} /> انتخاب برای برنامه</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {planOn && (
        <div className="mst-route-panel">
          {planGroups.length === 0 ? <small>{plans && plans.size ? 'فروشگاه برنامه‌ریزی‌شده‌ی دارای لوکیشن با این فیلترها نیست.' : `برای ${week === 'all' ? 'این بازه' : weekName(week)} برنامه‌ی هفتگی ثبت نشده است.`}</small> : (
            <>
              <small>{fa(planGroups.length)} مسیر در برنامه‌ی {week === 'all' ? '' : weekName(week)}؛ شماره‌ها ترتیب بازدید هر نفر است (خط‌چین = مسیر، ✓ = بازدید شده). روی نام هر نفر بزنید تا نقشه روی مسیرش بیاید.</small>
              <div className="mst-route-list">
                {planGroups.map((g) => {
                  const off = planHidden.has(g.key);
                  return (
                    <div key={g.key} className="mst-route-item" style={{ '--c': g.color, opacity: off ? 0.5 : 1 }}>
                      <button type="button" className="mst-route-focus" onClick={() => setPlanFocus({ key: g.key, t: Date.now() })} disabled={off}>
                        <i />{g.name}<small>{fa(g.stops.length)}{g.stops.length !== g.total ? ` از ${fa(g.total)}` : ''} فروشگاه · {fa(g.done)} بازدید شده · حدود {fa(Math.round(g.km))} کیلومتر</small>
                      </button>
                      <button type="button" className="mst-map-tool" onClick={() => setPlanHidden((h) => { const n = new Set(h); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}>
                        {off ? <Eye size={13} /> : <EyeOff size={13} />} {off ? 'نمایش' : 'پنهان'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
      <div className="mst-map" dir="ltr">
        <MapContainer center={savedView?.center || TEHRAN} zoom={savedView?.zoom || 11} preferCanvas scrollWheelZoom style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution="&copy; Google Maps" url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" />
          <RememberView />
          <FitToStores points={points} refit={refit} />
          {routeOn && <RouteLayer groups={routes} focus={focus} pins={pins} onPin={onPin} />}
          {planOn && <PlanRouteLayer groups={planGroups} hidden={planHidden} focus={planFocus} />}
          {located.map(({ row, state }) => {
            const latest = row.inWeek[0];
            const statusText = MAP_STATES.find((s) => s.key === state).label;
            const isSel = selectMode && selected?.has(row.store.id);
            const { store } = row;
            const away = distFromCity(store);
            const outOfArea = away > OUT_OF_AREA_KM;
            const ring = isSel ? '#6366f1' : RING_OF[state] || RING;
            const fill = COLOR[state];
            const groups = latest ? (catalog?.byEvent?.[latest.eventId]?.groups || catalog?.groups || []) : [];
            const shown = groups.filter((g) => latest?.products?.[g.key]);
            return (
              <CircleMarker
                key={store.id}
                center={[store.lat, store.lng]}
                radius={isSel ? 13 : state === 'idle' || state === 'never' ? 8 : 10}
                pathOptions={{ color: ring, weight: isSel ? 5 : RING_OF[state] ? 4 : 2.5, fillColor: fill, fillOpacity: 1, dashArray: outOfArea ? '3 3' : undefined }}
              >
                <Popup minWidth={270} maxWidth={330}>
                  <div className="mst-pop" dir="rtl">
                    <div className="mst-pop-head">
                      <div className="mst-pop-title">
                        <b>{store.name}</b>
                        {store.customerClass && <span className="mst-pop-class">کلاس {store.customerClass}</span>}
                      </div>
                      <small><MapPin size={11} /> {store.city}{store.district ? ` · ${store.district}` : ''}</small>
                    </div>

                    {outOfArea && (
                      <div className="mst-pop-away">
                        <b>خارج از محدوده‌ی {store.city}</b>
                        <small>{store.town ? `این فروشگاه در ${store.town} است — ` : ''}حدود {fa(Math.round(away))} کیلومتر با مرکز {store.city} فاصله دارد</small>
                      </div>
                    )}

                    <div className={`mst-pop-status ${state}`} style={{ '--c': COLOR[state] }}>
                      <i />
                      <div>
                        <b>{statusText}{week !== 'all' ? ` ${weekName(week)}` : ''}</b>
                        <small>
                          {latest ? `${clientView ? '' : `${latest.promoterName} · `}${fmtDay(latest.submittedAt)} ${fmtTime(latest.submittedAt)}`
                            : row.all[0] ? `آخرین بازدید: ${fmtDate(row.all[0].submittedAt)}${clientView ? '' : ` · ${row.all[0].promoterName}`}` : (clientView ? 'هنوز بازدیدی ثبت نشده' : 'هنوز هیچ پروموتری سر نزده')}
                        </small>
                      </div>
                    </div>

                    {row.plan && !clientView && <div className="mst-pop-plan">برنامه: <b>{row.plan.personName}</b></div>}
                    {onPlan && !clientView && week !== 'all' && <PopupPlan row={row} week={week} people={people} onPlan={onPlan} />}

                    {shown.length > 0 && (
                      <div className="mst-pop-products">
                        {shown.map((g) => <span key={g.key} className={STATUS_TONE[latest.products[g.key]] || ''} title={g.title}>{g.title.split(' ')[0]}: {latest.products[g.key]}</span>)}
                      </div>
                    )}

                    <dl className="mst-pop-info">
                      {store.sellerName && <><dt>فروشنده</dt><dd>{store.sellerName}</dd></>}
                      {(store.mobile || store.landline) && <><dt>تلفن</dt><dd><a href={`tel:${store.mobile || store.landline}`}><Phone size={11} /> {store.mobile || store.landline}</a></dd></>}
                      {store.address && <><dt>آدرس</dt><dd>{store.address}</dd></>}
                      <dt>بازدیدها</dt><dd>{fa(visitWeekCount(row.all))} بازدید در کل{week !== 'all' ? ` · ${fa(row.inWeek.length)} ${weekName(week)}` : ''}</dd>
                    </dl>

                    {notes && (notes.get(store.id) || []).length > 0 && <div className="mst-pop-notes"><NotesChip notes={notes.get(store.id)} /></div>}
                    <div className="mst-pop-actions">
                      <button type="button" className="main" onClick={() => onOpen(row)}>
                        {selectMode ? <CheckSquare size={14} /> : <History size={14} />}
                        {selectMode ? (isSel ? 'حذف از انتخاب' : 'انتخاب برای برنامه') : 'جزئیات و سابقه'}
                      </button>
                      {notes && onNotes && (
                        <button type="button" className="mst-pop-note" onClick={() => onNotes(row)}>
                          <MessageSquareText size={14} /> {(notes.get(store.id) || []).length ? `نوت‌ها (${fa((notes.get(store.id) || []).length)})` : 'افزودن نوت'}
                        </button>
                      )}
                      <a className="nav" href={`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`} target="_blank" rel="noreferrer"><Navigation size={14} /> مسیریابی</a>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
};

export default MehramStoresMap;
