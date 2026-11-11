import PageLoader from '../components/PageLoader';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate } from 'react-router-dom';
import { DateObject } from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import gregorian from "react-date-object/calendars/gregorian";
import gregorian_en from "react-date-object/locales/gregorian_en";
import './adminStyles.css';
import { resolveEffectiveRole, isUserScheduledToday } from '../utils/roleUtils';
import { calcGlobalProgress } from '../utils/progressUtils';
import { buildDailyTeam } from './utils/dailyTeam';
import { BVT_PRODUCTS } from '../components/BVTCigaretteMatch/cigaretteDatabase';

// Import Tabs
import { DashboardTab } from './tabs/DashboardTab/DashboardTab';
import { ReportsTab } from './tabs/ReportsTab/ReportsTab';
import { GalleryTab } from './tabs/GalleryTab/GalleryTab';
import { ChartsTab } from './tabs/ChartsTab/ChartsTab';
import { PromotersTab } from './tabs/PromotersTab/PromotersTab';
import { MapTab } from './tabs/MapTab/MapTab';
import { AITab } from './tabs/AITab/AITab';
import { SettingsTab } from './tabs/SettingsTab/SettingsTab';
import { InventoryTab } from './tabs/InventoryTab/InventoryTab';
import { TasksTab } from './tabs/TasksTab/TasksTab';
import { ChatTab } from './tabs/ChatTab/ChatTab';
import { SetupTab } from './tabs/SetupTab/SetupTab';
import { SetupCollectionTab } from './tabs/SetupCollectionTab/SetupCollectionTab';
import { EquipmentArchive } from './tabs/EquipmentArchiveTab/EquipmentArchive';
import MainHeader from '../components/MainHeader';
import MehramStoresTab from '../components/MehramSupermarketReport/MehramStoresTab';
import AdminSidebar from './components/AdminSidebar';
import { EventCountdown } from './components/EventCountdown';
import { RosterManager } from './resources/RosterManager';
import { ClientsManager } from './resources/ClientsManager';
import { BadgeManager } from './resources/BadgeManager';
import './resources/resources.css';

// Tiny client mark for the events menu/header: the client's logo when one is
// set, otherwise the first letter of the event name.
const EventClientMark = ({ ev, className }) => (
  <span className={className} title={ev.client_name || ev.name}>
    {ev.client_logo ? <img src={ev.client_logo} alt={ev.client_name || ''} /> : (ev.name || '؟')[0]}
  </span>
);

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const AdminPanel = ({ token, user, onBack, onLogout, theme, toggleTheme }) => {
  // Approve / archive / delete of events is restricted server-side to kave & S.Parmida.
  const canManageEvents = !!user?.can_manage_events;
  // Client-scoped panel account (e.g. mahram-admin): only that client's events,
  // no archives/clients/equipment, and inside an event no dashboard/map/equipment.
  // The server enforces the same limits; this just hides what it would refuse.
  const isScoped = !!user?.admin_client && !user?.is_admin;
  // The client's «نقشه» is the stores map (see below), not the live promoter map.
  const SCOPED_HIDDEN_TABS = ['dashboard', 'promoters', 'reports', 'inventory', 'charts', 'ai', 'chat', 'settings'];
  const tabAllowed = (t) => !isScoped || !SCOPED_HIDDEN_TABS.includes(t);
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(() => {
    const saved = localStorage.getItem('adminSelectedEvent');
    return saved ? JSON.parse(saved) : null;
  });
  const [eventsLoading, setEventsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('adminActiveTab') || 'dashboard';
    return tabAllowed(saved) ? saved : 'stores';
  });
  const [users, setUsers] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [promoterLocations, setPromoterLocations] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [dashboardTasks, setDashboardTasks] = useState([]);
  const [eventsSearch, setEventsSearch] = useState('');
  // Deep-link from a BVT distribution row in Reports straight to its exact spot
  // on the Live Map tab — set on click, consumed (and cleared) by MapTab once
  // it's flown to and popped the point open, so returning to Reports and back
  // doesn't keep re-triggering the same fly-to.
  const [mapFocusTarget, setMapFocusTarget] = useState(null);
  const goToMapPoint = (point) => {
    setMapFocusTarget(point);
    setActiveTab('map');
  };

  useEffect(() => {
    if (selectedEvent) {
      localStorage.setItem('adminSelectedEvent', JSON.stringify(selectedEvent));
    } else {
      localStorage.removeItem('adminSelectedEvent');
    }
  }, [selectedEvent]);

  useEffect(() => {
    if (!tabAllowed(activeTab)) { setActiveTab('stores'); return; }
    localStorage.setItem('adminActiveTab', activeTab);
  }, [activeTab]);

  const fetchEvents = async (quiet = false) => {
    try {
      const res = await axios.get(`${API_URL}/admin/events`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(res.data);
    } catch (e) {
      if (!quiet) toast.error('خطا در دریافت لیست ایونتها');
    } finally {
      setEventsLoading(false);
    }
  };
  useEffect(() => {
    fetchEvents();
    // Keeps the «در انتظار تایید» counts fresh while reports keep coming in.
    const interval = setInterval(() => { if (!document.hidden) fetchEvents(true); }, 60000);
    return () => clearInterval(interval);
  }, [token]);

  const deleteEvent = async (ev) => {
    if (!confirm(`مطمئنی که میخوای ایونت «${ev.name}» رو حذف کنی؟ این عمل غیرقابل بازگشته.`)) return;
    try {
      await axios.delete(`${API_URL}/admin/events/${ev.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(prev => prev.filter(e => e.id !== ev.id));
      toast.success('ایونت حذف شد');
    } catch (e) {
      toast.error('خطا در حذف ایونت');
    }
  };

  const toggleEventStatus = async (ev) => {
    try {
      const res = await axios.patch(`${API_URL}/admin/events/${ev.id}/status`, {
        is_active: !ev.is_active
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, is_active: res.data.is_active } : e));
      toast.success(res.data.is_active ? 'ایونت فعال شد ✅' : 'ایونت غیر فعال شد 🔴');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'خطا در تغییر وضعیت ایونت');
    }
  };

  const toggleClientApprove = async (ev) => {
    try {
      const res = await axios.patch(`${API_URL}/admin/events/${ev.id}/approve`, {
        client_approved: !ev.client_approved
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(prev => prev.map(e => e.id === ev.id ? { 
        ...e, 
        client_approved: res.data.client_approved,
        is_active: res.data.is_active
      } : e));
      toast.success(res.data.client_approved ? 'تایید کلاینت انجام شد و ایونت فعال شد ✅' : 'تایید کلاینت لغو شد 🔴');
    } catch (e) {
      toast.error('خطا در تغییر تایید کلاینت');
    }
  };

  // Only the newest request may update the list: a slower, older response (e.g.
  // the periodic poll that started just before an admin added someone) used to
  // land last and overwrite the fresh list with the stale one.
  const usersReqRef = useRef(0);
  const fetchUsers = async () => {
    if (!selectedEvent) return;
    const reqId = ++usersReqRef.current;
    try {
      const res = await axios.get(`${API_URL}/admin/promoters?event_id=${selectedEvent.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (reqId === usersReqRef.current) setUsers(res.data);
    } catch (e) {
      console.error('fetchUsers failed:', e);
    }
  };

  // Changes made by ANOTHER admin only show up on the next poll, so poll faster
  // and refetch the moment the tab becomes visible/focused again.
  useEffect(() => {
    fetchUsers();
    const interval = setInterval(() => { if (!document.hidden) fetchUsers(); }, 10000);
    const onWake = () => { if (!document.hidden) fetchUsers(); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [token, selectedEvent]);

  // `silent` = refresh in place (the «بروزرسانی» button of the reports tab): no full-page loader, so the tab keeps its
  // filters / scroll / open rows and only the rows underneath are swapped. Answers for an event that is no longer
  // selected, or older than the latest request, are dropped.
  const [subsRefreshing, setSubsRefreshing] = useState(false);
  const [subsUpdatedAt, setSubsUpdatedAt] = useState(Date.now());
  const subsSeq = useRef(0);
  const loadSubmissions = useCallback(async (silent = false) => {
    if (!selectedEvent) return;
    const seq = ++subsSeq.current;
    if (silent) setSubsRefreshing(true); else setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/events/${selectedEvent.id}/submissions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (seq !== subsSeq.current) return;
      setSubmissions(res.data);
      setSubsUpdatedAt(Date.now());
    } catch (e) {
      toast.error('خطا در دریافت گزارشها');
    } finally {
      if (seq === subsSeq.current) { if (silent) setSubsRefreshing(false); else setLoading(false); }
    }
  }, [selectedEvent, token]);

  useEffect(() => { loadSubmissions(); }, [loadSubmissions]);

  useEffect(() => {
    if (!selectedEvent || isScoped) return;
    const fetchAnalytics = async () => {
      try {
        const analyticsRes = await axios.get(`${API_URL}/admin/analytics`, { headers: { Authorization: `Bearer ${token}` } });
        setAnalytics(analyticsRes.data);
      } catch (e) { }
    };
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 60000);
    return () => clearInterval(interval);
  }, [selectedEvent, token]);

  useEffect(() => {
    if (activeTab === 'map' && selectedEvent && !isScoped) {
      const fetchPromoterLocations = async () => {
        try {
          const res = await axios.get(`${API_URL}/admin/promoters/locations`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setPromoterLocations(res.data);
        } catch (err) {
          console.error('Error fetching locations:', err);
        }
      };
      fetchPromoterLocations();
      const interval = setInterval(fetchPromoterLocations, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab, selectedEvent, token]);

  // The one field (if any) this event uses to track a monetary amount. Only events
  // that actually configured a price/number field get sales-related KPIs & charts —
  // an event like a plain check-in form has no such field and shouldn't show "کل فروش".
  const amountField = useMemo(
    () => selectedEvent?.fields?.find(f => ['price', 'number'].includes(f.type)) || null,
    [selectedEvent]
  );

  const promoterById = useMemo(() => {
    const map = {};
    users.forEach(u => { map[u.id] = u; });
    return map;
  }, [users]);

  // One merged report per promoter per (Tehran) day — the same grouping the
  // Reports tab uses. The raw `submissions` list holds every step save, and each
  // save carries a full snapshot of the form (including the sampling counts), so
  // summing raw rows counted the same samples again on every re-save.
  const dailyReports = useMemo(() => {
    const TEHRAN_OFFSET_MS = 210 * 60 * 1000;
    const groups = {};
    [...submissions]
      .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at))
      .forEach(s => {
        const ts = s.first_submitted_at || s.submitted_at;
        const tehranDate = ts ? new Date(new Date(ts).getTime() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10) : null;
        const key = `${s.promoter_id || s.promoter_name || 'anon'}_${tehranDate}`;
        if (!groups[key]) {
          groups[key] = { promoter_id: s.promoter_id, promoter_name: s.promoter_name, tehranDate, data: { ...s.data } };
        } else {
          Object.assign(groups[key].data, s.data);
        }
      });
    return Object.values(groups);
  }, [submissions]);

  // Samples handed out in one merged daily report: the plain sampling counter
  // plus the BVT per-pack counts, limited to packs in the field's own lineup
  // (same rule as the Reports tab) so stale product ids never inflate the total.
  const getSampledCount = useMemo(() => {
    const samplingField = selectedEvent?.fields?.find(f => f.type === 'sampling_counter');
    const bvtField = selectedEvent?.fields?.find(f => f.type === 'bvt_sampling_report');
    const bvtProductIds = bvtField ? (bvtField.bvtProducts?.length ? bvtField.bvtProducts : BVT_PRODUCTS).map(p => p.id) : [];
    return (data) => {
      let n = 0;
      if (samplingField) n += Number(data?.[samplingField.id]) || 0;
      if (bvtField) {
        const counts = data?.[`${bvtField.id}_counts`] || {};
        n += bvtProductIds.reduce((sum, id) => sum + (Number(counts[id]) || 0), 0);
      }
      return n;
    };
  }, [selectedEvent]);

  // BVT cigarette-match distributions in one merged daily report: every entry
  // in the field's history is one offer — accepted ones went into someone's
  // hand, rejected ones were declined (same split as the Reports tab).
  const getBvtDistribution = useMemo(() => {
    const matchField = selectedEvent?.fields?.find(f => f.type === 'bvt_cigarette_match');
    return (data) => {
      const hist = matchField ? data?.[`${matchField.id}_history`] : null;
      if (!Array.isArray(hist)) return { total: 0, accepted: 0, rejected: 0 };
      const rejected = hist.filter(h => h?.status === 'rejected').length;
      return { total: hist.length, accepted: hist.length - rejected, rejected };
    };
  }, [selectedEvent]);

  const stats = useMemo(() => {
    if (!selectedEvent) return {};
    // Use Tehran timezone (UTC+3:30 = +210 min) for "today" — UTC comparison causes
    // submissions in the first 3h30m of the Iranian day to be missed.
    const TEHRAN_OFFSET_MS = 210 * 60 * 1000;
    const today = new Date(Date.now() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);

    // One report = one promoter on one day (dailyReports is already merged that way).
    const todayReports = dailyReports.filter(r => r.tehranDate === today);
    const totalReportCount = dailyReports.length;
    const todayReportCount = todayReports.length;

    const totalSampled = dailyReports.reduce((sum, r) => sum + getSampledCount(r.data), 0);
    const samplingTarget = selectedEvent.sampling_count || 0;

    const bvtDistribution = { total: 0, accepted: 0, rejected: 0, todayTotal: 0 };
    dailyReports.forEach(r => {
      const d = getBvtDistribution(r.data);
      bvtDistribution.total += d.total;
      bvtDistribution.accepted += d.accepted;
      bvtDistribution.rejected += d.rejected;
      if (r.tehranDate === today) bvtDistribution.todayTotal += d.total;
    });

    let totalAmount = 0;
    let todayAmount = 0;
    if (amountField) {
      const amountOf = (r) => Number(r.data[amountField.id]) || 0;
      totalAmount = dailyReports.reduce((sum, r) => sum + amountOf(r), 0);
      todayAmount = todayReports.reduce((sum, r) => sum + amountOf(r), 0);
    }

    const nonAdminPromoters = users.filter(u => {
      if (u.is_admin || u.role === 'admin' || u.username === 'admin') return false;
      const r = u.role || 'promoter';
      return r === 'promoter';
    });
    const promoterCount = nonAdminPromoters.length;

    return {
      totalPromoters: promoterCount,
      totalReports: totalReportCount,
      todayVisits: todayReportCount,
      totalAmount,
      todayAmount,
      avgPerPromoter: promoterCount > 0 ? Math.round((totalReportCount / promoterCount) * 10) / 10 : 0,
      totalSampled,
      samplingTarget,
      hasBvtMatch: !!selectedEvent.fields?.some(f => f.type === 'bvt_cigarette_match'),
      bvtDistribution,
    };
  }, [users, selectedEvent, amountField, dailyReports, getSampledCount, getBvtDistribution]);

  const topPromoters = useMemo(() => {
    const counts = {};
    submissions.forEach(s => {
      // Only include submissions from promoters who are actually assigned to this event
      const isAssigned = users.some(u => u.id === s.promoter_id);
      if (!isAssigned) return;

      const name = s.promoter_name || 'نامشخص';
      if (!counts[name]) counts[name] = { name, sales: 0, visits: 0 };
      counts[name].visits += 1;
      if (amountField) counts[name].sales += (Number(s.data[amountField.id]) || 0);
    });
    return Object.values(counts).sort((a, b) => b.visits - a.visits).slice(0, 5).map((p, i) => ({ ...p, id: i + 1 }));
  }, [submissions, amountField, users]);

  // Dashboard «تیم», day by day (every day of the event: who is scheduled, check-in / lateness, report completion).
  const dailyTeam = useMemo(() => buildDailyTeam({ event: selectedEvent, users, submissions }), [selectedEvent, users, submissions]);

  const promoterDelays = useMemo(() => {
    if (!selectedEvent || !users) return [];

    const getCheckinField = (sub) => {
      const fds = selectedEvent.fields || [];
      if (!sub) return fds.find(f => f.type === 'camera_checkin');
      return fds.find(f => f.type === 'camera_checkin') || fds.find(f => ['camera', 'image'].includes(f.type) && sub.data && sub.data[f.id]);
    };
    const checkoutField = selectedEvent.fields?.find(f => f.type === 'camera_checkout');

    // Use Tehran timezone for today — same helper as stats above
    const TEHRAN_OFFSET_MS = 210 * 60 * 1000;
    const getTehranToday = () => new Date(Date.now() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
    const toTehranDate = (ts) => {
      if (!ts) return 'unknown';
      return new Date(new Date(ts).getTime() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
    };
    // Today's h:m target as a real instant, entirely in Tehran time — building
    // it via `new Date(); d.setHours(h, m)` (as this used to) applies h:m in
    // the VIEWING BROWSER's own local timezone, so the same check-in read as
    // more or less late depending on where the admin opened the dashboard
    // from (e.g. a real 30-minute delay showing as a full hour from Dubai,
    // which is 30 minutes ahead of Tehran). Shift-to-UTC-getters keeps this
    // independent of the viewer's timezone, matching toTehranDate above.
    const buildTehranInstant = (h, m) => {
      const nowShifted = new Date(Date.now() + TEHRAN_OFFSET_MS);
      const targetShifted = new Date(Date.UTC(nowShifted.getUTCFullYear(), nowShifted.getUTCMonth(), nowShifted.getUTCDate(), h, m, 0, 0));
      return targetShifted.getTime() - TEHRAN_OFFSET_MS;
    };
    // Arriving right at (or just after) the official start doesn't count as
    // late.
    const LATE_GRACE_MS = 5 * 60 * 1000;
    const today = getTehranToday();

    const todaySubmissions = submissions.filter(s => {
      const ts = s.first_submitted_at || s.submitted_at;
      return toTehranDate(ts) === today;
    });
    const hasValue = (v) => Array.isArray(v) ? v.length > 0 : (v !== undefined && v !== null && v !== '');

    // A submission's stored promoter_id can point at a stale/duplicate promoter
    // record (e.g. a captain who was ever assigned to more than one event ends up
    // with one promoter row per event, all sharing the same name) — the Reports
    // tab never notices because it just prints whatever name the backend resolved,
    // but here we need the *current event's* user.id to key off of. Resolve by id
    // first and only fall back to matching this event's roster by name so a
    // genuinely-submitted report/checkin doesn't get shown as missing.
    const nonAdminUsers = users.filter(u => !u.is_admin);
    const userIdSet = new Set(nonAdminUsers.map(u => u.id));
    const normalizeName = (s) => (s || '').trim().toLowerCase();
    const userIdByName = {};
    nonAdminUsers.forEach(u => {
      const key = normalizeName(u.full_name || u.username);
      if (key && !(key in userIdByName)) userIdByName[key] = u.id;
    });
    const resolvePromoterId = (s) => {
      if (s.promoter_id && userIdSet.has(s.promoter_id)) return s.promoter_id;
      const key = normalizeName(s.promoter_name);
      return (key && userIdByName[key]) || s.promoter_id || null;
    };

    // Distinct report-days per promoter (same "one report per promoter per day"
    // dedup rule as the totalReports KPI) — powers the Team card's report count.
    const reportDatesByPromoter = {};
    submissions.forEach(s => {
      const pid = resolvePromoterId(s);
      if (!pid) return;
      const ts = s.first_submitted_at || s.submitted_at;
      const d = toTehranDate(ts);
      if (!reportDatesByPromoter[pid]) reportDatesByPromoter[pid] = new Set();
      reportDatesByPromoter[pid].add(d);
    });

    const mergedByPromoter = {};
    todaySubmissions.forEach(s => {
      const pid = resolvePromoterId(s);
      if (!pid) return;
      const existing = mergedByPromoter[pid];
      if (!existing) {
        mergedByPromoter[pid] = {
          data: { ...s.data },
          submitted_at: s.submitted_at,
          first_submitted_at: s.first_submitted_at
        };
      } else {
        existing.data = { ...existing.data, ...s.data };
        if (!existing.submitted_at || (s.submitted_at && s.submitted_at > existing.submitted_at)) existing.submitted_at = s.submitted_at;
        if (!existing.first_submitted_at || (s.first_submitted_at && s.first_submitted_at < existing.first_submitted_at)) existing.first_submitted_at = s.first_submitted_at;
      }
    });

    const targetTimeMs = (() => {
      let targetTimeStr = selectedEvent?.start_time;
      if (selectedEvent?.custom_times) {
        const now = new Date();
        const formatEng = (str) => String(str || '').replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٥٦٧٨٩".indexOf(d));
        const todayJalali = formatEng(now.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' }));
        const todayJalaliNoZero = formatEng(now.toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' }));

        const matchedKey = Object.keys(selectedEvent.custom_times).find(k => {
          const cleanK = formatEng(k);
          return cleanK === todayJalali || cleanK === todayJalaliNoZero || cleanK.replace(/\b0/g, '') === todayJalaliNoZero;
        });
        if (matchedKey && selectedEvent.custom_times[matchedKey].start) {
          targetTimeStr = selectedEvent.custom_times[matchedKey].start;
        }
      }
      if (!targetTimeStr) return null;
      const [h, m] = targetTimeStr.split(':').map(Number);
      return buildTehranInstant(h, m);
    })();

    const results = [];

    // Before the event's first day, there's no "today's roster" to narrow
    // down to yet — show everyone so the admin can review the full team.
    // Once the event is actually under way, only people scheduled today
    // belong in a "today" team list — otherwise someone assigned to a
    // different day of a multi-day event shows up as a stray "ورود ثبت
    // نشده" row every day they aren't even supposed to be working.
    const eventNotStartedYet = (() => {
      const days = String(selectedEvent?.start_date || '').split(',').map(s => s.trim()).filter(Boolean);
      if (days.length === 0) return false;
      try {
        const firstDayIso = new DateObject({ date: days[0].replace(/-/g, '/'), calendar: persian, locale: persian_fa })
          .convert(gregorian, gregorian_en)
          .format('YYYY-MM-DD');
        return today < firstDayIso;
      } catch {
        return false;
      }
    })();

    // Same idea once the event is over: after the last day's end time has
    // passed there's no "today's roster" anymore, so go back to showing the
    // whole team. Uses that day's custom end time when one is set, else the
    // event's end_time; with no end time at all it flips the day after.
    const eventFinished = (() => {
      const days = String(selectedEvent?.start_date || '').split(',').map(s => s.trim()).filter(Boolean);
      if (days.length === 0) return false;
      try {
        const formatEng = (str) => String(str || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/-/g, '/');
        const toIso = (s) => new DateObject({ date: formatEng(s), calendar: persian, locale: persian_fa })
          .convert(gregorian, gregorian_en)
          .format('YYYY-MM-DD');
        const lastDay = days.map(s => ({ s, iso: toIso(s) })).sort((a, b) => a.iso.localeCompare(b.iso)).pop();
        if (today > lastDay.iso) return true;
        if (today < lastDay.iso) return false;

        let startStr = selectedEvent?.start_time;
        let endStr = selectedEvent?.end_time;
        if (selectedEvent?.custom_times) {
          const key = Object.keys(selectedEvent.custom_times).find(k => formatEng(k) === formatEng(lastDay.s));
          if (key) {
            startStr = selectedEvent.custom_times[key].start || startStr;
            endStr = selectedEvent.custom_times[key].end || endStr;
          }
        }
        if (!endStr) return false;
        const [eh, em] = endStr.split(':').map(Number);
        // An end time earlier than the start (e.g. 18:00 → 02:00) runs past midnight
        // into the next day — leave it to the `today > lastDay` check above.
        if (startStr) {
          const [sh, sm] = startStr.split(':').map(Number);
          if (eh * 60 + em <= sh * 60 + sm) return false;
        }
        return Date.now() >= buildTehranInstant(eh, em);
      } catch {
        return false;
      }
    })();

    const showWholeTeam = eventNotStartedYet || eventFinished;

    users.filter(u => !u.is_admin && (showWholeTeam || isUserScheduledToday(u, selectedEvent))).forEach(user => {
      const sub = mergedByPromoter[user.id];
      const checkinField = getCheckinField(sub);
      
      let status = 'missing';
      let message = 'ورود ثبت نشده';
      let timeStr = '—';
      let checkoutTimeStr = null;

      const checkinVal = checkinField && sub?.data ? sub.data[checkinField.id] : null;
      const checkoutVal = checkoutField && sub?.data ? sub.data[checkoutField.id] : null;
      const checkedIn = hasValue(checkinVal);
      const checkedOut = hasValue(checkoutVal);

      if (checkedIn) {
        const fallbackCheckinMs = sub ? new Date(sub.first_submitted_at || sub.submitted_at).getTime() : null;
        const checkinMs = sub.data[`${checkinField.id}_time`] || fallbackCheckinMs;
        // Always shown as Tehran clock time — otherwise the printed check-in
        // time itself (not just the lateness verdict) would read differently
        // depending on the viewing admin's own timezone.
        timeStr = new Date(checkinMs).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tehran' });

        let userTargetTimeMs = targetTimeMs;
        if (user.role === 'setup' && selectedEvent?.setup_time_in && selectedEvent.setup_time_in !== '00:00') {
          const [h, m] = selectedEvent.setup_time_in.split(':').map(Number);
          userTargetTimeMs = buildTehranInstant(h, m);
        } else if (user.role === 'collection' && selectedEvent?.collection_time_in && selectedEvent.collection_time_in !== '00:00') {
          const [h, m] = selectedEvent.collection_time_in.split(':').map(Number);
          userTargetTimeMs = buildTehranInstant(h, m);
        }

        if (userTargetTimeMs && checkinMs - userTargetTimeMs > LATE_GRACE_MS) {
          status = 'late';
          const diffMin = Math.floor((checkinMs - userTargetTimeMs) / 60000);
          const h = Math.floor(diffMin / 60);
          const m = diffMin % 60;
          message = h > 0 ? `${h} ساعت و ${m} دقیقه تاخیر` : `${diffMin} دقیقه تاخیر`;
        } else {
          status = 'on-time';
          message = 'ورود به موقع';
        }

        if (checkedOut) {
          const fallbackCheckoutMs = sub ? new Date(sub.submitted_at).getTime() : null;
          const checkoutMs = sub.data[`${checkoutField.id}_time`] || fallbackCheckoutMs;
          checkoutTimeStr = new Date(checkoutMs).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
      }
      // user.role is only ever the static base role set once at creation —
      // resolveEffectiveRole picks the role actually assigned for today
      // (daily_roles), which is why a captain no longer shows as "پروموتر"
      // here or in the team card's progress bar's checklist permissions.
      const dayRole = resolveEffectiveRole(user, selectedEvent);
      const progress = calcGlobalProgress(selectedEvent, sub?.data, dayRole);
      results.push({
        id: user.id,
        name: user.full_name || user.username,
        role: dayRole,
        status, message, timeStr, checkoutTimeStr,
        reportCount: reportDatesByPromoter[user.id]?.size || 0,
        progressDone: progress.done,
        progressTotal: progress.total,
        progressPct: progress.pct,
      });
    });

    const order = { 'late': 1, 'on-time': 2, 'missing': 3 };
    return results.sort((a, b) => order[a.status] - order[b.status]);
  }, [selectedEvent, users, submissions]);


  const weeklyData = useMemo(() => {
    let days = [];
    if (selectedEvent?.start_date) {
      const persianToEnglish = s => s.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
      days = selectedEvent.start_date.split(',').map(s => s.trim()).filter(Boolean).map(dateStr => {
        try {
          const engDateStr = persianToEnglish(dateStr);
          const dateObj = new DateObject({ date: engDateStr, format: "YYYY/MM/DD", calendar: persian, locale: persian_fa });
          if (dateObj.isValid) {
            return {
              date: dateObj.format("YYYY-MM-DD"),
              day: dateObj.format("dddd"),
              fullDay: dateObj.format("dddd DD MMMM"),
              value: 0,
              amount: 0,
              sampled: 0,
              distributed: 0,
              dateObj
            };
          }
        } catch (e) { console.error("Invalid date:", dateStr); }
        return null;
      }).filter(Boolean).sort((a, b) => a.dateObj.valueOf() - b.dateObj.valueOf());
    }

    if (days.length === 0) {
      const shortNames = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];
      const fullNames = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days.push({
          date: d.toISOString().slice(0, 10),
          day: shortNames[d.getDay()],
          fullDay: fullNames[d.getDay()],
          value: 0,
          amount: 0,
          sampled: 0,
          distributed: 0,
        });
      }
    }

    const byDate = Object.fromEntries(days.map(d => [d.date, d]));
    // dailyReports are already merged per promoter per Tehran day, keyed by
    // first_submitted_at so a report made on day 1 stays on day 1 even when
    // it's updated later (e.g. checkout).
    dailyReports.forEach(r => {
      if (!r.tehranDate) return;

      let dateStr;
      if (selectedEvent?.start_date) {
        // Event days are Persian dates — convert the report's Tehran calendar
        // day (not the viewing browser's local day) to the matching Persian date.
        dateStr = new DateObject({ date: r.tehranDate.replace(/-/g, '/'), format: 'YYYY/MM/DD', calendar: gregorian, locale: gregorian_en })
          .convert(persian, persian_fa)
          .format('YYYY-MM-DD');
      } else {
        dateStr = r.tehranDate;
      }

      const bucket = byDate[dateStr];
      if (bucket) {
        bucket.value += 1;
        if (amountField) bucket.amount += (Number(r.data[amountField.id]) || 0);
        bucket.sampled += getSampledCount(r.data);
        bucket.distributed += getBvtDistribution(r.data).total;
      }
    });
    return days.map(({ dateObj, ...rest }) => rest);
  }, [selectedEvent, dailyReports, getSampledCount, getBvtDistribution, amountField]);

  // This-week vs previous-week report count, for the trend badge on the weekly chart.
  const weeklyTrend = useMemo(() => {
    const now = new Date();
    let thisWeek = 0, lastWeek = 0;
    submissions.forEach(s => {
      if (!s.submitted_at) return;
      const diffDays = Math.floor((now - new Date(s.submitted_at)) / 86400000);
      if (diffDays >= 0 && diffDays < 7) thisWeek++;
      else if (diffDays >= 7 && diffDays < 14) lastWeek++;
    });
    const pct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : (thisWeek > 0 ? 100 : 0);
    return { thisWeek, lastWeek, pct };
  }, [submissions]);

  // Generic, per-event chart data: scans this event's actual field schema and produces
  // one insight per chartable field (choice/select distribution, rating average,
  // checkbox yes/no split, photo counts, location coverage). Fields that don't apply
  // to this event (e.g. no price field) simply produce no insight instead of a fake "0".
  const fieldInsights = useMemo(() => {
    if (!selectedEvent) return [];
    const insights = [];
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#ec4899'];
    for (const f of selectedEvent.fields || []) {
      if (['divider', 'heading'].includes(f.type)) continue;
      if (['choice', 'select'].includes(f.type)) {
        const counts = {};
        submissions.forEach(s => {
          const v = s.data[f.id];
          (Array.isArray(v) ? v : (v ? [v] : [])).forEach(opt => { counts[opt] = (counts[opt] || 0) + 1; });
        });
        const data = Object.entries(counts)
          .map(([name, value], i) => ({ name, value, fill: colors[i % colors.length] }))
          .sort((a, b) => b.value - a.value);
        if (data.length) insights.push({ key: f.id, kind: 'distribution', field: f, data });
      } else if (f.type === 'rating') {
        const values = submissions.map(s => Number(s.data[f.id])).filter(v => v > 0);
        if (values.length) insights.push({
          key: f.id, kind: 'rating', field: f,
          avg: values.reduce((a, b) => a + b, 0) / values.length, count: values.length,
        });
      } else if (f.type === 'checkbox') {
        const answered = submissions.filter(s => s.data[f.id] !== undefined && s.data[f.id] !== null && s.data[f.id] !== '');
        if (answered.length) {
          const yes = answered.filter(s => !!s.data[f.id]).length;
          insights.push({ key: f.id, kind: 'boolean', field: f, yes, no: answered.length - yes, total: answered.length });
        }
      } else if (['image', 'camera'].includes(f.type)) {
        const total = submissions.reduce((sum, s) => sum + (Array.isArray(s.data[f.id]) ? s.data[f.id].length : 0), 0);
        if (total > 0) insights.push({ key: f.id, kind: 'photos', field: f, total });
      } else if (f.type === 'location') {
        const withLoc = submissions.filter(s => !!s.data[f.id]).length;
        if (withLoc > 0) insights.push({ key: f.id, kind: 'location', field: f, count: withLoc, pct: submissions.length ? Math.round((withLoc / submissions.length) * 100) : 0 });
      }
    }
    return insights;
  }, [selectedEvent, submissions]);

  const formatAmount = (amount) => {
    const num = Number(String(amount).replace(/,/g, '')) || 0;
    if (num >= 1000000000) return (num / 1000000000).toLocaleString('fa-IR', { maximumFractionDigits: 1 }) + ' \u0645\u06cc\u0644\u06cc\u0627\u0631\u062f';
    if (num >= 1000000) return (num / 1000000).toLocaleString('fa-IR', { maximumFractionDigits: 1 }) + ' \u0645\u06cc\u0644\u06cc\u0648\u0646';
    return num.toLocaleString('fa-IR');
  };

  const [gwTab, setGwTab] = useState('events');
  const [showEventsDropdown, setShowEventsDropdown] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const archiveEvent = async (ev) => {
    if (!confirm(`مطمئنی که می‌خوای ایونت «${ev.name}» رو آرشیو کنی؟`)) return;
    try {
      await axios.patch(`${API_URL}/admin/events/${ev.id}/archive`, {
        is_archived: true
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, is_archived: true } : e));
      toast.success('ایونت آرشیو شد');
    } catch (e) {
      toast.error('خطا در آرشیو ایونت');
    }
  };

  const unarchiveEvent = async (ev) => {
    try {
      await axios.patch(`${API_URL}/admin/events/${ev.id}/archive`, {
        is_archived: false
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, is_archived: false } : e));
      toast.success('ایونت از آرشیو خارج شد');
    } catch (e) {
      toast.error('خطا در بازگردانی ایونت');
    }
  };

  // Unified Render
  // selectedEvent is restored from localStorage and can predate fields like
  // client_logo — prefer the freshly fetched copy of the same event.
  const currentEvent = selectedEvent ? (events.find(e => e.id === selectedEvent.id) || selectedEvent) : null;
  const activeEvents = events.filter(ev => !ev.is_archived);
  // Events with a Mehram supermarket section get the «فروشگاه‌ها» dashboard tab.
  const hasMehram = !!selectedEvent?.fields?.some?.(f => f.type === 'mehram_supermarket_report');
  const liveEvent = events.find(e => e.id === selectedEvent?.id);
  useEffect(() => {
    if (!selectedEvent || hasMehram) return;
    if (activeTab === 'stores' || (isScoped && activeTab === 'map')) setActiveTab(isScoped ? 'gallery' : 'dashboard');
  }, [selectedEvent, activeTab, hasMehram]);
  // A remembered event from another account (shared browser) the scoped account can't open.
  useEffect(() => {
    if (isScoped && selectedEvent && !eventsLoading && !events.some(ev => ev.id === selectedEvent.id)) setSelectedEvent(null);
  }, [isScoped, selectedEvent, events, eventsLoading]);
  const archivedEvents = events.filter(ev => ev.is_archived);
  const filteredEvents = activeEvents.filter(ev => !eventsSearch || ev.name.includes(eventsSearch) || ev.slug.includes(eventsSearch));
  const filteredArchived = archivedEvents.filter(ev => !eventsSearch || ev.name.includes(eventsSearch) || ev.slug.includes(eventsSearch));

  return (
    <div className="admin-app-container">
      {/* Ambient blobs */}
      <div className="gw-blob gw-blob-1" />
      <div className="gw-blob gw-blob-2" />

      {/* Global Header */}
      <header className="gw-topbar">
        <div className="gw-topbar-right">
          <div className="gw-topbar-logo">
            <img src="/images/vuLogo.png" alt="logo" />
          </div>
          <nav className={`gw-tab-nav ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
            <div className="nav-dropdown-container"
              onMouseEnter={() => window.innerWidth > 768 && setShowEventsDropdown(true)}
              onMouseLeave={() => window.innerWidth > 768 && setShowEventsDropdown(false)}
            >
              <button className={`gw-tab-btn ${(gwTab === 'events' && !selectedEvent) || selectedEvent ? 'active' : ''}`} onClick={(e) => {
                if (window.innerWidth <= 768) {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowEventsDropdown(prev => !prev);
                } else {
                  setGwTab('events');
                  setSelectedEvent(null);
                  setIsMobileMenuOpen(false);
                }
              }}>
                {currentEvent ? (
                  <EventClientMark ev={currentEvent} className="nav-client-mark nav-client-mark--header" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h7" /></svg>
                )}
                {currentEvent ? currentEvent.name : 'ایونت‌ها'} {activeEvents.length > 0 && '▾'}
              </button>
              {showEventsDropdown && (
                <div className="nav-dropdown-menu">
                  {activeEvents.map(ev => (
                    <button key={ev.id} className={selectedEvent?.id === ev.id ? 'active-event' : ''} onClick={() => { setSelectedEvent(ev); setShowEventsDropdown(false); setIsMobileMenuOpen(false); }}>
                      <EventClientMark ev={ev} className="nav-client-mark" />
                      {ev.name}
                      {ev.pending_approval_count > 0 && <span className="gw-pending-badge sm">{ev.pending_approval_count.toLocaleString('fa-IR')}</span>}
                    </button>
                  ))}
                  {activeEvents.length > 0 && <hr />}
                  <button className="manage-btn" onClick={() => { setSelectedEvent(null); setGwTab('events'); setShowEventsDropdown(false); setIsMobileMenuOpen(false); }}>
                    {isScoped ? 'لیست ایونت‌ها' : '+ مدیریت و ایونت جدید'}
                  </button>
                </div>
              )}
            </div>

            {!isScoped && (<>
            <button className={`gw-tab-btn ${gwTab === 'roster' && !selectedEvent ? 'active' : ''}`} onClick={() => { setGwTab('roster'); setSelectedEvent(null); setIsMobileMenuOpen(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
              آرشیو پروموترها
            </button>
            <button className={`gw-tab-btn ${gwTab === 'badges' && !selectedEvent ? 'active' : ''}`} onClick={() => { setGwTab('badges'); setSelectedEvent(null); setIsMobileMenuOpen(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" /></svg>
              آرشیو بج‌ها و گواهی‌ها
            </button>
            <button className={`gw-tab-btn ${gwTab === 'clients' && !selectedEvent ? 'active' : ''}`} onClick={() => { setGwTab('clients'); setSelectedEvent(null); setIsMobileMenuOpen(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              کلاینت‌ها
            </button>
            <button className={`gw-tab-btn ${gwTab === 'equipment' && !selectedEvent ? 'active' : ''}`} onClick={() => { setGwTab('equipment'); setSelectedEvent(null); setIsMobileMenuOpen(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" /></svg>
              آرشیو تجهیزات
            </button>
            <button className={`gw-tab-btn ${gwTab === 'archivedEvents' && !selectedEvent ? 'active' : ''}`} onClick={() => { setGwTab('archivedEvents'); setSelectedEvent(null); setIsMobileMenuOpen(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>
              آرشیو ایونت‌ها
            </button>
            </>)}
          </nav>
        </div>

        <div className="gw-topbar-left">
          <div className="gw-topbar-user">
            <span className="gw-user-name">{user?.full_name || user?.username}</span>
            <button className="gw-logout-btn" onClick={onLogout} title="خروج">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>

          <button className="gw-hamburger-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            )}
          </button>
        </div>
      </header>

      <div className="admin-app-body">
        {selectedEvent && (
          <AdminSidebar
            showStores={hasMehram}
            hiddenTabs={isScoped ? (hasMehram ? SCOPED_HIDDEN_TABS : [...SCOPED_HIDDEN_TABS, 'map']) : []}
            itemOverrides={isScoped ? { map: { label: 'نقشه فروشگاه‌ها', badge: null }, stores: { label: 'گزارش جامع' } } : {}}
            badges={{ reports: isScoped ? 0 : (liveEvent?.pending_approval_count || 0) }}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            requiresSetup={selectedEvent?.requires_setup || (selectedEvent?.setup_count ?? 0) > 0}
            requiresCollection={selectedEvent?.requires_collection || (selectedEvent?.collection_count ?? 0) > 0}
            eventName={selectedEvent.name}
            onLogout={onLogout}
            onDeleteEvent={() => {
              deleteEvent(selectedEvent);
              setSelectedEvent(null);
            }}
          />
        )}
        <main className={`admin-app-content ${selectedEvent ? 'admin-sidebar-content' : 'gw-main'}`}>
          {!selectedEvent ? (
            <>
              {/* ── TAB: Events ── */}
              {gwTab === 'events' && (
                <>
                  <div className="gw-heading">
                    <h1>ایونت‌های فعال</h1>
                    <p>یک ایونت را برای مدیریت انتخاب کنید</p>
                  </div>

                  <div className="gw-toolbar">
                    <div className="gw-search">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                      <input
                        placeholder="جستجوی ایونت..."
                        value={eventsSearch || ''}
                        onChange={e => setEventsSearch(e.target.value)}
                      />
                    </div>
                    {!isScoped && (
                    <button className="gw-new-btn" onClick={() => navigate('/event')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      ایونت جدید
                    </button>
                    )}
                  </div>

                  {eventsLoading ? (
                    <PageLoader label="در حال بارگذاری ایونت‌ها" />
                  ) : filteredEvents.length === 0 ? (
                    <div className="gw-empty">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4" /></svg>
                      <p>ایونتی یافت نشد</p>
                      {!isScoped && <button className="gw-new-btn" onClick={() => navigate('/event')}>ساخت اولین ایونت</button>}
                    </div>
                  ) : (
                    <div className="gw-table-wrap">
                      <table className="gw-table">
                        <thead>
                          <tr>
                            <th style={{textAlign:'center'}}>#</th>
                            <th style={{textAlign:'right'}}>نام ایونت</th>
                            <th style={{textAlign:'center'}}>کلاینت</th>
                            <th style={{textAlign:'center'}}>تایید کلاینت</th>
                            <th style={{textAlign:'center'}}>وضعیت</th>
                            <th style={{textAlign:'center'}}>تاریخ شروع</th>
                            <th style={{textAlign:'center'}}>تایمر</th>
                            <th style={{textAlign:'center'}}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredEvents.map((ev, i) => (
                            <tr key={ev.id} className={`gw-table-row${!ev.is_active ? ' gw-row-disabled' : ''}`} onClick={() => setSelectedEvent(ev)}>
                              <td className="gw-td-num" style={{textAlign:'center'}}>{i + 1}</td>
                              <td className="gw-td-name">
                                <div className="gw-event-icon-wrap">
                                  {ev.client_logo ? (
                                    <img src={ev.client_logo} alt={ev.client_name || ''} className="gw-event-icon-logo" />
                                  ) : (
                                    <div className="gw-event-icon">{ev.name[0]}</div>
                                  )}
                                </div>
                                <span>{ev.name}</span>
                                {ev.pending_approval_count > 0 && (
                                  <span className="gw-pending-badge" title="گزارش‌هایی که کلاینت هنوز نمی‌بیند">⏳ {ev.pending_approval_count.toLocaleString('fa-IR')} در انتظار تایید</span>
                                )}
                              </td>
                              <td style={{textAlign:'center'}}>
                                {ev.client_name ? (
                                  <span className="gw-client-badge">
                                    {ev.client_name}
                                  </span>
                                ) : (
                                  <span className="gw-client-badge gw-client-badge-empty">—</span>
                                )}
                              </td>
                              {/* تایید کلاینت — toggle اسلایدر */}
                              <td style={{textAlign:'center'}} onClick={(e) => e.stopPropagation()}>
                                <label className="gw-client-approval">
                                  <input type="checkbox" checked={ev.client_approved || false} disabled={!canManageEvents} title={canManageEvents ? undefined : "فقط ادمین‌های مجاز"} onChange={() => canManageEvents && toggleClientApprove(ev)} />
                                  <span className="gw-approval-slider"></span>
                                </label>
                              </td>
                              {/* وضعیت — badge کلیک‌پذیر که هم نشون میده هم toggle می‌کنه */}
                              <td style={{textAlign:'center'}} onClick={(e) => { e.stopPropagation(); if (!isScoped) toggleEventStatus(ev); }}>
                                <span className={`gw-status-pill ${ev.is_active ? 'active' : 'disabled'}${isScoped ? ' gw-status-pill--readonly' : ''}`}>
                                  <span className="gw-status-dot" />
                                  <span className="gw-status-text-default">{ev.is_active ? 'فعال' : 'غیر فعال'}</span>
                                  {ev.is_active && !isScoped && <span className="gw-status-text-hover">غیر فعال</span>}
                                </span>
                              </td>
                              <td className="gw-td-date" style={{textAlign:'center'}}>
                                {ev.start_date ? ev.start_date.split(',')[0] : '—'}
                              </td>
                              <td style={{textAlign:'center'}}>
                                {ev.is_active ? <EventCountdown event={ev} /> : <span className="evc-empty">—</span>}
                              </td>
                              <td className="gw-td-action gw-td-action-group">
                                <button className="gw-open-btn" onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}>
                                  باز کردن
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                                </button>
                                {!isScoped && (
                                <button className="gw-edit-btn" title="ویرایش ایونت" onClick={e => { e.stopPropagation(); navigate(`/event?edit=${ev.slug}`); }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                )}
                                {canManageEvents && (<>
                                <button className="gw-archive-btn" title="آرشیو ایونت" onClick={e => { e.stopPropagation(); archiveEvent(ev); }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>
                                </button>
                                <button className="gw-delete-btn" title="حذف ایونت" onClick={e => { e.stopPropagation(); deleteEvent(ev); }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                </button>
                                </>)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                  )}
                </>
              )}

              {/* ── TAB: Roster (Promoters Archive) ── */}
              {!isScoped && gwTab === 'roster' && (
                <>
                  <div className="gw-heading">
                    <h1>آرشیو پروموترها</h1>
                    <p>مدیریت لیست کامل پروموترها — مستقل از هر ایونت</p>
                  </div>
                  <div className="gw-inline-content">
                    <RosterManager token={token} onOpenBadges={() => { setGwTab('badges'); setSelectedEvent(null); }} />
                  </div>
                </>
              )}

              {/* ── TAB: Badges & Certificates Archive ── */}
              {!isScoped && gwTab === 'badges' && (
                <>
                  <div className="gw-heading">
                    <h1>آرشیو بج‌ها و گواهی‌ها</h1>
                    <p>بج‌ها را اینجا تعریف کن؛ بعد روی کارت هر پروموتر از لیست انتخاب می‌شوند</p>
                  </div>
                  <div className="gw-inline-content">
                    <BadgeManager token={token} />
                  </div>
                </>
              )}

              {/* ── TAB: Clients ── */}
              {!isScoped && gwTab === 'clients' && (
                <>
                  <div className="gw-heading">
                    <h1>کلاینت‌ها</h1>
                    <p>مدیریت لیست کلاینت‌ها</p>
                  </div>
                  <div className="gw-inline-content">
                    <ClientsManager token={token} />
                  </div>
                </>
              )}

              {/* ── TAB: Equipment Archive ── */}
              {!isScoped && gwTab === 'equipment' && (
                <>
                  <div className="gw-heading">
                    <h1>آرشیو تجهیزات</h1>
                    <p>مدیریت تجهیزات و وسایل — مستقل از هر ایونت</p>
                  </div>
                  <div className="gw-inline-content">
                    <EquipmentArchive token={token} />
                  </div>
                </>
              )}

              {/* ── TAB: Archived Events ── */}
              {!isScoped && gwTab === 'archivedEvents' && (
                <>
                  <div className="gw-heading">
                    <h1>آرشیو ایونت‌ها</h1>
                    <p>ایونت‌هایی که به پایان رسیده‌اند</p>
                  </div>

                  <div className="gw-toolbar">
                    <div className="gw-search">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                      <input
                        placeholder="جستجوی ایونت آرشیو شده..."
                        value={eventsSearch || ''}
                        onChange={e => setEventsSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  {filteredArchived.length === 0 ? (
                    <div className="gw-empty">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>
                      <p>هیچ ایونت آرشیو شده‌ای یافت نشد</p>
                    </div>
                  ) : (
                    <div className="gw-table-wrap">
                      <table className="gw-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>نام ایونت</th>
                            <th>کلاینت</th>
                            <th>کد (slug)</th>
                            <th>تاریخ شروع</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredArchived.map((ev, i) => (
                            <tr key={ev.id} className="gw-table-row gw-archived-row" onClick={() => setSelectedEvent(ev)}>
                              <td className="gw-td-num">{i + 1}</td>
                              <td className="gw-td-name">
                                <div className="gw-event-icon gw-event-icon-archived">{ev.name[0]}</div>
                                <span>{ev.name}</span>
                              </td>
                              <td className="gw-td-date">{ev.client_name || '—'}</td>
                              <td><code className="gw-slug">{ev.slug}</code></td>
                              <td className="gw-td-date">{ev.start_date ? ev.start_date.split(',')[0] : '—'}</td>
                              <td className="gw-td-action gw-td-action-group">
                                <button className="gw-open-btn" onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}>
                                  باز کردن
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                                </button>
                                {canManageEvents && (
                                <button className="gw-open-btn" onClick={e => { e.stopPropagation(); unarchiveEvent(ev); }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                                  بازگردانی
                                </button>
                                )}
                                <button className="gw-edit-btn" title="ویرایش ایونت" onClick={e => { e.stopPropagation(); navigate(`/event?edit=${ev.slug}`); }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                {canManageEvents && (
                                <button className="gw-delete-btn" title="حذف ایونت" onClick={e => { e.stopPropagation(); deleteEvent(ev); }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className={isScoped ? 'admin-scoped-client' : undefined}>
              {!tabAllowed(activeTab) ? null : loading && activeTab !== 'ai' ? (
                <PageLoader label="در حال بارگذاری" />
              ) : (
                <>
                  {activeTab === 'dashboard' && <DashboardTab stats={stats} weeklyData={weeklyData} weeklyTrend={weeklyTrend} formatAmount={formatAmount} analytics={analytics} users={users} selectedEvent={selectedEvent} amountField={amountField} fieldInsights={fieldInsights} promoterDelays={promoterDelays} dailyTeam={dailyTeam} />}
                  {activeTab === 'reports' && <ReportsTab selectedEvent={selectedEvent} submissions={submissions} token={token} formatAmount={formatAmount} users={users} onGoToMapPoint={isScoped ? undefined : goToMapPoint}
                    requiresApproval={!isScoped && !!events.find(e => e.id === selectedEvent.id)?.requires_report_approval}
                    canApprove={!!user?.can_approve_reports} canDelete={!!user?.can_delete_reports}
                    clientView={isScoped}
                    onRefresh={() => loadSubmissions(true)} refreshing={subsRefreshing} updatedAt={subsUpdatedAt}
                    onApprovalChange={(rows) => { setSubmissions(prev => prev.map(s => { const r = rows.find(x => x.id === s.id); return r ? { ...s, ...r } : s; })); fetchEvents(true); }} />}
                  {activeTab === 'gallery' && <GalleryTab selectedEvent={selectedEvent} submissions={submissions} users={users} currentUser={user} token={token} onUpdateEvent={(patch) => setSelectedEvent(prev => prev ? { ...prev, ...patch } : prev)} />}
                  {activeTab === 'setup_collection' && <SetupCollectionTab users={users} submissions={submissions} token={token} selectedEvent={selectedEvent} refreshUsers={fetchUsers} />}
                  {activeTab === 'stores' && hasMehram && <MehramStoresTab token={token} clientView={isScoped} />}
                  {activeTab === 'charts' && <ChartsTab token={token} />}
                  {activeTab === 'promoters' && <PromotersTab users={users} token={token} eventSlug={selectedEvent.slug} eventId={selectedEvent.id} selectedEvent={selectedEvent} refreshUsers={fetchUsers} readOnly={isScoped} />}
                  {activeTab === 'map' && isScoped && <MehramStoresTab key="stores-map" token={token} clientView defaultView="map" />}
                  {activeTab === 'map' && !isScoped && <MapTab users={users} promoterLocations={promoterLocations} selectedEvent={selectedEvent} submissions={submissions} focusTarget={mapFocusTarget} />}
                  {activeTab === 'inventory' && <InventoryTab token={token} users={users} eventId={selectedEvent.id} selectedEvent={selectedEvent} />}
                  {activeTab === 'ai' && <AITab stats={stats} topPromoters={topPromoters} />}
                  {activeTab === 'chat' && <ChatTab token={token} users={users} eventId={selectedEvent.id} />}
                  {activeTab === 'settings' && <SettingsTab stats={stats} formatAmount={formatAmount} />}
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminPanel;
