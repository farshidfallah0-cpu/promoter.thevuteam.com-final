import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import './promoters.css';
import { RosterPickerModal } from '../../components/RosterPickerModal';
import { EventCalendarBar } from '../../components/EventCalendarBar';
import { roleLabel, parseDailyRoles, explicitDays, composeDays } from '../../utils/roleHelpers';
import { Camera } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const DefaultAvatarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: '50%', height: '50%', color: 'white', opacity: 0.9 }}>
    <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
  </svg>
);

// ── Persian date converter (Jalali) ──────────────────────
function toJalali(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTimeFa(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}

async function fetchPlaceName(lat, lon) {
  if (!lat || !lon) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=fa`,
      { headers: { 'User-Agent': 'PromoterAdminApp/1.0' } }
    );
    const data = await res.json();
    const a = data.address || {};
    return a.shop || a.amenity || a.building || a.road || a.neighbourhood ||
           a.suburb || a.city_district || a.city || a.town || a.village ||
           data.display_name?.split(',')[0] || null;
  } catch { return null; }
}

// readOnly = the client's own account: sees the team, cannot add, edit, delete or share login links.
export const PromotersTab = ({ users, token, eventSlug, eventId, selectedEvent, refreshUsers, readOnly = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editingPromoter, setEditingPromoter] = useState(null);
  // The day group whose card was opened (null = opened from a view with no day) — deleting from there only removes that day.
  const [selectedDay, setSelectedDay] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'attendance'
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [uploadingAvatarId, setUploadingAvatarId] = useState(null);

  // Set or replace a promoter's photo. The backend keeps the archive entry and
  // this person's other event rows on the same photo.
  const handleAvatarUpload = async (u, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAvatarId(u.id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const up = await axios.post(`${API_URL}/upload/image`, fd, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      await axios.put(`${API_URL}/admin/promoters/${u.id}`, { profile_picture: up.data.url }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedUser(prev => (prev && prev.id === u.id ? { ...prev, profile_picture: up.data.url } : prev));
      refreshUsers();
      toast.success('عکس پروموتر به‌روزرسانی شد');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطا در آپلود عکس');
    } finally {
      setUploadingAvatarId(null);
    }
  };

  const AvatarUpload = ({ u }) => (readOnly ? null : (
    <label className="avatar-upload-btn" title="تغییر / افزودن عکس" onClick={e => e.stopPropagation()}>
      {uploadingAvatarId === u.id ? <span className="avatar-upload-spinner" /> : <Camera size={14} strokeWidth={2.5} />}
      <input type="file" accept="image/*" onChange={e => handleAvatarUpload(u, e)} />
    </label>
  ));
  
  useEffect(() => {
    if (viewMode === 'attendance') {
      fetchAttendance();
    }
  }, [viewMode]);

  const fetchAttendance = async () => {
    setIsLoadingAttendance(true);
    try {
      const res = await axios.get(`${API_URL}/admin/attendance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const raw = res.data;
      // Enrich with place names (parallel requests, max 3 at a time to avoid rate limiting)
      const enriched = await Promise.all(
        raw.map(async (log) => {
          const [inPlace, outPlace] = await Promise.all([
            fetchPlaceName(log.clock_in_lat, log.clock_in_lon),
            fetchPlaceName(log.clock_out_lat, log.clock_out_lon),
          ]);
          return { ...log, in_place_name: inPlace, out_place_name: outPlace };
        })
      );
      setAttendanceLogs(enriched);
    } catch (err) {
      console.error(err);
      toast.error('خطا در دریافت لیست ورود و خروج');
    } finally {
      setIsLoadingAttendance(false);
    }
  };

  useEffect(() => {
    if (selectedUser) setShowPassword(false);
  }, [selectedUser]);

  const filteredUsers = users.filter(u =>
    !u.is_admin &&
    (u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.team_name?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const onlineCount = filteredUsers.filter(u => isOnline(u.last_seen)).length;


  function getMainRole(u) {
    const dates = (u.assigned_dates || '').split(',').map(x => x.trim()).filter(Boolean);
    const dailyRoles = parseDailyRoles(u.daily_roles);

    if (dates.length > 0) {
      let matchedRole = null;
      for (const k in dailyRoles) {
        if (k.trim() === dates[0]) {
          matchedRole = dailyRoles[k];
          break;
        }
      }
      if (matchedRole) return matchedRole;
    }
    return u.role || 'promoter';
  }

  const eventDaysList = React.useMemo(() => {
    if (!selectedEvent?.start_date) return [];
    return selectedEvent.start_date.split(',').map(s => s.trim()).filter(Boolean);
  }, [selectedEvent?.start_date]);

  // Headcount per role, counted per assigned SHIFT (one promoter working 3
  // days of the event fills 3 of the "promoter_count" target slots, not 1) —
  // promoter_count/etc. on the event represent total promoter-days needed,
  // not distinct headcount, so this intentionally counts once per assigned date.
  //
  // This must match the day-grouped list below exactly, or the header number
  // and "who's actually on which day" view silently disagree. The bug that was
  // here: a promoter added WITHOUT explicit per-day checkboxes (empty
  // assigned_dates — meaning "here for the whole event") was counted ONCE no
  // matter how many days the event spanned, while the day-grouped list below
  // (correctly) shows that same promoter under every single day. For a 1-day
  // event that's the same number either way, so it looked fine — for a big
  // multi-day event with several promoters added that way, the header fell
  // further and further behind the real day-by-day coverage. Fixed by counting
  // them once per event day here too, exactly like the grouped list already did.
  let promoterUsersCount = 0;
  let supervisorUsersCount = 0;
  let setupUsersCount = 0;
  let collectionUsersCount = 0;
  let transportUsersCount = 0;

  const bumpRoleCount = (r) => {
    if (r === 'promoter') promoterUsersCount++;
    else if (r === 'supervisor') supervisorUsersCount++;
    else if (r === 'setup') setupUsersCount++;
    else if (r === 'collection') collectionUsersCount++;
    else if (r === 'transport') transportUsersCount++;
  };

  users.forEach(u => {
    if (u.is_admin) return;
    const dailyRoles = parseDailyRoles(u.daily_roles);
    const dates = (u.assigned_dates || '').split(',').map(x => x.trim()).filter(Boolean);
    if (dates.length === 0) {
      const r = u.role || 'promoter';
      const shiftCount = eventDaysList.length > 0 ? eventDaysList.length : 1;
      for (let i = 0; i < shiftCount; i++) bumpRoleCount(r);
    } else {
      dates.forEach(d => {
        let matchedRole = null;
        for (const k in dailyRoles) {
          if (k.trim() === d.trim()) {
            matchedRole = dailyRoles[k];
            break;
          }
        }
        bumpRoleCount(matchedRole || u.role || 'promoter');
      });
    }
  });


  // Needed counts from selectedEvent
  const promoterNeeded = selectedEvent?.promoter_count ?? selectedEvent?.promoters_needed ?? 0;
  const supervisorNeeded = selectedEvent?.supervisor_count ?? 0;
  const setupNeeded = selectedEvent?.setup_count ?? 0;
  const collectionNeeded = selectedEvent?.collection_count ?? 0;
  const transportNeeded = selectedEvent?.transport_count ?? 0;

  const requiresSupervisor = selectedEvent?.requires_supervisor || supervisorNeeded > 0;
  const requiresSetup = selectedEvent?.requires_setup || setupNeeded > 0;
  const requiresCollection = selectedEvent?.requires_collection || collectionNeeded > 0;
  const requiresTransport = selectedEvent?.requires_transport || transportNeeded > 0;

  const handleDelete = async (id, name, confirmed = false) => {
    if (!confirmed && !window.confirm(`آیا از حذف پروموتر "${name}" مطمئن هستید؟`)) return;
    try {
      await axios.delete(`${API_URL}/admin/promoters/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('پروموتر حذف شد');
      refreshUsers();
      setSelectedUser(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطا در حذف');
    }
  };

  // Remove the person from ONE day of the event; every other day (and its role) stays as it is.
  // The last remaining day can't be left empty (an empty list means «the whole event»), so that deletes the person instead.
  const handleRemoveFromDay = async (u, day) => {
    const ex = explicitDays(u, eventDaysList);
    delete ex.days[day];
    const c = composeDays(ex, eventDaysList);
    const name = u.full_name || u.username;
    if (c.count === 0) {
      if (!window.confirm(`«${day}» آخرین روز «${name}» است؛ با حذف آن، پروموتر به‌طور کامل از ایونت حذف می‌شود. ادامه می‌دهید؟`)) return;
      return handleDelete(u.id, name, true);
    }
    if (!window.confirm(`«${name}» فقط از روز ${day} حذف شود؟ روزهای دیگرش تغییری نمی‌کند.`)) return;
    try {
      await axios.put(`${API_URL}/admin/promoters/${u.id}`, {
        assigned_dates: c.assigned_dates,
        role: c.role,
        daily_roles: JSON.stringify(c.daily_roles),
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`از روز ${day} حذف شد`);
      refreshUsers();
      setSelectedUser(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطا در حذف از این روز');
    }
  };

  const handleShare = (u) => {
    // The promoter-facing site is a separate domain from wherever this admin
    // panel happens to be hosted, so it can't be derived from window.location.
    const siteUrl = 'https://promoter.thevuteam.com';
    const pwd = u.plain_password ? u.plain_password : '[رمز عبور تنظیم شده]';
    const shareText = `🎟 اطلاعات ورود به سیستم\n\nلینک ورود: ${siteUrl}/${eventSlug}\nنام کاربری: ${u.username}\nرمز عبور: ${pwd}`;
    if (navigator.share) {
      navigator.share({ title: 'اطلاعات ورود پروموتر', text: shareText })
        .catch((err) => { if (err?.name !== 'AbortError') toast.error('خطا در اشتراک‌گذاری'); });
      return;
    }
    navigator.clipboard.writeText(shareText).then(() => {
      toast.success('اطلاعات ورود کپی شد!');
    }).catch(() => toast.error('خطا در کپی'));
  };

  function isOnline(lastSeen) {
    if (!lastSeen) return false;
    // Backend stores UTC without 'Z' — append it so JS parses correctly
    const utcDate = lastSeen.endsWith('Z') ? lastSeen : lastSeen + 'Z';
    return (new Date() - new Date(utcDate)) / 1000 / 60 < 5;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return 'هرگز';
    // Backend stores UTC without 'Z' — append it so JS parses correctly
    const utcDate = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const diff = (new Date() - new Date(utcDate)) / 1000 / 60;
    if (diff < 1) return 'همین الان';
    if (diff < 60) return `${Math.floor(diff)} دقیقه پیش`;
    if (diff < 1440) return `${Math.floor(diff / 60)} ساعت پیش`;
    return `${Math.floor(diff / 1440)} روز پیش`;
  }

  // No longer needed, using SVG instead of initials
  // function getInitials(u) {
  //   const name = u.full_name || u.username || '?';
  //   return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  // }

  function getAvatarColor(username) {
    const colors = [
      ['#6366f1','#8b5cf6'], ['#f59e0b','#ef4444'], ['#10b981','#06b6d4'],
      ['#f97316','#ec4899'], ['#3b82f6','#6366f1']
    ];
    const idx = (username || '').charCodeAt(0) % colors.length;
    return colors[idx];
  }

  const groupedUsersByDay = React.useMemo(() => {
    if (eventDaysList.length === 0) {
      return [{
        label: 'همه روزها',
        users: filteredUsers.map(u => ({ ...u, currentRole: u.role || 'promoter' }))
      }];
    }

    const groups = eventDaysList.map(d => ({ date: d, users: [] }));
    
    filteredUsers.forEach(u => {
      const dates = (u.assigned_dates || '').split(',').map(x => x.trim()).filter(Boolean);
      const dailyRoles = parseDailyRoles(u.daily_roles);
      
      if (dates.length === 0) {
        groups.forEach(g => {
          const r = u.role || 'promoter';
          if (r !== 'setup' && r !== 'collection') {
            g.users.push({ ...u, currentRole: r });
          }
        });
      } else {
        dates.forEach(d => {
          const group = groups.find(g => g.date === d);
          if (group) {
             let matchedRole = null;
             for (const k in dailyRoles) {
               if (k.trim() === d) { matchedRole = dailyRoles[k]; break; }
             }
             const r = matchedRole || u.role || 'promoter';
             if (r !== 'setup' && r !== 'collection') {
               group.users.push({ ...u, currentRole: r });
             }
          }
        });
      }
    });

    return groups.map((g, i) => ({
      label: `روز ${i + 1} (${g.date})`,
      date: g.date,
      users: g.users
    }));
  }, [filteredUsers, eventDaysList]);

  return (
    <div className="promoters-tab-container">
      {/* ===== EXECUTIVE CALENDAR BAR ===== */}
      <EventCalendarBar selectedEvent={selectedEvent} />

      {/* ===== HEADER TOOLBAR ===== */}
      <div className="promoters-toolbar">
        <div className="promoters-stats">
          {/* Promoters Ratio */}
          <div className="pstat">
            <span className="pstat-num">
              {promoterUsersCount}{promoterNeeded > 0 ? `/${promoterNeeded}` : ''}
            </span>
            <span className="pstat-label">پروموتر</span>
          </div>

          {/* Supervisor badge */}
          {requiresSupervisor && (
            <>
              <div className="pstat-divider" />
              <div className="pstat">
                <span className="pstat-num" style={{ color: '#818cf8' }}>
                  {supervisorUsersCount}/{supervisorNeeded}
                </span>
                <span className="pstat-label">کاپیتان</span>
              </div>
            </>
          )}


        </div>
        <div className="promoters-toolbar-right">
          <div className="admin-search-bar" style={{ margin: 0 }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input type="text" placeholder="جستجو..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>

          {!readOnly && (
            <button
              className="admin-btn-primary"
              style={{ padding: '10px 24px', borderRadius: '8px', minHeight: '46px', fontWeight: '600', letterSpacing: '0.5px' }}
              onClick={() => setShowPickerModal(true)}
            >
              + افزودن پروموتر
            </button>
          )}
        </div>
      </div>

      {/* ===== ADD-FROM-ROSTER MODAL ===== */}
      {!readOnly && showPickerModal && (
        <RosterPickerModal
          token={token}
          eventId={eventId}
          selectedEvent={selectedEvent}
          existingUsers={users}
          onClose={() => setShowPickerModal(false)}
          onAdded={refreshUsers}
        />
      )}

      {/* ===== PROMOTERS GRID (Grouped By Day) ===== */}
      <div className="promoters-days-container fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px', width: '100%' }}>
        {groupedUsersByDay.map((group, gIdx) => (
          <div key={gIdx} className="promoter-day-group">
            <div className="promoter-day-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(39,39,42,0.5)', padding: '12px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" style={{ color: '#8b5cf6' }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {group.label}
              </h3>
              <div className="day-stats" style={{ display: 'flex', gap: '12px' }}>
                {['supervisor', 'promoter'].map(r => {
                  const c = group.users.filter(u => u.currentRole === r).length;
                  if (c === 0) return null;
                  return <span key={r} style={{ fontSize: '12px', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', color: '#e2e8f0' }}>{c} {roleLabel(r)}</span>
                })}
                <span style={{ fontSize: '12px', background: 'var(--primary-color)', color: 'white', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold' }}>{group.users.length} کل</span>
              </div>
            </div>
            <div className="promoters-grid">
              {group.users.length === 0 ? (
                <div className="promoters-empty" style={{ gridColumn: '1 / -1', minHeight: '150px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="48" height="48" style={{ opacity: 0.5 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  <p>پروموتری برای این روز یافت نشد</p>
                </div>
              ) : group.users.map(u => {
                const online = isOnline(u.last_seen);
                const isCaptain = u.currentRole === 'supervisor';
                const [c1, c2] = getAvatarColor(u.username);
                return (
                  <div key={u.id} className={`promoter-card${online ? ' card-online' : ''}${isCaptain ? ' card-captain' : ''}`} onClick={() => { setSelectedUser(u); setSelectedDay(group.date || null); }}>
                    {/* Top accent bar for online */}
                    {online && <div className="card-online-bar" />}

                    <div className="pc-top">
                      {/* Avatar */}
                      <div className="pc-avatar-holder">
                        <div className="pc-avatar" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {u.profile_picture
                              ? <img src={u.profile_picture} alt="" />
                              : <DefaultAvatarIcon />
                            }
                        </div>
                        {AvatarUpload({ u })}
                      </div>

                      {/* Name & username */}
                      <div className="pc-name-block">
                        <h3 className="pc-name">{u.full_name || u.username}</h3>
                        <span className="pc-username">@{u.username}</span>
                      </div>

                      {/* Status badge */}
                      <span className={`status-badge${online ? ' online' : ''}`}>
                        <span className={`badge-dot${online ? ' online' : ''}`} />
                        {online ? 'آنلاین' : 'آفلاین'}
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="pc-divider" />

                    {/* Info rows */}
                    <div className="pc-info-rows">
                      <div className="pc-info-row">
                        <span className="pc-info-icon">{isCaptain ? '🎖️' : '👤'}</span>
                        <span className="pc-info-label">نقش:</span>
                        <span className={`pc-info-val${isCaptain ? ' captain-role-val' : ''}`}>{roleLabel(u.currentRole)}</span>
                      </div>
                      {u.assigned_dates && (
                        <div className="pc-info-row" style={{ marginTop: 4 }}>
                          <span className="pc-info-icon">📅</span>
                          <span className="pc-info-label">حضور:</span>
                          <span className="pc-info-val" style={{ fontSize: '10px' }}>
                            {u.assigned_dates.split(',').length} روز
                          </span>
                        </div>
                      )}
                      {u.phone_number && (
                        <div className="pc-info-row">
                          <span className="pc-info-icon">📞</span>
                          <span className="pc-info-label">تماس:</span>
                          <span className="pc-info-val">{u.phone_number}</span>
                        </div>
                      )}
                      <div className="pc-info-row">
                        <span className="pc-info-icon">🕒</span>
                        <span className="pc-info-label">آخرین بازدید:</span>
                        <span className={`pc-info-val${online ? ' text-success' : ''}`}>
                          {online ? 'همین الان' : timeAgo(u.last_seen)}
                        </span>
                      </div>
                    </div>

                    {/* Footer action hint */}
                    <div className="pc-footer">
                      <span>مشاهده جزئیات</span>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="14" height="14">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ===== DETAIL MODAL ===== */}
      {selectedUser && (
        <div className="modal-overlay fade-in" onClick={e => { if (e.target === e.currentTarget) setSelectedUser(null); }}>
          <div className="promoter-modal">
            {/* Modal Header */}
            <div className="modal-header-bar">
              <div className="modal-avatar-section">
                {(() => {
                  const [c1, c2] = getAvatarColor(selectedUser.username);
                  const online = isOnline(selectedUser.last_seen);
                  return (
                    <div className="modal-avatar" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedUser.profile_picture
                        ? <img src={selectedUser.profile_picture} alt="" />
                        : <DefaultAvatarIcon />
                      }
                      <div className={`status-dot large${online ? ' online' : ''}`} />
                      {AvatarUpload({ u: selectedUser })}
                    </div>
                  );
                })()}
                <div>
                  <h2 className="modal-title">{selectedUser.full_name || selectedUser.username}</h2>
                  <div className="modal-subtitle">@{selectedUser.username}</div>
                  <span className={`status-badge${isOnline(selectedUser.last_seen) ? ' online' : ''}`} style={{ marginTop: 6, display: 'inline-block' }}>
                    {isOnline(selectedUser.last_seen) ? '🟢 آنلاین' : '⚫ آفلاین'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {!readOnly && (
                <button className="modal-icon-btn edit" onClick={() => { setEditingPromoter(selectedUser); setSelectedUser(null); }} title="ویرایش">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                </button>
                )}
                <button className="modal-icon-btn" onClick={() => setSelectedUser(null)} title="بستن">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {(() => {
              const dailyRoles = parseDailyRoles(selectedUser.daily_roles);
              const exDays = explicitDays(selectedUser, eventDaysList);
              const dayEntries = [...Object.entries(exDays.days), ...exDays.extraDates.map(d => [d, dailyRoles[d]])];
              const dates = dayEntries.map(([d]) => d);
              return (
                <div className="modal-body">
                  <div className="modal-info-grid">
                    {dates.length > 0 ? (
                      <div className="modal-info-item full-width">
                        <span className="modal-info-label">نقش در هر روز</span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                          {dates.map((d, idx) => (
                            <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', color: '#c7d2fe' }}>
                              <span>{d}</span>
                              <span style={{ opacity: 0.5 }}>·</span>
                              <span style={{ fontWeight: 600 }}>{roleLabel(dayEntries[idx][1])}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="modal-info-item">
                        <span className="modal-info-label">نقش</span>
                        <span className="modal-info-value">{roleLabel(selectedUser.role)}</span>
                      </div>
                    )}
                  <div className="modal-info-item">
                    <span className="modal-info-label">شماره تماس</span>
                    <span className="modal-info-value">{selectedUser.phone_number || '—'}</span>
                  </div>
                  <div className="modal-info-item">
                    <span className="modal-info-label">آخرین بازدید</span>
                    <span className="modal-info-value">{timeAgo(selectedUser.last_seen)}</span>
                  </div>
                  <div className="modal-info-item">
                    <span className="modal-info-label">آخرین لوکیشن</span>
                    <span className="modal-info-value">{timeAgo(selectedUser.last_location_time)}</span>
                  </div>
                  {!readOnly && (
                  <div className="modal-info-item full-width">
                    <span className="modal-info-label">رمز عبور (برای ادمین)</span>
                    <div className="password-display-row">
                      <span className="modal-info-value password-value">
                        {selectedUser.plain_password
                          ? (showPassword ? selectedUser.plain_password : '••••••••')
                          : '(تعیین نشده)'}
                      </span>
                      {selectedUser.plain_password && (
                        <button className="password-toggle-btn inline" onClick={() => setShowPassword(!showPassword)} title={showPassword ? 'پنهان کردن' : 'نمایش'}>
                          {showPassword
                            ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                            : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          }
                        </button>
                      )}
                    </div>
                  </div>
                  )}
                </div>

                {!readOnly && (
                <div className="modal-actions">
                  <button className="admin-btn-primary" onClick={() => handleShare(selectedUser)}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="17" height="17"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" /></svg>
                    ارسال لینک ورود
                  </button>
                  {selectedDay && explicitDays(selectedUser, eventDaysList).days[selectedDay] && (
                    <button className="admin-btn-danger" onClick={() => handleRemoveFromDay(selectedUser, selectedDay)}>
                      حذف فقط از این روز ({selectedDay})
                    </button>
                  )}
                  <button className="admin-btn-danger" onClick={() => handleDelete(selectedUser.id, selectedUser.full_name || selectedUser.username)}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="17" height="17"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    حذف کامل پروموتر (همه روزها)
                  </button>
                </div>
                )}
              </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ===== EDIT MODAL (reuses the add-promoter modal) ===== */}
      {!readOnly && editingPromoter && (
        <RosterPickerModal
          token={token}
          eventId={eventId}
          selectedEvent={selectedEvent}
          editingPromoter={editingPromoter}
          onClose={() => setEditingPromoter(null)}
          onUpdated={() => { refreshUsers(); setEditingPromoter(null); }}
        />
      )}
    </div>
  );
};
