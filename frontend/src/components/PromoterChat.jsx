import React, { useState, useEffect, useRef, useCallback } from 'react';
import './PromoterChat.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}

export default function PromoterChat({ token }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const [adminId, setAdminId] = useState(null);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`${API_URL}/chat/admin-id`, { headers })
      .then(res => res.ok ? res.json() : null)
      .then(data => data?.admin_id && setAdminId(data.admin_id))
      .catch(() => {});
  }, [token]);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/chat/unread-count`, { headers });
      if (res.ok) {
        const data = await res.json();
        setUnread(data.count);
      }
    } catch {}
  }, [token]);

  const fetchMessages = useCallback(async () => {
    if (!adminId) return;
    try {
      const res = await fetch(`${API_URL}/chat/messages/${adminId}`, { headers });
      if (res.ok) {
        setMessages(await res.json());
        setUnread(0);
      }
    } catch {}
  }, [token, adminId]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 10000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  useEffect(() => {
    if (!open) return;
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 4000);
    return () => clearInterval(pollRef.current);
  }, [open, adminId]);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const sendMessage = async () => {
    if (!input.trim() || !adminId) return;
    const text = input.trim();
    setInput('');
    try {
      const res = await fetch(`${API_URL}/chat/send`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_id: adminId, message: text })
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => [...prev, msg]);
      }
    } catch {}
  };

  return (
    <>
      <button
        className={`pc-float-btn ${unread > 0 ? 'has-unread' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="چت با مدیر"
      >
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 3C8.82 3 3 8.16 3 14.5c0 3.54 1.74 6.7 4.5 8.84L6 29l5.86-2.93A14.1 14.1 0 0016 26c7.18 0 13-5.16 13-11.5S23.18 3 16 3z" fill="rgba(255,255,255,0.15)" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
          <circle cx="10.5" cy="14.5" r="1.5" fill="white"/>
          <circle cx="16" cy="14.5" r="1.5" fill="white"/>
          <circle cx="21.5" cy="14.5" r="1.5" fill="white"/>
        </svg>
        {unread > 0 && <span className="pc-unread-dot">{unread}</span>}
      </button>

      {open && (
        <div className="pc-modal">
          <div className="pc-header">
            <div className="pc-header-info">
              <div className="pc-admin-avatar">
                <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="40">
                  <circle cx="20" cy="20" r="20" fill="url(#av-grad)"/>
                  <defs>
                    <linearGradient id="av-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#667eea"/>
                      <stop offset="100%" stopColor="#764ba2"/>
                    </linearGradient>
                  </defs>
                  <circle cx="20" cy="16" r="6" fill="rgba(255,255,255,0.9)"/>
                  <ellipse cx="20" cy="32" rx="10" ry="7" fill="rgba(255,255,255,0.75)"/>
                  <path d="M14 22c0 0 2-1 6-1s6 1 6 1" stroke="rgba(255,255,255,0.4)" strokeWidth="1"/>
                  <circle cx="28" cy="10" r="5" fill="#f59e0b"/>
                  <path d="M26 10l1.5 1.5L30 8" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div className="pc-header-name">کاپیتان</div>
                <div className="pc-header-sub">آنلاین</div>
              </div>
            </div>
            <button className="pc-close-btn" onClick={() => setOpen(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="pc-messages">
            {messages.length === 0 && (
              <div className="pc-empty">
                <span>سلام! چطور میتونم کمکت کنم؟</span>
              </div>
            )}
            {messages.map((msg, i) => {
              const sentByMe = msg.sender_id !== adminId;
              const prevMsg = messages[i - 1];
              const showDate = !prevMsg || new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();
              return (
                <React.Fragment key={msg.id}>
                  {showDate && (
                    <div className="pc-date-divider">
                      <span>{new Date(msg.created_at).toLocaleDateString('fa-IR')}</span>
                    </div>
                  )}
                  <div className={`pc-bubble-wrap ${sentByMe ? 'mine' : 'theirs'}`}>
                    {!sentByMe && (
                      <div className="pc-msg-avatar">
                        <svg viewBox="0 0 28 28" fill="none" width="28" height="28">
                          <circle cx="14" cy="14" r="14" fill="url(#msg-av-grad)"/>
                          <defs>
                            <linearGradient id="msg-av-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                              <stop offset="0%" stopColor="#667eea"/>
                              <stop offset="100%" stopColor="#764ba2"/>
                            </linearGradient>
                          </defs>
                          <circle cx="14" cy="11" r="4" fill="rgba(255,255,255,0.9)"/>
                          <ellipse cx="14" cy="22" rx="7" ry="5" fill="rgba(255,255,255,0.75)"/>
                        </svg>
                      </div>
                    )}
                    <div className={`pc-bubble ${sentByMe ? 'mine' : 'theirs'}`}>
                      <span className="pc-bubble-text">{msg.message}</span>
                      <span className="pc-bubble-meta">
                        {formatTime(msg.created_at)}
                        {sentByMe && (
                          <span className={`pc-tick ${msg.is_read ? 'read' : ''}`}>
                            {msg.is_read ? '✓✓' : '✓'}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="pc-input-bar">
            <input
              className="pc-input"
              placeholder="پیام بنویسید..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              dir="rtl"
            />
            <button
              className={`pc-send-btn ${input.trim() ? 'active' : ''}`}
              onClick={sendMessage}
              disabled={!input.trim()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
