import PageLoader from '../../components/PageLoader';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MapPin } from 'lucide-react';
import { toast } from 'react-toastify';
import '../resources/resources.css';
import { RoleSelect } from './RoleSelect';
import RosterFilters from './RosterFilters';
import { EMPTY_ROSTER_FILTERS, applyRosterFilters } from '../utils/rosterFilters';
import { parseDailyRoles, getRoleOptions, deriveBaseRole, getUserRoles, roleLabel, explicitDays, composeDays, isSpecialRole, normDay } from '../utils/roleHelpers';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const EMPTY_FORM = {
  firstName: '', lastName: '', phone_number: '',
  username: '', password: '', role: 'promoter', assigned_dates: '', daily_roles: {}
};

function formFromPromoter(p, eventDays = []) {
  const [firstName, ...rest] = (p.full_name || '').split(' ');
  // Spell the person's days out against the event's own day strings, so the form always shows exactly
  // which days they work and in which role (an empty assigned_dates = every day of the event).
  const ex = eventDays.length ? composeDays(explicitDays(p, eventDays), eventDays) : null;
  return {
    firstName: firstName || '',
    lastName: rest.join(' '),
    phone_number: p.phone_number || '',
    username: p.username || '',
    password: '',
    role: p.role || 'promoter',
    assigned_dates: ex ? ex.assigned_dates : (p.assigned_dates || ''),
    daily_roles: ex ? ex.daily_roles : parseDailyRoles(p.daily_roles),
    origEmpty: !(p.assigned_dates || '').trim(),
  };
}

const splitDays = (ev) => (ev?.start_date || '').split(',').map((x) => x.trim()).filter(Boolean);

export const RosterPickerModal = ({ token, eventId, selectedEvent, onClose, onAdded, editingPromoter, onUpdated, fixedRole, fixedDate, existingUsers = [] }) => {
  const isEditMode = !!editingPromoter;
  const [step, setStep] = useState(isEditMode ? 'form' : 'search'); // 'search' | 'form' | 'conflict'
  const [roster, setRoster] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [filters, setFilters] = useState(EMPTY_ROSTER_FILTERS);
  const [badges, setBadges] = useState([]);
  const [selectedRosterId, setSelectedRosterId] = useState(isEditMode ? (editingPromoter.roster_id ?? null) : null);
  const [form, setForm] = useState(isEditMode ? formFromPromoter(editingPromoter, splitDays(selectedEvent)) : EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [conflicts, setConflicts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  // The Promoter row this person ALREADY has on this event (one row per person
  // per event), if any. Adding them again — under a second role, or for another
  // day — must extend that row, not create a duplicate (which the server
  // rejects as "username exists in this event").
  const [existingUser, setExistingUser] = useState(null);

  // Key under which the fixed role is stored in daily_roles / assigned_dates.
  // The event's setup/collection date is optional; when it isn't set the old
  // code silently fell through to the plain-promoter branch, so the person
  // was saved as a normal promoter and never showed up in the setup/collection
  // tab. Fall back to the role name itself so the role is always recorded.
  const fixedKey = fixedRole ? (fixedDate || fixedRole) : null;

  const findExistingUser = (r) => (existingUsers || []).find(u =>
    !u.is_admin && ((r.id != null && u.roster_id === r.id) || (r.username && u.username === r.username))
  ) || null;

  const supervisorNeeded = selectedEvent?.supervisor_count ?? 0;
  const setupNeeded = selectedEvent?.setup_count ?? 0;
  const collectionNeeded = selectedEvent?.collection_count ?? 0;
  const transportNeeded = selectedEvent?.transport_count ?? 0;

  const requiresSupervisor = selectedEvent?.requires_supervisor || supervisorNeeded > 0;
  const requiresSetup = selectedEvent?.requires_setup || setupNeeded > 0;
  const requiresCollection = selectedEvent?.requires_collection || collectionNeeded > 0;
  const requiresTransport = selectedEvent?.requires_transport || transportNeeded > 0;

  const roleOptions = getRoleOptions({ 
    requiresSupervisor, 
    requiresSetup: false, 
    requiresCollection: false, 
    requiresTransport 
  });

  useEffect(() => {
    if (isEditMode) { setLoadingRoster(false); return; }
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/admin/promoter-roster`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setRoster(res.data);
      } catch (e) {
        toast.error('خطا در دریافت آرشیو پروموترها');
      } finally {
        setLoadingRoster(false);
      }
      try {
        const b = await axios.get(`${API_URL}/admin/badges`, { headers: { Authorization: `Bearer ${token}` } });
        setBadges(b.data || []);
      } catch (e) { /* the badge filter is optional: an account that can't list badges just doesn't get it */ }
    })();
  }, [token, isEditMode]);

  // «هست / نیست در این ایونت»: whoever already has a row on this event.
  const filtered = applyRosterFilters(roster, filters, (r) => !!findExistingUser(r));
  const inEventCount = roster.filter((r) => !!findExistingUser(r)).length;

  const pickFromRoster = (r) => {
    const [firstName, ...rest] = (r.full_name || '').split(' ');
    setSelectedRosterId(r.id);
    const existing = findExistingUser(r);
    setExistingUser(existing);
    if (fixedRole) {
      setForm({
        firstName: firstName || '',
        lastName: rest.join(' '),
        phone_number: r.phone_number || '',
        username: r.username || '',
        password: r.plain_password || '',
        role: fixedRole,
        assigned_dates: fixedKey,
        daily_roles: { [fixedKey]: fixedRole }
      });
    } else if (existing) {
      // Already on this event (e.g. on another day): start from their current
      // days/roles so the admin just adds the new day to the same row.
      setForm(formFromPromoter(existing, splitDays(selectedEvent)));
    } else {
      setForm({
        firstName: firstName || '',
        lastName: rest.join(' '),
        phone_number: r.phone_number || '',
        username: r.username || '',
        password: r.plain_password || '',
        role: 'promoter',
        assigned_dates: '',
        daily_roles: {}
      });
    }
    setUsernameError('');
    setStep('form');
  };

  const createNewAndPick = async () => {
    const name = filters.q.trim();
    if (!name) return toast.warning('اول یه نام برای جستجو/ثبت وارد کن');
    try {
      const res = await axios.post(`${API_URL}/admin/promoter-roster`, { full_name: name }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoster(prev => [...prev, res.data]);
      pickFromRoster(res.data);
      toast.success('به آرشیو اضافه شد');
    } catch (e) {
      toast.error('خطا در ثبت در آرشیو');
    }
  };

  const submitEdit = async (target = editingPromoter) => {
    if (!(form.assigned_dates || '').trim() && !form.origEmpty) {
      toast.error('حداقل یک روز باید انتخاب شود (برای حذف کامل از دکمه‌ی «حذف پروموتر» استفاده کنید)');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        full_name: `${form.firstName} ${form.lastName}`.trim(),
        phone_number: form.phone_number,
        assigned_dates: form.assigned_dates,
        role: deriveBaseRole(form.daily_roles),
        daily_roles: JSON.stringify(form.daily_roles)
      };
      const res = await axios.put(`${API_URL}/admin/promoters/${target.id}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('اطلاعات پروموتر بروز شد');
      if (onUpdated) onUpdated(res.data); else if (onAdded) onAdded();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطا در بروزرسانی');
    } finally {
      setSubmitting(false);
    }
  };

  // Add the fixed role (setup/collection) to a person who is already on this
  // event under another role — same row, extra role.
  const submitMerge = async () => {
    setSubmitting(true);
    try {
      const prevRoles = { ...parseDailyRoles(existingUser.daily_roles) };
      let prevDates = (existingUser.assigned_dates || '').split(',').map(x => x.trim()).filter(Boolean);

      // No assigned_dates = "here for the whole event" as a plain promoter.
      // Spell that out per day first, otherwise adding one extra role date
      // would silently shrink them to only that date.
      if (prevDates.length === 0) {
        const days = (selectedEvent?.start_date || '').split(',').map(x => x.trim()).filter(Boolean);
        const baseRole = existingUser.role || 'promoter';
        days.forEach(d => { prevDates.push(d); if (!prevRoles[d]) prevRoles[d] = baseRole; });
      }

      if (Object.values(prevRoles).includes(fixedRole)) {
        toast.info(`این نفر از قبل در نقش ${roleLabel(fixedRole)} ثبت شده است`);
        onClose();
        return;
      }

      // Same date already used by a different role for this person (e.g. setup
      // and collection on one day, or a setup date that is also a promoter
      // day) — keep both by using a distinct key instead of overwriting.
      let key = fixedKey;
      if (prevRoles[key] && prevRoles[key] !== fixedRole) key = `${fixedKey}~${fixedRole}`;

      const nextRoles = { ...prevRoles, [key]: fixedRole };
      const nextDates = prevDates.includes(key) ? prevDates : [...prevDates, key];

      await axios.put(`${API_URL}/admin/promoters/${existingUser.id}`, {
        assigned_dates: nextDates.join(','),
        role: deriveBaseRole(nextRoles),
        daily_roles: JSON.stringify(nextRoles),
      }, { headers: { Authorization: `Bearer ${token}` } });

      toast.success(`نقش ${roleLabel(fixedRole)} به ${existingUser.full_name || existingUser.username} اضافه شد`);
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطا در افزودن نقش');
    } finally {
      setSubmitting(false);
    }
  };

  const submitAdd = async (force) => {
    if (isEditMode) return submitEdit();
    if (fixedRole && existingUser) return submitMerge();
    if (existingUser) return submitEdit(existingUser);
    setSubmitting(true);
    setUsernameError('');
    try {
      if (!force && selectedRosterId) {
        const confRes = await axios.get(
          `${API_URL}/admin/promoter-roster/${selectedRosterId}/conflicts?event_id=${eventId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (confRes.data.length > 0) {
          setConflicts(confRes.data);
          setStep('conflict');
          setSubmitting(false);
          return;
        }
      }
      const finalUsername = form.username || `user_${Math.random().toString(36).substring(2, 8)}`;
      const finalPassword = form.password || `pass_${Math.random().toString(36).substring(2, 8)}`;
      const payload = {
        ...form,
        role: deriveBaseRole(form.daily_roles),
        username: finalUsername,
        password: finalPassword,
        full_name: `${form.firstName} ${form.lastName}`.trim(),
        event_id: eventId,
        roster_id: selectedRosterId,
        daily_roles: JSON.stringify(form.daily_roles)
      };
      await axios.post(`${API_URL}/admin/promoters`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(fixedRole ? 'نیرو با موفقیت اضافه شد!' : 'پروموتر با موفقیت اضافه شد!');
      onAdded();
      onClose();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail === 'username exists in this event' || detail === 'username exists') {
        setUsernameError('این نام کاربری قبلاً در این ایونت ثبت شده است.');
        setStep('form');
      } else {
        toast.error(detail || 'خطا در افزودن پروموتر');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();

    submitAdd(false);
  };

  return (
    <div className="res-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`res-modal ${step === 'search' && !isEditMode ? 'res-modal--wide' : ''}`}>
        <div className="res-modal-header">
          <h3>
            {step === 'search' && (fixedRole ? `انتخاب نیروی ${fixedRole === 'setup' ? 'ست‌آپ' : 'کالکشن'} از آرشیو` : 'انتخاب پروموتر از آرشیو')}
            {step === 'form' && (isEditMode ? 'ویرایش پروموتر' : (fixedRole ? `اطلاعات نیروی ${fixedRole === 'setup' ? 'ست‌آپ' : 'کالکشن'}` : 'اطلاعات پروموتر برای این ایونت'))}
            {step === 'conflict' && '⚠️ تداخل زمانی'}
          </h3>
          <button className="modal-icon-btn" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {step === 'search' && (
          <div className="res-form res-picker">
            <RosterFilters filters={filters} onChange={setFilters} roster={roster} badges={badges} shown={filtered.length} showPresence compact />
            {inEventCount > 0 && <div className="res-picker-note">{inEventCount.toLocaleString('fa-IR')} نفر از آرشیو الان روی این ایونت هستند (با برچسب «در این ایونت» دیده می‌شوند).</div>}

            {loadingRoster ? (
              <PageLoader label="در حال بارگذاری" compact />
            ) : filtered.length === 0 ? (
              <div className="res-picker-empty-hint">
                {roster.length === 0 ? 'آرشیو خالیه.' : 'کسی با این فیلترها پیدا نشد.'}
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="res-link-btn" onClick={createNewAndPick}>
                    پیدا نکردی؟ + ثبت «{filters.q.trim() || 'نام'}» در آرشیو و انتخاب
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="res-picker-search-list res-picker-search-list--tall">
                  {filtered.map(r => {
                    const activeCount = (r.assignments || []).filter(a => a.is_active).length;
                    const ex = findExistingUser(r);
                    const g = r.gamification;
                    const shownBadges = (r.badges || []).slice(0, 3);
                    const extra = (r.badges || []).length - shownBadges.length;
                    return (
                      <div key={r.id} className={`res-picker-item rp-item ${ex ? 'in-event' : ''}`} onClick={() => pickFromRoster(r)}>
                        <span className="rp-avatar">{r.profile_picture ? <img src={r.profile_picture} alt="" /> : (r.full_name || '؟').charAt(0)}</span>
                        <div className="rp-main">
                          <div className="res-picker-item-name">{r.full_name}{g?.title && <span className={`rc-title-pill rc-title-${g.title.toLowerCase()} rp-title`}>{g.title}</span>}</div>
                          <div className="res-picker-item-sub">
                            <span dir="ltr">{r.phone_number || 'بدون شماره'}</span>
                            {r.city && <span className="rp-city"> · <MapPin size={12} strokeWidth={2.2} /> {r.city}</span>}
                            {g && <span> · {g.total_days.toLocaleString('fa-IR')} روز فعالیت</span>}
                          </div>
                          {shownBadges.length > 0 && (
                            <div className="rp-badges">
                              {shownBadges.map(b => <span key={b.id} className="rp-badge">{b.image_url ? <img src={b.image_url} alt="" /> : null}{b.name}</span>)}
                              {extra > 0 && <span className="rp-badge more">+{extra}</span>}
                            </div>
                          )}
                        </div>
                        <div className="rp-tags">
                          {ex && <span className="res-chip assignment" title="از قبل در این ایونت">در این ایونت{fixedRole ? ` · ${getUserRoles(ex).map(roleLabel).join('، ')}` : ' ✓'}</span>}
                          {activeCount > 0 && <span className="res-chip assignment">{activeCount} ایونت فعال</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button type="button" className="res-link-btn" onClick={createNewAndPick}>
                  پیدا نکردی؟ + ثبت در آرشیو و انتخاب
                </button>
              </>
            )}
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleFormSubmit} className="res-form">
            <div className="res-form-grid">
              <div className="res-field">
                <label>نام</label>
                <input className="admin-input" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="res-field">
                <label>نام خانوادگی</label>
                <input className="admin-input" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
              </div>

              {fixedRole ? (
                <div className="res-field" style={{ gridColumn: '1 / -1' }}>
                  <label>نقش و تاریخ (خودکار)</label>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: '6px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.5)',
                      padding: '12px 18px', borderRadius: '12px', minWidth: '180px'
                    }}>
                      <span style={{ fontSize: '13px', color: '#34d399', fontWeight: '600' }}>
                        {fixedRole === 'setup' ? '🔧 نیروی ست‌آپ' : '📦 نیروی کالکشن'}
                      </span>
                      {fixedDate && <span style={{ fontSize: '12px', color: '#9ca3af' }}>📅 {fixedDate}</span>}
                    </div>
                  </div>
                  {existingUser && (
                    <p style={{ margin: '10px 0 0', fontSize: '12px', lineHeight: 1.8, color: '#fbbf24' }}>
                      ℹ️ این نفر از قبل در این ایونت با نقش «{getUserRoles(existingUser).map(roleLabel).join('، ')}» ثبت شده؛
                      نقش «{roleLabel(fixedRole)}» به همان حساب اضافه می‌شود (نام کاربری و رمز عبور همان قبلی می‌ماند).
                    </p>
                  )}
                </div>
              ) : (
                <div className="res-field" style={{ gridColumn: '1 / -1' }}>
                  <label>روزهای حضور و نقش در هر روز</label>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#9ca3af' }}>برای هر روز جداگانه مشخص کنید: حضور ندارد، پروموتر، یا کاپیتان.</p>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                    {splitDays(selectedEvent).map((d) => {
                      const dayRole = (form.assigned_dates || '').split(',').map(x => x.trim()).filter(Boolean).some(x => normDay(x) === normDay(d))
                        ? (form.daily_roles[d] || 'promoter') : null;
                      const locked = isSpecialRole(dayRole);
                      const choices = [{ value: '', label: 'هیچی' }, ...roleOptions.filter(o => !isSpecialRole(o.value))];
                      if (dayRole && !locked && !choices.some(c => c.value === dayRole)) choices.push({ value: dayRole, label: roleLabel(dayRole) });
                      const setDay = (role) => {
                        const evDays = splitDays(selectedEvent);
                        const listed = (form.assigned_dates || '').split(',').map(x => x.trim()).filter(Boolean);
                        const byNorm = {};
                        Object.entries(form.daily_roles).forEach(([k, v]) => { byNorm[normDay(k)] = v; });
                        const days = {};
                        evDays.forEach((x) => {
                          if (normDay(x) === normDay(d)) { if (role) days[x] = role; }
                          else if (listed.some(l => normDay(l) === normDay(x))) days[x] = byNorm[normDay(x)] || 'promoter';
                        });
                        const evNorms = new Set(evDays.map(normDay));
                        const extraDates = listed.filter(l => !evNorms.has(normDay(l)));
                        const extraRoles = {};
                        Object.entries(form.daily_roles).forEach(([k, v]) => { if (!evNorms.has(normDay(k))) extraRoles[k] = v; });
                        const c = composeDays({ days, extraDates, extraRoles }, evDays);
                        setForm({ ...form, assigned_dates: c.assigned_dates, daily_roles: c.daily_roles, origEmpty: false });
                      };
                      return (
                        <div key={d} style={{
                          display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '170px', padding: '10px 12px', borderRadius: '12px',
                          background: dayRole ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${dayRole ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255,255,255,0.08)'}`,
                        }}>
                          <div style={{ textAlign: 'center', fontSize: '13px', fontWeight: 600, color: dayRole ? '#34d399' : '#9ca3af' }}>{d}</div>
                          {locked ? (
                            <div style={{ textAlign: 'center', fontSize: '12px', color: '#fbbf24' }}>{roleLabel(dayRole)} (از تب ست‌آپ/کالکشن)</div>
                          ) : (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {choices.map((c) => {
                                const on = (dayRole || '') === c.value;
                                return (
                                  <button key={c.value || 'none'} type="button" onClick={() => setDay(c.value)}
                                    style={{
                                      flex: 1, padding: '6px 4px', fontSize: '12px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
                                      border: `1px solid ${on ? (c.value === 'supervisor' ? '#f59e0b' : c.value ? '#10b981' : '#6b7280') : 'rgba(255,255,255,0.1)'}`,
                                      background: on ? (c.value === 'supervisor' ? 'rgba(245,158,11,0.25)' : c.value ? 'rgba(16,185,129,0.25)' : 'rgba(107,114,128,0.3)') : 'transparent',
                                      color: on ? '#fff' : '#9ca3af', fontWeight: on ? 700 : 400,
                                    }}>{c.label}</button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {!(selectedEvent?.start_date) && <span style={{ fontSize: '11px', color: '#888' }}>تاریخی برای ایونت ثبت نشده است</span>}
                  </div>
                  {existingUser && !isEditMode && (
                    <p style={{ margin: '10px 0 0', fontSize: '12px', lineHeight: 1.8, color: '#fbbf24' }}>
                      ℹ️ این نفر از قبل در این ایونت ثبت شده؛ روزها و نقش‌های جدید به همان حساب اضافه می‌شود.
                    </p>
                  )}
                </div>
              )}
            </div>

            {usernameError && (
              <p style={{ margin: 0, fontSize: '12px', color: '#f87171' }}>{usernameError}</p>
            )}

            <div className="res-actions">
              <button type="submit" className="admin-btn-primary" disabled={submitting}>
                {submitting
                  ? (isEditMode ? 'در حال ذخیره...' : 'در حال بررسی...')
                  : (isEditMode || (existingUser && !fixedRole) ? '✓ ذخیره تغییرات' : (fixedRole && existingUser ? `+ افزودن نقش ${roleLabel(fixedRole)}` : '+ افزودن به این ایونت'))}
              </button>
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={isEditMode ? onClose : () => setStep('search')}
              >
                {isEditMode ? 'انصراف' : 'بازگشت'}
              </button>
            </div>
          </form>
        )}

        {step === 'conflict' && (
          <div className="res-form">
            <div className="res-conflict-box">
              {conflicts.map(c => (
                <p key={c.event_id}>
                  ⚠️ این پروموتر همین الان روی ایونت «<span className="res-conflict-event">{c.event_name}</span>» فعاله
                  (تاریخ مشترک: {c.overlapping_dates.join('، ')}). مطمئنی می‌خوای اونو به این ایونت هم اضافه کنی؟
                </p>
              ))}
            </div>
            <div className="res-actions">
              <button type="button" className="admin-btn-primary" disabled={submitting} onClick={() => submitAdd(true)}>
                {submitting ? 'در حال ذخیره...' : 'بله، اضافه کن'}
              </button>
              <button type="button" className="admin-btn-ghost" onClick={() => setStep('form')}>انصراف</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
