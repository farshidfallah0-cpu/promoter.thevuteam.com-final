import PageLoader from '../../../components/PageLoader';
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import './inventory.css';
import { EventCalendarBar } from '../../components/EventCalendarBar';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const STATUS = {
  pending:  { label: 'در حال ارسال',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳' },
  received: { label: 'تحویل گرفته شده', color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: '✅' },
  returned: { label: 'عودت داده شده',   color: '#6b7280', bg: 'rgba(107,114,128,0.12)', icon: '🔄' },
  lost:     { label: 'مفقود شده',       color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: '❌' },
};

const EMPTY_FORM = { name: '', description: '', promoter_id: '', status: 'pending', archive_item_id: '' };

export const InventoryTab = ({ token, users, eventId, selectedEvent }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [newItem, setNewItem] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPromoter, setFilterPromoter] = useState('all');
  const [search, setSearch] = useState('');
  
  const [globalEquipment, setGlobalEquipment] = useState([]);
  const [isFromArchive, setIsFromArchive] = useState(true);

  const promoters = useMemo(() => users.filter(u => !u.is_admin), [users]);

  const fetchInventory = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/inventory${eventId ? `?event_id=${eventId}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(res.data);
    } catch (error) {
      toast.error('خطا در دریافت لیست انبار');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
    
    // Fetch global equipment available
    const fetchGlobalEquipment = async () => {
      try {
        const res = await axios.get(`${API_URL}/admin/equipment`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setGlobalEquipment(res.data);
      } catch (error) {}
    };
    fetchGlobalEquipment();
  }, [token, eventId]);

  const handleCreateItem = async (e) => {
    e.preventDefault();
    if (!newItem.name.trim()) return toast.warning('نام وسیله الزامی است');
    setSaving(true);
    
    try {
      if (editId) {
        await axios.put(`${API_URL}/admin/inventory/${editId}`, 
          {
            name: newItem.name,
            description: newItem.description || null,
            promoter_id: newItem.promoter_id ? parseInt(newItem.promoter_id) : null,
            status: newItem.status
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('وسیله با موفقیت ویرایش شد');
      } else {
        await axios.post(`${API_URL}/admin/inventory`, 
          {
            name: newItem.name,
            description: newItem.description || null,
            promoter_id: newItem.promoter_id ? parseInt(newItem.promoter_id) : null,
            status: newItem.status,
            event_id: eventId,
            archive_item_id: newItem.archive_item_id ? parseInt(newItem.archive_item_id) : null
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('وسیله با موفقیت اضافه شد');
      }
      setShowModal(false);
      setNewItem(EMPTY_FORM);
      setEditId(null);
      fetchInventory();
      
      // Refresh global equipment to sync latest status
      try {
        const res = await axios.get(`${API_URL}/admin/equipment`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setGlobalEquipment(res.data);
      } catch (e) {}
    } catch (error) {
      toast.error(editId ? 'خطا در ویرایش وسیله' : 'خطا در ذخیره وسیله');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item) => {
    setNewItem({
      name: item.name,
      description: item.description || '',
      promoter_id: item.promoter_id || '',
      status: item.status
    });
    setEditId(item.id);
    setShowModal(true);
  };

  const handleDeleteItem = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('آیا از حذف این وسیله مطمئن هستید؟')) return;
    try {
      await axios.delete(`${API_URL}/admin/inventory/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(t => t.filter(x => x.id !== id));
      toast.success('وسیله حذف شد');
    } catch (error) {
      toast.error('خطا در حذف وسیله');
    }
  };

  const updateStatus = async (id, newStatus, e) => {
    if (e) e.stopPropagation();
    try {
      await axios.put(`${API_URL}/admin/inventory/${id}`, 
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setItems(t => t.map(x => x.id === id ? { ...x, status: newStatus } : x));
      toast.success('وضعیت بروزرسانی شد');
    } catch (error) {
      toast.error('خطا در تغییر وضعیت');
    }
  };

  const filtered = useMemo(() => items.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPromoter !== 'all' && String(t.promoter_id) !== filterPromoter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [items, filterStatus, filterPromoter, search]);

  const stats = useMemo(() => ({
    total: items.length,
    pending: items.filter(t => t.status === 'pending').length,
    received: items.filter(t => t.status === 'received').length,
    returned: items.filter(t => t.status === 'returned').length,
    lost: items.filter(t => t.status === 'lost').length,
  }), [items]);

  const getAssigneeName = (id) => {
    if (!id) return 'در انبار موجود است';
    const u = users.find(p => String(p.id) === String(id));
    return u ? (u.full_name || u.username) : 'نامشخص';
  };

  if (loading) return (
    <PageLoader label="در حال بارگذاری انبار" />
  );

  return (
    <div className="inventory-container">

      {/* ── EXECUTIVE CALENDAR BAR ── */}
      <EventCalendarBar selectedEvent={selectedEvent} />

      {/* ── HEADER ── */}
      <div className="inventory-header">
        <div className="inventory-stats-row">
          {[
            { key: 'all',      label: 'کل',              val: stats.total,    accent: '#6366f1' },
            { key: 'pending',  label: 'در حال ارسال',    val: stats.pending,  accent: '#f59e0b' },
            { key: 'received', label: 'تحویل گرفته شده', val: stats.received, accent: '#10b981' },
            { key: 'returned', label: 'عودت داده شده',   val: stats.returned, accent: '#6b7280' },
            { key: 'lost',     label: 'مفقود شده',       val: stats.lost,     accent: '#ef4444' },
          ].map(s => (
            <button 
              key={s.key} 
              className={`inventory-stat-chip ${filterStatus === s.key ? 'active' : ''}`} 
              style={{ '--chip-accent': s.accent }}
              onClick={() => setFilterStatus(filterStatus === s.key ? 'all' : s.key)}
            >
              <span className="tsc-num">{s.val}</span>
              <span className="tsc-label">{s.label}</span>
            </button>
          ))}
        </div>
        <button className="inventory-create-btn" onClick={() => { setEditId(null); setIsFromArchive(true); setNewItem(EMPTY_FORM); setShowModal(true); }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" width="16" height="16">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          افزودن وسیله
        </button>
      </div>

      {/* ── FILTERS ── */}
      <div className="inventory-filters">
        <div className="admin-search-bar inventory-search">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="15" height="15">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input placeholder="جستجو در انبار..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="inventory-filter-pills">
          {['all', 'pending', 'received', 'returned', 'lost'].map(s => (
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
          className="inventory-select"
          value={filterPromoter}
          onChange={e => setFilterPromoter(e.target.value)}
        >
          <option value="all">همه پروموترها</option>
          <option value="null">در انبار موجود است</option>
          {promoters.map(p => (
            <option key={p.id} value={p.id}>{p.full_name || p.username}</option>
          ))}
        </select>
      </div>

      {/* ── INVENTORY LIST ── */}
      {filtered.length === 0 ? (
        <div className="inventory-empty">
          <div className="inventory-empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" width="56" height="56">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <h3>وسیله‌ای یافت نشد</h3>
          <p>برای شروع، اولین وسیله را به انبار اضافه کنید</p>
          <button className="inventory-create-btn" onClick={() => { setEditId(null); setIsFromArchive(true); setNewItem(EMPTY_FORM); setShowModal(true); }}>+ افزودن وسیله</button>
        </div>
      ) : (
        <div className="inventory-list">
          {filtered.map(item => {
            const s = STATUS[item.status] || STATUS.pending;
            return (
              <div
                key={item.id}
                className={`inventory-card ${item.status === 'returned' ? 'done' : ''}`}
                style={{ '--p-bg': s.bg }}
                onClick={() => openEdit(item)}
              >
                {/* Top: icon + title + status */}
                <div className="inventory-card-top">
                  <div className="inventory-card-icon">
                    {s.icon}
                  </div>
                  <div className="inventory-card-title-block">
                    <h3 className="inventory-title">
                      {item.name}
                      {item.item_code && <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', color: '#a1a1aa', fontFamily: 'monospace' }}>{item.item_code}</span>}
                    </h3>
                  </div>
                  <span
                    className="inventory-status-badge"
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
                <div className="inventory-card-divider" />

                {/* Info rows */}
                <div className="inventory-info-rows">
                  <div className="inventory-info-row">
                    <span className="inventory-info-icon">👤</span>
                    <span className="inventory-info-label">پروموتر:</span>
                    <span className="inventory-info-val">{getAssigneeName(item.promoter_id)}</span>
                  </div>
                  {item.description && (
                    <div className="inventory-info-row">
                      <span className="inventory-info-icon">📝</span>
                      <span className="inventory-info-label">توضیحات:</span>
                      <span className="inventory-info-val">{item.description}</span>
                    </div>
                  )}
                  <div className="inventory-info-row">
                    <span className="inventory-info-icon">📅</span>
                    <span className="inventory-info-label">ثبت:</span>
                    <span className="inventory-info-val">
                      {item.assigned_at ? new Date(item.assigned_at).toLocaleDateString('fa-IR') : '—'}
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div className="inventory-card-footer" onClick={e => e.stopPropagation()}>
                  <select 
                    className="inventory-card-select" 
                    value={item.status} 
                    onChange={(e) => updateStatus(item.id, e.target.value, e)}
                  >
                    <option value="pending">در حال ارسال</option>
                    <option value="received">تحویل گرفته شده</option>
                    <option value="returned">عودت داده شده</option>
                    <option value="lost">مفقود شده</option>
                  </select>
                  <div className="inventory-card-actions">
                    <button className="inventory-action-btn delete" onClick={(e) => handleDeleteItem(item.id, e)} title="حذف">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="16" height="16">
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

      {/* Add Modal */}
      {showModal && (
        <div className="inventory-modal-overlay" onClick={e => { if(e.target === e.currentTarget) setShowModal(false); }}>
          <div className="inventory-modal">
            <div className="inventory-modal-header">
              <h3>{editId ? 'ویرایش اطلاعات وسیله' : 'افزودن وسیله از آرشیو'}</h3>
              <button className="modal-icon-btn" onClick={() => setShowModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleCreateItem} className="inventory-form">
              {!editId ? (
                <div className="tf-group">
                  <label>انتخاب از آرشیو تجهیزات (موجود در انبار)</label>
                  <select 
                    className="admin-input"
                    value={newItem.archive_item_id || ''}
                    onChange={e => {
                      const id = e.target.value;
                      if (!id) {
                        setNewItem({...newItem, archive_item_id: '', name: '', description: ''});
                        return;
                      }
                      const eq = globalEquipment.find(x => x.id == id);
                      if (eq) {
                        setNewItem({...newItem, archive_item_id: eq.id, name: eq.name, description: eq.description || ''});
                      }
                    }}
                    required
                  >
                    <option value="">-- یک مورد انتخاب کنید --</option>
                    {globalEquipment.map(eq => (
                      <option 
                        key={eq.id} 
                        value={eq.id} 
                        disabled={eq.status !== 'in_stock'}
                      >
                        {eq.name} {eq.item_code ? `(${eq.item_code})` : ''}
                        {eq.status === 'in_use' ? ' ❌ (در حال استفاده)' : ''}
                        {eq.status === 'in_office' ? ' ❌ (در دفتر)' : ''}
                        {eq.status === 'needs_repair' ? ' ❌ (نیاز به تعمیر)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="tf-group">
                  <label>نام وسیله</label>
                  <input 
                    type="text" 
                    className="admin-input"
                    value={newItem.name} 
                    onChange={e => setNewItem({...newItem, name: e.target.value})}
                    required 
                    disabled
                  />
                </div>
              )}

              <div className="tf-group">
                <label>توضیحات تکمیلی</label>
                <textarea 
                  className="admin-input tf-textarea"
                  value={newItem.description} 
                  onChange={e => setNewItem({...newItem, description: e.target.value})}
                  placeholder="رنگ، سریال، وضعیت ظاهری..."
                  rows={3}
                />
              </div>

              <div className="tf-row">
                <div className="tf-group">
                  <label>پروموتر تحویل‌گیرنده</label>
                  <select 
                    className="admin-input"
                    value={newItem.promoter_id} 
                    onChange={e => setNewItem({...newItem, promoter_id: e.target.value})}
                  >
                    <option value="">— در انبار موجود است —</option>
                    {promoters.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                    ))}
                  </select>
                </div>

                <div className="tf-group">
                  <label>وضعیت فعلی</label>
                  <select 
                    className="admin-input"
                    value={newItem.status} 
                    onChange={e => setNewItem({...newItem, status: e.target.value})}
                  >
                    <option value="pending">در حال ارسال</option>
                    <option value="received">تحویل داده شده</option>
                  </select>
                </div>
              </div>

              <div className="tf-actions">
                <button type="submit" className="admin-btn-primary" disabled={saving}>
                  {saving ? 'در حال ذخیره...' : (editId ? '✓ ذخیره تغییرات' : '+ افزودن وسیله')}
                </button>
                <button type="button" className="admin-btn-ghost" onClick={() => setShowModal(false)}>
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

