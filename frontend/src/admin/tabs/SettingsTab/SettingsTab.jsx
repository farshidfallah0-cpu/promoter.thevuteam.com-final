import React from 'react';
import './settings.css';

export const SettingsTab = ({ stats, formatAmount }) => {
  return (
    <div className="admin-settings">
      <div className="settings-item"><span>نسخه اپلیکیشن</span><span className="settings-value">2.1.0</span></div>
      <div className="settings-item"><span>وضعیت سرور</span><span className="settings-value online">آنلاین</span></div>
      <div className="settings-item"><span>تعداد پروموتر</span><span className="settings-value">{stats.totalPromoters} نفر</span></div>
      <div className="settings-item"><span>تعداد گزارش</span><span className="settings-value">{stats.totalReports}</span></div>
      {!!stats.totalAmount && (
        <div className="settings-item"><span>کل فروش</span><span className="settings-value">{formatAmount(stats.totalAmount)} تومان</span></div>
      )}
    </div>
  );
};
