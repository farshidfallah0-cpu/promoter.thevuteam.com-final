import React, { useEffect, useRef, useState } from 'react';
import { User as UserIcon, Phone, Users, BadgeCheck, LogOut, Camera, ShieldCheck, Package, Check, Star, Flame, Crown } from 'lucide-react';
import { resolveEffectiveRole, roleLabel } from '../../utils/roleUtils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TEAMS = ['تیم A', 'تیم B', 'تیم C', 'تیم D'];

// Brand gold accent used for the level card, matching the site's primary color.
const BRAND_GOLD = '#f6c016';

// One icon per promoter title (Rookie < Pro < Expert < Elite).
const LEVEL_TIER_ICONS = {
  Rookie: Star,
  Pro: ShieldCheck,
  Expert: Flame,
  Elite: Crown,
};

const EQUIPMENT_STATUS = {
  pending:  { label: 'در انتظار تحویل',  badge: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  received: { label: 'تحویل گرفته شده',  badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  returned: { label: 'عودت داده شده',    badge: 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400' },
  lost:     { label: 'مفقود شده',        badge: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
};

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  return (Date.now() - new Date(lastSeen).getTime()) < 3 * 60 * 1000;
}

export default function CrewProfileTab({ user, event, setUser, token, onLogout }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [equipment, setEquipment] = useState([]);
  const [confirmingId, setConfirmingId] = useState(null);
  const fileInputRef = useRef(null);

  const online = isOnline(user?.last_seen);
  const certificates = user?.certificates || [];
  const gamification = user?.gamification;
  const roleText = roleLabel(resolveEffectiveRole(user, event));

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/inventory/my`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : []))
      .then(setEquipment)
      .catch(() => {});
  }, [token]);

  const confirmReceipt = async (id) => {
    setConfirmingId(id);
    try {
      const res = await fetch(`${API_URL}/inventory/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'received' }),
      });
      if (res.ok) {
        setEquipment(prev => prev.map(it => (it.id === id ? { ...it, status: 'received' } : it)));
      }
    } catch {
    } finally {
      setConfirmingId(null);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_URL}/upload/image`, { 
        method: 'POST', 
        headers: { Authorization: `Bearer ${token}` },
        body: fd 
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const saveRes = await fetch(`${API_URL}/auth/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ profile_picture: data.url }),
      });
      if (saveRes.ok) setUser(await saveRes.json());
    } catch {
      setMessage('❌ خطا در آپلود عکس');
    } finally {
      setUploading(false);
    }
  };



  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      {/* Header card */}
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-24 h-24 rounded-full overflow-hidden border-4 border-white dark:border-zinc-900 shadow-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center cursor-pointer"
          >
            {user?.profile_picture ? (
              <img src={user.profile_picture} alt="" className="w-full h-full object-cover" />
            ) : (
              <UserIcon size={34} className="text-slate-300 dark:text-zinc-600" />
            )}
          </div>
          <div className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-indigo-600 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-white cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <Camera size={12} />
          </div>
          <span className={`absolute top-1 right-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900 ${online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-zinc-600'}`} />
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>

        <h2 className="mt-3 text-base font-extrabold text-gray-900 dark:text-white">{user?.full_name || user?.username}</h2>
        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
          {roleText} • شناسه #VU-{user?.id}
        </p>
        {user?.team_name && (
          <span className="mt-2 text-[11px] font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
            {user.team_name}
          </span>
        )}
      </div>

      {/* Gamification Banner */}
      {gamification && (() => {
        const TierIcon = LEVEL_TIER_ICONS[gamification.title] || LEVEL_TIER_ICONS.Rookie;
        const progressCurrent = Math.max(0, gamification.days_into_level);
        const progressTotal = Math.max(1, gamification.credits_to_next_level ?? 1);
        const isTopTitle = !gamification.next_title;
        const progressPct = Math.min(100, (progressCurrent / progressTotal) * 100);

        return (
          <div className="rounded-[1.75rem] p-6 relative overflow-hidden shadow-xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-black border" style={{ borderColor: 'rgba(246,192,22,0.2)' }}>
            <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full blur-3xl pointer-events-none" style={{ background: 'rgba(246,192,22,0.12)' }} />

            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center border" style={{ background: 'rgba(246,192,22,0.1)', borderColor: 'rgba(246,192,22,0.3)', color: BRAND_GOLD }}>
                  <TierIcon size={24} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">سطح فعلی شما</p>
                  <h3 className="text-lg font-black truncate" style={{ color: BRAND_GOLD }}>{gamification.title}</h3>
                </div>
              </div>
              <div className="text-left shrink-0" dir="ltr">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 text-right">روزهای کاری</p>
                <h3 className="text-xl font-black text-white text-right">{gamification.total_days} <span className="text-xs font-bold text-zinc-500">روز</span></h3>
              </div>
            </div>

            <div className="relative z-10 mt-5">
              <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400 mb-2">
                <span>{isTopTitle ? 'شما به بالاترین تایتل رسیده‌اید' : `پیشرفت تا ${gamification.next_title}`}</span>
                {!isTopTitle && <span dir="ltr">{progressCurrent} / {progressTotal}</span>}
              </div>
              <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${isTopTitle ? 100 : progressPct}%`, background: `linear-gradient(90deg, #d9a30f, ${BRAND_GOLD})`, boxShadow: '0 0 10px rgba(246,192,22,0.5)' }}
                ></div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Assigned Equipment */}
      {equipment.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-2.5 px-1">تجهیزات تحویلی</h3>
          <div className="space-y-2">
            {equipment.map(item => {
              const meta = EQUIPMENT_STATUS[item.status] || EQUIPMENT_STATUS.pending;
              return (
                <div key={item.id} className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                      <Package size={17} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{item.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${meta.badge}`}>
                          {meta.label}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1 leading-relaxed">{item.description}</p>
                      )}
                      {item.assigned_at && (
                        <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-1.5">
                          تاریخ ثبت: {new Date(item.assigned_at).toLocaleDateString('fa-IR')}
                        </p>
                      )}
                    </div>
                  </div>
                  {item.status === 'pending' && (
                    <button
                      onClick={() => confirmReceipt(item.id)}
                      disabled={confirmingId === item.id}
                      className="mt-3 w-full py-2.5 rounded-xl bg-indigo-600 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Check size={13} />
                      {confirmingId === item.id ? 'در حال ثبت...' : 'تایید دریافت'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Certifications */}
      {certificates.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-2.5 px-1">گواهی‌های برند</h3>
          <div className="space-y-2">
            {certificates.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
                  <span className="text-xs font-bold text-gray-800 dark:text-zinc-200 truncate">{c.label || c.value}</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 shrink-0">
                  تایید شده
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personal info form */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-2.5 px-1">اطلاعات شخصی</h3>
        <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-slate-100 dark:divide-zinc-800 overflow-hidden">
          <ProfileRow icon={UserIcon} label="نام و نام خانوادگی">
            <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{user?.full_name || '—'}</span>
          </ProfileRow>
          <ProfileRow icon={BadgeCheck} label="سمت">
            <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{roleText}</span>
          </ProfileRow>
          <ProfileRow icon={Phone} label="شماره تماس">
            <span className="text-sm font-bold text-gray-900 dark:text-white truncate" dir="ltr">{user?.phone_number || '—'}</span>
          </ProfileRow>
          {user?.team_name && (
            <ProfileRow icon={Users} label="تیم">
              <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{user.team_name}</span>
            </ProfileRow>
          )}
          <ProfileRow icon={UserIcon} label="نام کاربری">
            <span className="text-sm font-bold text-gray-400 dark:text-zinc-500 truncate" dir="ltr">{user?.username}</span>
          </ProfileRow>
        </div>
      </div>

      <button
        onClick={onLogout}
        className="w-full py-3.5 rounded-2xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
      >
        <LogOut size={15} /> خروج از حساب
      </button>
    </div>
  );
}

function ProfileRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
          <Icon size={14} className="text-slate-500 dark:text-zinc-400" />
        </div>
        <p className="text-[11px] font-bold text-gray-500 dark:text-zinc-400">{label}</p>
      </div>
      <div className="min-w-0 text-left flex-1 flex justify-end">
        {children}
      </div>
    </div>
  );
}
