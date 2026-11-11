import React, { useEffect, useRef, useState } from 'react';
import { startLocationService, getUsableFix, subscribeLocation } from '../utils/locationService';

const LOCATION_PERM_KEY = 'vu_location_permission'; // 'granted' | 'denied' | 'dismissed'
const LOCATION_ASKED_KEY = 'vu_location_asked';

/**
 * Checks if we already have/know permission status without asking the browser
 */
async function checkExistingPermission() {
  if (!navigator.permissions) return null;
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return null;
  }
}

/**
 * Silently starts location tracking (fire-and-forget) and keeps sending forever.
 *
 * The auth token is re-read from localStorage on every single send (not captured
 * once at setup time) because this modal lives at the app root and is mounted
 * before the promoter/crew login flow (a separate, independent auth state in
 * EventForm.jsx) has necessarily produced a token yet. Capturing the token once
 * meant tracking silently never started for anyone who granted permission before
 * logging in — which, in practice, was almost everyone. Re-reading it fresh here
 * makes tracking self-heal the moment a token appears, with no reload required.
 */
export function startLocationTracking(apiUrl) {
  if (!('geolocation' in navigator)) return;
  if (window.__vuLocationTrackingStarted) return; // already running, don't stack watchers
  window.__vuLocationTrackingStarted = true;

  // GPS itself is owned by the shared locationService (one watcher pair for the
  // whole app, also used by BVT) — this only forwards its fixes to the server.
  startLocationService();

  let lastSentAt = 0;
  const sendLatest = () => {
    const token = localStorage.getItem('token');
    if (!token) return; // not logged in yet — next tick will retry with a fresh token
    const fix = getUsableFix();
    if (!fix) return;
    lastSentAt = Date.now();
    fetch(`${apiUrl}/promoter/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lat: fix.lat, lng: fix.lng }),
    }).catch(() => { });
  };

  // Send on new fixes (throttled to ~10s)...
  subscribeLocation(() => {
    if (Date.now() - lastSentAt >= 10000) sendLatest();
  });
  // ...and heartbeat every 15s — also the retry for "granted but not logged in yet".
  setInterval(sendLatest, 15000);
}

/**
 * First-launch location permission modal.
 * Shows once per device. On "allow", requests browser permission, saves result.
 * On "later", saves 'dismissed' so it doesn't reappear this session.
 * Automatically starts tracking if permission was previously granted.
 */
/** In-app browsers (messengers, social apps, WebViews) often cannot show the
 *  location prompt at all, so the user "allows" it and nothing changes. */
function detectInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /Telegram|Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|Twitter|MicroMessenger|Bale|Eitaa|Rubika|Soroush|iGap|; wv\)|WebView/i.test(ua);
}

/**
 * Actually probes the sensor. permissions.query() can say "granted" while the
 * OS-level permission for the browser app (or the phone's Location switch) is
 * still off — only a real call tells the truth.
 * Resolves { ok: true } | { ok: false, code }.
 */
function probeLocation(timeout) {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve({ ok: true }),
      (err) => resolve({ ok: false, code: err.code }),
      { enableHighAccuracy: false, timeout, maximumAge: 60000 }
    );
  });
}

export default function LocationPermissionModal({ apiUrl }) {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [result, setResult] = useState(null); // 'granted' | 'denied' | null
  const [diag, setDiag] = useState(null); // { code, queryState } shown on the denied screen
  const shownRef = useRef(false);
  const inApp = detectInAppBrowser();

  const markGranted = () => {
    localStorage.setItem(LOCATION_PERM_KEY, 'granted');
    startLocationTracking(apiUrl);
  };

  useEffect(() => {
    shownRef.current = visible;
  }, [visible]);

  useEffect(() => {
    let cancelled = false;
    let status = null;

    const letIn = () => {
      markGranted();
      setResult(null);
      setVisible(false);
    };
    const showDenied = (queryState) => {
      setDiag({ code: 1, queryState });
      setResult('denied');
      setVisible(true);
    };

    const evaluate = async () => {
      const state = await checkExistingPermission();
      if (cancelled) return;
      if (state === 'denied') {
        showDenied(state);
        return;
      }
      const savedPerm = localStorage.getItem(LOCATION_PERM_KEY);
      if (state === 'granted' || (state === null && savedPerm === 'granted')) {
        // Browser says yes — verify with a real fix, because the OS-level
        // permission can still be off (the classic "I allowed it but it still
        // says denied" case). A timeout / "unavailable" is NOT a permission
        // problem, so only code 1 keeps the user out.
        const probe = await probeLocation(10000);
        if (cancelled) return;
        if (probe.ok || probe.code !== 1) letIn();
        else showDenied(state === null ? 'unknown' : state);
        return;
      }
      setVisible(true); // 'prompt' (or unknown, never granted): ask
    };

    evaluate();

    // The user usually fixes this in the browser/phone settings and comes
    // back — re-check automatically instead of making them find the button.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && shownRef.current) evaluate();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((st) => {
        if (cancelled) return;
        status = st;
        st.onchange = () => evaluate();
      }).catch(() => { });
    }
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      if (status) status.onchange = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  const handleAllow = async () => {
    setRequesting(true);
    try {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false, // a fast network fix is enough to prove permission
          timeout: 20000,
          maximumAge: 60000,
        });
      });
      localStorage.setItem(LOCATION_ASKED_KEY, '1');
      markGranted();
      setResult('granted');
      setTimeout(() => { setVisible(false); setResult(null); }, 1600);
    } catch (err) {
      const queryState = await checkExistingPermission();
      setDiag({ code: err.code, queryState });
      if (err.code === 1) {
        localStorage.setItem(LOCATION_PERM_KEY, 'denied');
        setResult('denied');
      } else {
        // Timeout / position unavailable: the permission itself is fine (GPS or
        // the phone's Location switch is off, or the signal is weak). Let them
        // in — the shared location service keeps retrying in the background.
        // (This used to leave the blocking modal up forever.)
        markGranted();
        setResult(null);
        setVisible(false);
        alert('دسترسی داده شده ولی موقعیت هنوز پیدا نشد. GPS/Location گوشی را روشن کن؛ برنامه خودش دوباره تلاش می‌کند.');
      }
    } finally {
      setRequesting(false);
    }
  };

  if (!visible) return null;

  const YELLOW = '#fab809';
  const YELLOW_SOFT = 'rgba(250,184,9,0.12)';
  const BG = 'var(--card-bg, #141414)';
  const BORDER = 'var(--input-border, #262626)';
  const TEXT = 'var(--text-color, #f5f5f5)';
  const TEXT_MUTED = 'var(--text-secondary, #9a9a9a)';

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 99990,
          animation: 'locPermFadeIn 0.25s ease forwards',
        }}
      />

      {/* Modal Card */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: '0 12px calc(20px + env(safe-area-inset-bottom, 0px))',
          pointerEvents: 'none',
        }}
      >
        <div
          dir="rtl"
          style={{
            width: '100%',
            maxWidth: 400,
            background: BG,
            borderRadius: 20,
            border: `1px solid ${BORDER}`,
            boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
            padding: '26px 22px 22px',
            pointerEvents: 'all',
            animation: 'locPermSlideUp 0.35s cubic-bezier(0.34, 1.2, 0.64, 1) forwards',
          }}
        >
          {/* Icon */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{
              width: 56, height: 56,
              margin: '0 auto',
              background: result === 'granted'
                ? 'rgba(34,197,94,0.12)'
                : result === 'denied'
                  ? 'rgba(239,68,68,0.12)'
                  : YELLOW_SOFT,
              border: `1.5px solid ${result === 'granted' ? 'rgba(34,197,94,0.35)' : result === 'denied' ? 'rgba(239,68,68,0.35)' : 'rgba(250,184,9,0.35)'}`,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              transition: 'all 0.3s ease',
            }}>
              {result === 'granted' ? '✓' : result === 'denied' ? '✕' : requesting ? '⏳' : '📍'}
            </div>
          </div>

          {/* Title */}
          <div style={{
            textAlign: 'center',
            fontSize: '1.05rem',
            fontWeight: 700,
            color: TEXT,
            marginBottom: 8,
          }}>
            {result === 'granted'
              ? 'دسترسی داده شد'
              : result === 'denied'
                ? 'دسترسی رد شد'
                : 'دسترسی به موقعیت مکانی'}
          </div>

          {/* Description */}
          <div style={{
            textAlign: 'center',
            fontSize: '0.82rem',
            color: TEXT_MUTED,
            lineHeight: 1.75,
            marginBottom: 24,
            padding: '0 4px',
          }}>
            {result === 'granted'
              ? 'موقعیت شما با موفقیت دریافت شد. در حال ورود...'
              : result === 'denied'
                ? (
                  <>
                    دسترسی موقعیت مکانی برای این سایت فعال نیست.
                    <span style={{ display: 'block', textAlign: 'right', fontSize: '0.76rem', marginTop: 10, lineHeight: 1.9 }}>
                      {inApp && (
                        <b style={{ display: 'block', color: '#ef4444', marginBottom: 4 }}>
                          ⚠ به نظر می‌رسد لینک را داخل یک برنامه (تلگرام، اینستاگرام، پیام‌رسان…) باز کرده‌ای و آن برنامه اجازه‌ی لوکیشن نمی‌دهد. لینک را کپی کن و در Chrome (اندروید) یا Safari (آیفون) باز کن.
                        </b>
                      )}
                      ۱) سایت را در Chrome یا Safari باز کن، نه داخل برنامه‌های دیگر.<br />
                      ۲) اندروید: Location گوشی را روشن کن، بعد تنظیمات ← Apps ← Chrome ← Permissions ← Location ← «Allow» (ترجیحاً Precise).<br />
                      ۳) آیفون: Settings ← Privacy ← Location Services را روشن کن، بعد Safari Websites ← «While Using».<br />
                      ۴) در مرورگر روی قفل کنار آدرس بزن ← Permissions ← Location ← Allow.<br />
                      بعد از تغییر به همین صفحه برگرد؛ خودکار بررسی می‌شود.
                    </span>
                    {diag && (
                      <span dir="ltr" style={{ display: 'block', marginTop: 8, fontSize: '0.66rem', opacity: 0.6 }}>
                        code={String(diag.code)} · browser={String(diag.queryState)}{inApp ? ' · in-app' : ''}
                      </span>
                    )}
                  </>
                )
                : (
                  <>
                    برای نمایش موقعیت شما روی نقشه در پنل مدیران و اطمینان از حضور در محل رویداد، دسترسی به موقعیت مکانی الزامی است.
                    <br />
                    <span style={{ fontSize: '0.74rem', opacity: 0.75, marginTop: 6, display: 'block' }}>
                      بدون این دسترسی امکان فعالیت در پنل را نخواهید داشت.
                    </span>
                  </>
                )
            }
          </div>

          {/* Buttons */}
          {!result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handleAllow}
                disabled={requesting}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: requesting ? 'rgba(250,184,9,0.5)' : YELLOW,
                  color: '#171200',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: requesting ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {requesting ? (
                  <>
                    <span style={{
                      width: 14, height: 14, border: '2px solid rgba(23,18,0,0.3)',
                      borderTopColor: '#171200', borderRadius: '50%',
                      display: 'inline-block', animation: 'locPermSpin 0.7s linear infinite'
                    }} />
                    در حال دریافت موقعیت...
                  </>
                ) : (
                  <>تایید و اعطای دسترسی</>
                )}
              </button>
            </div>
          )}
          {result === 'denied' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handleAllow}
                disabled={requesting}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'transparent',
                  color: TEXT,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: requesting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {requesting ? (
                  <>
                    <span style={{
                      width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff', borderRadius: '50%',
                      display: 'inline-block', animation: 'locPermSpin 0.7s linear infinite'
                    }} />
                    در حال بررسی...
                  </>
                ) : (
                  <>دسترسی را دادم (بررسی مجدد)</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes locPermFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes locPermSlideUp {
          from { transform: translateY(60px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes locPermSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
