// Keeps open tabs / installed PWAs from running an old build after a deploy.
// A stale build is the worst kind of bug here: it looks like the fix "didn't work".
/* global __BUILD_ID__ */
const CURRENT = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
const CHECK_EVERY_MS = 5 * 60 * 1000;

let newBuildReady = false;
let lastCheck = 0;

async function checkForNewBuild() {
  if (CURRENT === 'dev' || newBuildReady) return newBuildReady;
  lastCheck = Date.now();
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const { build } = await res.json();
    if (build && build !== CURRENT) newBuildReady = true;
  } catch { /* offline: try again later */ }
  return newBuildReady;
}

// Called on every route change: the user is leaving the page anyway, so a full
// load of the new URL loses nothing (unlike reloading under a half-filled form).
export function reloadIfStale(pathWithSearch) {
  if (newBuildReady) {
    window.location.assign(pathWithSearch);
    return true;
  }
  return false;
}

export function startVersionWatch() {
  if (CURRENT === 'dev') return;
  checkForNewBuild();
  setInterval(checkForNewBuild, CHECK_EVERY_MS);
  // Phones resume tabs from the background for days; check when they come back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > 30 * 1000) checkForNewBuild();
  });
  // A lazily loaded chunk of the old build was deleted by the deploy: reload to the new build.
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    window.location.reload();
  });
}
