import React, { useState } from 'react';
import './adminStyles.css';
import './resources/resources.css';
import { RosterManager } from './resources/RosterManager';
import { ClientsManager } from './resources/ClientsManager';
import { BadgeManager } from './resources/BadgeManager';

const ResourcesPanel = ({ token, user, onBack }) => {
  const [tab, setTab] = useState('roster'); // 'roster' | 'badges' | 'clients'

  return (
    <div className="res-root">
      <div className="res-topbar">
        <button className="res-back-btn" onClick={onBack} title="بازگشت">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h1>مدیریت منابع</h1>
          <p>آرشیو کامل پروموترها و کلاینت‌های ما — مستقل از هر ایونت خاص</p>
        </div>
      </div>

      <div className="res-tabs">
        <button className={`res-tab-btn ${tab === 'roster' ? 'active' : ''}`} onClick={() => setTab('roster')}>پروموترها</button>
        <button className={`res-tab-btn ${tab === 'badges' ? 'active' : ''}`} onClick={() => setTab('badges')}>آرشیو بج‌ها و گواهی‌ها</button>
        <button className={`res-tab-btn ${tab === 'clients' ? 'active' : ''}`} onClick={() => setTab('clients')}>کلاینت‌ها</button>
      </div>

      <div className="res-body">
        {tab === 'roster' ? <RosterManager token={token} onOpenBadges={() => setTab('badges')} /> : tab === 'badges' ? <BadgeManager token={token} /> : <ClientsManager token={token} />}
      </div>
    </div>
  );
};

export default ResourcesPanel;
