import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import './InventoryModal.css';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const InventoryModal = ({ token, onClose }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      const res = await axios.get(`${API_URL}/inventory/my`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(res.data);
    } catch (e) {
      toast.error('خطا در دریافت لیست وسایل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [token]);

  const handleConfirmReceipt = async (id) => {
    try {
      await axios.put(`${API_URL}/inventory/${id}/status`, 
        { status: 'received' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('دریافت وسیله تایید شد');
      fetchItems();
    } catch (e) {
      toast.error('خطا در تایید دریافت');
    }
  };

  const statusMap = {
    'pending': 'در حال ارسال',
    'received': 'تحویل گرفته شده',
    'returned': 'عودت داده شده',
    'lost': 'مفقود شده'
  };

  return (
    <div className="inventory-modal-overlay" onClick={onClose}>
      <div className="inventory-modal-content" onClick={e => e.stopPropagation()}>
        <div className="inventory-modal-header">
          <h2>📦 وسایل من (انبار)</h2>
          <button className="inventory-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="inventory-modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>در حال بارگذاری...</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              هیچ وسیله‌ای به شما تحویل داده نشده است.
            </div>
          ) : (
            items.map(item => (
              <div key={item.id} className="inventory-item-card">
                <div className="inventory-item-info">
                  <span className="inventory-item-title">{item.name}</span>
                  {item.description && <span className="inventory-item-desc">{item.description}</span>}
                  <span className="inventory-item-date">
                    تاریخ ثبت: {new Date(item.assigned_at).toLocaleDateString('fa-IR')}
                  </span>
                </div>
                <div className="inventory-item-actions">
                  <span className={`inventory-status-badge inventory-status-${item.status}`}>
                    {statusMap[item.status] || item.status}
                  </span>
                  {item.status === 'pending' && (
                    <button 
                      className="btn-confirm-receipt"
                      onClick={() => handleConfirmReceipt(item.id)}
                    >
                      تایید دریافت ✓
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryModal;
