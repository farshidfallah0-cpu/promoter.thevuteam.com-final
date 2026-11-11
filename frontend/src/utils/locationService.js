/**
 * Single shared GPS source for the whole app.
 *
 * Why this exists: location used to be requested from three independent places
 * (the app-root tracker, the BVT field, ...), each with its own watchers and
 * timeouts, all fighting over the same phone sensor. BVT then blocked every
 * handout for up to ~10s waiting on a one-shot GPS call. Now ONE pair of
 * watchers keeps a warm fix in memory, and consumers just read it:
 *
 *   startLocationService()   idempotent — begin keeping a fix warm
 *   getUsableFix()           instant, synchronous — best fresh fix or null
 *   waitForFix(ms)           resolves as soon as a usable fix exists (or null)
 *   subscribeLocation(cb)    notified on every fix / error / status tick
 *   getLocationStatus()      { state: 'ok' | 'searching' | 'denied' | 'unsupported' }
 *   getFailureReason()       { reason, accuracy, code } — why there is no fix
 *
 * Quality rules (a pin is only handed out if it is trustworthy):
 *  • a precise fix (<= PRECISE_ACC_M) stays valid for PRECISE_MAX_AGE_MS —
 *    a promoter works from one spot, and an older *precise* pin beats waiting —
 *    unless a newer fix shows the device has clearly moved away from it;
 *  • a coarse fix (<= MAX_ACC_M) is only valid while very fresh;
 *  • anything worse is never stamped (it is how one city-centre point used to
 *    end up on dozens of handouts).
 */

const PRECISE_ACC_M = 200;
const MAX_ACC_M = 1500;
const PRECISE_MAX_AGE_MS = 3 * 60 * 1000;
const COARSE_MAX_AGE_MS = 60 * 1000;
const STALL_REFRESH_MS = 20 * 1000; // no fix for this long => force a fresh one
const TICK_MS = 10 * 1000;

let started = false;
let latest = null;   // most recent fix of any quality
let precise = null;  // most recent fix with accuracy <= PRECISE_ACC_M
let lastError = null;
let refreshing = false;
let preciseWatchId = null;
let coarseWatchId = null;
const listeners = new Set();

const supported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;

const notify = () => listeners.forEach((cb) => { try { cb(); } catch { /* listener bug must not break others */ } });

const distanceM = (a, b) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const normalize = (pos) => {
  const now = Date.now();
  // pos.timestamp is the time the fix was *taken* (a cached fix keeps its old
  // one). Guard against devices with a bogus/missing/future timestamp.
  const ts = Number.isFinite(pos.timestamp) && pos.timestamp <= now + 60000 ? pos.timestamp : now;
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : Infinity,
    timestamp: ts,
  };
};

const onFix = (pos) => {
  const fix = normalize(pos);
  lastError = null;
  if (!latest || fix.timestamp >= latest.timestamp) latest = fix;
  if (fix.accuracy <= PRECISE_ACC_M && (!precise || fix.timestamp >= precise.timestamp)) precise = fix;
  notify();
};

const onError = (err) => {
  lastError = err;
  notify();
};

export function getUsableFix() {
  const now = Date.now();
  if (precise && now - precise.timestamp <= PRECISE_MAX_AGE_MS) {
    // Drop the precise pin only if a newer fix says we are clearly elsewhere.
    const moved = latest && latest.timestamp > precise.timestamp &&
      distanceM(precise, latest) > Math.max(latest.accuracy, 300);
    if (!moved) return precise;
  }
  if (latest && latest.accuracy <= MAX_ACC_M && now - latest.timestamp <= COARSE_MAX_AGE_MS) return latest;
  return null;
}

export function getLocationStatus() {
  if (!supported()) return { state: 'unsupported' };
  if (lastError && lastError.code === 1) return { state: 'denied' };
  return { state: getUsableFix() ? 'ok' : 'searching' };
}

export function getFailureReason() {
  if (!supported()) return { reason: 'unsupported', accuracy: null, code: null };
  if (lastError && lastError.code === 1) return { reason: 'denied', accuracy: null, code: 1 };
  if (latest && latest.accuracy > MAX_ACC_M) {
    return { reason: 'low_accuracy', accuracy: Math.round(latest.accuracy), code: lastError?.code ?? null };
  }
  return { reason: 'unavailable', accuracy: null, code: lastError?.code ?? null };
}

export function subscribeLocation(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// One-shot forced refresh: precise first, then a coarse Wi-Fi/cell fallback.
// Used when the watchers have gone quiet (stationary phone, screen was off).
function refresh() {
  if (!supported() || refreshing) return;
  refreshing = true;
  const done = () => { refreshing = false; };
  navigator.geolocation.getCurrentPosition(
    (pos) => { onFix(pos); done(); },
    () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => { onFix(pos); done(); },
        (err) => { onError(err); done(); },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
}

function startWatches() {
  if (preciseWatchId == null) {
    preciseWatchId = navigator.geolocation.watchPosition(
      onFix, onError,
      // Long timeout: a cold GPS-only start can legitimately take 30s+; the
      // coarse watch below covers the gap meanwhile.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
  }
  if (coarseWatchId == null) {
    coarseWatchId = navigator.geolocation.watchPosition(
      onFix, onError,
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 }
    );
  }
}

function stopWatches() {
  if (preciseWatchId != null) navigator.geolocation.clearWatch(preciseWatchId);
  if (coarseWatchId != null) navigator.geolocation.clearWatch(coarseWatchId);
  preciseWatchId = null;
  coarseWatchId = null;
}

export function startLocationService() {
  if (started || !supported()) return;
  started = true;
  startWatches();

  // Phones stop delivering watch updates while stationary / screen locked, so
  // a fix can silently go stale. Re-acquire proactively instead of letting the
  // next handout discover it.
  setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    if (!latest || Date.now() - latest.timestamp > STALL_REFRESH_MS) refresh();
    notify(); // lets status UIs notice a fix expiring
  }, TICK_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // Permission may have been granted in settings while we were away: a
    // denied watch never restarts by itself.
    if (lastError && lastError.code === 1) {
      stopWatches();
      lastError = null;
      startWatches();
    }
    refresh();
  });
}

/**
 * Resolves with a usable fix as soon as one exists, or null after `timeoutMs`
 * (or immediately if permission is denied). Never rejects.
 */
export function waitForFix(timeoutMs = 25000) {
  const existing = getUsableFix();
  if (existing) return Promise.resolve(existing);
  if (!supported()) return Promise.resolve(null);
  startLocationService();
  refresh();
  return new Promise((resolve) => {
    let timer = null;
    let unsub = null;
    const finish = (value) => {
      clearTimeout(timer);
      if (unsub) unsub();
      resolve(value);
    };
    const check = () => {
      const fix = getUsableFix();
      if (fix) finish(fix);
      else if (lastError && lastError.code === 1) finish(null);
    };
    unsub = subscribeLocation(check);
    timer = setTimeout(() => finish(getUsableFix()), timeoutMs);
    check();
  });
}
