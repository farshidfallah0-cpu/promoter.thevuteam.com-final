import PageLoader from '../../components/PageLoader';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Camera, Building2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const ClientsManager = ({ token }) => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingLogoId, setUploadingLogoId] = useState(null);

  const fetchClients = async () => {
    try {
      const res = await axios.get(`${API_URL}/clients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClients(res.data);
    } catch (e) {
      toast.error('خطا در دریافت لیست کلاینت‌ها');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClients(); }, [token]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await axios.post(`${API_URL}/clients`, { name }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNewName('');
      toast.success('کلاینت اضافه شد');
      fetchClients();
    } catch (e2) {
      toast.error('خطا در افزودن کلاینت');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`مطمئنی می‌خوای «${c.name}» رو حذف کنی؟`)) return;
    try {
      await axios.delete(`${API_URL}/clients/${c.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClients(prev => prev.filter(x => x.id !== c.id));
      toast.success('کلاینت حذف شد');
    } catch (e) {
      toast.error('خطا در حذف کلاینت');
    }
  };

  const handleLogoUpload = async (c, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingLogoId(c.id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await axios.post(`${API_URL}/upload/image`, fd, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      const { data } = await axios.put(`${API_URL}/clients/${c.id}`, {
        logo_url: uploadRes.data.url
      }, { headers: { Authorization: `Bearer ${token}` } });
      setClients(prev => prev.map(x => (x.id === c.id ? data : x)));
      toast.success('لوگوی کلاینت به‌روزرسانی شد');
    } catch (err) {
      toast.error('خطا در آپلود لوگو');
    } finally {
      setUploadingLogoId(null);
    }
  };

  if (loading) return (
    <PageLoader label="در حال بارگذاری کلاینت‌ها" />
  );

  return (
    <div>
      <form className="res-inline-add" onSubmit={handleAdd}>
        <input
          className="admin-input"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="نام کلاینت جدید..."
        />
        <button className="res-create-btn" type="submit" disabled={saving}>+ کلاینت جدید</button>
      </form>

      {clients.length === 0 ? (
        <div className="res-empty">
          <p>هنوز کلاینتی ثبت نشده — اولین کلاینت رو اضافه کن</p>
        </div>
      ) : (
        <div className="client-grid">
          {clients.map(c => (
            <div key={c.id} className="client-card">
              <button className="res-icon-btn danger client-card-delete" title="حذف" onClick={() => handleDelete(c)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>

              <div className="client-card-logo-wrap">
                <div className="client-card-logo">
                  {c.logo_url ? <img src={c.logo_url} alt="" /> : <Building2 size={22} />}
                </div>
                <label className="client-card-logo-upload" title="آپلود لوگو">
                  {uploadingLogoId === c.id ? (
                    <span className="pc-avatar-spinner" />
                  ) : (
                    <Camera size={11} strokeWidth={2.5} />
                  )}
                  <input type="file" accept="image/*" onChange={e => handleLogoUpload(c, e)} />
                </label>
              </div>

              <span className="client-card-name">{c.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

