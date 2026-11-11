import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Separate dismiss keys so admin and promoter track independently
const DISMISS_KEY_PROMOTER = 'vu_pwa_install_dismissed';
const DISMISS_KEY_ADMIN    = 'vu_dashboard_install_dismissed';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as Mac
}

function isSafari() {
  const ua = window.navigator.userAgent;
  return /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
}

function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Site-wide install nudge — mobile only.
 *
 * • On /admin routes  → shows "VU Dashboard" with indigo icon
 * • On all other routes → shows "VU" with the default icon
 * • On desktop (mouse/non-touch) → hidden entirely
 *
 * Android/Chrome: captures 'beforeinstallprompt' and calls prompt() directly,
 * which triggers the real WebAPK install flow.
 * iOS Safari: shows manual Share → Add to Home Screen instructions.
 */
export default function InstallPWAPrompt() {
  const location = useLocation();
  const isAdmin = location.pathname === '/admin' ||
                  location.pathname.startsWith('/admin/') ||
                  location.pathname === '/event';

  const dismissKey = isAdmin ? DISMISS_KEY_ADMIN : DISMISS_KEY_PROMOTER;

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosHint, setShowIosHint]       = useState(false);
  const [iosStepsOpen, setIosStepsOpen]     = useState(false);
  const [dismissed, setDismissed]           = useState(() => sessionStorage.getItem(dismissKey) === '1');

  // Re-check dismissed state when route changes (admin ↔ promoter)
  useEffect(() => {
    setDismissed(sessionStorage.getItem(dismissKey) === '1');
    setIosStepsOpen(false);
  }, [dismissKey]);

  useEffect(() => {
    if (isStandalone()) return;
    if (!isMobileDevice()) return; // ← desktop: skip entirely

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    if (isIos() && isSafari()) {
      setShowIosHint(true);
    }

    const onInstalled = () => {
      setDeferredPrompt(null);
      setShowIosHint(false);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  // Don't render on desktop at all
  if (!isMobileDevice()) return null;
  if (isStandalone()) return null;
  if (dismissed || (!deferredPrompt && !showIosHint)) return null;

  const handleActionClick = () => {
    if (deferredPrompt) return handleInstall();
    setIosStepsOpen(v => !v);
  };

  // Per-context branding
  // Admin and promoter use the same icon artwork — only name/accent differ.
  // Cache-busted (?v=) so a browser that already cached a stale icon at this
  // exact URL fetches the current file instead of quietly reusing it.
  const appIcon     = '/images/icon-192x192.png?v=4';
  const appName     = isAdmin ? 'VU Dashboard' : 'VU';
  const accentColor = isAdmin ? '#4f46e5' : 'var(--primary-color, #6366f1)';
  const installLabel = deferredPrompt ? `نصب ${appName}` : 'نصب روی آیفون';

  return (
    <div
      style={{
        position: 'fixed',
        insetInlineStart: 'max(10px, env(safe-area-inset-left, 0px))',
        insetInlineEnd: 'max(10px, env(safe-area-inset-right, 0px))',
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        zIndex: 9998,
        maxWidth: '380px',
        marginInlineStart: 'auto',
        marginInlineEnd: 'auto',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        background: isAdmin
          ? 'linear-gradient(135deg, #1e1b4b 0%, #0f0c29 100%)'
          : 'var(--bg-card, #1a1a1a)',
        border: `1px solid ${isAdmin ? 'rgba(99,102,241,0.35)' : 'var(--border-color, #333)'}`,
        borderRadius: '12px',
        padding: '8px 10px',
        boxShadow: isAdmin
          ? '0 8px 28px rgba(79,70,229,0.3)'
          : '0 8px 28px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img
          src={appIcon}
          alt=""
          style={{ width: 28, height: 28, borderRadius: '22%', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
        />
        <div style={{
          flex: 1, minWidth: 0,
          fontSize: '0.78rem', fontWeight: 700,
          color: 'var(--text-primary, #f5f5f5)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {installLabel}
        </div>
        <button
          type="button"
          onClick={handleActionClick}
          style={{
            background: accentColor,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '0.74rem',
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {deferredPrompt ? 'نصب' : (iosStepsOpen ? 'باشه' : 'راهنما')}
        </button>
        <button
          type="button"
          onClick={dismiss}
          title="بستن"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted, #888)',
            cursor: 'pointer',
            padding: '4px',
            flexShrink: 0,
            display: 'flex',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 15, height: 15 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {!deferredPrompt && iosStepsOpen && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888)', lineHeight: 1.5, paddingInlineStart: '36px' }}>
          دکمه‌ی Share (share icon) رو بزن، بعد «Add to Home Screen» رو انتخاب کن
        </div>
      )}
    </div>
  );
}
