import React, { useState, useEffect, useRef, useCallback } from 'react';
import './chat.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function Avatar({ name, size = 36 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'];
  const color = colors[(name || '').charCodeAt(0) % colors.length];
  return (
    <div className="chat-avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}

function formatLastSeen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'همین الان';
  if (diff < 3600) return `${Math.floor(diff / 60)} دقیقه پیش`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ساعت پیش`;
  return d.toLocaleDateString('fa-IR');
}

export function ChatTab({ token, users, eventId }) {
  const [promoters, setPromoters] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchPromoters = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/chat/promoters`, { headers });
      if (res.ok) setPromoters(await res.json());
    } catch {}
  }, [token]);

  const fetchMessages = useCallback(async (promoterId) => {
    try {
      const res = await fetch(`${API_URL}/chat/messages/${promoterId}`, { headers });
      if (res.ok) {
        setMessages(await res.json());
        fetchPromoters();
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchPromoters();
    const interval = setInterval(fetchPromoters, 10000);
    return () => clearInterval(interval);
  }, [fetchPromoters]);

  useEffect(() => {
    if (!selected) return;
    fetchMessages(selected.id);
    pollRef.current = setInterval(() => fetchMessages(selected.id), 4000);
    return () => clearInterval(pollRef.current);
  }, [selected?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !selected) return;
    const text = input.trim();
    setInput('');
    try {
      const res = await fetch(`${API_URL}/chat/send`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_id: selected.id, message: text, event_id: eventId })
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => [...prev, msg]);
        fetchPromoters();
      }
    } catch {}
  };

  const filtered = promoters.filter(p =>
    !search || (p.full_name || p.username).includes(search)
  );

  const totalUnread = promoters.reduce((s, p) => s + (p.unread_count || 0), 0);

  return (
    <div className="chat-root">
      {/* Sidebar */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <span className="chat-sidebar-title">
            پیام‌ها
            {totalUnread > 0 && <span className="chat-unread-badge">{totalUnread}</span>}
          </span>
          <div className="chat-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              placeholder="جستجو..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="chat-search-input"
            />
          </div>
        </div>
        <div className="chat-list">
          {filtered.length === 0 && (
            <div className="chat-empty-list">هیچ پروموتری یافت نشد</div>
          )}
          {filtered.map(p => (
            <button
              key={p.id}
              className={`chat-list-item ${selected?.id === p.id ? 'active' : ''}`}
              onClick={() => setSelected(p)}
            >
              <div className="chat-list-avatar-wrap">
                <Avatar name={p.full_name || p.username} size={42} />
                {p.is_online && <span className="chat-online-dot" />}
              </div>
              <div className="chat-list-info">
                <div className="chat-list-name-row">
                  <span className="chat-list-name">{p.full_name || p.username}</span>
                  {p.last_message_at && (
                    <span className="chat-list-time">{formatTime(p.last_message_at)}</span>
                  )}
                </div>
                <div className="chat-list-preview-row">
                  <span className="chat-list-preview">
                    {p.last_message_mine && <span className="chat-sent-tick">✓ </span>}
                    {p.last_message || <span className="chat-no-msg">شروع مکالمه...</span>}
                  </span>
                  {p.unread_count > 0 && (
                    <span className="chat-unread-count">{p.unread_count}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="chat-main">
        {!selected ? (
          <div className="chat-no-select">
            <div className="chat-no-select-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </div>
            <p>یک پروموتر را انتخاب کنید</p>
            <span>برای شروع مکالمه از لیست سمت راست انتخاب کنید</span>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="chat-header">
              <div className="chat-header-info">
                <div className="chat-header-avatar-wrap">
                  <Avatar name={selected.full_name || selected.username} size={38} />
                  {selected.is_online && <span className="chat-online-dot" />}
                </div>
                <div>
                  <div className="chat-header-name">{selected.full_name || selected.username}</div>
                  <div className="chat-header-status">
                    {selected.is_online
                      ? <span className="chat-status-online">آنلاین</span>
                      : <span className="chat-status-offline">{selected.team_name || 'آفلاین'}</span>
                    }
                  </div>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="chat-messages">
              {messages.length === 0 && (
                <div className="chat-messages-empty">
                  <span>شروع مکالمه با {selected.full_name || selected.username}</span>
                </div>
              )}
              {messages.map((msg, i) => {
                const isMine = msg.sender_id !== selected.id;
                const prevMsg = messages[i - 1];
                const showDate = !prevMsg || new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();
                return (
                  <React.Fragment key={msg.id}>
                    {showDate && (
                      <div className="chat-date-divider">
                        <span>{new Date(msg.created_at).toLocaleDateString('fa-IR')}</span>
                      </div>
                    )}
                    <div className={`chat-bubble-wrap ${isMine ? 'mine' : 'theirs'}`}>
                      <div className={`chat-bubble ${isMine ? 'mine' : 'theirs'}`}>
                        <span className="chat-bubble-text">{msg.message}</span>
                        <span className="chat-bubble-meta">
                          {formatTime(msg.created_at)}
                          {isMine && (
                            <span className={`chat-tick ${msg.is_read ? 'read' : ''}`}>
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

            {/* Input */}
            <div className="chat-input-bar">
              <input
                className="chat-input"
                placeholder="پیام بنویسید..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                dir="rtl"
              />
              <button
                className={`chat-send-btn ${input.trim() ? 'active' : ''}`}
                onClick={sendMessage}
                disabled={!input.trim()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
