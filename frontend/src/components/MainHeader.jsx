import React from 'react';
import { useNavigate } from 'react-router-dom';

const MainHeader = ({
  token,
  user,
  theme,
  toggleTheme,
  onLogout,
  onHistoryClick,
  onTasksClick,
  onProfileClick,
  onInventoryClick,
  newTaskCount = 0,
  myTasks = [],
  customActions = null,
  centerContent = null,
  roleLabelOverride = null
}) => {
  const navigate = useNavigate();

  return (
    <div className="main-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div className="header-left">
          <button
            type="button"
            onClick={() => navigate('/')}
            title="بازگشت به صفحه اصلی و همه ایونت‌ها"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
          >
            <img src="/images/vuLogo.png" alt="Logo" className="app-logo" />
          </button>
        </div>

        {token && user && (
          <div className="user-info" onClick={() => onProfileClick && onProfileClick()}
            title={user.full_name || user.username}
            style={{
              cursor: onProfileClick ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginRight: '10px',
              maxWidth: 160,
              minWidth: 0,
              overflow: 'hidden',
              flexShrink: 1,
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm, 12px)',
              border: '1px solid var(--border-color)',
              background: 'var(--card-bg, #ffffff)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              transition: 'all 0.2s ease'
            }}>
            <div className="user-avatar-icon icon-btn" style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: 'var(--radius-sm, 10px)', 
              background: 'var(--bg-input)', 
              overflow: 'hidden', 
              border: '1px solid var(--border-color)', 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              padding: 0,
              boxShadow: 'none'
            }}>
              {user.profile_picture
                ? <img src={user.profile_picture} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Profile" />
                : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '20px', height: '20px' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
              }
            </div>
            <div className="user-details" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
              <span style={{
                fontSize: '1.1rem', fontWeight: 'bold',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                maxWidth: 120, direction: 'ltr', textAlign: 'left',
                color: 'var(--text-primary)'
              }}>
                {(user.full_name || user.username)}
              </span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                {roleLabelOverride || user.role || (user.is_admin ? 'ادمین' : 'پروموتر')}
              </span>
            </div>
          </div>
        )}
      </div>

      {centerContent && (
        <div className="header-center" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          {centerContent}
        </div>
      )}

      <div className="header-actions">
        {customActions}

        {token && user && !user.is_admin && onInventoryClick && (
          <button
            className="icon-btn"
            onClick={onInventoryClick}
            title="وسایل من (انبار)"
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '22px', height: '22px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </button>
        )}

        {token && user && user.is_admin && !window.location.pathname.startsWith('/admin') && (
          <button onClick={() => navigate('/admin')} className="icon-btn" title="پنل ادمین" style={{ color: '#ff9800' }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </button>
        )}

        {token && user && !user.is_admin && onTasksClick && (
          <button onClick={onTasksClick} className="icon-btn" title="وظایف من" style={{ position: 'relative' }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {myTasks && myTasks.filter(t => t.status !== 'completed').length > 0 && (
              <span className={`task-badge ${newTaskCount > 0 ? 'pulse-badge' : ''}`}>
                {myTasks.filter(t => t.status !== 'completed').length}
              </span>
            )}
          </button>
        )}

        {token && user && !user.is_admin && onHistoryClick && (
          <button onClick={onHistoryClick} className="icon-btn" title="تاریخچه">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}

        {toggleTheme && (
          <button onClick={toggleTheme} className="icon-btn" title={theme === 'light' ? "حالت شب" : "حالت روز"}>
            {theme === 'light' ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            )}
          </button>
        )}

        {token && onLogout && (
          <button onClick={onLogout} className="logout-btn">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '18px', height: '18px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            <span className="logout-text">خروج</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default MainHeader;
