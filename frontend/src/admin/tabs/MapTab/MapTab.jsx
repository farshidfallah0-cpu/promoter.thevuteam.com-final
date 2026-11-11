import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import { EventCalendarBar } from '../../components/EventCalendarBar';
import { BVT_PRODUCTS, parseLatLngFromMapsUrl } from '../../../components/BVTCigaretteMatch/cigaretteDatabase';

// A promoter can hand out several cigarettes while standing more or less in
// the same spot (a stand, a shop entrance) — their GPS fixes end up only a
// few meters apart, which makes plain markers overlap into one unclickable
// blob. Great-circle distance (haversine) between two points, in meters.
const distanceMeters = (a, b) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// Greedy single-linkage clustering: anything within `radiusMeters` of a
// cluster's seed point joins it. Good enough at the scale of one promoter's
// day (a handful to a few dozen points) — no need for a full clustering lib.
const CLUSTER_RADIUS_METERS = 20;
const clusterBvtPoints = (points, radiusMeters = CLUSTER_RADIUS_METERS) => {
  const used = new Array(points.length).fill(false);
  const clusters = [];
  for (let i = 0; i < points.length; i++) {
    if (used[i]) continue;
    const group = [points[i]];
    used[i] = true;
    for (let j = i + 1; j < points.length; j++) {
      if (used[j]) continue;
      if (distanceMeters(points[i], points[j]) <= radiusMeters) {
        group.push(points[j]);
        used[j] = true;
      }
    }
    clusters.push({
      lat: group.reduce((s, p) => s + p.lat, 0) / group.length,
      lng: group.reduce((s, p) => s + p.lng, 0) / group.length,
      minTime: Math.min(...group.map(p => p.time || 0)),
      points: group,
    });
  }
  return clusters.sort((a, b) => a.minTime - b.minTime);
};

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MapController = ({ selectedPromoter }) => {
  const map = useMap();
  useEffect(() => {
    if (selectedPromoter && selectedPromoter.lat && selectedPromoter.lng) {
      map.flyTo([selectedPromoter.lat, selectedPromoter.lng], 14, { animate: true, duration: 1.5 });
    }
  }, [selectedPromoter, map]);
  return null;
};

// Flies to a single deep-linked point (from a Reports BVT row) and pops its
// detail open automatically — a fresh object reference from Reports re-fires
// this every time, even for the same coordinates clicked twice in a row.
const FocusPointController = ({ focusTarget }) => {
  const map = useMap();
  const markerRef = useRef(null);
  useEffect(() => {
    if (!focusTarget) return;
    map.flyTo([focusTarget.lat, focusTarget.lng], 16, { animate: true, duration: 1.5 });
    const t = setTimeout(() => markerRef.current?.openPopup(), 900);
    return () => clearTimeout(t);
  }, [focusTarget, map]);

  if (!focusTarget) return null;

  return (
    <Marker
      ref={markerRef}
      position={[focusTarget.lat, focusTarget.lng]}
      icon={L.divIcon({
        className: 'custom-marker',
        html: `<div class="bvt-focus-marker"><div class="bvt-focus-ring"></div><span>🚬</span></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -19],
      })}
    >
      <Popup className="custom-popup">
        <div className="popup-content" style={{ fontFamily: '"Vazirmatn", Tahoma, sans-serif' }}>
          <div className="popup-header">
            <div className="popup-info">
              <strong>{focusTarget.targetName} ← {focusTarget.recommendedName}</strong>
              {focusTarget.manual && <span className="popup-team">ثبت دستی</span>}
            </div>
          </div>
          <div className="popup-details">
            <div className="popup-detail-row">
              <span className="detail-icon">🙋</span>
              <span>{focusTarget.promoterName || 'نامشخص'}</span>
            </div>
            <div className="popup-detail-row">
              <span className="detail-icon">🕐</span>
              <span>
                {focusTarget.time ? new Date(focusTarget.time).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit', year: 'numeric', month: 'long', day: 'numeric' }) : 'نامشخص'}
              </span>
            </div>
            <div className="popup-detail-row">
              <span className="detail-icon">📍</span>
              <span style={{ fontSize: '11px', lineHeight: '1.4' }}>{focusTarget.lat.toFixed(5)}, {focusTarget.lng.toFixed(5)}</span>
            </div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
};

export const MapTab = ({ users, promoterLocations, selectedEvent, submissions = [], focusTarget }) => {
  const [selectedPromoter, setSelectedPromoter] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [addressCache, setAddressCache] = useState({});

  // BVT cigarette-match distribution points — only meaningful when the event
  // actually uses that field. Each submission row is one promoter/day and
  // already carries that promoter's full day's dispense log in one array.
  const bvtField = selectedEvent?.fields?.find(f => f.type === 'bvt_cigarette_match');
  const bvtPointsByPromoter = useMemo(() => {
    if (!bvtField) return {};
    const byPromoter = {};
    submissions.forEach(s => {
      const hist = s.data?.[`${bvtField.id}_history`] || [];
      hist.forEach(h => {
        const coords = parseLatLngFromMapsUrl(h.location);
        if (!coords) return;
        if (!byPromoter[s.promoter_id]) byPromoter[s.promoter_id] = [];
        byPromoter[s.promoter_id].push({ ...h, ...coords, promoterName: s.promoter_name });
      });
    });
    Object.values(byPromoter).forEach(list => list.sort((a, b) => (a.time || 0) - (b.time || 0)));
    return byPromoter;
  }, [submissions, bvtField]);

  const createBvtIcon = () => L.divIcon({
    className: 'custom-marker',
    html: `<div class="bvt-point-marker">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 12H2M22 12v.01M2 12a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4M2 12a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4"/>
        <path d="M7 16v4M11 16v4"/>
        <path d="M18 8V4M14 8V4"/>
      </svg>
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });

  const createBvtClusterIcon = (count) => L.divIcon({
    className: 'custom-marker',
    html: `<div class="bvt-cluster-marker">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 12H2M22 12v.01M2 12a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4M2 12a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4"/>
      </svg>
      <span>${count}</span>
    </div>`,
    iconSize: [44, 22],
    iconAnchor: [22, 11],
    popupAnchor: [0, -13],
  });

  const displayClusters = useMemo(() => {
    if (selectedPromoter) {
      return clusterBvtPoints(bvtPointsByPromoter[selectedPromoter.id] || []);
    }
    const allPoints = [];
    Object.values(bvtPointsByPromoter).forEach(pts => allPoints.push(...pts));
    return clusterBvtPoints(allPoints);
  }, [selectedPromoter, bvtPointsByPromoter]);

  const fetchAddressIfMissing = (lat, lng) => {
    const key = `${lat},${lng}`;
    if (addressCache[key]) return;
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fa`)
      .then(res => res.json())
      .then(data => {
        if (data && data.display_name) {
          setAddressCache(prev => ({ ...prev, [key]: data.display_name }));
        }
      })
      .catch(e => console.error('Geocoding error', e));
  };

  useEffect(() => {
    if (selectedPromoter && selectedPromoter.lat && selectedPromoter.lng) {
      fetchAddressIfMissing(selectedPromoter.lat, selectedPromoter.lng);
    }
  }, [selectedPromoter]);

  
  const iranCenter = [32.4279, 53.6880];

  const formatLastSeen = (updatedAt) => {
    if (!updatedAt) return 'نامشخص';
    const utcDate = updatedAt.endsWith('Z') ? updatedAt : updatedAt + 'Z';
    const lastUpdate = new Date(utcDate);
    const now = new Date();
    const diffMinutes = Math.floor((now - lastUpdate) / (1000 * 60));
    if (diffMinutes < 1) return 'همین الان';
    if (diffMinutes < 60) return `${diffMinutes} دقیقه پیش`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} ساعت پیش`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} روز پیش`;
  };
  
  const promotersWithLocation = users?.filter(p => !p.is_admin).map(p => {
    const location = promoterLocations?.find(loc => loc.id === p.id);
    
    let status = 'offline';
    if (location?.last_seen) {
        const utcDate = location.last_seen.endsWith('Z') ? location.last_seen : location.last_seen + 'Z';
        const diffMin = (new Date() - new Date(utcDate)) / 60000;
        if (diffMin < 5) status = 'online';
        else if (diffMin < 30) status = 'away';
    }
    
    return {
      ...p,
      lat: location?.last_latitude || null,
      lng: location?.last_longitude || null,
      lastSeen: location?.last_seen || null,
      history: location?.history || [],
      status: status
    };
  }).filter(p => p.lat && p.lng) || [];
  
  const filteredPromotersMap = filterStatus === 'all' 
    ? promotersWithLocation 
    : promotersWithLocation.filter(p => p.status === filterStatus);
  
  const statusCounts = {
    online: promotersWithLocation.filter(p => p.status === 'online').length,
    away: promotersWithLocation.filter(p => p.status === 'away').length,
    offline: promotersWithLocation.filter(p => p.status === 'offline').length,
    total: promotersWithLocation.length
  };

  const createCustomIcon = (status, isSelected) => {
    return L.divIcon({
      className: 'custom-marker',
      html: `
        <div class="marker-container ${status} ${isSelected ? 'selected' : ''}">
          <div class="marker-dot-inner"></div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20]
    });
  };

  return (
    <div className="live-map-container">
      <EventCalendarBar selectedEvent={selectedEvent} />
      <div className="map-section-header">
        <div className="map-title-area">
          <h3>🗺️ موقعیت زنده پروموترها</h3>
          <p>
            نمایش لحظه‌ای موقعیت تیم فروش در سراسر ایران
            {bvtField && ' — روی یک پروموتر بزن تا مسیر توزیع سیگارهاش رو هم ببینی'}
          </p>
        </div>
        
        <div className="map-stats-bar">
          <div className={`stat-chip online ${filterStatus === 'online' ? 'active' : ''}`} onClick={() => setFilterStatus(filterStatus === 'online' ? 'all' : 'online')}>
            <span className="chip-dot"></span>
            <span className="chip-count">{statusCounts.online}</span>
            <span className="chip-label">آنلاین</span>
          </div>
          <div className={`stat-chip away ${filterStatus === 'away' ? 'active' : ''}`} onClick={() => setFilterStatus(filterStatus === 'away' ? 'all' : 'away')}>
            <span className="chip-dot"></span>
            <span className="chip-count">{statusCounts.away}</span>
            <span className="chip-label">غیرفعال</span>
          </div>
          <div className={`stat-chip offline ${filterStatus === 'offline' ? 'active' : ''}`} onClick={() => setFilterStatus(filterStatus === 'offline' ? 'all' : 'offline')}>
            <span className="chip-dot"></span>
            <span className="chip-count">{statusCounts.offline}</span>
            <span className="chip-label">آفلاین</span>
          </div>
        </div>
      </div>

      <div className="map-wrapper">
        <MapContainer 
          center={iranCenter} 
          zoom={5} 
          style={{ height: '600px', width: '100%', borderRadius: '16px' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; Google Maps'
            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
          />
          <MapController selectedPromoter={selectedPromoter} />
          <FocusPointController focusTarget={focusTarget} />

          {filteredPromotersMap.map((promoter) => {
            const isSelected = selectedPromoter?.id === promoter.id;
            return (
              <React.Fragment key={promoter.id}>
                {/* Trail History */}
                {promoter.history && promoter.history.length > 1 && (
                  <Polyline 
                    positions={promoter.history} 
                    pathOptions={{ 
                      color: promoter.status === 'online' ? '#10b981' : promoter.status === 'away' ? '#f59e0b' : '#6b7280', 
                      weight: isSelected ? 5 : 3,
                      opacity: isSelected ? 0.8 : 0.4,
                      dashArray: isSelected ? null : '5, 10',
                      lineCap: 'round'
                    }}
                  />
                )}
                
                {/* Current Position Marker */}
                <Marker
                  position={[promoter.lat, promoter.lng]}
                  icon={createCustomIcon(promoter.status, isSelected)}
                  eventHandlers={{
                    click: () => setSelectedPromoter(promoter)
                  }}
                >
                  <Popup className="custom-popup">
                    <div className="popup-content">
                      <div className="popup-header">
                        <div className="popup-avatar">
                          {promoter.profile_picture ? (
                            <img src={promoter.profile_picture} alt="" />
                          ) : (
                            <span>{promoter.full_name?.charAt(0) || '?'}</span>
                          )}
                          <span className={`popup-status-dot ${promoter.status}`}></span>
                        </div>
                        <div className="popup-info">
                          <strong>{promoter.full_name || promoter.username}</strong>
                          {promoter.team_name && <span className="popup-team">{promoter.team_name}</span>}
                        </div>
                      </div>
                      <div className="popup-details" style={{ fontFamily: '"Vazirmatn", Tahoma, sans-serif' }}>
                        <div className="popup-detail-row">
                          <span className="detail-icon">📍</span>
                          <span style={{ fontSize: '11px', lineHeight: '1.4' }}>
                            {addressCache[`${promoter.lat},${promoter.lng}`] || `${promoter.lat.toFixed(5)}, ${promoter.lng.toFixed(5)}`}
                          </span>
                        </div>
                        <div className="popup-detail-row">
                          <span className="detail-icon">🕐</span>
                          <span>{formatLastSeen(promoter.lastSeen)}</span>
                        </div>
                        <div className="popup-detail-row">
                          <span className="detail-icon">👣</span>
                          <span>مسیر امروز: {promoter.history?.length || 0} نقطه</span>
                        </div>
                        {bvtPointsByPromoter[promoter.id]?.length > 0 && (
                          <div className="popup-detail-row">
                            <span className="detail-icon">🚬</span>
                            <span>{bvtPointsByPromoter[promoter.id].length} توزیع سیگار — روی نقشه مشخص شده</span>
                          </div>
                        )}
                      </div>
                      <div className={`popup-status-badge ${promoter.status}`}>
                        {promoter.status === 'online' ? '● آنلاین - در حال حرکت' : promoter.status === 'away' ? '● غیرفعال' : '● آفلاین'}
                      </div>
                    </div>
                  </Popup>
                  
                  {promoter.status === 'online' && (
                    <Circle
                      center={[promoter.lat, promoter.lng]}
                      radius={200}
                      pathOptions={{
                        color: '#10b981',
                        fillColor: '#10b981',
                        fillOpacity: 0.2,
                        weight: 1
                      }}
                    />
                  )}
                </Marker>
              </React.Fragment>
            );
          })}

          {/* BVT distribution points — shown for all by default, or filtered to the selected promoter. */}
          {displayClusters.length > 0 && (
            <React.Fragment>
              {selectedPromoter && (
                <Polyline
                  positions={displayClusters.map(c => [c.lat, c.lng])}
                  pathOptions={{ color: '#ec4899', weight: 3, opacity: 0.7, dashArray: '2, 8', lineCap: 'round' }}
                />
              )}
              {displayClusters.map((cluster, idx) => {
                const single = cluster.points.length === 1 ? cluster.points[0] : null;
                return (
                  <Marker
                    key={single ? single.id : `cluster-${idx}`}
                    position={[cluster.lat, cluster.lng]}
                    icon={single ? createBvtIcon() : createBvtClusterIcon(cluster.points.length)}
                    eventHandlers={{ click: () => fetchAddressIfMissing(cluster.lat, cluster.lng) }}
                  >
                    <Popup className="custom-popup" maxWidth={280}>
                      <div className="popup-content" style={{ fontFamily: '"Vazirmatn", Tahoma, sans-serif' }}>
                        {single ? (
                          <>
                            <div className="popup-header">
                              <div className="popup-info">
                                <strong>{single.targetName} ← {single.recommendedName}</strong>
                                {single.manual && <span className="popup-team">ثبت دستی</span>}
                              </div>
                            </div>
                            <div className="popup-details">
                              <div className="popup-detail-row">
                                <span className="detail-icon">🙋</span>
                                <span>{single.promoterName || selectedPromoter.full_name || selectedPromoter.username}</span>
                              </div>
                              <div className="popup-detail-row">
                                <span className="detail-icon">🕐</span>
                                <span>
                                  {single.time ? new Date(single.time).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit', year: 'numeric', month: 'long', day: 'numeric' }) : 'نامشخص'}
                                </span>
                              </div>
                              <div className="popup-detail-row">
                                <span className="detail-icon">📍</span>
                                <span style={{ fontSize: '11px', lineHeight: '1.4' }}>
                                  {addressCache[`${cluster.lat},${cluster.lng}`] || `${cluster.lat.toFixed(5)}, ${cluster.lng.toFixed(5)}`}
                                </span>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="popup-header">
                              <div className="popup-info">
                                <strong>{cluster.points.length} توزیع در این نقطه</strong>
                                <span className="popup-team">
                                  {addressCache[`${cluster.lat},${cluster.lng}`] || `${cluster.lat.toFixed(5)}, ${cluster.lng.toFixed(5)}`}
                                </span>
                              </div>
                            </div>
                            <div className="bvt-cluster-list">
                              {[...cluster.points].sort((a, b) => (b.time || 0) - (a.time || 0)).map(h => (
                                <div key={h.id} className="bvt-cluster-row">
                                  <span className="bvt-cluster-row-main">
                                    {h.manual && <span className="bvt-cluster-manual-tag">دستی</span>}
                                    {h.targetName} ← {h.recommendedName}
                                  </span>
                                  <span className="bvt-cluster-row-time">
                                    {h.time ? new Date(h.time).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </React.Fragment>
          )}
        </MapContainer>
        
        <div className="map-overlay">
          <span>{filteredPromotersMap.length} پروموتر روی نقشه</span>
          <small>برای نمایش موقعیت، پروموترها باید GPS خود را فعال کنند</small>
        </div>
        
        <div className="map-info-overlay">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" className="text-emerald-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          <span>{statusCounts.total} پروموتر روی نقشه</span>
        </div>
      </div>

      <div className="promoters-list-section">
        <h4>📋 لیست پروموترها ({filteredPromotersMap.length})</h4>
        
        {filteredPromotersMap.length === 0 ? (
          <div className="empty-list">
            <Search size={48} className="text-gray-400 opacity-50" strokeWidth={1.5} />
            <p>پروموتری با این فیلتر یافت نشد</p>
          </div>
        ) : (
          <div className="promoters-grid">
            {filteredPromotersMap.map((promoter) => (
              <div 
                key={promoter.id} 
                className={`promoter-card ${promoter.status} ${selectedPromoter?.id === promoter.id ? 'selected' : ''}`}
                onClick={() => setSelectedPromoter(promoter)}
              >
                <div className="promoter-avatar">
                  {promoter.profile_picture ? (
                    <img src={promoter.profile_picture} alt="" />
                  ) : (
                    <span>{promoter.full_name?.charAt(0) || '?'}</span>
                  )}
                  <span className={`status-indicator ${promoter.status}`}></span>
                </div>
                
                <div className="promoter-info">
                  <span className="promoter-name">{promoter.full_name || promoter.username}</span>
                  {promoter.team_name && <span className="promoter-team">{promoter.team_name}</span>}
                </div>
                
                <div className="promoter-location">
                  <span className="location-city">
                    📍 {promoter.lat.toFixed(2)}°, {promoter.lng.toFixed(2)}°
                  </span>
                  <span className="location-time">{formatLastSeen(promoter.lastSeen)}</span>
                </div>
                
                <div className={`status-badge ${promoter.status}`}>
                  {promoter.status === 'online' ? 'آنلاین' : promoter.status === 'away' ? 'غیرفعال' : 'آفلاین'}
                </div>

                {bvtPointsByPromoter[promoter.id]?.length > 0 && (
                  <div className="bvt-count-badge">🚬 {bvtPointsByPromoter[promoter.id].length} توزیع</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
