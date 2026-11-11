import PageLoader from '../../../components/PageLoader';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import ClientOwnerPicker from '../../resources/ClientOwnerPicker';
import './equipmentArchive.css';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const STATUS_MAP = {
  in_stock: { label: 'در انبار', color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: '📦', dot: '#10b981' },
  in_use: { label: 'در حال استفاده', color: '#6366f1', bg: 'rgba(99,102,241,0.12)', icon: '⚡', dot: '#6366f1' },
  in_office: { label: 'در دفتر', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', icon: '🏢', dot: '#38bdf8' },
  needs_repair: { label: 'نیاز به تعمیر', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '🔧', dot: '#f59e0b' },
};
const STATUS_KEYS = Object.keys(STATUS_MAP);

const EMPTY_FORM = {
  name: '',
  description: '',
  item_code: '',
  status: 'in_stock',
  owner_type: 'vu',
  client_id: null,
  client_name: null,
  quantity: 1,
};


export const EquipmentArchive = ({ token }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');
  const [search, setSearch] = useState('');

  // ── fetch ──────────────────────────────────────────────
  const fetchEquipment = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/equipment`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(res.data);
    } catch (e) {
      toast.error('خطا در دریافت لیست تجهیزات');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchEquipment(); }, [fetchEquipment]);

  // ── computed ────────────────────────────────────────────
  const getCounts = useCallback((item) => {
    const counts = { ...(item.status_counts || {}) };
    STATUS_KEYS.forEach(k => { if (!counts[k]) counts[k] = 0; });
    return counts;
  }, []);

  const filtered = useMemo(() => items.filter(it => {
    if (filterStatus !== 'all' && (getCounts(it)[filterStatus] || 0) <= 0) return false;
    if (filterOwner === 'vu' && it.owner_type !== 'vu') return false;
    if (filterOwner === 'client' && it.owner_type !== 'client') return false;
    if (search) {
      const q = search.toLowerCase();
      if (!it.name.toLowerCase().includes(q) && !(it.item_code || '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [items, filterStatus, filterOwner, search, getCounts]);

  const stats = useMemo(() => {
    const base = { total: 0, in_stock: 0, in_use: 0, in_office: 0, needs_repair: 0 };
    items.forEach(it => {
      const counts = getCounts(it);
      base.total += it.quantity || 1;
      STATUS_KEYS.forEach(k => { base[k] += counts[k] || 0; });
    });
    return base;
  }, [items, getCounts]);


  // ── modal helpers ───────────────────────────────────────
  const openNew = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditId(item.id);
    setForm({
      name: item.name,
      description: item.description || '',
      item_code: item.item_code || '',
      status: item.status,
      owner_type: item.owner_type || 'vu',
      client_id: item.client_id || null,
      client_name: item.client_name || null,
      quantity: item.quantity || 1,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setForm(EMPTY_FORM);
    setEditId(null);
  };

  // ── CRUD ────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.warning('نام تجهیز الزامی است');
    if (form.owner_type === 'client' && !form.client_id) return toast.warning('لطفاً یک کلاینت انتخاب کنید');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        item_code: form.item_code.trim() || null,
        owner_type: form.owner_type,
        client_id: form.owner_type === 'client' ? form.client_id : null,
        client_name: form.owner_type === 'client' ? form.client_name : null,
        quantity: Math.max(1, Number(form.quantity) || 1),
      };
      if (!editId) payload.status = form.status;
      if (editId) {
        await axios.put(`${API_URL}/admin/equipment/${editId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('تجهیز با موفقیت ویرایش شد');
      } else {
        const res = await axios.post(`${API_URL}/admin/equipment`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success(`تجهیز ثبت شد — کد: ${res.data.item_code}`);
      }
      closeModal();
      fetchEquipment();
    } catch (err) {
      toast.error(editId ? 'خطا در ویرایش' : 'خطا در ثبت تجهیز');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('آیا از حذف این تجهیز مطمئنید؟')) return;
    try {
      await axios.delete(`${API_URL}/admin/equipment/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(p => p.filter(x => x.id !== id));
      toast.success('تجهیز حذف شد');
    } catch {
      toast.error('خطا در حذف تجهیز');
    }
  };

  const moveUnits = async (item, fromStatus, toStatus, e) => {
    e?.stopPropagation();
    const counts = getCounts(item);
    if ((counts[fromStatus] || 0) < 1) return;
    try {
      const res = await axios.put(`${API_URL}/admin/equipment/${item.id}/move`, {
        from_status: fromStatus,
        to_status: toStatus,
        count: 1,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const newCounts = res.data.status_counts;
      const dominant = Object.keys(newCounts).reduce((a, b) => newCounts[a] >= newCounts[b] ? a : b);
      setItems(p => p.map(x => x.id === item.id ? { ...x, status_counts: newCounts, status: dominant } : x));
      toast.success(`۱ عدد به «${STATUS_MAP[toStatus].label}» منتقل شد`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'خطا در جابجایی وضعیت');
    }
  };

  // ── render ──────────────────────────────────────────────
  if (loading) return (
    <PageLoader label="در حال بارگذاری تجهیزات" />
  );

  return (
    <div className="ea-container">

      {/* ── STAT CHIPS ── */}
      <div className="ea-stats-row">
        {[
          { key: 'all', label: 'کل تجهیزات', val: stats.total, accent: '#6366f1', icon: '🗂️' },
          { key: 'in_stock', label: 'در انبار', val: stats.in_stock, accent: '#10b981', icon: '📦' },
          { key: 'in_use', label: 'در حال استفاده', val: stats.in_use, accent: '#6366f1', icon: '⚡' },
          { key: 'in_office', label: 'در دفتر', val: stats.in_office, accent: '#38bdf8', icon: '🏢' },
          { key: 'needs_repair', label: 'نیاز به تعمیر', val: stats.needs_repair, accent: '#f59e0b', icon: '🔧' },
        ].map(s => (
          <button
            key={s.key}
            className={`ea-stat-chip ${filterStatus === s.key ? 'active' : ''}`}
            style={{ '--chip-accent': s.accent }}
            onClick={() => setFilterStatus(filterStatus === s.key ? 'all' : s.key)}
          >
            <span className="ea-stat-icon">{s.icon}</span>
            <span className="ea-stat-num">{s.val}</span>
            <span className="ea-stat-label">{s.label}</span>
          </button>
        ))}

        <button className="ea-new-btn" onClick={openNew}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          تجهیز جدید
        </button>
      </div>

      {/* ── FILTERS ── */}
      <div className="ea-filters">
        <div className="ea-search-bar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            placeholder="جستجو بر اساس نام یا کد تجهیز..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="ea-search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className="ea-filter-pills">
          {['all', 'in_stock', 'in_use', 'in_office', 'needs_repair'].map(s => (
            <button
              key={s}
              className={`ea-pill ${filterStatus === s ? 'active' : ''}`}
              onClick={() => setFilterStatus(s)}
            >
              {s === 'all' ? 'همه وضعیت‌ها' : STATUS_MAP[s]?.label}
            </button>
          ))}
        </div>

        <div className="ea-filter-pills">
          {[
            { key: 'all', label: 'همه مالکان' },
            { key: 'vu', label: 'VU' },
            { key: 'client', label: 'کلاینت‌ها' },
          ].map(o => (
            <button
              key={o.key}
              className={`ea-pill secondary ${filterOwner === o.key ? 'active' : ''}`}
              onClick={() => setFilterOwner(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CARDS GRID ── */}
      {filtered.length === 0 ? (
        <div className="ea-empty">
          <div className="ea-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
              <line x1="12" y1="12" x2="12" y2="16" />
              <line x1="10" y1="14" x2="14" y2="14" />
            </svg>
          </div>
          <h3>{search || filterStatus !== 'all' || filterOwner !== 'all' ? 'نتیجه‌ای یافت نشد' : 'هنوز تجهیزی ثبت نشده'}</h3>
          <p>{search || filterStatus !== 'all' || filterOwner !== 'all' ? 'فیلتر یا جستجو را تغییر دهید' : 'برای شروع، اولین تجهیز را اضافه کنید'}</p>
          {!search && filterStatus === 'all' && filterOwner === 'all' && (
            <button className="ea-new-btn" onClick={openNew}>+ افزودن تجهیز</button>
          )}
        </div>
      ) : (
        <div className="ea-grid">
          {filtered.map(item => {
            const s = STATUS_MAP[item.status] || STATUS_MAP.in_stock;
            const isClient = item.owner_type === 'client';
            return (
              <div
                key={item.id}
                className="ea-card"
                style={{ '--card-accent': s.color, '--card-bg': s.bg }}
                onClick={() => openEdit(item)}
              >
                {/* Card glow accent bar */}
                <div className="ea-card-accent-bar" style={{ background: s.color }} />

                {/* Header */}
                <div className="ea-card-head">
                  <div className="ea-card-icon" style={{ background: s.bg, color: s.color }}>
                    {s.icon}
                  </div>
                  <div className="ea-card-title-wrap">
                    <h3 className="ea-card-title">{item.name}</h3>
                    <div className="ea-card-subline">
                      {item.item_code && (
                        <span className="ea-card-code">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10">
                            <rect x="4" y="4" width="16" height="16" rx="2" />
                            <line x1="9" y1="9" x2="15" y2="9" />
                            <line x1="9" y1="12" x2="15" y2="12" />
                            <line x1="9" y1="15" x2="12" y2="15" />
                          </svg>
                          {item.item_code}
                        </span>
                      )}
                      <span className="ea-card-qty-badge" title="تعداد کل">
                        <b>{item.quantity || 1}</b> عدد
                      </span>
                    </div>
                  </div>
                  <span
                    className="ea-status-badge"
                    style={{ background: s.bg, color: s.color, borderColor: `${s.color}40` }}
                  >
                    <span className="ea-status-dot" style={{ background: s.color }} />
                    {s.label}
                  </span>
                </div>

                {/* Divider */}
                <div className="ea-card-divider" />

                {/* Quantity breakdown + status mover */}
                <div className="ea-qty-section" onClick={e => e.stopPropagation()}>
                  <div className="ea-qty-bar">
                    {STATUS_KEYS.map(k => {
                      const c = getCounts(item)[k];
                      if (!c) return null;
                      const pct = ((c / (item.quantity || 1)) * 100).toFixed(2);
                      return (
                        <div
                          key={k}
                          className="ea-qty-bar-seg"
                          style={{ width: `${pct}%`, background: STATUS_MAP[k].color }}
                          title={`${STATUS_MAP[k].label}: ${c}`}
                        />
                      );
                    })}
                  </div>
                  <div className="ea-qty-rows">
                    {STATUS_KEYS.map(k => {
                      const counts = getCounts(item);
                      const c = counts[k];
                      const st = STATUS_MAP[k];
                      const isStock = k === 'in_stock';
                      return (
                        <div className="ea-qty-row" key={k}>
                          <span className="ea-qty-row-dot" style={{ background: st.color }} />
                          <span className="ea-qty-row-label">{st.icon} {st.label}</span>
                          <span className="ea-qty-row-count">{c}</span>
                          {!isStock && (
                            <div className="ea-qty-row-actions">
                              <button
                                type="button"
                                className="ea-qty-stepper minus"
                                disabled={c === 0}
                                title="بازگشت ۱ عدد به انبار"
                                onClick={e => moveUnits(item, k, 'in_stock', e)}
                              >−</button>
                              <button
                                type="button"
                                className="ea-qty-stepper plus"
                                disabled={(counts.in_stock || 0) === 0}
                                title={`استفاده از ۱ عدد از انبار برای «${st.label}»`}
                                onClick={e => moveUnits(item, 'in_stock', k, e)}
                              >+</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Info rows */}
                <div className="ea-card-info">
                  {/* Owner */}
                  <div className="ea-info-row">
                    <span className="ea-info-icon">
                      {isClient ? '👔' : '🏢'}
                    </span>
                    <span className="ea-info-label">مالک:</span>
                    <span className={`ea-info-val ${isClient ? 'client-tag' : 'vu-tag'}`}>
                      {isClient ? (item.client_name || 'کلاینت') : 'VU'}
                    </span>
                  </div>

                  {/* Description */}
                  {item.description && (
                    <div className="ea-info-row">
                      <span className="ea-info-icon">📝</span>
                      <span className="ea-info-label">توضیحات:</span>
                      <span className="ea-info-val ea-desc-clamp">{item.description}</span>
                    </div>
                  )}

                  {/* Date */}
                  <div className="ea-info-row">
                    <span className="ea-info-icon">🗓️</span>
                    <span className="ea-info-label">آخرین بروزرسانی:</span>
                    <span className="ea-info-val">
                      {item.updated_at
                        ? new Date(item.updated_at).toLocaleDateString('fa-IR')
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div className="ea-card-footer" onClick={e => e.stopPropagation()}>
                  <span className="ea-footer-hint">برای جابجایی واحدها از دکمه‌های بالا استفاده کنید</span>
                  <div className="ea-card-actions">
                    <button
                      className="ea-action-btn edit"
                      onClick={e => { e.stopPropagation(); openEdit(item); }}
                      title="ویرایش"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      className="ea-action-btn delete"
                      onClick={e => handleDelete(item.id, e)}
                      title="حذف"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL ── */}
      {showModal && (
        <div className="ea-modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="ea-modal">
            <div className="ea-modal-header">
              <div className="ea-modal-title-wrap">
                <div className="ea-modal-icon">
                  {editId ? '✏️' : '📦'}
                </div>
                <div>
                  <h3>{editId ? 'ویرایش تجهیز' : 'ثبت تجهیز جدید'}</h3>
                  <p>{editId ? 'اطلاعات تجهیز را ویرایش کنید' : 'اطلاعات تجهیز جدید را وارد کنید'}</p>
                </div>
              </div>
              <button className="ea-modal-close" onClick={closeModal}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="ea-form">
              {/* Name + Quantity + Code */}
              <div className="ea-form-row">
                <div className="ea-field">
                  <label>نام تجهیز <span className="ea-required">*</span></label>
                  <input
                    type="text"
                    className="ea-input"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="مثال: دوربین Sony A7III"
                    required
                  />
                </div>
                <div className="ea-field ea-field-xs">
                  <label>تعداد کل <span className="ea-required">*</span></label>
                  <input
                    type="number"
                    min={1}
                    className="ea-input"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    required
                  />
                </div>
                <div className="ea-field ea-field-sm">
                  <label>
                    کد اختصاصی
                  </label>
                  <input
                    type="text"
                    className="ea-input ea-code-input"
                    value={form.item_code}
                    onChange={e => setForm(f => ({ ...f, item_code: e.target.value }))}
                    placeholder="EQ-001"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="ea-field">
                <label>توضیحات</label>
                <textarea
                  className="ea-input ea-textarea"
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="سریال، رنگ، وضعیت ظاهری، یادداشت..."
                />
              </div>

              {/* Status (only for new items — existing units are moved via the card breakdown controls) */}
              {!editId && (
                <div className="ea-field">
                  <label>وضعیت اولیه <span className="ea-required">*</span></label>
                  <div className="ea-status-toggle-row">
                    {Object.entries(STATUS_MAP).map(([key, s]) => (
                      <button
                        key={key}
                        type="button"
                        className={`ea-status-toggle ${form.status === key ? 'active' : ''}`}
                        style={form.status === key ? { borderColor: s.color, background: s.bg, color: s.color } : {}}
                        onClick={() => setForm(f => ({ ...f, status: key }))}
                      >
                        <span>{s.icon}</span>
                        <span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {editId && (
                <p className="ea-qty-edit-hint">
                  💡 برای تغییر وضعیت واحدها (مثلاً استفاده یا بازگشت به انبار) از دکمه‌های + و − روی کارت تجهیز استفاده کنید. تغییر «تعداد کل» در بالا، واحدهای جدید را به «در انبار» اضافه می‌کند یا از آن کم می‌کند.
                </p>
              )}

              {/* Owner */}
              <div className="ea-field">
                <label>متعلق به</label>
                <ClientOwnerPicker
                  token={token}
                  ownerType={form.owner_type}
                  clientId={form.client_id}
                  clientName={form.client_name}
                  onChange={({ ownerType, clientId, clientName }) =>
                    setForm(f => ({ ...f, owner_type: ownerType, client_id: clientId, client_name: clientName }))
                  }
                />
              </div>

              {/* Actions */}
              <div className="ea-form-actions">
                <button type="submit" className="ea-btn-primary" disabled={saving}>
                  {saving
                    ? <><div className="ea-btn-spinner" />در حال ذخیره...</>
                    : (editId ? '✓ ذخیره تغییرات' : '+ ثبت تجهیز')}
                </button>
                <button type="button" className="ea-btn-ghost" onClick={closeModal}>
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
