import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DatePicker, { DateObject } from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import MainHeader from "./components/MainHeader";
import PhoneInput from "./components/PhoneInput";

import './App.css';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function SetupDashboard() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState('pre'); // 'pre' or 'post'
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Same rule as the promoter form: only 401/403 logs out; network errors / 5xx retry.
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

  useEffect(() => {
    fetch(`${API_URL}/events/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if(data) setEvent(data);
        setLoading(false);
      });
  }, [slug]);

  if (!authChecked) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--text-muted)' }}>
      در حال بارگذاری...
    </div>
  );

  const doLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginData.username, password: loginData.password })
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'خطا');
      const data = await res.json();
      setToken(data.access_token);
      localStorage.setItem('token', data.access_token);
    } catch (e) { setAuthError(e.message); }
    finally { setAuthLoading(false); }
  };

  if (!token || !user) return (
    <>
      <MainHeader 
        theme={theme}
        toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
      />
      <div className="login-form-wrapper">
        <div className="login-card fade-in">
          <div className="login-card-header">
            <div className="login-icon-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width:24,height:24}}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
            </div>
            <h2 className="login-title">ورود به سیستم ست‌آپ</h2>
            {event && <p style={{textAlign:'center', color:'var(--text-muted)', fontSize:'0.85rem', margin:'-8px 0 0'}}>برای دسترسی به <b style={{color:'var(--accent-color)'}}>{event.name}</b></p>}
          </div>
          <div className="login-form">
            <div className="login-field"><div className="login-input-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="input-icon"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              <input className="login-input" autoCapitalize="none" autoCorrect="off" autoComplete="username" spellCheck={false} dir="ltr" placeholder="نام کاربری" value={loginData.username} onChange={e => setLoginData({...loginData, username: e.target.value})} />
            </div></div>
            <div className="login-field"><div className="login-input-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="input-icon"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
              <input className="login-input" type="password" autoComplete="current-password" placeholder="رمز عبور" value={loginData.password} onChange={e => setLoginData({...loginData, password: e.target.value})} />
            </div></div>
            {authError && <div style={{color:'#ef4444', fontSize:'0.85rem', textAlign:'center'}}>{authError}</div>}
            <button className="login-submit-btn" onClick={doLogin} disabled={authLoading}>
              {authLoading ? '...' : 'ورود'}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  if (loading) return (
    <>
      <MainHeader theme={theme} toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-muted)' }}>
        در حال بارگذاری...
      </div>
    </>
  );

  if (!event) return (
    <>
      <MainHeader theme={theme} toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} />
      <div style={{padding: 20, textAlign: 'center'}}>ایونت پیدا نشد</div>
    </>
  );

  const currentFields = phase === 'pre' ? event.setup_pre_fields || [] : event.setup_post_fields || [];
  
  // Header fixed values
  const dateNow = new DateObject({ calendar: persian, locale: persian_fa }).format();
  const timeNow = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

  const handleSubmit = async (e) => {
    if(e) e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/events/${slug}/setup-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phase, data: formData })
      });
      if(res.ok) {
        alert('گزارش با موفقیت ثبت شد!');
        if (phase === 'pre') setPhase('post');
        setFormData({});
      } else {
        alert('خطا در ثبت گزارش');
      }
    } catch(err) {
      alert('خطا در ارتباط با سرور');
    }
    setSubmitting(false);
  };

  const handleChange = (id, value) => {
    setFormData(p => ({...p, [id]: value}));
  };

  const formatNumber = (v) => { if (!v) return ''; return v.toString().replace(/[^0-9]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,','); };

  const renderField = (f) => {
    const val = formData[f.id] ?? '';
    const onChange = (v) => handleChange(f.id, v);

    switch (f.type) {
      case 'text':
        return <input className="input-field" placeholder={f.placeholder || f.label} value={val} onChange={e => onChange(e.target.value)} required={f.required} />;
      case 'number':
        return <input className="input-field" type="number" placeholder={f.placeholder || '۰'} value={val} onChange={e => onChange(e.target.value)} required={f.required} />;
      case 'phone':
        return <PhoneInput value={val} onChange={e => onChange(e.target.value)} required={f.required} />;
      case 'price':
        return <input className="input-field" type="number" value={val} onChange={e => onChange(e.target.value)} placeholder={f.placeholder || f.label} required={f.required} />;
      case 'email':
        return <input className="input-field" type="email" placeholder={f.placeholder || 'example@mail.com'} value={val} onChange={e => onChange(e.target.value)} required={f.required} dir="ltr" />;
      case 'textarea':
        return <textarea className="input-field" rows={3} placeholder={f.placeholder || f.label} value={val} onChange={e => onChange(e.target.value)} required={f.required} />;
      case 'date':
        return <input className="input-field" type="date" value={val} onChange={e => onChange(e.target.value)} required={f.required} />;
      case 'time':
        return <input className="input-field" type="time" value={val} onChange={e => onChange(e.target.value)} required={f.required} />;
      case 'select':
        return (
          <select className="input-field" value={val} onChange={e => onChange(e.target.value)} required={f.required}>
            <option value="">انتخاب کنید...</option>
            {(f.options || []).filter(Boolean).map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
          </select>
        );
      case 'checkbox':
        return (
          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', background: 'var(--input-bg, #1a1a1a)', padding: 12, borderRadius: 8, border: '1px solid var(--input-border, #333)' }}>
            <input type="checkbox" checked={!!val} onChange={e => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--primary-color)' }} required={f.required} />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-color)' }}>{f.label}</span>
          </label>
        );
      case 'choice': {
        const selectedOpts = Array.isArray(val) ? val : (val ? [val] : []);
        const isMulti = !!f.multiple;
        return (
          <div className="choice-chips" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(f.options || []).filter(Boolean).map((opt, i) => {
              const isSel = selectedOpts.includes(opt);
              return (
                <button
                  key={i} type="button"
                  onClick={() => {
                    if (isMulti) {
                      onChange(isSel ? selectedOpts.filter(o => o !== opt) : [...selectedOpts, opt]);
                    } else {
                      onChange(isSel ? [] : [opt]);
                    }
                  }}
                  style={{
                    padding: '8px 16px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 500, transition: 'all 0.2s', border: 'none', cursor: 'pointer',
                    background: isSel ? 'var(--primary-color)' : 'var(--input-bg, #1a1a1a)',
                    color: isSel ? '#fff' : 'var(--text-color)',
                    boxShadow: isSel ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none'
                  }}
                >{opt}</button>
              );
            })}
          </div>
        );
      }
      default:
        return <input className="input-field" type="text" placeholder={f.placeholder || f.label} value={val} onChange={e => onChange(e.target.value)} required={f.required} />;
    }
  };

  const cols = event?.desktop_columns || 3;

  return (
    <>
      <MainHeader 
        token={token} 
        user={user} 
        theme={theme} 
        toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
        onLogout={() => { setToken(''); localStorage.removeItem('token'); navigate('/admin/login'); }}
      />
      <div className="container-full fade-in">
        
        {/* Header fields block removed per user request */}

        <div className="card" style={{ padding: '30px', marginTop: '20px' }}>
          <h2 className="form-title" style={{ textAlign: 'center', marginBottom: '30px', fontSize: '1.5rem', background: 'linear-gradient(90deg, var(--primary-color), var(--accent-color))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            پنل ست‌آپ: {event.name}
          </h2>
          {/* Phase toggles */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', padding: 4, background: 'var(--ep-bg-secondary, #111)', borderRadius: 12 }}>
            <button type="button" onClick={() => setPhase('pre')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: phase === 'pre' ? 'var(--primary-color)' : 'transparent', color: phase === 'pre' ? '#fff' : 'var(--text-muted)', fontWeight: phase === 'pre' ? 'bold' : 'normal', transition: 'all 0.2s', cursor: 'pointer' }}>
              📋 فرم قبل از ایونت
            </button>
            <button type="button" onClick={() => setPhase('post')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: phase === 'post' ? 'var(--primary-color)' : 'transparent', color: phase === 'post' ? '#fff' : 'var(--text-muted)', fontWeight: phase === 'post' ? 'bold' : 'normal', transition: 'all 0.2s', cursor: 'pointer' }}>
              📦 فرم بعد از ایونت
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }}>
              {currentFields.map(f => (
                <div key={f.id} style={{ gridColumn: `span ${Math.min(f.width || 1, cols)}` }}>
                  {!['checkbox', 'divider', 'heading'].includes(f.type) && (
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}
                    </label>
                  )}
                  {renderField(f)}
                </div>
              ))}
            </div>

            {currentFields.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '40px 0' }}>هیچ فیلدی برای این مرحله تعریف نشده است.</p>}
            
            {currentFields.length > 0 && (
              <button type="submit" className="login-submit-btn" style={{ marginTop: 30, padding: '14px', fontSize: '1.1rem', borderRadius: '12px', boxShadow: '0 8px 20px rgba(16, 185, 129, 0.4)', background: 'linear-gradient(90deg, #10b981, #059669)', border: 'none', transition: 'all 0.3s ease' }} disabled={submitting}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: 22, height: 22, marginLeft: 8 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {submitting ? 'در حال ثبت...' : 'ثبت'}
              </button>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
