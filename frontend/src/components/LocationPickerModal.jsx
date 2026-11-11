import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { toast } from 'react-toastify';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import './LocationPickerModal.css';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Leaflet's default marker icon URLs are broken under bundlers — use the
// bundled copies rather than unpkg, which some networks block (the pin then
// never appears and can't be dragged).
const PIN_ICON = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
});

const DEFAULT_CENTER = { lat: 35.7219, lng: 51.3347 }; // Tehran

function ClickToPlace({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// The map mounts inside a modal that's still laying out, so on some devices
// Leaflet measures a wrong size and leaves grey/unclickable areas — re-measure
// once the modal has settled and whenever the viewport changes.
function FixMapSize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); };
  }, [map]);
  return null;
}

function FlyToPoint({ point }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo([point.lat, point.lng], 16);
  }, [point?.lat, point?.lng]);
  return null;
}

export default function LocationPickerModal({ initialLatLng, initialLocationLabel, token, onConfirm, onClose, onLabelChange }) {
  const [point, setPoint] = useState(initialLatLng || DEFAULT_CENTER);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locationLabel, setLocationLabel] = useState(initialLocationLabel || '');

  const runSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      // Goes through the backend: calling Nominatim directly from the browser
      // with a custom User-Agent failed CORS on some browsers/networks.
      const res = await axios.get(`${API_URL}/admin/geocode-search`, {
        params: { q: searchTerm.trim() },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 20000,
      });
      const data = res.data;
      setSearchResults(data || []);
      if (!data || data.length === 0) toast.info('نتیجه‌ای یافت نشد. عبارت دیگری امتحان کنید');
    } catch (err) {
      console.error('Nominatim search error:', err);
      toast.error('خطا در جستجوی مکان — اتصال اینترنت را بررسی کنید');
    } finally {
      setSearching(false);
    }
  };

  const pickSearchResult = (r) => {
    setPoint({ lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
    // Auto-fill English label from the short display_name if not already set
    if (!locationLabel && r.display_name) {
      const shortName = r.display_name.split(',').slice(0, 2).join(',').trim();
      setLocationLabel(shortName);
      if (onLabelChange) onLabelChange(shortName);
    }
    setSearchResults([]);
  };

  const handleConfirm = async () => {
    const lat = Number(point?.lat);
    // Leaflet allows panning past ±180°; wrap it back into range.
    const lng = ((Number(point?.lng) + 180) % 360 + 360) % 360 - 180;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error('مختصات نامعتبر است — دوباره روی نقشه انتخاب کن');
      return;
    }
    const fallbackUrl = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    setSaving(true);
    try {
      const res = await axios.post(`${API_URL}/admin/location-snapshot`, { lat, lng }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60000,
      });
      if (res.data?.report_location_image) {
        toast.success('لوکیشن و تصویر نقشه ثبت شد');
      } else {
        toast.warn('لوکیشن ثبت شد ولی تصویر نقشه ساخته نشد — بعداً دوباره «تایید» را بزن');
      }
      onConfirm({
        report_location: res.data?.report_location || fallbackUrl,
        report_location_image: res.data?.report_location_image || '',
        location_label: locationLabel,
      });
    } catch (err) {
      console.error('location-snapshot failed:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        toast.error('نشست شما منقضی شده — دوباره وارد پنل شوید');
        return;
      }
      // Network hiccup/timeout — still keep the pinned point so it isn't lost.
      toast.warn('لوکیشن ثبت شد ولی تصویر نقشه ساخته نشد (اتصال به سرور) — بعداً دوباره امتحان کن');
      onConfirm({ report_location: fallbackUrl, report_location_image: '', location_label: locationLabel });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lpm-overlay" onClick={onClose}>
      <div className="lpm-card" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="lpm-header">
          <h3>انتخاب دقیق لوکیشن روی نقشه</h3>
          <button type="button" className="lpm-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div className="lpm-search-row">
            <input
              className="lpm-search-input"
              placeholder="جستجوی آدرس یا مکان..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), runSearch())}
            />
            <button type="button" className="lpm-search-btn" onClick={runSearch} disabled={searching}>
              {searching ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  ...
                </span>
              ) : 'جستجو'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="lpm-search-results">
              {searchResults.map((r, i) => (
                <button type="button" key={i} className="lpm-search-result" onClick={() => pickSearchResult(r)}>
                  📍 {r.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lpm-map-wrap">
          <MapContainer center={[point.lat, point.lng]} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FixMapSize />
            <ClickToPlace onPick={setPoint} />
            <FlyToPoint point={point} />
            <Marker position={[point.lat, point.lng]} icon={PIN_ICON} draggable eventHandlers={{
              dragend: (e) => {
                const ll = e.target.getLatLng();
                setPoint({ lat: ll.lat, lng: ll.lng });
              }
            }} />
          </MapContainer>
        </div>
        <p className="lpm-hint">روی نقشه کلیک کن یا پین را جابه‌جا کن تا مکان دقیق مشخص شود</p>

        {/* English location label for PDF output */}
        <div className="lpm-label-row">
          <label className="lpm-label-text">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginLeft: 5, verticalAlign: 'middle' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            نام لوکیشن به انگلیسی (برای PDF)
          </label>
          <input
            className="lpm-label-input"
            placeholder="e.g. Palladium Mall, Tehran — Floor 2"
            value={locationLabel}
            onChange={e => {
              setLocationLabel(e.target.value);
              if (onLabelChange) onLabelChange(e.target.value);
            }}
            dir="ltr"
          />
          <p className="lpm-label-hint">این متن در بخش EXACT LOCATION فایل PDF نمایش داده می‌شود</p>
        </div>

        <div className="lpm-actions">
          <button type="button" className="lpm-cancel-btn" onClick={onClose}>انصراف</button>
          <button type="button" className="lpm-confirm-btn" onClick={handleConfirm} disabled={saving}>
            {saving ? 'در حال ساخت تصویر...' : 'تایید و ذخیره'}
          </button>
        </div>
      </div>
    </div>
  );
}
