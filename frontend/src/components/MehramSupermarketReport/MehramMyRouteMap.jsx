import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation } from 'lucide-react';
import './MehramMyRouteMap.css';

const pin = (n, kind) => L.divIcon({
  className: `mrm-pin mrm-pin--${kind}`,
  html: `<span>${kind === 'done' ? '✓' : n.toLocaleString('fa-IR')}</span>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

// Frames the route when the set of stores changes — NOT on a reorder, so dragging a stop never makes the map jump.
function Frame({ points, sig }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(L.latLngBounds(points), { padding: [34, 34], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  // The map is mounted inside a card that can change size (collapse / rotate): keep Leaflet's idea of its size right.
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

/**
 * The promoter's own route on a map: stops in visiting order, numbered 1…N, joined by a bold line.
 * Visited stops (and the legs between two visited stops) turn green, the NEXT stop pulses, the rest stay blue.
 * stops: [{ store, done }] in the current order; onPick(store) opens that store's report.
 */
const MehramMyRouteMap = ({ stops, onPick }) => {
  const located = useMemo(() => stops
    .map((x, i) => ({ ...x, n: i + 1 }))
    .filter((x) => x.store.lat != null && x.store.lng != null), [stops]);
  const nextId = located.find((x) => !x.done)?.store.id;
  const points = located.map((x) => [x.store.lat, x.store.lng]);
  const sig = useMemo(() => located.map((x) => x.store.id).sort().join(','), [located]);
  const next = located.find((x) => x.store.id === nextId);
  const missing = stops.length - located.length;

  if (!located.length) {
    return <div className="mrm-empty">برای فروشگاه‌های این برنامه موقعیت روی نقشه ثبت نشده است.</div>;
  }
  return (
    <div className="mrm">
      <div className="mrm-map" dir="ltr">
        <MapContainer center={points[0]} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution="&copy; Google Maps" url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" />
          <Frame points={points} sig={sig} />
          {/* white casing under the line keeps it bold and readable on any tile */}
          <Polyline positions={points} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} interactive={false} />
          {located.slice(1).map((x, i) => {
            const prev = located[i];
            const green = prev.done && x.done;
            return (
              <Polyline key={`${prev.store.id}-${x.store.id}`}
                positions={[[prev.store.lat, prev.store.lng], [x.store.lat, x.store.lng]]}
                pathOptions={{ color: green ? '#16a34a' : '#2563eb', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }} interactive={false} />
            );
          })}
          {located.map((x) => {
            const kind = x.done ? 'done' : x.store.id === nextId ? 'next' : 'todo';
            return (
              <Marker key={`${x.store.id}-${x.n}-${kind}`} position={[x.store.lat, x.store.lng]} icon={pin(x.n, kind)}
                zIndexOffset={kind === 'next' ? 1000 : kind === 'todo' ? 500 : 0}
                eventHandlers={{ click: () => onPick?.(x.store) }}>
                <Tooltip direction="top" offset={[0, -16]}>{x.n.toLocaleString('fa-IR')}. {x.store.name}{x.done ? ' ✓' : x.store.id === nextId ? ' — بعدی' : ''}</Tooltip>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
      <div className="mrm-foot">
        <span className="mrm-legend"><i className="done" /> انجام شد</span>
        <span className="mrm-legend"><i className="next" /> بعدی</span>
        <span className="mrm-legend"><i className="todo" /> در انتظار</span>
        {missing > 0 && <span className="mrm-miss">{missing.toLocaleString('fa-IR')} فروشگاه بدون موقعیت</span>}
        {next && (
          <a className="mrm-go" href={`https://www.google.com/maps/dir/?api=1&destination=${next.store.lat},${next.store.lng}`} target="_blank" rel="noreferrer">
            <Navigation size={14} /> مسیریابی به فروشگاه بعدی
          </a>
        )}
      </div>
    </div>
  );
};

export default MehramMyRouteMap;
