import React, { useState } from 'react';
import './adminSidebar.css';

const NAV_ITEMS = [
  {
    id: 'dashboard', label: 'داشبورد',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
  },
  {
    id: 'promoters', label: 'پروموترها',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
  },
  {
    id: 'reports', label: 'گزارش‌ها',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h6M9 16h4M7 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-2"/><path d="M9 3h6v4H9z"/></svg>
  },
  {
    id: 'gallery', label: 'گالری تصاویر',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
  },
  {
    id: 'map', label: 'نقشه زنده', badge: 'LIVE',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
  },
  {
    id: 'inventory', label: 'تجهیزات',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
  },
];

const BOTTOM_ITEMS = [
];

const STORES_ITEM = {
  id: 'stores', label: 'فروشگاه‌ها',
  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v2a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0z"/><path d="M5 12v8h14v-8"/><path d="M10 20v-5h4v5"/></svg>
};

export default function AdminSidebar({ activeTab, setActiveTab, requiresSetup, requiresCollection, onDeleteEvent, onLogout, hiddenTabs = [], showStores = false, itemOverrides = {}, badges = {} }) {
  const [collapsed, setCollapsed] = useState(true);

  const dynamicNavItems = React.useMemo(() => {
    const items = NAV_ITEMS.filter(i => !hiddenTabs.includes(i.id)).map(i => (itemOverrides[i.id] ? { ...i, ...itemOverrides[i.id] } : i));
    // Mehram events: the stores dashboard, right after the reports.
    if (showStores) items.splice(items.findIndex(i => i.id === 'reports') + 1, 0, STORES_ITEM);
    if (requiresSetup || requiresCollection) {
      // Insert after 'reports'
      const reportsIndex = items.findIndex(i => i.id === 'reports');
      items.splice(reportsIndex + 1, 0, {
        id: 'setup_collection',
        label: 'ست‌آپ و کالکشن',
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 3v5h5M16 13H8M16 17H8M10 9H8"/></svg>
      });
    }
    return items;
  }, [requiresSetup, requiresCollection, hiddenTabs, showStores, itemOverrides]);

  return (
    <>
    <aside 
      className={`admin-sidebar ${collapsed ? 'collapsed' : ''}`}
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
    >

      {/* Nav */}
      <nav className="sidebar-nav">
        {dynamicNavItems.map(item => (
          <button
            key={item.id}
            className={`sidebar-item ${activeTab === item.id ? 'active' : ''} ${['chat', 'ai', 'setup_collection'].includes(item.id) ? 'hide-on-mobile' : ''}`}
            onClick={() => setActiveTab(item.id)}
            title={collapsed ? item.label : ''}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            <span className="sidebar-item-label">{item.label}</span>
            {!collapsed && item.badge && <span className="sidebar-badge">{item.badge}</span>}
            {collapsed && item.badge && <span className="sidebar-badge-dot" />}
            {badges[item.id] > 0 && <span className="sidebar-count" title={`${badges[item.id]} در انتظار تایید`}>{badges[item.id].toLocaleString('fa-IR')}</span>}
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div className="sidebar-bottom">
        {BOTTOM_ITEMS.map(item => (
          <button
            key={item.id}
            className={`sidebar-item ${activeTab === item.id ? 'active' : ''} ${['settings'].includes(item.id) ? 'hide-on-mobile' : ''}`}
            onClick={() => setActiveTab(item.id)}
            title={collapsed ? item.label : ''}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            <span className="sidebar-item-label">{item.label}</span>
          </button>
        ))}

        <button className="sidebar-item sidebar-item-muted" onClick={onLogout} title={collapsed ? 'خروج' : ''}>
          <span className="sidebar-item-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </span>
          <span className="sidebar-item-label">خروج</span>
        </button>


      </div>
    </aside>

    </>
  );
}
