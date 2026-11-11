import PageLoader from './components/PageLoader';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Search, FileText, CheckCircle2, ShieldCheck, StickyNote, PhoneCall, Phone, UserCheck, Package, UploadCloud, MapPin, Grid, Camera, Users, LogOut, CheckSquare, Plus, Edit2, Download, Trash2, Calendar, Layout, Lock, Settings, ChevronLeft, CalendarDays, Maximize2, Mic, Settings2, MessageSquare, Cloud, X, User, Minus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';
import './index.css';
import MainHeader from "./components/MainHeader";
import InventoryModal from "./components/InventoryModal";
import PromoterChat from "./components/PromoterChat";
import CrewHeader from "./components/crew/CrewHeader";
import CrewBottomNav from "./components/crew/CrewBottomNav";
import CrewEventTab from "./components/crew/CrewEventTab";
import CrewScheduleTab from "./components/crew/CrewScheduleTab";
import CrewProfileTab from "./components/crew/CrewProfileTab";
import "./components/crew/crew.css";
import BVTCigaretteMatch from "./components/BVTCigaretteMatch/BVTCigaretteMatch";
import BVTSamplingReport from "./components/BVTSamplingReport/BVTSamplingReport";
import MehramSupermarketReport from "./components/MehramSupermarketReport/MehramSupermarketReport";
import { startLocationTracking } from "./components/LocationPermissionModal";
import { resolveEffectiveRole, roleLabel } from "./utils/roleUtils";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
// Grace period after check-out before the check-in/check-out photo slots quietly
// clear themselves (locally only) so the form is ready for the next shift.
const CHECKOUT_RESET_DELAY_MS = 5 * 60 * 1000;

const TEHRAN_OFFSET_MS = 210 * 60 * 1000; // Tehran = UTC+3:30

// Mirrors backend/app/main.py SHIFT_CONTINUITY_GRACE — keep both in sync.
const SHIFT_CONTINUITY_GRACE_MS = 4 * 60 * 60 * 1000;

// 'HH:MM' -> minutes since local midnight, or null if missing/unparsable.
function parseHM(raw) {
  if (!raw) return null;
  const [h, m] = String(raw).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Returns a 'YYYY-MM-DD' key (Tehran local date) identifying which shift day
// `ms` belongs to. For overnight events (end_time at/before start_time, e.g.
// 20:00 -> 02:00), timestamps between local midnight and end_time + grace
// still belong to the previous calendar day's shift — mirrors the backend's
// _shift_cutover/_is_same_shift so drafts and submissions don't reset mid-shift.
function shiftDayTehran(event, ms) {
  const local = new Date(ms + TEHRAN_OFFSET_MS);
  const minutesOfDay = local.getUTCHours() * 60 + local.getUTCMinutes();

  const startMin = parseHM(event?.start_time);
  const endMin = parseHM(event?.end_time);
  const isOvernight = startMin !== null && endMin !== null && endMin <= startMin;

  if (isOvernight) {
    const graceMin = endMin + SHIFT_CONTINUITY_GRACE_MS / 60000;
    if (minutesOfDay < graceMin) {
      const prevDay = new Date(local.getTime() - 24 * 60 * 60 * 1000);
      return prevDay.toISOString().slice(0, 10);
    }
  }
  return local.toISOString().slice(0, 10);
}

// Removes every locally-saved draft for this user+event (one per shift day
// they've worked, `vu_draft_${slug}_${userId}_${day}`) — used on logout so
// the next person to log in on this phone starts clean. The logout handlers
// previously tried to remove a `draft_event_${slug}` key that the save/load
// effects never actually wrote to (a leftover key-name mismatch), so this
// cleanup silently never ran at all.
function clearUserDrafts(slug, userId) {
  if (!slug || userId == null) return;
  const prefix = `vu_draft_${slug}_${userId}_`;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) localStorage.removeItem(key);
  }
}


// Small circular upload-progress indicator — shared by the "چیدمان" photo grid
// and the check-in/check-out camera fields so the user can actually see how far
// an upload has gotten instead of staring at an indefinite spinner.
const ProgressRing = ({ pct = 0, size = 40, strokeWidth = 3, textClassName = 'image-upload-progress-pct' }) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="image-upload-progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(127,127,127,0.25)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--primary-color)" strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={`${((clamped / 100) * circ).toFixed(2)} ${circ.toFixed(2)}`}
          className="image-upload-progress-arc"
        />
      </svg>
      <span className={textClassName}>{clamped}</span>
    </div>
  );
};

const SamplingCounterField = ({ field, value, onChange, eventSlug, userRole }) => {
  const [globalStatus, setGlobalStatus] = useState({ target: 0, done: 0 });
  const [loading, setLoading] = useState(true);
  const [localVal, setLocalVal] = useState(Number(value) || 0);
  // Only the captain (supervisor) enters the sampling count — everyone else,
  // including regular promoters, can only view the running total.
  const canEdit = userRole === 'supervisor';

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/events/${eventSlug}/sampling_status`);
      if (res.ok) {
        const data = await res.json();
        setGlobalStatus({ target: data.total_target, done: data.total_done });
      }
    } catch (e) {
      console.error("Failed to fetch sampling status", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 15 seconds to keep it fresh
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [eventSlug]);

  // Sync local changes upstream with a small debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (Number(value) !== localVal) {
        onChange(localVal);
        // After sending to server, update global status optimistic
        fetchStatus();
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [localVal, value, onChange]);

  const diff = localVal - (Number(value) || 0);
  const optimisticDone = (globalStatus.done || 0) + diff;
  const percentage = globalStatus.target > 0 ? Math.min(100, (optimisticDone / globalStatus.target) * 100) : 0;

  return (
    <div className="sampling-counter-wrapper" style={{
      background: 'var(--bg-secondary)',
      padding: '16px',
      borderRadius: '16px',
      border: '1px solid var(--border-color)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Background progress */}
      <motion.div 
        className="sampling-progress-bg"
        initial={{ width: 0 }}
        animate={{ width: `${percentage}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{
          position: 'absolute',
          top: 0, left: 0, bottom: 0,
          background: 'linear-gradient(90deg, rgba(34, 197, 94, 0.05), rgba(34, 197, 94, 0.15))',
          zIndex: 0
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ 
              width: 36, height: 36, borderRadius: '10px', 
              background: 'var(--primary-color)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Package size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>آمار کل رویداد</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={optimisticDone}
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 10, opacity: 0 }}
                    style={{ display: 'inline-block' }}
                  >
                    {optimisticDone}
                  </motion.span>
                </AnimatePresence>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', margin: '0 4px' }}>/</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>{globalStatus.target}</span>
              </div>
            </div>
          </div>
          
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 500, marginBottom: '2px' }}>پیشرفت</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--success-color)' }}>
              {percentage.toFixed(0)}%
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-input)', borderRadius: '12px', padding: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '12px', fontWeight: 600 }}>تعداد توزیع شده توسط شما</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <input 
              type="number"
              value={localVal || ''}
              onChange={(e) => setLocalVal(Math.max(0, parseInt(e.target.value) || 0))}
              disabled={!canEdit}
              style={{
                width: '100%', height: '56px',
                textAlign: 'center', fontSize: '1.5rem', fontWeight: 800,
                background: canEdit ? 'var(--bg-primary)' : 'transparent',
                border: canEdit ? '2px solid var(--border-color)' : 'none',
                borderRadius: '16px', color: 'var(--primary-color)',
                outline: 'none', WebkitAppearance: 'none', margin: 0, fontFamily: 'monospace'
              }}
              className="hide-arrows"
              placeholder={canEdit ? 'عدد وارد کنید...' : ''}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default function EventForm() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [formData, setFormData] = useState({});
  const [briefModalText, setBriefModalText] = useState(null);
  const [checklistPhotoAlert, setChecklistPhotoAlert] = useState(false);
  const syncTimeoutRef = useRef(null);

  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [loginData, setLoginData] = useState({ username: '', password: '', full_name: '', phone_number: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Theme for Promoter - independent of Admin panel
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('promoter_theme');
    if (saved) return saved;
    return 'dark'; // Default to dark mode
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('promoter_theme', theme);
  }, [theme]);

  const [showInventory, setShowInventory] = useState(false);
  const [myTasks, setMyTasks] = useState([]);
  const [newTaskCount, setNewTaskCount] = useState(0);
  const [activeTab, setActiveTab] = useState('event');

  // Image field upload + location field capture state, keyed by field id
  const [uploadingFields, setUploadingFields] = useState({});
  const [uploadErrors, setUploadErrors] = useState({});
  // { [fieldId]: { index, total, pct } } — live upload progress for the loading UI
  const [uploadProgress, setUploadProgress] = useState({});
  const failedUploadsRef = useRef({}); // fieldId → files whose upload failed, for the «تلاش مجدد» button
  const [locationState, setLocationState] = useState({});
  // Moment (ms) each image field was last successfully uploaded — used to judge
  // check-in lateness against the event's start_time without trusting the backend's
  // submitted_at (which gets overwritten on every field edit, not just check-in).
  const [uploadedAt, setUploadedAt] = useState({});

  // Removed duplicate useEffect
  // Auth check - redirect to login if no token
  const [authChecked, setAuthChecked] = useState(false);

  // Only an explicit 401/403 means the session is really gone. A network
  // failure or a 5xx (weak mobile data, server restarting) used to log the
  // promoter out too — mid-shift they'd have to find their password again.
  // Those now just retry until the server answers.
  useEffect(() => {
    if (!token) { setAuthChecked(true); return; }
    let cancelled = false;
    let retryTimer = null;
    const check = (attempt) => {
      fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(async r => {
          if (cancelled) return;
          if (r.ok) {
            setUser(await r.json());
            setAuthChecked(true);
          } else if (r.status === 401 || r.status === 403) {
            setToken(''); localStorage.removeItem('token'); setAuthChecked(true);
          } else {
            throw new Error(`HTTP ${r.status}`);
          }
        })
        .catch(() => {
          if (cancelled) return;
          retryTimer = setTimeout(() => check(attempt + 1), Math.min(2000 * (attempt + 1), 10000));
        });
    };
    check(0);
    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, [token]);

  // A phone can be handed between promoters without a full page reload (a
  // forced 403 logout clears the token in place, then someone else logs in
  // through the same still-mounted form) — formData is page-lifetime React
  // state, so without this reset it keeps whichever previous account's
  // in-progress answers were in memory. The load effect below only
  // overwrites fields the new user's own server/draft data actually has a
  // value for, so anything else silently stayed as the PREVIOUS promoter's
  // leftover answer — which then auto-synced to the backend under the new
  // promoter's own submission. Runs before the load effect (defined first,
  // same [user] change) so the merge always starts from a clean slate.
  const prevUserIdRef = useRef(null);
  const draftResyncRef = useRef(null);
  useEffect(() => {
    const uid = user?.id ?? null;
    if (prevUserIdRef.current !== uid) {
      prevUserIdRef.current = uid;
      if (uid !== null) setFormData({});
    }
  }, [user]);

  // Load event
  useEffect(() => {
    fetch(`${API_URL}/events/${slug}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { setEvent(data); setLoading(false); })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [slug]);

  // Load tasks
  useEffect(() => {
    if (token && user && !user.is_admin) {
      fetch(`${API_URL}/tasks/my`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then(data => {
          setMyTasks(data);
        })
        .catch(console.error);
    }
  }, [token, user]);

  // Load dynamic team
  const [dynamicTeam, setDynamicTeam] = useState(null);
  useEffect(() => {
    if (!slug) return;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${API_URL}/events/${slug}/team`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data)) setDynamicTeam(data);
      })
      .catch(console.error);
  }, [slug, token]);

  useEffect(() => {
    // Scoped by user.id, not just event+day — without this, a draft saved by
    // whoever was last logged in on this device persists in localStorage and
    // gets picked up (and re-submitted to the backend under their name) by
    // the NEXT promoter who logs in on the same phone for the same event,
    // even though they're a completely different account.
    if (!slug || !user || Object.keys(formData).length === 0) return;
    const draftKey = `vu_draft_${slug}_${user.id}_${shiftDayTehran(event, Date.now())}`;
    localStorage.setItem(draftKey, JSON.stringify(formData));
  }, [formData, slug, event, user]);


  // Access Control check — hard-block non-admin promoters from wrong events
  useEffect(() => {
    if (user && event && !user.is_admin) {
      if (user.role === 'setup') {
        navigate(`/${slug}/setup`, { replace: true });
        return;
      }
      // Strict access control: if promoter belongs to a different event, log them out
      if (user.event_id !== null && user.event_id !== undefined && user.event_id !== event.id) {
        // Clear session and redirect to login
        setToken('');
        setUser(null);
        localStorage.removeItem('token');
        setAuthError('شما به این رویداد دسترسی ندارید. لطفاً با اکانت مربوط به این رویداد وارد شوید.');
        return;
      }
    }
  }, [user, event, navigate, slug]);

  // Heartbeat — update last_seen every 60 seconds while logged in
  useEffect(() => {
    if (!token || !user) return;
    // Call immediately on login
    fetch(`${API_URL}/heartbeat`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => { });
    const interval = setInterval(() => {
      fetch(`${API_URL}/heartbeat`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => { });
    }, 60000);
    return () => clearInterval(interval);
  }, [token, user]);

  // Live Location Tracking — delegates to the shared helper so behaviour is
  // consistent with the first-launch permission modal in App.jsx.
  // Runs whenever token becomes available (i.e. after login).
  useEffect(() => {
    const savedPerm = localStorage.getItem('vu_location_permission');
    if (token && savedPerm === 'granted') {
      startLocationTracking(API_URL);
    }
    return () => {
      // Cleanup is handled globally; individual unmounts don't stop tracking
    };
  }, [token]);

  // Tracks the shift-day (see shiftDayTehran) that `formData` currently
  // reflects, so the watcher below can tell when it's gone stale.
  const currentShiftDayRef = useRef(null);

  // Fetch existing submission for today if it exists, otherwise auto-fill from
  // profile. Also re-invoked by the shift-day watcher effect below when the
  // day rolls over while the app stays open on a promoter's phone.
  const loadTodaySubmission = React.useCallback(() => {
    if (!token || !user || !event) return undefined;

    let isMounted = true;
    fetch(`${API_URL}/events/${slug}/my-submission-today`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(r => {
      if (r.status === 403) {
        // Promoter doesn't belong to this event - force logout
        setToken('');
        setUser(null);
        localStorage.removeItem('token');
        setAuthError('شما به این رویداد دسترسی ندارید. لطفاً با اکانت مربوط به این رویداد وارد شوید.');
        return null;
      }
      return r.ok ? r.json() : null;
    })
    .then(data => {
      if (!isMounted || data === null) return;

      const todayShiftDay = shiftDayTehran(event, Date.now());
      currentShiftDayRef.current = todayShiftDay;

      // Check if server data belongs to the current shift day
      // submitted_at from server is UTC ISO string
      let serverDataIsToday = false;
      if (data && data.submitted_at) {
        const submittedMs = new Date(data.submitted_at).getTime();
        serverDataIsToday = shiftDayTehran(event, submittedMs) === todayShiftDay;
      }

      // Today's draft key (shift-day + user aware — see the save effect above
      // for why user.id has to be part of this key)
      const draftKey = `vu_draft_${slug}_${user.id}_${todayShiftDay}`;
      const savedDraft = localStorage.getItem(draftKey);
      const parsedDraft = savedDraft ? JSON.parse(savedDraft) : {};

      // Auto-fill map — date_now and time_now are ALWAYS today's values
      const autoMap = {
        username: user.username,
        full_name: user.full_name,
        phone_number: user.phone_number,
        team_name: user.team_name,
        date_now: new Date().toLocaleDateString('fa-IR'),
        time_now: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      };

      setFormData(prev => {
        const next = { ...prev };

        // Apply autoFill from profile (only if field is empty)
        event.fields.forEach(f => {
          if (f.autoFill && autoMap[f.autoFill] && !next[f.id]) {
            next[f.id] = autoMap[f.autoFill];
          }
        });

        // Only merge server data if it is from today — prevent yesterday's data bleeding in
        if (serverDataIsToday && data && data.data) {
          Object.assign(next, data.data);
        }

        // Merge today's local draft (but never bring flags from local)
        if (parsedDraft._flags !== undefined) {
          delete parsedDraft._flags;
        }
        Object.assign(next, parsedDraft);
        // The draft may hold changes whose sync never reached the server (app
        // closed while offline) — resend the merged snapshot once loaded.
        if (Object.keys(parsedDraft).length > 0) draftResyncRef.current = next;

        // Always override date/time auto-fields with current values
        event.fields.forEach(f => {
          if (f.autoFill === 'date_now') next[f.id] = autoMap.date_now;
          if (f.autoFill === 'time_now') next[f.id] = autoMap.time_now;
        });

        return next;
      });
      setTimeout(() => {
        if (draftResyncRef.current) {
          const snapshot = draftResyncRef.current;
          draftResyncRef.current = null;
          syncDataToBackend(snapshot);
        }
      }, 0);
    })
    .catch(console.error);

    return () => { isMounted = false; };
  }, [token, user, event, slug]);

  useEffect(() => {
    const cleanup = loadTodaySubmission();
    return cleanup;
  }, [loadTodaySubmission]);

  // Shift-day rollover watcher — a promoter's phone commonly keeps the app
  // open (backgrounded, not closed) across midnight, especially for events
  // with variable/overnight hours. Without this, `formData` in memory never
  // resets: the fetch above only runs once per (token/user/event/slug), so
  // yesterday's check-in photo, checklist, and report fields silently stick
  // around and even get written back into today's localStorage draft the
  // moment the promoter edits anything. Poll the shift-day (and re-check on
  // tab focus/visibility, which fires reliably when a backgrounded phone app
  // is reopened) and reset local state once it actually changes.
  useEffect(() => {
    const checkShiftDayRollover = () => {
      if (!event || currentShiftDayRef.current === null) return;
      const nowShiftDay = shiftDayTehran(event, Date.now());
      if (nowShiftDay !== currentShiftDayRef.current) {
        currentShiftDayRef.current = nowShiftDay;
        setFormData({});
        setUploadedAt({});
        setUploadProgress({});
        setUploadErrors({});
        setLocationState({});
        loadTodaySubmission();
      }
    };
    const interval = setInterval(checkShiftDayRollover, 60000);
    document.addEventListener('visibilitychange', checkShiftDayRollover);
    window.addEventListener('focus', checkShiftDayRollover);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', checkShiftDayRollover);
      window.removeEventListener('focus', checkShiftDayRollover);
    };
  }, [event, loadTodaySubmission]);

  const checkinField = event?.fields?.find(f => f.type === 'camera_checkin');
  const checkoutField = event?.fields?.find(f => f.type === 'camera_checkout');
  const checkoutVal = checkoutField ? formData[checkoutField.id] : null;
  const hasCheckedOut = Array.isArray(checkoutVal) ? checkoutVal.length > 0 : !!checkoutVal;

  // Stats for this event
  const [stats, setStats] = useState({ today: 0, week: 0, total: 0 });
  const [showHistory, setShowHistory] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const formatNumber = (v) => { if (!v) return ''; return v.toString().replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  const unformatNumber = (v) => { if (!v) return ''; return v.toString().replace(/,/g, ''); };

  // Helper: Compress Image Client-Side before upload.
  // Deliberately NOT skipping HEIC/HEIF (the default iPhone photo format) anymore —
  // Safari decodes it fine via Image(), and re-encoding it to JPEG here is what fixes
  // the iPhone-only upload failures: a raw "Original quality" HEIC file can exceed the
  // 15MB upload cap and sometimes arrives with a filename Safari didn't give a proper
  // extension, both of which this canvas pass sidesteps by always producing a small .jpg.
  // GIFs are still skipped so animation isn't destroyed.
  const compressImage = (file, quality = 0.7, maxWidth = 1024) => {
    return new Promise((resolve) => {
      const looksLikeImage = /^image\//.test(file.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name || '');
      if (!looksLikeImage || file.type === 'image/gif') {
        return resolve(file);
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => resolve(file); // Browser couldn't decode it (e.g. HEIC on a non-Apple browser) — upload the original
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          
          // Weak mobile links drop big request bodies (nginx answered 400/408 for a promoter's
          // multi-MB photos), so keep shrinking until the photo is small enough to send reliably.
          const TARGET_BYTES = 300 * 1024; // the server is abroad: the smaller the body, the likelier it survives a lossy mobile uplink
          const attempt = (w, h, q) => {
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            canvas.toBlob((blob) => {
              if (!blob) return resolve(file);
              if (blob.size > TARGET_BYTES && q > 0.45) return attempt(Math.round(w * 0.85), Math.round(h * 0.85), q - 0.1);
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile.size < file.size ? compressedFile : file);
            }, 'image/jpeg', q);
          };
          attempt(width, height, quality);
        };
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

  // Uploads a single image file to the backend and returns its public URL.
  // Uses XMLHttpRequest (not fetch) specifically so upload.onprogress gives us real
  // byte-level progress for the loading UI — fetch has no upload progress API.
  const UPLOAD_TIMEOUT_MS = 150 * 1000;
  const newUploadId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
  // On a weak link the photo can reach the server while the response never reaches the phone, leaving the
  // upload "stuck at 100%". The server remembers each upload id, so ask it (tiny request) before re-sending.
  const checkUploadStatus = async (uploadId) => {
    for (let i = 0; i < 8; i += 1) {
      try {
        const res = await fetch(`${API_URL}/upload/status/${uploadId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) { const d = await res.json(); if (d.url) return d.url; }
        if (res.status === 404 && i >= 1) return null; // server never got it
      } catch { /* still offline — try again */ }
      await new Promise((r) => setTimeout(r, 2500));
    }
    return null;
  };
  const uploadImageFile = async (file, onProgress) => {
    const compressedFile = await compressImage(file);
    const uploadId = newUploadId();
    const sendOnce = () => new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', compressedFile);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/upload/image`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('X-Upload-Id', uploadId);
      xhr.timeout = UPLOAD_TIMEOUT_MS;
      let bodySent = false;
      let stalledTimer = null;
      const finish = (fn, v) => { clearTimeout(stalledTimer); fn(v); };
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
      };
      // Whole photo sent but no answer for 20s: the response was probably lost — ask the server.
      xhr.upload.onload = () => {
        bodySent = true;
        stalledTimer = setTimeout(async () => {
          const url = await checkUploadStatus(uploadId);
          if (url) { xhr.abort(); onProgress?.(100); resolve(url); }
        }, 20000);
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* non-JSON error body */ }
        if (xhr.status >= 200 && xhr.status < 300 && data.url) {
          onProgress?.(100);
          finish(resolve, data.url);
        } else {
          const err = new Error(data.detail || 'خطا در آپلود عکس');
          err.final = xhr.status >= 400 && xhr.status < 500 && xhr.status !== 408;
          finish(reject, err);
        }
      };
      xhr.onerror = () => finish(reject, new Error('اتصال اینترنت برقرار نشد — دوباره تلاش کنید'));
      xhr.ontimeout = () => finish(reject, new Error('آپلود بیش از حد طول کشید — اینترنت را بررسی کنید و دوباره تلاش کنید'));
      xhr.onabort = () => clearTimeout(stalledTimer);
      xhr.send(fd);
    });
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await sendOnce();
      } catch (err) {
        if (err.final) throw err;
        lastErr = err;
        // The failed attempt may still have stored the photo — recover it instead of re-sending.
        const stored = await checkUploadStatus(uploadId);
        if (stored) { onProgress?.(100); return stored; }
        onProgress?.(0);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    throw lastErr;
  };

  // Files are uploaded strictly one at a time (not in parallel) — this is what keeps
  // multi-photo uploads from a flaky mobile connection reliable instead of racing
  // several large requests at once and silently dropping/corrupting one of them.
  const handleImageFilesSelected = async (fieldId, files, currentUrls, multiple) => {
    if (!files.length) return;
    delete failedUploadsRef.current[fieldId];
    setUploadErrors(prev => ({ ...prev, [fieldId]: '' }));
    setUploadingFields(prev => ({ ...prev, [fieldId]: true }));
    setUploadProgress(prev => ({ ...prev, [fieldId]: { index: 1, total: files.length, pct: 0 } }));
    try {
      const uploaded = [];
      for (let i = 0; i < files.length; i++) {
        const url = await uploadImageFile(files[i], (pct) => {
          setUploadProgress(prev => ({ ...prev, [fieldId]: { index: i + 1, total: files.length, pct } }));
        });
        uploaded.push(url);
      }
      const nowMs = Date.now();
      setFormData(prev => {
        const existingTime = prev[`${fieldId}_time`];
        const nextData = { 
          ...prev, 
          [fieldId]: multiple ? [...(Array.isArray(prev[fieldId]) ? prev[fieldId] : (prev[fieldId] ? [prev[fieldId]] : [])), ...uploaded] : uploaded, 
          [`${fieldId}_time`]: existingTime || nowMs 
        };
        
        // Clear flag if it exists for this field
        if (nextData._flags && nextData._flags[fieldId]) {
          const nextFlags = { ...nextData._flags };
          delete nextFlags[fieldId];
          nextData._flags = nextFlags;
        }

        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => syncDataToBackend(nextData), 500);
        return nextData;
      });
      setUploadedAt(prev => ({ ...prev, [fieldId]: nowMs }));
    } catch (err) {
      failedUploadsRef.current[fieldId] = { files, multiple };
      setUploadErrors(prev => ({ ...prev, [fieldId]: err.message || 'خطا در آپلود عکس' }));
    } finally {
      setUploadingFields(prev => ({ ...prev, [fieldId]: false }));
      setUploadProgress(prev => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const removeImageAt = (fieldId, currentUrls, index) => {
    handleChange(fieldId, currentUrls.filter((_, i) => i !== index));
  };

  const captureLocation = (fieldId) => {
    if (!navigator.geolocation) {
      setLocationState(prev => ({ ...prev, [fieldId]: { status: 'unsupported' } }));
      return;
    }
    setLocationState(prev => ({ ...prev, [fieldId]: { status: 'loading' } }));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
        handleChange(fieldId, mapsUrl);
        let address = '';
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=fa`);
          if (res.ok) {
            const data = await res.json();
            address = data.display_name || '';
          }
        } catch { /* reverse geocoding is a nice-to-have; ignore failures */ }
        setLocationState(prev => ({ ...prev, [fieldId]: { status: 'success', address } }));
      },
      (err) => {
        setLocationState(prev => ({ ...prev, [fieldId]: { status: err.code === 1 ? 'denied' : 'error' } }));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorderRef.current.onstop = () => {
        setAudioBlob(new Blob(audioChunksRef.current, { type: 'audio/webm' }));
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    } catch { alert('دسترسی به میکروفون رد شد'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
      setShowVoiceModal(true);
    }
  };

  const sendVoiceToAI = async () => {
    if (!audioBlob) return;
    setAiLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', audioBlob, 'voice.webm');
      const res = await fetch(`${API_URL}/ai/analyze-voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const map = {
        store_name: data.store_name,
        business_type: data.business_type,
        seller_role: data.seller_role,
        note: data.note,
        transaction_amount: data.transaction_amount,
        address_floor: data.address_floor,
      };
      // Map AI fields to event form fields by autoFill key or label match
      if (event) {
        const next = { ...formData };
        event.fields.forEach(f => {
          const key = f.autoFill || f.label;
          if (map[key]) next[f.id] = map[key];
        });
        setFormData(next);
      }
      setShowVoiceModal(false);
      setAudioBlob(null);
    } catch { alert('خطا در آنالیز صدا'); }
    finally { setAiLoading(false); }
  };

  const doLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: loginData.username, 
          password: loginData.password,
          event_slug: slug
        })
      });
      if (!res.ok) {
        // A proxy error page (502/504) isn't JSON — don't show "Unexpected token <".
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || (res.status >= 500 ? 'سرور در دسترس نیست، چند لحظه دیگر دوباره تلاش کنید' : 'خطا در ورود'));
      }
      const data = await res.json();
      setToken(data.access_token);
      localStorage.setItem('token', data.access_token);
    } catch (e) {
      setAuthError(e instanceof TypeError ? 'اتصال اینترنت برقرار نیست — دوباره تلاش کنید' : e.message);
    }
    finally { setAuthLoading(false); }
  };

  // Latest snapshot the server hasn't confirmed yet. Syncing used to be a single
  // fire-and-forget request: if the connection dropped at that moment (common
  // on event-floor mobile data), the change never reached the admin unless the
  // promoter happened to edit another field later — checkout, being the last
  // step, was the usual casualty. Now a failed sync keeps retrying, and is
  // flushed again as soon as the phone is back online / the app is reopened.
  const pendingSyncRef = useRef(null);
  const syncRetryRef = useRef({ timer: null, attempt: 0 });

  const syncDataToBackend = async (dataToSync) => {
    if (!slug || !dataToSync) return;
    pendingSyncRef.current = dataToSync;
    clearTimeout(syncRetryRef.current.timer);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/events/${slug}/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify(dataToSync)
      });
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        // Saved — or rejected for a reason a retry can't fix (auth/validation).
        if (!res.ok) console.error('Sync rejected:', res.status);
        if (pendingSyncRef.current === dataToSync) pendingSyncRef.current = null;
        syncRetryRef.current.attempt = 0;
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error('Sync error, will retry:', err);
      if (pendingSyncRef.current !== dataToSync) return; // a newer snapshot owns the retry
      const attempt = ++syncRetryRef.current.attempt;
      syncRetryRef.current.timer = setTimeout(
        () => syncDataToBackend(pendingSyncRef.current),
        Math.min(3000 * attempt, 30000)
      );
    }
  };

  useEffect(() => {
    const flush = () => {
      if (pendingSyncRef.current && document.visibilityState !== 'hidden') {
        syncRetryRef.current.attempt = 0;
        syncDataToBackend(pendingSyncRef.current);
      }
    };
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', flush);
      clearTimeout(syncRetryRef.current.timer);
    };
  });

  const handleChange = (fieldId, value) => {
    setFormData(prev => {
      const nextData = { ...prev, [fieldId]: value };

      // Auto-sync debounce
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        syncDataToBackend(nextData);
      }, 500);

      return nextData;
    });
  };

  // Submit flow removed in favor of auto-sync

  const renderSectionField = (f) => {
    // If it's a primitive type, fallback to original logic for custom sections or fallback
    const val = formData[f.id] ?? '';
    const onChange = (v) => handleChange(f.id, v);
    const isAutoFilled = f.autoFill && val;

    switch (f.type) {
      case 'sampling_counter':
        return (
          <SamplingCounterField 
            field={f} 
            value={val} 
            onChange={onChange} 
            eventSlug={slug} 
            userRole={resolveEffectiveRole(user, event)}
          />
        );
      case 'bvt_cigarette_match':
        return (
          <BVTCigaretteMatch
            field={f}
            history={formData[`${f.id}_history`] || []}
            onChange={handleChange}
          />
        );
      case 'bvt_sampling_report':
        return (
          <BVTSamplingReport
            field={f}
            counts={formData[`${f.id}_counts`] || {}}
            onChange={handleChange}
          />
        );
      case 'mehram_supermarket_report':
        return (
          <MehramSupermarketReport
            field={f}
            reports={formData[`${f.id}_reports`] || []}
            calls={formData[`${f.id}_calls`] || {}}
            onChange={handleChange}
            uploadImage={uploadImageFile}
            token={token}
            hideSelfie={user?.team_name === 'mahram-viewer'}
          />
        );
      case 'sales':
        return (
          <div className="section-inputs-group">
            <input className="input-field" type="number" value={formData[`${f.id}_amount`] || ''} onChange={e => handleChange(`${f.id}_amount`, e.target.value)} placeholder="� روش ریالی (تومان)" required={f.required} />
            <input className="input-field mt-2" type="number" placeholder="� روش تعدادی (عدد)" value={formData[`${f.id}_count`] || ''} onChange={e => handleChange(`${f.id}_count`, e.target.value)} required={f.required} />
          </div>
        );
      case 'gps':
      case 'location': {
        const locState = locationState[f.id] || {};
        return (
          <div className="location-field-wrapper">
            <div className="location-input-group">
              <input
                className="input-field"
                placeholder="برای دریافت خودکار، دکمه کنار را بزن یا دستی وارد کن"
                value={val}
                onChange={e => onChange(e.target.value)}
                required={f.required}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className={`location-btn ${locState.status === 'loading' ? 'loading' : ''}`}
                disabled={locState.status === 'loading'}
                onClick={() => captureLocation(f.id)}
                title="دریافت موقعیت فعلی"
              >
                {locState.status === 'loading' ? (
                  <span className="spin-icon" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" style={{ width: 18, height: 18 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                )}
              </button>
            </div>
            {locState.status === 'loading' && <span className="location-status">📍 در حال دریافت موقعیت...</span>}
            {locState.status === 'success' && (
              <span className="location-status success">✓ موقعیت ثبت شد{locState.address ? `: ${locState.address}` : ''}</span>
            )}
            {locState.status === 'denied' && (
              <span className="location-status error">دسترسی به موقعیت مکانی رد شد. از تنظیمات مرورگر اجازه بده یا آدرس را دستی وارد کن.</span>
            )}
            {locState.status === 'error' && (
              <span className="location-status error">خطا در دریافت موقعیت. دوباره تلاش کن یا دستی وارد کن.</span>
            )}
            {locState.status === 'unsupported' && (
              <span className="location-status error">مرورگر شما از موقعیت مکانی پشتیبانی نمی‌کند.</span>
            )}
          </div>
        );
      }
      case 'photos':
      case 'image':
      case 'camera': {
        const urls = Array.isArray(val) ? val : (val ? [val] : []);
        const isCamera = f.type === 'camera';
        const allowMultiple = f.multiple !== false; // for photos it's usually multiple
        const uploading = !!uploadingFields[f.id];
        const progress = uploadProgress[f.id];
        const error = uploadErrors[f.id];
        const showAddTile = !uploading && (allowMultiple || urls.length === 0);
        // Gallery mode: two explicit buttons — live camera shot OR upload from the
        // device gallery (multi-select). A plain 'photos' field keeps its single tile.
        const dualSource = f.type === 'photos' && f.photoSource === 'both';
        const flag = formData._flags?.[f.id];
        const onFilesPicked = (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          handleImageFilesSelected(f.id, files, urls, allowMultiple);
        };
        return (
          <div className={`image-upload-field${dualSource ? ' image-upload-field--gallery' : ''}`}>
            {flag && (!flag.reason || !flag.reason.startsWith('ADMIN_ONLY')) && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-xl mb-3 flex items-start gap-2 text-right">
                <span className="shrink-0 mt-0.5">❌</span>
                <div>
                  <div className="font-bold mb-1">این تصویر توسط ادمین تایید نشد</div>
                  <div className="opacity-90">{flag.reason}</div>
                  <div className="text-xs opacity-75 mt-1">لطفا مجددا عکس بگیرید</div>
                </div>
              </div>
            )}
            <div className="image-upload-grid">
              {urls.map((u, i) => (
                <div className="image-upload-tile image-upload-tile--photo" key={i}>
                  <img src={u} alt="" loading="lazy" />
                  <button type="button" className="image-upload-remove" onClick={() => removeImageAt(f.id, urls, i)} title="حذف عکس">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              {uploading && (
                <div className="image-upload-tile image-upload-tile--loading">
                  <ProgressRing pct={progress?.pct || 0} />
                </div>
              )}
              {showAddTile && !dualSource && (
                <label className="image-upload-tile image-upload-tile--add">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    multiple={allowMultiple}
                    capture={isCamera ? 'environment' : undefined}
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      e.target.value = '';
                      handleImageFilesSelected(f.id, files, urls, allowMultiple);
                    }}
                  />
                  {isCamera ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.174C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" /></svg>
                  )}
                  <span>{isCamera ? 'گرفتن عکس' : 'انتخاب عکس'}</span>
                </label>
              )}
            </div>
            {dualSource && !uploading && (
              <div className="image-upload-add-row">
                <label className="image-upload-tile image-upload-tile--add image-upload-tile--camera">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    capture="environment"
                    onChange={onFilesPicked}
                  />
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.174C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
                  <span>گرفتن عکس با دوربین</span>
                </label>
                <label className="image-upload-tile image-upload-tile--add">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    multiple
                    onChange={onFilesPicked}
                  />
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" /></svg>
                  <span>آپلود از گالری</span>
                </label>
              </div>
            )}
            {uploading && progress && (
              <div className="image-upload-progress-bar-wrap">
                <div className="image-upload-progress-bar-track">
                  <div className="image-upload-progress-bar-fill" style={{ width: `${progress.pct}%` }} />
                </div>
                <span className="image-upload-progress-caption">
                  در حال آپلود عکس {progress.index} از {progress.total} — {progress.pct}٪
                </span>
              </div>
            )}
            {error && <span className="location-status error">{error}</span>}
          </div>
        );
      }
      case 'camera_checkin':
      case 'camera_checkout': {
        const urls = Array.isArray(val) ? val : (val ? [val] : []);
        const error = uploadErrors[f.id];
        const isCheckin = f.type === 'camera_checkin';
        const uploading = !!uploadingFields[f.id];
        const progress = uploadProgress[f.id];

        let isLate = false;
        if (isCheckin && urls.length > 0) {
          const ts = formData[`${f.id}_time`] || uploadedAt[f.id];
          const uploadMoment = ts ? new Date(ts) : new Date();

          let targetTimeStr = event?.start_time;
          if (event?.custom_times) {
             const formatEng = (str) => String(str || '').replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٥٦٧٨٩".indexOf(d));
             const subJalali = formatEng(uploadMoment.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }));
             const subJalaliNoZero = formatEng(uploadMoment.toLocaleDateString('fa-IR'));
             
             const matchedKey = Object.keys(event.custom_times).find(k => {
                 const cleanK = formatEng(k);
                 return cleanK === subJalali || cleanK === subJalaliNoZero || cleanK.replace(/\b0/g, '') === subJalaliNoZero;
             });
             if (matchedKey && event.custom_times[matchedKey].start) {
                 targetTimeStr = event.custom_times[matchedKey].start;
             }
          }

          if (targetTimeStr) {
              const [tH, tM] = targetTimeStr.split(':').map(Number);
              const target = new Date(uploadMoment);
              target.setHours(tH, tM, 0, 0);
              isLate = uploadMoment > target;
          }
        }
        const statusMessage = urls.length === 0 ? null
          : isCheckin ? (isLate ? 'ورود شما با تاخیر ثبت شد' : 'ورود شما ثبت شد')
          : 'خروج شما ثبت شد';

        const flag = formData._flags?.[f.id];

        return (
          <div className={`camera-check-field p-4 border rounded-2xl text-center space-y-3 shadow-2xs ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-slate-200/90'}`}>
            {flag && (!flag.reason || !flag.reason.startsWith('ADMIN_ONLY')) && (
              <div className="bg-red-500/10 text-red-600 dark:text-red-400 text-sm p-3 rounded-xl flex items-center justify-between text-right border border-red-500/20 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="shrink-0">⚠️</span>
                  <div>
                    <div className="font-bold text-[13px]">تصویر تایید نشد:</div>
                    <div className="text-xs opacity-90 mt-0.5">{flag.reason}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeImageAt(f.id, urls, 0)}
                  className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold shadow hover:bg-red-600 transition-colors shrink-0"
                >
                  عکاسی مجدد
                </button>
              </div>
            )}
            {uploading ? (
              <div className="w-full flex flex-col items-center justify-center py-6">
                <ProgressRing pct={progress?.pct || 0} size={64} strokeWidth={4} textClassName="image-upload-progress-pct--lg" />
                <span className="text-xs text-gray-500 mt-3 font-bold">در حال آپلود عکس... {progress?.pct || 0}٪</span>
              </div>
            ) : urls.length > 0 ? (
              <div>
                <div className={`relative w-36 h-36 mx-auto rounded-2xl overflow-hidden border-2 ${flag ? 'border-red-500 shadow-red-500/30' : 'border-emerald-500'} shadow-md group`}>
                  <img src={urls[0]} alt={isCheckin ? 'تصویر ورود' : 'تصویر خروج'} className="w-full h-full object-cover" />
                  
                  {/* Status Overlay */}
                  <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity ${flag ? 'opacity-0' : 'opacity-100'}`}>
                    <CheckCircle2
                      size={38}
                      strokeWidth={2.3}
                      className={`rounded-full bg-white/90 dark:bg-zinc-900/90 shadow-lg ${isLate ? 'text-amber-500' : 'text-emerald-500'}`}
                    />
                  </div>
                </div>
                {statusMessage && (
                  <p className={`mt-2 text-xs font-extrabold ${isLate ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {statusMessage}
                  </p>
                )}
              </div>
            ) : (
              <label
                className={`w-full py-3.5 px-4 font-bold text-xs rounded-xl cursor-pointer shadow-2xs transition-all border ${theme === 'dark' ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-slate-200' : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  capture="environment"
                  className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    if (files.length > 0) {
                      handleImageFilesSelected(f.id, files, [], false);
                    }
                  }}
                />
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Camera size={18} className={`shrink-0 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`} />
                  <span className="text-xs font-bold" style={{ transform: 'translateY(1.5px)' }}>
                    {isCheckin ? 'ثبت تصویر ورود (دوربین مستقیم)' : 'ثبت تصویر خروج (دوربین مستقیم)'}
                  </span>
                </div>
              </label>
            )}
            {error && <span className="location-status error">{error}</span>}
          </div>
        );
      }

      case 'brief_reader': {
        const isRead = !!formData[`${f.id}_read`];
        return (
          <div className={`brief-reader-card p-4 border rounded-2xl shadow-2xs ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-slate-200/80'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <FileText size={20} />
                </div>
                <div>
                  <h4 className={`text-xs font-bold leading-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{f.title || 'مطالعه پروتکل رویداد'}</h4>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBriefModalText({
                    title: f.title || 'بریف و قوانین رویداد',
                    text: f.briefText || f.description || 'به رویداد سمپلینگ خوش آمدید.\n۱. حفظ آراستگی و لبخند پروموتر\n۲. معرفی ویژگی‌های اصلی محصول\n۳. توزیع و شمارش دقیق سمپل‌ها',
                    fieldId: f.id
                  });
                }}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-2xs transition-all flex items-center gap-1 shrink-0 cursor-pointer ${isRead
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
              >
                {isRead ? <><CheckCircle2 size={13} /> مطالعه شد</> : 'مطالعه پروتکل ➔'}
              </button>
            </div>
          </div>
        );
      }

      case 'advanced_checklist': {
        const items = f.checklistItems || [
          { title: 'تحویل وسایل، استند و نمونه محصولات', role: 'supervisor', attachPhoto: true },
          { title: 'حضور در لوکیشن و اعلام ورود به مدیر', role: 'supervisor', attachPhoto: false },
          { title: 'چیدمان میز سمپلینگ و پرچم برند', role: 'setup', attachPhoto: true }
        ];
        const checkedState = formData[`${f.id}_checklist`] || {};
        return (
          <div className="advanced-checklist-wrapper space-y-2.5">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className={`text-xs font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                📋 لیست وظایف آماده‌سازی
              </span>
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                <Cloud size={10} className="text-emerald-600 shrink-0" /> Synced
              </span>
            </div>

            {items.map((item, idx) => {
              const itemChecked = !!checkedState[idx];
              const userRole = resolveEffectiveRole(user, event);
              const defaultPerm = (item.role === userRole) ? 'edit' : 'view';
              const effectivePerm = item.permissions ? item.permissions[userRole] : defaultPerm;

              if (effectivePerm === 'hidden') return null;

              const canEdit = effectivePerm === 'edit';

              const itemRoleLabel = item.role === 'supervisor' ? 'کاپیتان' : item.role === 'setup' ? 'ست‌آپ' : item.role === 'collection' ? 'کالکشن' : 'پروموتر';
              const itemRoleBadgeClass = item.role === 'supervisor' ? 'bg-amber-400 text-amber-950' : item.role === 'setup' ? 'bg-amber-500 text-amber-950' : item.role === 'collection' ? 'bg-purple-400 text-purple-950' : 'bg-sky-400 text-sky-950';

              const photoKey = `${f.id}_photo_${idx}`;
              const photoVal = formData[photoKey];
              const photoUrls = Array.isArray(photoVal) ? photoVal : (photoVal ? [photoVal] : []);
              const photoUploading = !!uploadingFields[photoKey];

              const handleToggle = () => {
                if (!canEdit) return;
                if (!itemChecked && item.attachPhoto && photoUrls.length === 0) {
                  setChecklistPhotoAlert(true);
                  return;
                }
                const nextState = { ...checkedState, [idx]: !itemChecked };
                handleChange(`${f.id}_checklist`, nextState);
              };

              return (
                <div key={idx} className={`rounded-2xl border p-3 shadow-2xs space-y-2 ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-slate-200/90'} ${!canEdit ? 'opacity-75' : ''}`}>
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={handleToggle}
                      className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center shrink-0 mt-0.5 ${!canEdit ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${itemChecked
                        ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 border-emerald-500 text-white shadow-xs scale-105'
                        : (theme === 'dark' ? 'bg-zinc-900 border-zinc-600 ' + (canEdit ? 'hover:border-indigo-400' : '') : 'bg-white border-slate-300 ' + (canEdit ? 'hover:border-indigo-400' : ''))
                        }`}
                    >
                      {itemChecked && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      )}
                    </button>

                    <div className={`flex-1 ${canEdit ? 'cursor-pointer' : 'cursor-default'}`} onClick={() => canEdit && handleToggle()}>
                      <span className={`text-xs font-bold block leading-snug transition-all ${itemChecked ? (theme === 'dark' ? 'line-through text-slate-500' : 'line-through text-slate-400') : (theme === 'dark' ? 'text-gray-100' : 'text-gray-900')}`}>
                        {item.title}
                      </span>

                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className={`text-[8px] font-bold px-2.5 py-0.5 rounded-full shadow-2xs ${itemRoleBadgeClass}`}>
                          {itemRoleLabel}
                        </span>
                        {item.attachPhoto && (
                          <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 flex items-center gap-0.5">
                            <Camera size={8} /> عکس الزامی
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {item.attachPhoto && (
                    <div className="pt-1 pr-8">
                      {formData._flags?.[`${f.id}_${idx}`] && (!formData._flags[`${f.id}_${idx}`].reason || !formData._flags[`${f.id}_${idx}`].reason.startsWith('ADMIN_ONLY')) && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] p-2 rounded-lg mb-2 flex items-start gap-1.5 text-right w-full">
                          <span className="shrink-0">❌</span>
                          <div>
                            <div className="font-bold">عکس تایید نشد:</div>
                            <div className="opacity-90">{formData._flags[`${f.id}_${idx}`].reason}</div>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex flex-wrap items-center gap-2">
                        {canEdit && (
                          <label className={`inline-flex items-center justify-center whitespace-nowrap gap-1.5 border text-[10px] font-bold px-2.5 py-1 rounded-xl shadow-2xs transition-colors cursor-pointer ${theme === 'dark' ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-slate-300' : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'}`}>
                            <input type="file" accept="image/*" multiple className="hidden" onChange={e => {
                              const files = Array.from(e.target.files || []);
                              e.target.value = '';
                              if (files.length > 0) {
                                handleImageFilesSelected(photoKey, files, photoUrls, true);
                              }
                            }} />
                            <Camera size={12} className={theme === 'dark' ? 'text-slate-400' : 'text-slate-600'} />
                            <span>{photoUrls.length > 0 ? 'افزودن عکس دیگر' : 'افزودن عکس وظیفه'}</span>
                          </label>
                        )}
                        
                        {/* Show all uploaded photos */}
                        {photoUrls.map((u, pIdx) => (
                          <div key={pIdx} className={`relative w-10 h-10 rounded-lg overflow-hidden border-2 shrink-0 group ${formData._flags?.[`${f.id}_${idx}`] ? 'border-red-500' : 'border-emerald-500'}`}>
                            <img src={u} alt={`عکس ${pIdx + 1}`} className="w-full h-full object-cover" />
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => {
                                  removeImageAt(photoKey, photoUrls, pIdx);
                                  if (photoUrls.length === 1 && itemChecked) {
                                    handleChange(`${f.id}_checklist`, { ...checkedState, [idx]: false });
                                  }
                                }}
                                className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                        
                        {photoUploading && (
                          <div className="w-10 h-10 rounded-lg border border-slate-300 dark:border-zinc-700 flex items-center justify-center shrink-0">
                            <ProgressRing pct={uploadProgress[photoKey]?.pct || 0} size={30} strokeWidth={3} textClassName="image-upload-progress-pct" />
                          </div>
                        )}
                      </div>
                      {uploadErrors[photoKey] && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] p-2 rounded-lg mt-2 flex items-start gap-1.5 text-right w-full" role="alert">
                          <span className="shrink-0">⚠️</span>
                          <div>
                            <div className="font-bold">آپلود عکس انجام نشد</div>
                            <div className="opacity-90">{uploadErrors[photoKey]}</div>
                            {failedUploadsRef.current[photoKey] && !photoUploading && (
                              <button type="button" className="mt-1.5 px-2.5 py-1 rounded-lg bg-red-500 text-white font-bold cursor-pointer"
                                onClick={() => { const f = failedUploadsRef.current[photoKey]; handleImageFilesSelected(photoKey, f.files, photoUrls, f.multiple); }}>
                                تلاش مجدد (بدون انتخاب دوباره‌ی عکس)
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      case 'daily_report': {
        return (
          <div className="daily-report-wrapper space-y-3">
            <div>
              <label className={`text-xs font-bold mb-1 block ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>📝 خلاصه عملکرد و گزارش روزانه:</label>
              <textarea
                className={`input-field border rounded-xl ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-slate-200'}`}
                rows={3}
                placeholder="خلاصه فعالیت‌ها و تعداد سمپل‌های توزیع شده..."
                value={formData[`${f.id}_summary`] || ''}
                onChange={e => handleChange(`${f.id}_summary`, e.target.value)}
                required={f.required}
              />
            </div>
            <div>
              <label className={`text-xs font-bold mb-1 block ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>⚠️ گزارش مشکلات و چالش‌ها:</label>
              <textarea
                className={`input-field rounded-xl border ${theme === 'dark' ? 'border-red-900/50 bg-red-900/10' : 'border-red-200 bg-red-50/40'}`}
                rows={3}
                placeholder="موانع یا کمبودهای احتمالی..."
                value={formData[`${f.id}_issues`] || ''}
                onChange={e => handleChange(`${f.id}_issues`, e.target.value)}
              />
            </div>
          </div>
        );
      }

      case 'team_directory': {
        const members = dynamicTeam || f.teamMembers || [];
        return (
          <div className="team-directory-wrapper space-y-2">
            {members.map((member, mIdx) => {
              const initials = (member.name || 'M')
                .split(' ')
                .map(n => n.charAt(0))
                .join('')
                .substring(0, 2);

              return (
                <div key={mIdx} className={`rounded-2xl border p-2.5 shadow-2xs flex items-center justify-between ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-slate-200/90'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${theme === 'dark' ? 'bg-zinc-700 text-slate-300 border-zinc-600' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                      <User size={15} className={theme === 'dark' ? 'text-slate-300' : 'text-slate-600'} />
                    </div>
                    <div>
                      <span className={`text-xs font-bold block leading-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{member.name}</span>
                      <span className={`text-[8px] font-bold uppercase tracking-wider block mt-0.5 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                        {member.role === 'promoter' ? 'پروموتر' : member.role === 'supervisor' ? 'کاپیتان' : member.role || 'MEMBER'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={`tel:${member.phone}`}
                      className={`w-7 h-7 rounded-full border-2 border-indigo-600 text-indigo-600 flex items-center justify-center shadow-2xs transition-colors ${theme === 'dark' ? 'bg-zinc-900 hover:bg-indigo-900/50' : 'bg-white hover:bg-indigo-50'}`}
                      title="تماس تلفنی"
                    >
                      <Phone size={12} />
                    </a>
                    <a
                      href={`sms:${member.phone}`}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${theme === 'dark' ? 'bg-zinc-700 text-slate-300 hover:bg-zinc-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      title="ارسال پیامک"
                    >
                      <MessageSquare size={12} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      case 'checklist':
      case 'notes':
      case 'feedback':
      case 'textarea':
        return (
          <textarea
            className="input-field"
            rows={f.rows || 4}
            placeholder={f.placeholder || f.label || 'توضیحات...'}
            value={val}
            onChange={e => onChange(e.target.value)}
            required={f.required}
          />
        );
      case 'custom':
        return <input className="input-field" type="text" placeholder={f.placeholder || f.label || 'متن'} value={val} onChange={e => onChange(e.target.value)} required={f.required} />;
      case 'inventory':
      case 'attendance':
      case 'number':
        return (
          <input
            className="input-field"
            type="number"
            placeholder={f.placeholder || 'تعداد (عدد)'}
            value={val}
            onChange={e => onChange(e.target.value)}
            min={f.minValue ?? undefined}
            max={f.maxValue ?? undefined}
            required={f.required}
          />
        );
      case 'expenses':
        return (
          <div className="section-inputs-group">
            <input
              className="input-field"
              type="number"
              value={formData[`${f.id}_amount`] || ''}
              onChange={e => handleChange(`${f.id}_amount`, e.target.value)}
              placeholder={f.placeholder || 'مبلغ هزینه (تومان)'}
              required={f.required}
            />
            <textarea
              className="input-field mt-2"
              rows={2}
              placeholder="بابت..."
              value={formData[`${f.id}_desc`] || ''}
              onChange={e => handleChange(`${f.id}_desc`, e.target.value)}
              required={f.required}
            />
          </div>
        );
      case 'rating':
        return (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '10px 0' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <span key={n} onClick={() => onChange(n)}
                style={{ fontSize: '2rem', cursor: 'pointer', opacity: n <= (val || 0) ? 1 : 0.25, transition: 'opacity 0.15s' }}>⭐</span>
            ))}
          </div>
        );
      case 'text':
      default:
        return <input className="input-field" type="text" placeholder={f.placeholder || f.label || 'متن'} value={val} onChange={e => onChange(e.target.value)} required={f.required} readOnly={isAutoFilled} />;
    }
  };

  const AppHeader = () => (
    <MainHeader
      token={token}
      user={user}
      theme={theme}
      roleLabelOverride={user ? roleLabel(resolveEffectiveRole(user, event)) : null}
      toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
      onLogout={() => {
        localStorage.removeItem('token');
        clearUserDrafts(slug, user?.id);
        window.location.reload();
      }}
      onHistoryClick={() => setShowHistory(true)}
      onInventoryClick={() => setShowInventory(true)}
      // The old tasks/profile modals are gone (profile is now a bottom-nav tab);
      // these used to call undefined setters and throw on click.
      onProfileClick={() => setActiveTab('profile')}
      myTasks={myTasks}
      newTaskCount={newTaskCount}
    />
  );

  if (!authChecked) return (
<PageLoader fullscreen />
  );

  // اگر لاگین نیست، صفحه لاگین نشون بده
  if (!token || !user) return (
    <div className="login-page">
      <MainHeader
        theme={theme}
        toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
      />
      <div className="login-form-wrapper">
        <div className="login-card fade-in">
          <div className="login-card-header">
            <div className="login-icon-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 24, height: 24 }}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
            </div>
            <h2 className="login-title">ورود به سیستم</h2>
            {event && <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', margin: '-8px 0 0' }}>برای دسترسی به <b style={{ color: 'var(--accent-color)' }}>{event.name}</b></p>}
          </div>
          <div className="login-form">
            <button
              type="button"
              onClick={() => navigate('/')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600,
                padding: '2px 0 6px', margin: '-4px 0 4px',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 14, height: 14 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              این ایونت درست نیست؟ بازگشت به همه ایونت‌ها
            </button>
            <div className="login-field"><div className="login-input-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="input-icon"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              <input className="login-input" autoCapitalize="none" autoCorrect="off" autoComplete="username" spellCheck={false} dir="ltr" placeholder="نام کاربری" value={loginData.username} onChange={e => setLoginData({ ...loginData, username: e.target.value })} />
            </div></div>
            <div className="login-field"><div className="login-input-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="input-icon"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
              <input className="login-input" type="password" autoComplete="current-password" placeholder="رمز عبور" value={loginData.password} onChange={e => setLoginData({ ...loginData, password: e.target.value })} />
            </div></div>
            {authError && <div style={{ color: '#ef4444', fontSize: '0.85rem', textAlign: 'center' }}>{authError}</div>}
            <button className="login-submit-btn" onClick={doLogin} disabled={authLoading}>
              {authLoading ? '...' : 'ورود'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) return (
    <>
      <AppHeader />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-muted)', fontSize: '1rem' }}>
        در حال بارگذاری...
      </div>
    </>
  );

  if (notFound) return (
    <>
      <AppHeader />
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>❌</div>
        <h2 style={{ color: 'var(--text-color)', marginBottom: 8 }}>ایونت یافت نشد</h2>
        <p style={{ color: 'var(--text-muted)' }}>آدرس <b>{slug}</b> معتبر نیست یا ایونت غیرفعال شده.</p>
      </div>
    </>
  );

  return (
    <>
      <CrewHeader theme={theme} toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} eventName={event.name} />

      {/* Inventory Modal */}
      {showInventory && <InventoryModal token={token} onClose={() => setShowInventory(false)} />}

      {/* pb-24 clears the fixed CrewBottomNav — on a short/mobile viewport the
          page scrolls so this was never obviously missing, but on a tall
          desktop viewport nothing scrolls and the last bit of content (e.g.
          the logout button on the profile tab) used to render right under
          the nav bar with no way to reach it. */}
      <div className="min-h-screen pb-24" style={{ background: 'transparent' }}>
        {activeTab === 'event' && (
          <CrewEventTab
            event={event}
            formData={formData}
            handleChange={handleChange}
            renderSectionField={renderSectionField}
            isRecording={isRecording}
            startRecording={startRecording}
            stopRecording={stopRecording}
            aiLoading={aiLoading}
            recordingTime={recordingTime}
            formatTime={formatTime}
            user={user}
          />
        )}
        {activeTab === 'schedule' && (
          <CrewScheduleTab token={token} event={event} />
        )}
        {activeTab === 'profile' && (
          <CrewProfileTab
            user={user}
            event={event}
            setUser={setUser}
            token={token}
            onLogout={() => {
              localStorage.removeItem('token');
              clearUserDrafts(slug, user?.id);
              window.location.reload();
            }}
          />
        )}
      </div>

      <CrewBottomNav active={activeTab} onChange={setActiveTab} />

      <div className="crew-attendance-offset">

      </div>

      {/* Chat Button */}
      {event?.enable_chat && user && !user.is_admin && (
        <div className="crew-chat-offset">
          <PromoterChat token={token} />
        </div>
      )}

      {/* Voice recording review (triggered from the Report sheet's AI mic button) */}
      {showVoiceModal && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ maxWidth: 380, textAlign: 'center' }}>
            <div className="card-header">
              <h2 style={{ fontSize: '1rem' }}>🎤 فایل صوتی ضبط شد</h2>
            </div>
            <div style={{ padding: 16 }}>
              {audioBlob && (
                <audio controls src={URL.createObjectURL(audioBlob)} style={{ width: '100%', marginBottom: 12 }} />
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={sendVoiceToAI} className="btn btn-primary" disabled={aiLoading}>
                  {aiLoading ? '...' : 'ارسال به AI'}
                </button>
                <button onClick={() => { setShowVoiceModal(false); setAudioBlob(null); }} className="btn btn-outline">لغو</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Protocol Modal */}
      <AnimatePresence>
      {briefModalText && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[99999] p-4 flex items-center justify-center" style={{ zIndex: 99999 }}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`rounded-3xl p-6 shadow-2xl border max-w-md w-full text-right ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-100'}`} dir="rtl">
            <div className={`flex justify-between items-center mb-3 pb-3 border-b ${theme === 'dark' ? 'border-zinc-800' : 'border-gray-100'}`}>
              <h3 className={`text-base font-bold flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                <FileText size={18} className="text-indigo-600 dark:text-indigo-400" />
                {briefModalText.title}
              </h3>
              <button onClick={() => setBriefModalText(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[65vh] custom-scrollbar text-xs leading-relaxed mb-5 bg-indigo-50/50 dark:bg-zinc-800/80 p-4 rounded-2xl border border-indigo-100/60 dark:border-zinc-700 text-gray-800 dark:text-gray-200 [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:mb-3 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:ps-5 [&_ol]:mb-3 [&_ol]:space-y-1 [&_li::marker]:text-[#e4b407] [&_li::marker]:font-bold [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-extrabold [&_strong]:text-black dark:[&_strong]:text-white [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:mb-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mb-3 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:mb-2 [&_h4]:text-lg [&_h4]:font-bold [&_h5]:font-bold [&_h6]:font-bold">
              <ReactMarkdown rehypePlugins={[rehypeRaw]}>{briefModalText.text}</ReactMarkdown>
            </div>
            <button
              onClick={() => {
                if (briefModalText.fieldId) {
                  handleChange(`${briefModalText.fieldId}_read`, true);
                }
                setBriefModalText(null);
              }}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <CheckCircle2 size={16} /> متوجه شدم و مطالعه شد
            </button>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Checklist Photo Required Alert */}
      <AnimatePresence>
      {checklistPhotoAlert && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[99999] p-4 flex items-center justify-center" onClick={() => setChecklistPhotoAlert(false)}>
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 20, stiffness: 350 }}
            onClick={e => e.stopPropagation()}
            className={`rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative ${theme === 'dark' ? 'bg-zinc-900 border border-zinc-800' : 'bg-white'}`}
            dir="rtl"
          >
            {/* Header pattern */}
            <div className="h-24 relative" style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)' }}>
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-white dark:bg-zinc-900 rounded-full flex items-center justify-center p-1.5 shadow-lg">
                <div className="w-full h-full rounded-full flex items-center justify-center bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
                  <Camera size={32} strokeWidth={1.5} />
                </div>
              </div>
            </div>

            <div className="pt-14 pb-6 px-6 text-center space-y-3">
              <h3 className={`text-lg font-black ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                عکس وظیفه الزامی است!
              </h3>
              <p className={`text-[13px] font-medium leading-relaxed ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-600'}`}>
                برای تایید این وظیفه، ابتدا باید عکس انجام کار را از طریق دکمه <strong className="text-orange-500 font-bold">«افزودن عکس وظیفه»</strong> در فرم آپلود کنید.
              </p>
            </div>

            <div className="px-6 pb-6">
              <button
                onClick={() => setChecklistPhotoAlert(false)}
                className="w-full py-3.5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)', boxShadow: '0 8px 24px rgba(249,115,22,0.35)' }}
              >
                متوجه شدم
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}
