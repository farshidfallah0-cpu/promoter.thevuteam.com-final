import React, { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import axios from "axios";
import PageLoader from "./components/PageLoader";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import AdminPanel from "./admin/AdminPanel"
import ResourcesPanel from "./admin/ResourcesPanel"
import AdminLogin from "./AdminLogin";
import EventForm from "./EventForm";
import SetupDashboard from "./SetupDashboard";
import EventsDirectory from "./components/EventsDirectory";
import EventPanel from "./EventPanel"; // Keep for legacy route
import MainHeader from "./components/MainHeader"; // Keep for EventPanel fallback
import InstallPWAPrompt from "./components/InstallPWAPrompt";
import LocationPermissionModal from "./components/LocationPermissionModal";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Admin-only surfaces: the dashboard itself plus the (also admin-only) event
// builder. Neither should get promoter-facing PWA nudges — location tracking
// and the "install the field app" prompt are both about crew members walking
// around an event, not an admin at a desk.
function isAdminRoute(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/event';
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const onAdminRoute = isAdminRoute(location.pathname);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);

  // index.html's manifest-switcher only runs once, on the very first full
  // page load — it has no way to react to client-side (SPA) navigation. Most
  // real sessions start at "/" or an event slug (promoter manifest) and reach
  // "/admin" by clicking through, not by a hard reload — so without this, the
  // <link rel="manifest"> silently stays pointed at the promoter app (id "/")
  // even once the URL bar says /admin. Trying to "install the dashboard app"
  // at that point installs/re-detects the *promoter* app instead — which is
  // exactly why it reports "already installed": as far as the browser can
  // tell, it *is* the same app they installed for promoters. Re-applying the
  // right manifest/meta/icons on every route change keeps it in sync.
  useEffect(() => {
    const manifestLink = document.getElementById('pwa-manifest');
    if (!manifestLink) return;
    const wantAdmin = onAdminRoute;
    const wantHref = wantAdmin ? '/manifest-admin.json?v=3' : '/manifest.json?v=4';
    if (manifestLink.getAttribute('href') === wantHref) return; // already correct, avoid redundant DOM writes

    manifestLink.setAttribute('href', wantHref);
    document.title = wantAdmin ? 'VU Dashboard' : 'VU';

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', wantAdmin ? '#4f46e5' : '#6366f1');

    const appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appTitle) appTitle.setAttribute('content', wantAdmin ? 'VU Dashboard' : 'VU');

    // Admin and promoter share the same icon artwork — only the manifest/name/
    // theme color differ between the two installable apps.
    const iconBase = '/images/icon';
    const iconV = 'v=4';
    document.querySelectorAll(
      'link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"], link[rel="icon"], link[rel="shortcut icon"]'
    ).forEach(el => {
      const sizes = el.getAttribute('sizes');
      const size = sizes === '512x512' ? '512x512' : '192x192';
      el.setAttribute('href', `${iconBase}-${size}.png?${iconV}`);
    });
  }, [onAdminRoute]);

  // Theme Logic — defaults to dark (matches the promoter app's own default) until
  // the user explicitly picks a theme, at which point that choice is remembered.
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return 'dark';
  });

  // The admin / client panel is dark-only: with a light theme saved in the browser (e.g. toggled on
  // the promoter app) its theme-variable surfaces turned white on a dark page. The saved choice is kept
  // for the promoter app.
  // location.pathname: /admin/login and /admin are both «admin routes», so onAdminRoute doesn't change on
  // login — yet AdminLogin applies its own (possibly light) theme, which would otherwise stay on the panel
  // (white cards on the dark page) until a refresh.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', onAdminRoute ? 'dark' : theme);
    localStorage.setItem('theme', theme);
  }, [theme, onAdminRoute, location.pathname]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Auth check for AdminPanel and global user context
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!token) {
      setAuthChecked(true);
      return;
    }
    // Only a 401/403 means the session is invalid — a network error or 5xx
    // just retries instead of logging the admin out.
    let cancelled = false;
    let retryTimer = null;
    const check = (attempt) => {
      axios.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => {
          if (cancelled) return;
          setUser(res.data);
          setAuthChecked(true);
        })
        .catch((err) => {
          if (cancelled) return;
          const status = err.response?.status;
          if (status === 401 || status === 403) {
            setToken('');
            localStorage.removeItem('token');
            setUser(null);
            setAuthChecked(true);
          } else {
            retryTimer = setTimeout(() => check(attempt + 1), Math.min(2000 * (attempt + 1), 10000));
          }
        });
    };
    check(0);
    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, [token]);

  // Legacy header for EventPanel
  const renderAppHeader = (customActions, leftContent) => (
    <MainHeader 
      theme={theme} 
      toggleTheme={toggleTheme} 
      customActions={customActions} 
      leftContent={leftContent} 
    />
  );

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} rtl={true} />
      <InstallPWAPrompt />
      {!onAdminRoute && <LocationPermissionModal apiUrl={API_URL} />}
      <Routes>
        <Route path="/" element={<EventsDirectory theme={theme} toggleTheme={toggleTheme} />} />
        
        {/* Legacy Admin Routes */}
        <Route path="/admin/login" element={<AdminLogin setToken={setToken} setUser={setUser} />} />
        
        <Route path="/admin" element={
          !authChecked ? (
            <PageLoader fullscreen label="در حال بررسی دسترسی" />
          ) : (token && (user?.is_admin || user?.admin_client)) ? (
            <AdminPanel token={token} user={user} theme={theme} toggleTheme={toggleTheme} onBack={() => navigate('/')} onLogout={() => { setToken(''); localStorage.removeItem('token'); setUser(null); navigate('/admin/login'); }} />
          ) : (
            <Navigate to="/admin/login" replace />
          )
        } />
        
        <Route path="/admin/resources" element={
          !authChecked ? (
            <PageLoader fullscreen label="در حال بررسی دسترسی" />
          ) : (token && user?.is_admin) ? (
            <ResourcesPanel token={token} user={user} onBack={() => navigate('/admin')} />
          ) : (
            <Navigate to="/admin/login" replace />
          )
        } />

        <Route path="/event" element={
          !authChecked ? (
            <PageLoader fullscreen label="در حال بررسی دسترسی" />
          ) : (token && user?.is_admin) ? (
            <div className="app-container">
              <EventPanel renderHeader={renderAppHeader} />
            </div>
          ) : (
            <Navigate to="/admin/login" replace />
          )
        } />

        {/* Dynamic Event Routes */}
        <Route path="/:slug/setup" element={<SetupDashboard />} />
        <Route path="/:slug" element={<EventForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;