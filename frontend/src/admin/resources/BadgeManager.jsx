import PageLoader from '../../components/PageLoader';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const EMPTY = { name: '', image_url: '', color: '#f6c016' };

export const BadgeManager = ({ token }) => {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const fetchBadges = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/badges`, auth);
      setBadges(res.data);
    } catch (e) {
      toast.error('خطا در دریافت آرشیو بج‌ها');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBadges(); }, [token]);

  const reset = () => { setForm(EMPTY); setEditId(null); };

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_URL}/upload/image`, fd, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      setForm(f => ({ ...f, image_url: res.data.url }));
    } catch (err) {
      toast.error('خطا در آپلود تصویر');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.warning('نام بج الزامی است');
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), image_url: form.image_url || null, color: form.color || null };
      if (editId) await axios.put(`${API_URL}/admin/badges/${editId}`, payload, auth);
      else await axios.post(`${API_URL}/admin/badges`, payload, auth);
      toast.success(editId ? 'بج ویرایش شد' : 'بج به آرشیو اضافه شد');
      reset();
      fetchBadges();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (b) => {
    if (!window.confirm(`بج «${b.name}» حذف بشه؟ از کارت همه پروموترها هم برداشته می‌شه.`)) return;
    try {
      await axios.delete(`${API_URL}/admin/badges/${b.id}`, auth);
      setBadges(prev => prev.filter(x => x.id !== b.id));
      if (editId === b.id) reset();
      toast.success('بج حذف شد');
    } catch (err) {
      toast.error('خطا در حذف');
    }
  };

  if (loading) return <PageLoader label="در حال بارگذاری بج‌ها" />;

  return (
    <div>
      <form className="rc-badge-form" onSubmit={handleSubmit}>
        <label className="rc-badge-upload" title="آپلود آیکون بج">
          {form.image_url ? <img src={form.image_url} alt="" /> : <span>{uploading ? '...' : '📷'}</span>}
          <input type="file" accept="image/*" onChange={handleImage} />
        </label>
        <input className="admin-input" style={{ flex: 1, minWidth: 160 }} value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })} placeholder="نام بج / گواهی، مثلاً: گواهی لیفتراک" />
        <input type="color" className="rc-badge-color" value={form.color || '#f6c016'} onChange={e => setForm({ ...form, color: e.target.value })} title="رنگ بج" />
        <button type="submit" className="admin-btn-primary" disabled={saving}>{editId ? '✓ ذخیره' : '+ افزودن بج'}</button>
        {editId && <button type="button" className="admin-btn-ghost" onClick={reset}>انصراف</button>}
        {form.image_url && <button type="button" className="admin-btn-ghost" onClick={() => setForm({ ...form, image_url: '' })}>حذف تصویر</button>}
      </form>

      {badges.length === 0 ? (
        <div className="res-empty"><p>هنوز بجی تعریف نشده — اولین بج را بالا بساز</p></div>
      ) : (
        <div className="rc-badge-grid">
          {badges.map(b => (
            <div key={b.id} className="rc-badge-card" style={{ '--badge-color': b.color || '#f6c016' }}>
              <div className="rc-badge-art">{b.image_url ? <img src={b.image_url} alt="" /> : <span className="rc-badge-dot big" />}</div>
              <div className="rc-badge-title" title={b.name}>{b.name}</div>
              <div className="rc-badge-actions">
                <button className="admin-btn-ghost" onClick={() => { setEditId(b.id); setForm({ name: b.name, image_url: b.image_url || '', color: b.color || '#f6c016' }); }}>ویرایش</button>
                <button className="res-icon-btn danger" title="حذف" onClick={() => handleDelete(b)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
