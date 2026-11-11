import React, { useState, useMemo, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import '../PromotersTab/promoters.css';
import '../ReportsTab/reports.css';
import { RosterPickerModal } from '../../components/RosterPickerModal';
import { EventCalendarBar } from '../../components/EventCalendarBar';
import { roleLabel, parseDailyRoles, deriveBaseRole, getUserRoles } from '../../utils/roleHelpers';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const DefaultAvatarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: '50%', height: '50%', color: 'white', opacity: 0.9 }}>
    <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
  </svg>
);

function getAvatarColor(username) {
  const colors = [
    ['#6366f1','#8b5cf6'], ['#f59e0b','#ef4444'], ['#10b981','#06b6d4'],
    ['#f97316','#ec4899'], ['#3b82f6','#6366f1']
  ];
  const idx = (username || '').charCodeAt(0) % colors.length;
  return colors[idx];
}

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const utcDate = lastSeen.endsWith('Z') ? lastSeen : lastSeen + 'Z';
  return (new Date() - new Date(utcDate)) / 1000 / 60 < 5;
}

function timeAgo(dateStr) {
  if (!dateStr) return 'هرگز';
  const utcDate = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
  const diff = (new Date() - new Date(utcDate)) / 1000 / 60;
  if (diff < 1) return 'همین الان';
  if (diff < 60) return `${Math.floor(diff)} دقیقه پیش`;
  if (diff < 1440) return `${Math.floor(diff / 60)} ساعت پیش`;
  return `${Math.floor(diff / 1440)} روز پیش`;
}

export const SetupCollectionTab = ({ users, submissions, token, selectedEvent, refreshUsers }) => {
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [pickerRole, setPickerRole] = useState(null); // 'setup' or 'collection'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null); // which section's card was opened

  const setupNeeded = selectedEvent?.setup_count || 0;
  const collectionNeeded = selectedEvent?.collection_count || 0;
  // Same rule PromotersTab / the role picker use: an event that asks for a
  // headcount of setup/collection staff needs the section even if the
  // requires_* flag itself wasn't ticked (the collection button/section used
  // to vanish in that case, so collection staff couldn't be added at all).
  const requiresSetup = selectedEvent?.requires_setup || setupNeeded > 0;
  const requiresCollection = selectedEvent?.requires_collection || collectionNeeded > 0;

  // Filter users whose role (or daily_roles) is setup or collection
  const scUsers = useMemo(() => {
    return users.filter(u => {
      if (u.is_admin) return false;
      const dailyRoles = parseDailyRoles(u.daily_roles);
      const roles = Object.values(dailyRoles);
      if (roles.includes('setup') || roles.includes('collection')) return true;
      if (u.role === 'setup' || u.role === 'collection') return true;
      return false;
    });
  }, [users]);

  // Apply search filter
  const filteredScUsers = useMemo(() => {
    return scUsers.filter(u =>
      u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [scUsers, searchTerm]);

  // Group into setup vs collection — strict matching
  const groupedUsers = useMemo(() => {
    const setup = [];
    const collection = [];
    filteredScUsers.forEach(u => {
      const dailyRoles = parseDailyRoles(u.daily_roles);
      const roleValues = Object.values(dailyRoles);
      
      // Only add to setup if they have an explicit 'setup' daily role or base role is 'setup'
      const hasSetupRole = roleValues.includes('setup') || (roleValues.length === 0 && u.role === 'setup');
      const hasCollectionRole = roleValues.includes('collection') || (roleValues.length === 0 && u.role === 'collection');

      if (hasSetupRole) setup.push(u);
      if (hasCollectionRole) collection.push(u);
    });
    return { setup, collection };
  }, [filteredScUsers]);

  const scSubmissions = useMemo(() => {
    return submissions.filter(s => {
      const username = s.promoter_username;
      return groupedUsers.setup.some(u => u.username === username) || 
             groupedUsers.collection.some(u => u.username === username);
    });
  }, [submissions, groupedUsers]);

  const handleAddClick = (role) => {
    setPickerRole(role);
    setShowPickerModal(true);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`آیا از حذف "${name}" مطمئن هستید؟`)) return;
    try {
      await axios.delete(`${API_URL}/admin/promoters/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('نیرو حذف شد');
      refreshUsers();
      setSelectedUser(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطا در حذف');
    }
  };

  // Person holds several roles on this event (e.g. setup + collection):
  // remove just this role and keep the rest, instead of deleting the account.
  const handleRemoveRole = async (u, role) => {
    if (!window.confirm(`فقط نقش «${roleLabel(role)}» از "${u.full_name || u.username}" حذف شود؟ (سایر نقش‌های او می‌ماند)`)) return;
    try {
      const roles = parseDailyRoles(u.daily_roles);
      const nextRoles = {};
      Object.keys(roles).forEach(k => { if (roles[k] !== role) nextRoles[k] = roles[k]; });
      const nextDates = (u.assigned_dates || '').split(',').map(x => x.trim()).filter(Boolean).filter(d => d in nextRoles);
      await axios.put(`${API_URL}/admin/promoters/${u.id}`, {
        assigned_dates: nextDates.join(','),
        role: deriveBaseRole(nextRoles),
        daily_roles: JSON.stringify(nextRoles),
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`نقش ${roleLabel(role)} حذف شد`);
      refreshUsers();
      setSelectedUser(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطا در حذف نقش');
    }
  };

  const handleShare = (u) => {
    const siteUrl = window.location.origin;
    const pwd = u.plain_password ? u.plain_password : '[رمز عبور تنظیم شده]';
    const shareText = `🎟 اطلاعات ورود به سیستم\n\nلینک ورود: ${siteUrl}/${selectedEvent?.slug}\nنام کاربری: ${u.username}\nرمز عبور: ${pwd}`;
    navigator.clipboard.writeText(shareText).then(() => {
      toast.success('اطلاعات ورود کپی شد!');
    }).catch(() => toast.error('خطا در کپی'));
  };

  // Build a card exactly like PromotersTab
  const renderCard = (u, roleName) => {
    const online = isOnline(u.last_seen);
    const [c1, c2] = getAvatarColor(u.username);
    return (
      <div key={`${roleName}-${u.id}`} className={`promoter-card${online ? ' card-online' : ''}`} onClick={() => { setSelectedUser(u); setSelectedRole(roleName); }}>
        {online && <div className="card-online-bar" />}

        <div className="pc-top">
          <div className="pc-avatar" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {u.profile_picture
              ? <img src={u.profile_picture} alt="" />
              : <DefaultAvatarIcon />
            }
          </div>
          <div className="pc-name-block">
            <h3 className="pc-name">{u.full_name || u.username}</h3>
            <span className="pc-username">@{u.username}</span>
          </div>
          <span className={`status-badge${online ? ' online' : ''}`}>
            <span className={`badge-dot${online ? ' online' : ''}`} />
            {online ? 'آنلاین' : 'آفلاین'}
          </span>
        </div>

        <div className="pc-divider" />

        <div className="pc-info-rows">
          <div className="pc-info-row">
            <span className="pc-info-icon">👤</span>
            <span className="pc-info-label">نقش:</span>
            <span className="pc-info-val">{roleLabel(roleName)}{getUserRoles(u).filter(r => r !== roleName && (r === 'setup' || r === 'collection')).map(r => ` + ${roleLabel(r)}`).join('')}</span>
          </div>
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

        <div className="pc-footer">
          <span>مشاهده جزئیات</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="14" height="14">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="promoters-tab-container">
      {/* ===== CALENDAR BAR ===== */}
      <EventCalendarBar selectedEvent={selectedEvent} />

      {/* ===== HEADER TOOLBAR (same as PromotersTab) ===== */}
      <div className="promoters-toolbar">
        <div className="promoters-stats">
          {requiresSetup && (
            <div className="pstat">
              <span className="pstat-num" style={{ color: '#a78bfa' }}>
                {groupedUsers.setup.length}{setupNeeded > 0 ? `/${setupNeeded}` : ''}
              </span>
              <span className="pstat-label">ست‌آپ</span>
            </div>
          )}

          {requiresSetup && requiresCollection && <div className="pstat-divider" />}

          {requiresCollection && (
            <div className="pstat">
              <span className="pstat-num" style={{ color: '#38bdf8' }}>
                {groupedUsers.collection.length}{collectionNeeded > 0 ? `/${collectionNeeded}` : ''}
              </span>
              <span className="pstat-label">کالکشن</span>
            </div>
          )}
        </div>

        <div className="promoters-toolbar-right">
          <div className="admin-search-bar" style={{ margin: 0 }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input type="text" placeholder="جستجو..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>

          {requiresSetup && (
            <button
              className="admin-btn-primary"
              style={{ padding: '10px 24px', borderRadius: '8px', minHeight: '46px', fontWeight: '600', letterSpacing: '0.5px' }}
              onClick={() => handleAddClick('setup')}
            >
              + افزودن ست‌آپ
            </button>
          )}
          {requiresCollection && (
            <button
              className="admin-btn-primary"
              style={{ padding: '10px 24px', borderRadius: '8px', minHeight: '46px', fontWeight: '600', letterSpacing: '0.5px', background: '#38bdf8' }}
              onClick={() => handleAddClick('collection')}
            >
              + افزودن کالکشن
            </button>
          )}
        </div>
      </div>

      {/* ===== ADD FROM ROSTER MODAL (reuse existing) ===== */}
      {showPickerModal && (
        <RosterPickerModal
          token={token}
          eventId={selectedEvent.id}
          selectedEvent={selectedEvent}
          fixedRole={pickerRole}
          fixedDate={pickerRole === 'setup' ? selectedEvent?.setup_date : selectedEvent?.collection_date}
          existingUsers={users}
          onClose={() => setShowPickerModal(false)}
          onAdded={refreshUsers}
        />
      )}

      {/* ===== SECTIONS ===== */}
      <div className="promoters-days-container fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px', width: '100%' }}>

        {/* ── Setup Section ── */}
        {requiresSetup && (
          <div className="promoter-day-group">
            <div className="promoter-day-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(39,39,42,0.5)', padding: '12px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" style={{ color: '#a78bfa' }}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
                نیروی ست‌آپ
              </h3>
              <div className="day-stats" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {selectedEvent?.setup_date && (
                  <span style={{ fontSize: '12px', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', color: '#e2e8f0' }}>
                    📅 {selectedEvent.setup_date}
                  </span>
                )}
                {selectedEvent?.setup_time_in && (
                  <span style={{ fontSize: '12px', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', color: '#e2e8f0' }}>
                    🕒 {selectedEvent.setup_time_in} الی {selectedEvent.setup_time_out}
                  </span>
                )}
                <span style={{ fontSize: '12px', background: 'var(--primary-color)', color: 'white', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold' }}>{groupedUsers.setup.length} نفر</span>
              </div>
            </div>
            <div className="promoters-grid">
              {groupedUsers.setup.length === 0 ? (
                <div className="promoters-empty" style={{ gridColumn: '1 / -1', minHeight: '150px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="48" height="48" style={{ opacity: 0.5 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  <p>هنوز نیروی ست‌آپی اضافه نشده</p>
                </div>
              ) : groupedUsers.setup.map(u => renderCard(u, 'setup'))}
            </div>
          </div>
        )}

        {/* ── Collection Section ── */}
        {requiresCollection && (
          <div className="promoter-day-group">
            <div className="promoter-day-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(39,39,42,0.5)', padding: '12px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" style={{ color: '#38bdf8' }}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                نیروی کالکشن
              </h3>
              <div className="day-stats" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {selectedEvent?.collection_date && (
                  <span style={{ fontSize: '12px', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', color: '#e2e8f0' }}>
                    📅 {selectedEvent.collection_date}
                  </span>
                )}
                {selectedEvent?.collection_time_in && (
                  <span style={{ fontSize: '12px', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', color: '#e2e8f0' }}>
                    🕒 {selectedEvent.collection_time_in} الی {selectedEvent.collection_time_out}
                  </span>
                )}
                <span style={{ fontSize: '12px', background: 'var(--primary-color)', color: 'white', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold' }}>{groupedUsers.collection.length} نفر</span>
              </div>
            </div>
            <div className="promoters-grid">
              {groupedUsers.collection.length === 0 ? (
                <div className="promoters-empty" style={{ gridColumn: '1 / -1', minHeight: '150px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="48" height="48" style={{ opacity: 0.5 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  <p>هنوز نیروی کالکشنی اضافه نشده</p>
                </div>
              ) : groupedUsers.collection.map(u => renderCard(u, 'collection'))}
            </div>
          </div>
        )}
      </div>

      {/* ===== DETAIL MODAL (same as PromotersTab) ===== */}
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
                <button className="modal-icon-btn" onClick={() => setSelectedUser(null)} title="بستن">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="18" height="18"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="modal-body">
              <div className="modal-info-grid">
                <div className="modal-info-item">
                  <span className="modal-info-label">نقش</span>
                  <span className="modal-info-value">{getUserRoles(selectedUser).map(r => roleLabel(r)).join('، ')}</span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">شماره تماس</span>
                  <span className="modal-info-value">{selectedUser.phone_number || '—'}</span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">آخرین بازدید</span>
                  <span className="modal-info-value">{timeAgo(selectedUser.last_seen)}</span>
                </div>
                <div className="modal-info-item full-width">
                  <span className="modal-info-label">رمز عبور (برای ادمین)</span>
                  <span className="modal-info-value">{selectedUser.plain_password || '(تعیین نشده)'}</span>
                </div>
              </div>

              <div className="modal-actions">
                <button className="admin-btn-primary" onClick={() => handleShare(selectedUser)}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="17" height="17"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" /></svg>
                  ارسال لینک ورود
                </button>
                {selectedRole && getUserRoles(selectedUser).some(r => r !== selectedRole) && (
                  <button className="admin-btn-danger" onClick={() => handleRemoveRole(selectedUser, selectedRole)}>
                    حذف فقط از {roleLabel(selectedRole)}
                  </button>
                )}
                <button className="admin-btn-danger" onClick={() => handleDelete(selectedUser.id, selectedUser.full_name || selectedUser.username)}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="17" height="17"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                  حذف نیرو
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== REPORTS SECTION ===== */}
      {scSubmissions.length > 0 && (
        <div className="promoter-day-group" style={{ marginTop: '8px' }}>
          <div className="promoter-day-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(39,39,42,0.5)', padding: '12px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" style={{ color: '#f59e0b' }}><path d="M9 12h6M9 16h4M7 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-2"/><path d="M9 3h6v4H9z"/></svg>
              گزارش‌های نیروها
            </h3>
            <span style={{ fontSize: '12px', background: 'var(--primary-color)', color: 'white', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold' }}>{scSubmissions.length} گزارش</span>
          </div>

          <div className="rt-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
            {scSubmissions.slice().reverse().map(sub => {
              const dateObj = new Date(sub.submitted_at || sub.timestamp);
              const timeStr = !isNaN(dateObj) ? dateObj.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '-';
              const dateStr = !isNaN(dateObj) ? dateObj.toLocaleDateString('fa-IR') : '-';
              const promoterUser = users.find(u => u.username === sub.promoter_username);
              const promoterName = promoterUser?.full_name || sub.promoter_username;

              // Extract fields
              const checkinField = selectedEvent?.fields?.find(f => f.type === 'camera_checkin') || selectedEvent?.fields?.find(f => ['camera', 'image'].includes(f.type) && sub.data[f.id]);
              const checkoutField = selectedEvent?.fields?.find(f => f.type === 'camera_checkout');
              const dailyReportField = selectedEvent?.fields?.find(f => f.type === 'daily_report');
              const checklistField = selectedEvent?.fields?.find(f => f.type === 'advanced_checklist');

              const checkinUrl = checkinField && sub.data[checkinField.id] ? (Array.isArray(sub.data[checkinField.id]) ? sub.data[checkinField.id][0] : sub.data[checkinField.id]) : null;
              const checkoutUrl = checkoutField && sub.data[checkoutField.id] ? (Array.isArray(sub.data[checkoutField.id]) ? sub.data[checkoutField.id][0] : sub.data[checkoutField.id]) : null;

              return (
                <div key={sub.id} className="modern-report-card">
                  {/* Header Info */}
                  <div className="mrc-header">
                    <div className="mrc-user-info">
                      <div className="mrc-avatar">
                        {promoterName.charAt(0).toUpperCase()}
                      </div>
                      <div className="mrc-user-text">
                        <span className="mrc-name">{promoterName}</span>
                        <span className="mrc-role">
                          {roleLabel(promoterUser?.role || 'promoter')}
                        </span>
                      </div>
                    </div>
                    <div className="mrc-timestamp">
                      <span className="mrc-time">⏱️ {timeStr}</span>
                      <span className="mrc-date">{dateStr}</span>
                    </div>
                  </div>

                  {/* Hero Dual Photo Area */}
                  {(checkinUrl || checkoutUrl) ? (
                    <div className={`mrc-hero-photos ${checkinUrl && checkoutUrl ? 'dual' : 'single'}`}>
                      {checkinUrl && (
                        <div className="mrc-hero-photo-box">
                          <img src={checkinUrl} alt="ورود" className="mrc-hero-img" loading="lazy" decoding="async" />
                          <div className="mrc-hero-overlay" />
                          <div className="mrc-hero-badges top">
                            <span className="mrc-badge-pill photo-type">📸 تصویر ورود</span>
                          </div>
                        </div>
                      )}
                      {checkoutUrl && (
                        <div className="mrc-hero-photo-box checkout">
                          <img src={checkoutUrl} alt="خروج" className="mrc-hero-img" loading="lazy" decoding="async" />
                          <div className="mrc-hero-overlay" />
                          <div className="mrc-hero-badges top">
                            <span className="mrc-badge-pill photo-type checkout">🏁 تصویر خروج</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mrc-no-photo-banner">
                      <span>📷 بدون تصویر ورود / خروج ثبت شده</span>
                    </div>
                  )}

                  {/* Checklist Section */}
                  {checklistField && sub.data[`${checklistField.id}_checklist`] && checklistField.checklistItems && (
                    <div className="mrc-section-block">
                      <div className="mrc-checklist-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '13px', color: '#e2e8f0' }}>✅ چک‌لیست</div>
                        {checklistField.checklistItems.map((item, idx) => {
                          const isChecked = sub.data[`${checklistField.id}_checklist`][idx];
                          return (
                            <div key={idx} className={`mrc-checklist-item ${isChecked ? 'done' : 'pending'}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '13px', color: isChecked ? '#9ca3af' : '#e2e8f0' }}>
                              <span style={{ opacity: isChecked ? 0.7 : 1 }}>{isChecked ? '✅' : '⏳'}</span>
                              <span style={{ textDecoration: isChecked ? 'line-through' : 'none' }}>{typeof item === 'string' ? item : item.title}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Daily Report & Issues Section */}
                  {dailyReportField && (sub.data[`${dailyReportField.id}_summary`] || sub.data[`${dailyReportField.id}_issues`]) && (
                    <div className="mrc-section-block">
                      <div className="mrc-daily-reports-wrapper">
                        {sub.data[`${dailyReportField.id}_summary`] && (
                          <div className="mrc-daily-box summary">
                            <div className="mrc-daily-box-header">
                              <span>📝 خلاصه عملکرد روزانه</span>
                            </div>
                            <p className="mrc-daily-box-text">
                              {String(sub.data[`${dailyReportField.id}_summary`])}
                            </p>
                          </div>
                        )}
                        {sub.data[`${dailyReportField.id}_issues`] && (
                          <div className="mrc-daily-box issues">
                            <div className="mrc-daily-box-header">
                              <span>⚠️ گزارش مشکلات و چالش‌ها</span>
                            </div>
                            <p className="mrc-daily-box-text">
                              {String(sub.data[`${dailyReportField.id}_issues`])}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
