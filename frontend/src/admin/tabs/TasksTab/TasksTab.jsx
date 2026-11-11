import PageLoader from '../../../components/PageLoader';
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import './tasks.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const PRIORITY = {
  low:    { label: 'پایین',   color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  normal: { label: 'معمولی', color: '#6366f1', bg: 'rgba(99,102,241,0.12)'  },
  high:   { label: 'بالا',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  urgent: { label: 'فوری',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
};

const STATUS = {
  pending:     { label: 'در انتظار',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: '⏳' },
  in_progress: { label: 'در حال انجام', color: '#6366f1', bg: 'rgba(99,102,241,0.12)', icon: '🔄' },
  completed:   { label: 'تکمیل شده',    color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: '✅' },
};

const EMPTY_FORM = { title: '', description: '', priority: 'normal', due_date: '', promoter_id: '' };

export const TasksTab = ({ token, users, eventId }) => {
  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editTask, setEditTask]     = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPromoter, setFilterPromoter] = useState('all');
  const [search, setSearch]         = useState('');
  const [detailTask, setDetailTask] = useState(null);

  const promoters = useMemo(() => users.filter(u => !u.is_admin), [users]);

  const fetchTasks = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/tasks?event_id=${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // normalize: backend returns assignee object, extract id
      setTasks(res.data.map(t => ({
        ...t,
        promoter_id: t.assignee?.id ?? t.promoter_id ?? null,
      })));
    } catch {
      toast.error('خطا در دریافت وظایف');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTasks(); }, [eventId]);

  const openCreate = () => {
    setEditTask(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (task) => {
    setEditTask(task);
    setForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      due_date: task.due_date ? task.due_date.slice(0, 10) : '',
      promoter_id: task.promoter_id || '',
    });
    setShowForm(true);
    setDetailTask(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('عنوان وظیفه الزامی است');
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        priority: form.priority,
        due_date: form.due_date || null,
        promoter_id: form.promoter_id ? Number(form.promoter_id) : null,
        event_id: eventId,
      };
      if (editTask) {
        // backend PUT /tasks/{id} only updates status/title/desc/priority for admin
        await axios.put(`${API_URL}/tasks/${editTask.id}`, {
          title: payload.title,
          description: payload.description,
          priority: payload.priority,
        }, { headers: { Authorization: `Bearer ${token}` } });
        setTasks(t => t.map(x => x.id === editTask.id ? { ...x, ...payload } : x));
        toast.success('وظیفه ویرایش شد');
      } else {
        const res = await axios.post(`${API_URL}/admin/tasks`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // refetch to get normalized data
        await fetchTasks();
        toast.success('وظیفه ایجاد شد');
      }
      setShowForm(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطا در ذخیره وظیفه');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('آیا از حذف این وظیفه مطمئن هستید؟')) return;
    try {
      await axios.delete(`${API_URL}/admin/tasks/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTasks(t => t.filter(x => x.id !== id));
      setDetailTask(null);
      toast.success('وظیفه حذف شد');
    } catch {
      toast.error('خطا در حذف وظیفه');
    }
  };

  const changeStatus = async (id, status) => {
    try {
      await axios.put(`${API_URL}/tasks/${id}`, { status }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTasks(t => t.map(x => x.id === id ? { ...x, status } : x));
      if (detailTask?.id === id) setDetailTask(d => ({ ...d, status }));
    } catch {
      toast.error('خطا در تغییر وضعیت');
    }
  };

  const filtered = useMemo(() => tasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPromoter !== 'all' && String(t.promoter_id) !== filterPromoter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [tasks, filterStatus, filterPromoter, search]);

  const stats = useMemo(() => ({
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
  }), [tasks]);

  const getAssigneeName = (id) => {
    if (!id) return '—';
    const u = promoters.find(p => p.id === id || String(p.id) === String(id));
    return u ? (u.full_name || u.username) : '—';
  };

  if (loading) return (
    <PageLoader label="در حال بارگذاری وظایف" />
  );

  return (
    <div className="tasks-container">

      {/* ── HEADER ── */}
      <div className="tasks-header">
        <div className="tasks-stats-row">
          {[
            { key: 'total',       label: 'کل',          val: stats.total,       accent: 'var(--admin-primary)' },
            { key: 'pending',     label: 'در انتظار',   val: stats.pending,     accent: '#f59e0b' },
            { key: 'in_progress', label: 'در جریان',    val: stats.in_progress, accent: '#6366f1' },
            { key: 'completed',   label: 'تکمیل شده',   val: stats.completed,   accent: '#10b981' },
          ].map(s => (
            <div key={s.key} className="tasks-stat-chip" style={{ '--chip-accent': s.accent }}>
              <span className="tsc-num">{s.val}</span>
              <span className="tsc-label">{s.label}</span>
            </div>
          ))}
        </div>
        <button className="tasks-create-btn" onClick={openCreate}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" width="16" height="16">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          وظیفه جدید
        </button>
      </div>

      {/* ── FILTERS ── */}
      <div className="tasks-filters">
        <div className="admin-search-bar tasks-search">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="15" height="15">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input placeholder="جستجو در وظایف..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="tasks-filter-pills">
          {['all', 'pending', 'in_progress', 'completed'].map(s => (
            <button
              key={s}
              className={`filter-pill ${filterStatus === s ? 'active' : ''}`}
              onClick={() => setFilterStatus(s)}
            >
              {s === 'all' ? 'همه' : STATUS[s].label}
            </button>
          ))}
        </div>

        <select
          className="tasks-select"
          value={filterPromoter}
          onChange={e => setFilterPromoter(e.target.value)}
        >
          <option value="all">همه پروموترها</option>
          {promoters.map(p => (
            <option key={p.id} value={p.id}>{p.full_name || p.username}</option>
          ))}
        </select>
      </div>

      {/* ── TASK LIST ── */}
      {filtered.length === 0 ? (
        <div className="tasks-empty">
          <div className="tasks-empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" width="56" height="56">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3>وظیفه‌ای یافت نشد</h3>
          <p>برای شروع، اولین وظیفه را ایجاد کنید</p>
          <button className="tasks-create-btn" onClick={openCreate}>+ ایجاد وظیفه</button>
        </div>
      ) : (
        <div className="tasks-list">
          {filtered.map(task => {
            const p = PRIORITY[task.priority] || PRIORITY.normal;
            const s = STATUS[task.status]   || STATUS.pending;
            const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
            return (
              <div
                key={task.id}
                className={`task-card ${task.status === 'completed' ? 'done' : ''} ${isOverdue ? 'overdue' : ''}`}
                style={{ '--p-bg': p.bg }}
                onClick={() => setDetailTask(task)}
              >
                {/* Top: icon + title + status */}
                <div className="task-card-top">
                  <div className="task-card-icon">
                    {s.icon}
                  </div>
                  <div className="task-card-title-block">
                    <h3 className="task-title">{task.title}</h3>
                    <span className="pc-username">{p.label}</span>
                  </div>
                  <span
                    className="task-status-badge"
                    style={{
                      background: s.bg,
                      color: s.color,
                      borderColor: `${s.color}40`,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0, display: 'inline-block' }} />
                    {s.label}
                  </span>
                </div>

                {/* Divider */}
                <div className="task-card-divider" />

                {/* Info rows */}
                <div className="task-info-rows">
                  {task.promoter_id && (
                    <div className="task-info-row">
                      <span className="task-info-icon">👤</span>
                      <span className="task-info-label">پروموتر:</span>
                      <span className="task-info-val">{getAssigneeName(task.promoter_id)}</span>
                    </div>
                  )}
                  <div className="task-info-row">
                    <span className="task-info-icon">🚩</span>
                    <span className="task-info-label">اولویت:</span>
                    <span className="task-info-val" style={{ color: p.color, fontWeight: 600 }}>{p.label}</span>
                  </div>
                  <div className="task-info-row">
                    <span className="task-info-icon">📅</span>
                    <span className="task-info-label">مهلت:</span>
                    <span className={`task-info-val ${isOverdue ? 'overdue-val' : ''}`}>
                      {task.due_date ? new Date(task.due_date).toLocaleDateString('fa-IR') : '—'}
                      {isOverdue && ' ⚠️'}
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div className="task-card-footer">
                  <span>مشاهده جزئیات</span>
                  <div className="task-card-footer-actions" onClick={e => e.stopPropagation()}>
                    {task.status === 'pending' && (
                      <button
                        className="task-quick-btn start"
                        title="شروع"
                        onClick={() => changeStatus(task.id, 'in_progress')}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="13" height="13">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                        </svg>
                      </button>
                    )}
                    {task.status !== 'completed' && (
                      <button
                        className="task-quick-btn complete"
                        title="تکمیل"
                        onClick={() => changeStatus(task.id, 'completed')}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" width="13" height="13">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CREATE / EDIT MODAL ── */}
      {showForm && (
        <div className="tasks-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="tasks-modal">
            <div className="tasks-modal-header">
              <h3>{editTask ? 'ویرایش وظیفه' : 'وظیفه جدید'}</h3>
              <button className="modal-icon-btn" onClick={() => setShowForm(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="tasks-form">
              <div className="tf-group">
                <label>عنوان وظیفه <span className="required-star">*</span></label>
                <input
                  className="admin-input"
                  placeholder="مثال: بازدید از فروشگاه مرکزی"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div className="tf-group">
                <label>توضیحات</label>
                <textarea
                  className="admin-input tf-textarea"
                  placeholder="جزئیات وظیفه را بنویسید..."
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="tf-row">
                <div className="tf-group">
                  <label>اولویت</label>
                  <div className="priority-selector">
                    {Object.entries(PRIORITY).map(([key, val]) => (
                      <button
                        key={key}
                        type="button"
                        className={`priority-btn ${form.priority === key ? 'active' : ''}`}
                        style={{ '--p-color': val.color, '--p-bg': val.bg }}
                        onClick={() => setForm({ ...form, priority: key })}
                      >
                        {val.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="tf-row">
                <div className="tf-group">
                  <label>تخصیص به پروموتر</label>
                  <select
                    className="admin-input"
                    value={form.promoter_id}
                    onChange={e => setForm({ ...form, promoter_id: e.target.value })}
                  >
                    <option value="">— انتخاب پروموتر —</option>
                    {promoters.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name || p.username}</option>
                    ))}
                  </select>
                </div>

                <div className="tf-group">
                  <label>مهلت انجام</label>
                  <input
                    className="admin-input"
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm({ ...form, due_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="tf-actions">
                <button type="submit" className="admin-btn-primary" disabled={saving}>
                  {saving ? 'در حال ذخیره...' : editTask ? '✓ ذخیره تغییرات' : '+ ایجاد وظیفه'}
                </button>
                <button type="button" className="admin-btn-ghost" onClick={() => setShowForm(false)}>
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DETAIL MODAL ── */}
      {detailTask && (() => {
        const task = tasks.find(t => t.id === detailTask.id) || detailTask;
        const p = PRIORITY[task.priority] || PRIORITY.normal;
        const s = STATUS[task.status]   || STATUS.pending;
        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
        return (
          <div className="tasks-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDetailTask(null); }}>
            <div className="tasks-modal detail-modal">
              <div className="tasks-modal-header">
                <div className="detail-header-left">
                  <span className="task-status-icon" style={{ fontSize: '1.4rem' }}>{s.icon}</span>
                  <h3>{task.title}</h3>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="modal-icon-btn edit" onClick={() => openEdit(task)} title="ویرایش">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="17" height="17">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                  </button>
                  <button className="modal-icon-btn" onClick={() => setDetailTask(null)}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="18" height="18">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="detail-body">
                {task.description && (
                  <p className="detail-desc">{task.description}</p>
                )}

                <div className="detail-info-grid">
                  <div className="detail-info-item">
                    <span className="modal-info-label">اولویت</span>
                    <span className="task-badge" style={{ color: p.color, background: p.bg }}>{p.label}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="modal-info-label">وضعیت</span>
                    <span className="task-badge" style={{ color: s.color, background: s.bg }}>{s.icon} {s.label}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="modal-info-label">پروموتر</span>
                    <span className="modal-info-value">{getAssigneeName(task.promoter_id)}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="modal-info-label">مهلت</span>
                    <span className={`modal-info-value ${isOverdue ? 'text-danger' : ''}`}>
                      {task.due_date ? new Date(task.due_date).toLocaleDateString('fa-IR') : '—'}
                      {isOverdue && ' ⚠️'}
                    </span>
                  </div>
                </div>

                {/* Status change buttons */}
                <div className="detail-status-row">
                  <span className="modal-info-label" style={{ marginBottom: 8, display: 'block' }}>تغییر وضعیت:</span>
                  <div className="detail-status-btns">
                    {Object.entries(STATUS).map(([key, val]) => (
                      <button
                        key={key}
                        className={`status-change-btn ${task.status === key ? 'active' : ''}`}
                        style={{ '--s-color': val.color, '--s-bg': val.bg }}
                        onClick={() => changeStatus(task.id, key)}
                      >
                        {val.icon} {val.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="detail-actions">
                  <button className="admin-btn-danger" onClick={() => handleDelete(task.id)}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="16" height="16">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    حذف وظیفه
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
