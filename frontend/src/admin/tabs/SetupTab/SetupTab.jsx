import PageLoader from '../../../components/PageLoader';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './SetupTab.css';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const SetupTab = ({ token, eventId }) => {
  const [submissions, setSubmissions] = useState([]);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!eventId) return;
    
    setLoading(true);
    axios.all([
      axios.get(`${API_URL}/admin/events/${eventId}/setup-submissions`, { headers: { Authorization: `Bearer ${token}` } }),
      axios.get(`${API_URL}/admin/events/${eventId}`, { headers: { Authorization: `Bearer ${token}` } })
    ])
      .then(axios.spread((subsRes, eventRes) => {
        setSubmissions(subsRes.data || []);
        setEvent(eventRes.data);
        setError(null);
      }))
      .catch(err => {
        console.error("Error fetching setup submissions:", err);
        setError("خطا در دریافت گزارش‌های ست‌آپ");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [eventId, token]);

  if (!eventId) {
    return <div className="setup-empty-state" style={{marginTop: '20px'}}>لطفاً ابتدا یک رویداد را انتخاب کنید.</div>;
  }

  if (loading) return <PageLoader />;

  const preSubmissions = submissions.filter(s => s.phase === 'pre');
  const postSubmissions = submissions.filter(s => s.phase === 'post');

  // Create a mapping of field ID to field Label
  const fieldLabelMap = {};
  if (event) {
    [...(event.setup_pre_fields || []), ...(event.setup_post_fields || [])].forEach(f => {
      fieldLabelMap[f.id] = f.label;
    });
  }

  const renderSubmissionCard = (sub) => {
    return (
      <div key={sub.id} className="setup-card">
        <div className="setup-card-header">
          <strong className="setup-card-promoter">توسط: {sub.promoter_name}</strong>
          <span className="setup-card-time">{new Date(sub.submitted_at).toLocaleString('fa-IR')}</span>
        </div>
        <div className="setup-card-body">
          {Object.entries(sub.data || {}).map(([key, value]) => (
            <div key={key} className="setup-field-item">
              <span className="setup-field-label">{fieldLabelMap[key] || key}</span>
              <span className="setup-field-value">
                {typeof value === 'boolean' ? (
                  value ? <span className="setup-badge-success">✅ تایید شد</span> : <span className="setup-badge-error">❌ تایید نشد</span>
                ) : value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="setup-tab-container">
      <div className="setup-tab-header">
        <h3 className="setup-tab-title">گزارش‌های ست‌آپ تیم</h3>
      </div>
      
      {error && <div className="setup-badge-error" style={{marginBottom: '15px', width: 'fit-content'}}>{error}</div>}
      
      <div className="setup-columns">
        <div className="setup-column">
          <div className="setup-column-header pre">قبل از ایونت (Pre)</div>
          <div className="setup-cards-list">
            {preSubmissions.length === 0 ? <p className="setup-empty-state">گزارشی ثبت نشده است</p> : preSubmissions.map(renderSubmissionCard)}
          </div>
        </div>
        
        <div className="setup-column">
          <div className="setup-column-header post">بعد از ایونت (Post)</div>
          <div className="setup-cards-list">
            {postSubmissions.length === 0 ? <p className="setup-empty-state">گزارشی ثبت نشده است</p> : postSubmissions.map(renderSubmissionCard)}
          </div>
        </div>
      </div>
    </div>
  );
};
