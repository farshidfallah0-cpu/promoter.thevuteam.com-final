import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import '../tabs/EquipmentArchiveTab/equipmentArchive.css';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * ClientOwnerPicker — پیکر حرفه‌ای برای انتخاب مالک تجهیز
 * Props:
 *   token: string
 *   ownerType: "vu" | "client"
 *   clientId: number | null
 *   clientName: string | null
 *   onChange: ({ownerType, clientId, clientName}) => void
 */
const ClientOwnerPicker = ({ token, ownerType = 'vu', clientId = null, clientName = null, onChange }) => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const fetchClients = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_URL}/clients`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setClients(res.data);
      } catch (e) {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchClients();
  }, [token]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectVU = () => {
    onChange({ ownerType: 'vu', clientId: null, clientName: null });
    setShowDropdown(false);
  };

  const handleSelectClient = (c) => {
    onChange({ ownerType: 'client', clientId: c.id, clientName: c.name });
    setShowDropdown(false);
    setSearch('');
  };

  return (
    <div className="cop-wrapper" ref={dropdownRef}>
      {/* Toggle Row */}
      <div className="cop-toggle-row">
        <button
          type="button"
          className={`cop-toggle-btn ${ownerType === 'vu' ? 'active' : ''}`}
          onClick={handleSelectVU}
        >
          <div className="cop-toggle-icon vu-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h18M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4" />
            </svg>
          </div>
          <span>VU (خودمان)</span>
          {ownerType === 'vu' && (
            <svg className="cop-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>

        <button
          type="button"
          className={`cop-toggle-btn ${ownerType === 'client' ? 'active' : ''}`}
          onClick={() => setShowDropdown(v => !v)}
        >
          <div className="cop-toggle-icon client-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <span>{ownerType === 'client' && clientName ? clientName : 'کلاینت...'}</span>
          <svg className={`cop-chevron ${showDropdown ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="cop-dropdown">
          <div className="cop-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="cop-search-input"
              placeholder="جستجوی کلاینت..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="cop-client-list">
            {loading ? (
              <div className="cop-loading">
                <div className="cop-spinner" />
                <span>در حال بارگذاری...</span>
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="cop-empty">کلاینتی یافت نشد</div>
            ) : (
              filteredClients.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={`cop-client-item ${clientId === c.id ? 'selected' : ''}`}
                  onClick={() => handleSelectClient(c)}
                >
                  <div className="cop-client-avatar">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="cop-client-name">{c.name}</span>
                  {clientId === c.id && (
                    <svg className="cop-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientOwnerPicker;
