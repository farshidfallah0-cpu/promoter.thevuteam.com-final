import PageLoader from './components/PageLoader';
import WelcomeToast from './components/WelcomeToast';
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import MainHeader from './components/MainHeader';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Compact SVG Icons
const Icons = {
  crown: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  login: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
      <polyline points="10 17 15 12 10 7"/>
      <line x1="15" y1="12" x2="3" y2="12"/>
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
};

const AdminLogin = ({ setToken, setUser }) => {
  const navigate = useNavigate();
  const [login, setLogin] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const doLogin = async () => {
    if (!login.username || !login.password) {
      toast.error("لطفا نام کاربری و رمز عبور را وارد کنید");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/login`, {
        username: login.username,
        password: login.password
      });
      const token = res.data.access_token;
      
      const userRes = await axios.get(`${API_URL}/auth/me`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });

      if (userRes.data.is_admin || userRes.data.admin_client) {
        setToken(token);
        localStorage.setItem('token', token);
        setUser(userRes.data);
        toast(<WelcomeToast name={userRes.data.username || userRes.data.full_name} />, {
          className: 'vu-welcome-toast', bodyClassName: 'vu-welcome-body', icon: false, closeButton: false, hideProgressBar: true, autoClose: 2800,
        });
        navigate('/admin');
      } else {
        toast.error("شما دسترسی ادمین ندارید");
      }
    } catch (e) {
      toast.error("ورود ناموفق: " + (e.response?.data?.detail || "خطا در برقراری ارتباط"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    doLogin();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      
      {/* Unified Header */}
      <MainHeader 
        theme={theme}
        toggleTheme={toggleTheme}
        customActions={
          <button onClick={() => navigate('/')} className="btn btn-text" style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: 16, height: 16 }}>{Icons.home}</span>
            <span>صفحه اصلی</span>
          </button>
        }
      />

      {/* Compact Login Form */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="card fade-in" style={{ maxWidth: '340px', width: '100%', padding: '1.25rem' }}>
          
          {/* Compact Header */}
          <div className="card-header" style={{ marginBottom: '1rem' }}>
            <div style={{ 
              width: '50px', 
              height: '50px', 
              background: 'linear-gradient(135deg, var(--primary-color), var(--primary-hover))',
              borderRadius: '12px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              margin: '0 auto 0.75rem auto',
              color: 'white'
            }}>
              <span style={{ width: 26, height: 26 }}>{Icons.shield}</span>
            </div>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>ورود به پنل مدیریت</h2>
            <p className="subtitle" style={{ fontSize: '0.8rem', marginBottom: 0 }}>اطلاعات ورود خود را وارد کنید</p>
          </div>
          
          {loading ? (
            <PageLoader label="در حال ورود" compact />
          ) : (
            <form className="form-group" onSubmit={handleSubmit} style={{ gap: '0.75rem' }}>
              {/* Username */}
              <div style={{ position: 'relative' }}>
                <input 
                  className="input-field"
                  style={{ padding: '10px 40px 10px 12px', fontSize: '0.9rem' }}
                  placeholder="نام کاربری" 
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  spellCheck={false}
                  value={login.username}
                  onChange={e => setLogin({...login, username: e.target.value})}
                />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, color: 'var(--text-secondary)' }}>{Icons.user}</span>
              </div>
              
              {/* Password */}
              <div style={{ position: 'relative' }}>
                <input 
                  className="input-field"
                  style={{ padding: '10px 40px 10px 12px', fontSize: '0.9rem' }}
                  placeholder="رمز عبور" 
                  type="password" 
                  value={login.password}
                  onChange={e => setLogin({...login, password: e.target.value})}
                />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, color: 'var(--text-secondary)' }}>{Icons.lock}</span>
              </div>
              
              {/* Login Button */}
              <button 
                type="submit"
                className="btn btn-primary"
                style={{ padding: '10px', fontSize: '0.9rem', marginTop: '0.25rem' }}
              >
                <span style={{ width: 18, height: 18 }}>{Icons.login}</span>
                <span>ورود به سیستم</span>
              </button>
            </form>
          )}
        </div>
      </main>
      
      {/* Compact Footer */}
      <footer style={{ 
        textAlign: 'center', 
        padding: '0.75rem', 
        color: 'var(--text-secondary)', 
        fontSize: '0.75rem',
        borderTop: '1px solid var(--input-border)'
      }}>
        <p>© {new Date().getFullYear()} VU Team</p>
      </footer>
    </div>
  );
};

export default AdminLogin;
