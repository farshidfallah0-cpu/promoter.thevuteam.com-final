import React from 'react';
import { Wallet } from 'lucide-react';
import './payroll.css';

/** Shown in place of the payroll tab until PAYROLL_ENABLED is switched on. */
export default function PayrollComingSoon() {
  return (
    <div className="pr-root">
      <div className="pr-hero">
        <div className="pr-hero-title">
          <span className="pr-hero-icon"><Wallet size={22} /></span>
          <div>
            <h1>محاسبه عملکرد</h1>
            <p>به‌زودی فعال می‌شود</p>
          </div>
        </div>
      </div>
    </div>
  );
}
