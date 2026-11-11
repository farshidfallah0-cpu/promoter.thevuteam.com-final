import PageLoader from '../../components/PageLoader';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Camera, MapPin } from 'lucide-react';
import CityPicker from '../components/CityPicker';
import RosterFilters from '../components/RosterFilters';
import { EMPTY_ROSTER_FILTERS, applyRosterFilters } from '../utils/rosterFilters';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const DefaultAvatarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: '50%', height: '50%', color: 'white', opacity: 0.9 }}>
    <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
  </svg>
);

const EMPTY_FORM = { firstName: '', lastName: '', phone_number: '', username: '', password: '', certificates: [], gender: '', badge_ids: [], city: '' };

const TITLES = ['Rookie', 'Pro', 'Expert', 'Elite'];
const GENDER_LABEL = { male: 'آقا', female: 'خانم' };

function formatWorkDay(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tehran' });
}

function BadgeChip({ badge }) {
  return (
    <span className="rc-badge" title={badge.name} style={badge.image_url ? undefined : { '--badge-color': badge.color || '#f6c016' }}>
      {badge.image_url ? <img src={badge.image_url} alt="" /> : <span className="rc-badge-dot" />}
      <span>{badge.name}</span>
    </span>
  );
}
const PROMOTER_SITE = 'https://promoter.thevuteam.com';

function getAvatarColor(seed) {
  const colors = [
    ['#6366f1', '#8b5cf6'], ['#f59e0b', '#ef4444'], ['#10b981', '#06b6d4'],
    ['#f97316', '#ec4899'], ['#3b82f6', '#6366f1']
  ];
  const idx = (seed || '').charCodeAt(0) % colors.length;
  return colors[idx];
}

// Deep-link to the promoter's currently active event when there is exactly
// one, otherwise fall back to the bare site (roster entries aren't tied to
// a single event — they can be active on several, or none, at once).
function buildLoginUrl(r) {
  const active = (r.assignments || []).filter(a => a.is_active);
  return active.length === 1 ? `${PROMOTER_SITE}/${active[0].event_slug}` : PROMOTER_SITE;
}

function buildShareText(r) {
  return `🎟 اطلاعات ورود به سامانه VU\n\nنام: ${r.full_name}\nآدرس: ${buildLoginUrl(r)}\nنام کاربری: ${r.username || '—'}\nرمز عبور: ${r.plain_password || '—'}`;
}

function toWhatsAppHref(r) {
  const text = encodeURIComponent(buildShareText(r));
  let phone = (r.phone_number || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '98' + phone.slice(1);
  return `https://wa.me/${phone}?text=${text}`;
}

export const RosterManager = ({ token, onOpenBadges }) => {
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState(EMPTY_ROSTER_FILTERS); // search, gender, title, city, badges
  const [badges, setBadges] = useState([]);
  const [shareTarget, setShareTarget] = useState(null);
  const [showSharePassword, setShowSharePassword] = useState(false);
  const [uploadingAvatarId, setUploadingAvatarId] = useState(null);

  const openShare = (r, e) => {
    e.stopPropagation();
    setShowSharePassword(false);
    setShareTarget(r);
  };

  const copyShareField = (label, value) => {
    navigator.clipboard.writeText(value).then(() => {
      toast.success(`${label} کپی شد`);
    }).catch(() => toast.error('خطا در کپی'));
  };

  const handleNativeShare = async (r) => {
    const text = buildShareText(r);
    if (navigator.share) {
      try { await navigator.share({ title: 'اطلاعات ورود پروموتر', text }); }
      catch (err) { if (err?.name !== 'AbortError') toast.error('خطا در اشتراک‌گذاری'); }
    } else {
      navigator.clipboard.writeText(text).then(() => toast.success('اطلاعات ورود کپی شد!')).catch(() => toast.error('خطا در کپی'));
    }
  };

  const handleAvatarUpload = async (r, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAvatarId(r.id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await axios.post(`${API_URL}/upload/image`, fd, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      const { data } = await axios.put(`${API_URL}/admin/promoter-roster/${r.id}`, {
        profile_picture: uploadRes.data.url
      }, { headers: { Authorization: `Bearer ${token}` } });
      setRoster(prev => prev.map(x => (x.id === r.id ? data : x)));
      toast.success('عکس پروموتر به‌روزرسانی شد');
    } catch (err) {
      toast.error('خطا در آپلود عکس');
    } finally {
      setUploadingAvatarId(null);
    }
  };

  const fetchRoster = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/promoter-roster`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoster(res.data);
    } catch (e) {
      toast.error('خطا در دریافت آرشیو پروموترها');
    } finally {
      setLoading(false);
    }
  };

  const fetchBadges = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/badges`, { headers: { Authorization: `Bearer ${token}` } });
      setBadges(res.data);
    } catch (e) {
      toast.error('خطا در دریافت آرشیو بج‌ها');
    }
  };

  useEffect(() => { fetchRoster(); fetchBadges(); }, [token]);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (r) => {
    const [firstName, ...rest] = (r.full_name || '').split(' ');
    setForm({
      firstName: firstName || '',
      lastName: rest.join(' '),
      phone_number: r.phone_number || '',
      username: r.username || '',
      password: '',
      certificates: r.certificates || [],
      gender: r.gender || '',
      badge_ids: r.badge_ids || [],
      city: r.city || ''
    });
    setEditId(r.id);
    setShowModal(true);
  };

  const removeCertAt = (idx) => {
    setForm(f => ({ ...f, certificates: f.certificates.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.firstName.trim()) return toast.warning('نام الزامی است');
    setSaving(true);
    try {
      const payload = {
        full_name: `${form.firstName} ${form.lastName}`.trim(),
        phone_number: form.phone_number || null,
        username: form.username || null,
        certificates: form.certificates,
        gender: form.gender,
        badge_ids: form.badge_ids,
        city: form.city || '',
      };
      if (form.password) payload.password = form.password;
      if (editId) {
        await axios.put(`${API_URL}/admin/promoter-roster/${editId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('اطلاعات پروموتر ویرایش شد');
      } else {
        await axios.post(`${API_URL}/admin/promoter-roster`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('پروموتر به آرشیو اضافه شد');
      }
      setShowModal(false);
      fetchRoster();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r, e) => {
    e.stopPropagation();
    const activeAssignments = (r.assignments || []).filter(a => a.is_active);
    const msg = activeAssignments.length > 0
      ? `این پروموتر الان روی ${activeAssignments.length} ایونت قرار داره. حذف از آرشیو، حساب‌های فعلیشون رو پاک نمی‌کنه — فقط ارتباط با آرشیو قطع می‌شه. ادامه بدم؟`
      : 'مطمئنی می‌خوای این پروموتر رو از آرشیو حذف کنی؟';
    if (!window.confirm(msg)) return;
    try {
      await axios.delete(`${API_URL}/admin/promoter-roster/${r.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoster(prev => prev.filter(x => x.id !== r.id));
      toast.success('از آرشیو حذف شد');
    } catch (e2) {
      toast.error('خطا در حذف');
    }
  };

  const toggleBadge = (id) => {
    setForm(f => ({ ...f, badge_ids: f.badge_ids.includes(id) ? f.badge_ids.filter(x => x !== id) : [...f.badge_ids, id] }));
  };

  const filtered = applyRosterFilters(roster, filters);

  if (loading) return (
    <PageLoader label="در حال بارگذاری آرشیو" />
  );

  return (
    <div>
      <div className="res-header">
        {onOpenBadges && <button className="admin-btn-ghost" onClick={onOpenBadges}>🏅 مدیریت بج‌ها و گواهی‌ها</button>}
        <button className="res-create-btn" onClick={openCreate}>+ افزودن پروموتر به آرشیو</button>
      </div>

      <RosterFilters filters={filters} onChange={setFilters} roster={roster} badges={badges} shown={filtered.length} />

      {filtered.length === 0 ? (
        <div className="res-empty">
          <p>{roster.length === 0 ? 'هنوز پروموتری در آرشیو ثبت نشده — اولین نفر رو اضافه کن' : 'موردی یافت نشد'}</p>
        </div>
      ) : (
        <div className="rc-grid">
          {filtered.map(r => {
            const [c1, c2] = getAvatarColor(r.username || r.full_name);
            const activeCount = (r.assignments || []).filter(a => a.is_active).length;
            const legacyCerts = r.certificates || [];
            const g = r.gamification;
            const title = g?.title || 'Rookie';
            const progressPct = g && g.credits_to_next_level
              ? Math.min(100, (Math.max(0, g.days_into_level) / g.credits_to_next_level) * 100)
              : 100;
            const shownBadges = (r.badges || []).slice(0, 4);
            const extraBadges = (r.badges || []).length - shownBadges.length;
            return (
              <div key={r.id} className={`rc-card rc-card-${title.toLowerCase()}`} onClick={() => openEdit(r)}>
                <div className="rc-hero">
                  <div className="rc-avatar-wrap" onClick={e => e.stopPropagation()}>
                    <div className="rc-avatar" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                      {r.profile_picture ? <img src={r.profile_picture} alt="" /> : <DefaultAvatarIcon />}
                    </div>
                    <label className="rc-avatar-upload" title="تغییر / افزودن عکس پروموتر">
                      {uploadingAvatarId === r.id ? <span className="pc-avatar-spinner" /> : <Camera size={14} strokeWidth={2.5} />}
                      <input type="file" accept="image/*" onChange={e => handleAvatarUpload(r, e)} />
                    </label>
                  </div>
                  {activeCount > 0 && (
                    <span className="rc-active-pill"><span className="badge-dot" />{activeCount} ایونت فعال</span>
                  )}
                  <span className={`rc-title-pill rc-title-${title.toLowerCase()}`}>{title}</span>
                </div>

                <div className="rc-name-block">
                  <h3 className="rc-name" title={r.full_name}>{r.full_name}</h3>
                  <span className="rc-username">
                    {r.username ? `@${r.username}` : 'بدون نام‌کاربری'}
                    {r.gender && <span className="rc-gender"> · {GENDER_LABEL[r.gender]}</span>}
                  </span>
                  {r.city && <span className="rc-city"><MapPin size={13} strokeWidth={2.2} /> {r.city}</span>}
                </div>

                {g && (
                  <div className="rc-progress">
                    <div className="rc-progress-bar"><div className="rc-progress-fill" style={{ width: `${progressPct}%` }} /></div>
                    <div className="rc-progress-hint">
                      {g.next_title ? `${g.total_days} / ${g.next_title_days} روز تا ${g.next_title}` : `${g.total_days} روز — بالاترین تایتل`}
                    </div>
                  </div>
                )}

                <div className="rc-stats">
                  <div className="rc-stat"><span className="rc-stat-label">روز فعالیت</span><span className="rc-stat-val">{g ? g.total_days : 0}</span></div>
                  <div className="rc-stat"><span className="rc-stat-label">آخرین روز کاری</span><span className="rc-stat-val">{formatWorkDay(g?.last_work_at)}</span></div>
                  <div className="rc-stat"><span className="rc-stat-label">تماس</span><span className="rc-stat-val" dir="ltr">{r.phone_number || '—'}</span></div>
                </div>

                <div className="rc-badges">
                  {shownBadges.map(b => <BadgeChip key={b.id} badge={b} />)}
                  {extraBadges > 0 && <span className="rc-badge rc-badge-more">+{extraBadges}</span>}
                  {legacyCerts.length > 0 && shownBadges.length === 0 && (
                    <span className="rc-badge rc-badge-legacy">{legacyCerts.length} گواهی قدیمی</span>
                  )}
                </div>

                <div className="rc-footer">
                  <span>ویرایش / حذف</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="res-icon-btn share" title="اشتراک‌گذاری اطلاعات ورود" onClick={(e) => openShare(r, e)}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                      </svg>
                    </button>
                    <button className="res-icon-btn danger" title="حذف" onClick={(e) => handleDelete(r, e)}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="res-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="res-modal">
            <div className="res-modal-header">
              <h3>{editId ? 'ویرایش پروموتر' : 'افزودن پروموتر به آرشیو'}</h3>
              <button className="modal-icon-btn" onClick={() => setShowModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="res-form">
              <div className="res-form-grid">
                <div className="res-field">
                  <label>نام</label>
                  <input className="admin-input" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} placeholder="مثال: علی" />
                </div>
                <div className="res-field">
                  <label>نام خانوادگی</label>
                  <input className="admin-input" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} placeholder="مثال: محمدی" />
                </div>
                <div className="res-field">
                  <label>شماره تماس</label>
                  <input className="admin-input" type="tel" value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value.replace(/[^0-9]/g, '') })} placeholder="09123456789" />
                </div>
                <div className="res-field">
                  <label>نام کاربری (برای ورود)</label>
                  <input className="admin-input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="مثال: ali_m" />
                </div>
                <div className="res-field">
                  <label>رمز عبور (برای ورود)</label>
                  <div className="password-field-wrapper">
                    <input
                      className="admin-input"
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      placeholder={editId ? 'برای تغییر وارد کنید' : 'رمز عبور'}
                    />
                    <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="res-field">
                <label>شهر</label>
                <CityPicker value={form.city} onChange={(c) => setForm({ ...form, city: c })} placeholder="انتخاب شهر (از لیست شهرهای ایران)" clearLabel="بدون شهر" />
              </div>

              <div className="res-field">
                <label>جنسیت</label>
                <div className="rc-filter-group">
                  {[['', 'نامشخص'], ['male', 'آقا'], ['female', 'خانم']].map(([k, label]) => (
                    <button type="button" key={k || 'unset'} className={`rc-filter-btn ${form.gender === k ? 'active' : ''}`} onClick={() => setForm({ ...form, gender: k })}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="res-field">
                <label>بج‌ها / گواهی‌ها</label>
                {badges.length === 0 ? (
                  <div className="res-field-hint">هنوز بجی تعریف نشده — از تب «آرشیو بج‌ها» بج بساز</div>
                ) : (
                  <div className="rc-badge-picker">
                    {badges.map(b => (
                      <button type="button" key={b.id} className={`rc-pick ${form.badge_ids.includes(b.id) ? 'selected' : ''}`} onClick={() => toggleBadge(b.id)}>
                        <BadgeChip badge={b} />
                        <span className="rc-pick-check">{form.badge_ids.includes(b.id) ? '✓' : '+'}</span>
                      </button>
                    ))}
                  </div>
                )}
                {form.certificates.length > 0 && (
                  <>
                    <div className="res-field-hint" style={{ marginTop: 8 }}>گواهی‌های قدیمی (با کلیک حذف می‌شوند)</div>
                    <div className="res-chip-row" style={{ marginTop: 4 }}>
                      {form.certificates.map((c, i) => (
                        c.type === 'image' ? (
                          <span key={i} className="res-chip-img-wrap">
                            <img src={c.value} alt="مجوز" className="res-chip-img" />
                            <button type="button" className="res-chip-img-remove" onClick={() => removeCertAt(i)}>×</button>
                          </span>
                        ) : (
                          <span key={i} className="res-chip removable" onClick={() => removeCertAt(i)}>{c.value} ×</span>
                        )
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="res-actions">
                <button type="submit" className="admin-btn-primary" disabled={saving}>
                  {saving ? 'در حال ذخیره...' : (editId ? '✓ ذخیره تغییرات' : '+ افزودن به آرشیو')}
                </button>
                <button type="button" className="admin-btn-ghost" onClick={() => setShowModal(false)}>انصراف</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {shareTarget && (
        <div className="res-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShareTarget(null); }}>
          <div className="res-modal" style={{ maxWidth: 420 }}>
            <div className="res-modal-header">
              <h3>اشتراک‌گذاری اطلاعات ورود</h3>
              <button className="modal-icon-btn" onClick={() => setShareTarget(null)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="share-card">
                <div className="share-card-brand">
                  <span className="share-card-brand-icon">VU</span>
                  <span>سامانه پروموتور VU</span>
                </div>
                <h4 className="share-card-name">{shareTarget.full_name}</h4>

                <div className="share-row">
                  <span className="share-row-label">آدرس</span>
                  <span className="share-row-value" dir="ltr">{buildLoginUrl(shareTarget).replace('https://', '')}</span>
                  <button className="share-copy-btn" title="کپی آدرس" onClick={() => copyShareField('آدرس', buildLoginUrl(shareTarget))}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
                  </button>
                </div>

                <div className="share-row">
                  <span className="share-row-label">یوزرنیم</span>
                  <span className="share-row-value" dir="ltr">{shareTarget.username || '—'}</span>
                  {shareTarget.username && (
                    <button className="share-copy-btn" title="کپی یوزرنیم" onClick={() => copyShareField('نام کاربری', shareTarget.username)}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
                    </button>
                  )}
                </div>

                <div className="share-row">
                  <span className="share-row-label">رمز عبور</span>
                  <span className="share-row-value" dir="ltr">
                    {shareTarget.plain_password ? (showSharePassword ? shareTarget.plain_password : '••••••••') : '—'}
                  </span>
                  {shareTarget.plain_password && (
                    <>
                      <button className="share-copy-btn" title={showSharePassword ? 'پنهان کردن' : 'نمایش'} onClick={() => setShowSharePassword(p => !p)}>
                        {showSharePassword
                          ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                          : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        }
                      </button>
                      <button className="share-copy-btn" title="کپی رمز عبور" onClick={() => copyShareField('رمز عبور', shareTarget.plain_password)}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!shareTarget.plain_password && (
                <p className="res-field-hint" style={{ margin: 0 }}>
                  این پروموتر هنوز رمز عبوری در آرشیو ثبت نکرده — از دکمه ویرایش برای تعیین رمز استفاده کن.
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="admin-btn-primary" onClick={() => handleNativeShare(shareTarget)}>
                  اشتراک‌گذاری
                </button>
                {shareTarget.phone_number && (
                  <a
                    className="share-btn-whatsapp"
                    href={toWhatsAppHref(shareTarget)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ارسال در واتساپ
                  </a>
                )}
                <button className="admin-btn-ghost" onClick={() => copyShareField('اطلاعات ورود', buildShareText(shareTarget))}>
                  کپی متن کامل
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
