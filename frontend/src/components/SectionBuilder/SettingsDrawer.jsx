import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { X, Trash2, GripVertical, RefreshCw } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'react-toastify';
import MarkdownEditor from '../MarkdownEditor';
import { getShelfQuestions, getProductGroups, PRODUCT_STATUSES } from '../MehramSupermarketReport/mehramData';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const SettingsDrawer = ({ isOpen, onClose, section, onUpdate, onDelete, eventId }) => {
  const [formData, setFormData] = useState(section || {});
  const [roster, setRoster] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [searchRoster, setSearchRoster] = useState('');
  const checklistEndRef = useRef(null);

  const [presets, setPresets] = useState([]);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [showCreatePreset, setShowCreatePreset] = useState(false);
  const [presetTitle, setPresetTitle] = useState('');
  const [selectedPresetItems, setSelectedPresetItems] = useState([]);

  const [editingPresetId, setEditingPresetId] = useState(null);
  
  const [briefPresets, setBriefPresets] = useState([]);
  const [showBriefPresetManager, setShowBriefPresetManager] = useState(false);
  const [showCreateBriefPreset, setShowCreateBriefPreset] = useState(false);
  const [briefPresetTitle, setBriefPresetTitle] = useState('');
  const [editingBriefPresetId, setEditingBriefPresetId] = useState(null);

  useEffect(() => {
    if (formData.type === 'advanced_checklist') {
      fetch(`${API_URL}/admin/checklist-presets`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setPresets(data);
      })
      .catch(console.error);
    }
  }, [formData.type]);

  useEffect(() => {
    if (formData.type === 'brief_reader') {
      fetch(`${API_URL}/admin/brief-presets`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setBriefPresets(data);
      })
      .catch(console.error);
    }
  }, [formData.type]);

  const handleCreatePreset = async () => {
    if (!presetTitle.trim() || selectedPresetItems.length === 0) return;
    try {
      const isEdit = !!editingPresetId;
      const url = isEdit ? `${API_URL}/admin/checklist-presets/${editingPresetId}` : `${API_URL}/admin/checklist-presets`;
      const method = isEdit ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          title: presetTitle,
          items: selectedPresetItems.map(i => {
             const currentItem = formData.checklistItems?.find(it => it.id === i.id) || i;
             const { id, checked, ...rest } = currentItem;
             return rest;
          })
        })
      });
      if (res.ok) {
        const savedPreset = await res.json();
        if (isEdit) {
          setPresets(presets.map(p => p.id === editingPresetId ? savedPreset : p));
        } else {
          setPresets([savedPreset, ...presets]);
        }
        setShowCreatePreset(false);
        setPresetTitle('');
        setSelectedPresetItems([]);
        setEditingPresetId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePreset = async (id) => {
    try {
      const res = await fetch(`${API_URL}/admin/checklist-presets/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        setPresets(presets.filter(p => p.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateBriefPreset = async () => {
    if (!briefPresetTitle.trim() || !formData.briefText?.trim()) return;
    try {
      const isEdit = !!editingBriefPresetId;
      const url = isEdit ? `${API_URL}/admin/brief-presets/${editingBriefPresetId}` : `${API_URL}/admin/brief-presets`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          title: briefPresetTitle,
          text: formData.briefText
        })
      });
      if (res.ok) {
        const savedPreset = await res.json();
        if (isEdit) {
          setBriefPresets(briefPresets.map(p => p.id === editingBriefPresetId ? savedPreset : p));
        } else {
          setBriefPresets([savedPreset, ...briefPresets]);
        }
        setShowCreateBriefPreset(false);
        setBriefPresetTitle('');
        setEditingBriefPresetId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteBriefPreset = async (id) => {
    try {
      const res = await fetch(`${API_URL}/admin/brief-presets/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        setBriefPresets(briefPresets.filter(p => p.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (section) {
      setFormData(section);
    }
  }, [section?.id]);

  useEffect(() => {
    if (formData.type === 'team_directory' && roster.length === 0) {
      fetch(`${API_URL}/admin/promoter-roster`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setRoster(data);
      })
      .catch(console.error);
    }
  }, [formData.type]);

  const handleAutoFetchTeam = async () => {
    if (!eventId) {
      toast?.error?.("برای همگام‌سازی، ابتدا باید رویداد را یک بار ذخیره کنید.");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/admin/promoters?event_id=${eventId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        const roleMap = {
          'promoter': 'پروموتر',
          'supervisor': 'کاپیتان',
          'setup': 'ست‌آپ'
        };
        const autoMembers = data.map(p => ({
          id: p.id,
          name: p.full_name || p.username,
          role: roleMap[p.role] || p.role || 'پروموتر',
          phone: p.phone_number || ''
        }));
        handleChange({ teamMembers: autoMembers });
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (formData.type === 'team_directory' && eventId) {
      const hasSamples = formData.teamMembers?.some(m => 
        m.name?.includes('علی محمدی') || 
        m.name?.includes('رضا کریمی') || 
        m.name?.includes('آلیس')
      );
      if (!formData.teamMembers || formData.teamMembers.length === 0 || hasSamples) {
        handleAutoFetchTeam();
      }
    }
  }, [formData.type, eventId]);

  if (!section) return null;

  const handleChange = (updatedFields) => {
    const updated = { ...formData, ...updatedFields };
    setFormData(updated);
    onUpdate(updated);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[99998]"
          />
          <motion.div 
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-full sm:w-[380px] shadow-2xl z-[99999] flex flex-col border-r transition-colors duration-300"
            style={{
              background: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)'
            }}
            dir="rtl"
          >
            {showCreatePreset && (
              <div className="absolute inset-0 z-[60] flex flex-col rounded-l-2xl" style={{ background: 'var(--bg-secondary)' }}>
                <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-color)' }}>
                  <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>ساخت قالب جدید</h3>
                  <button onClick={() => setShowCreatePreset(false)} className="p-2 rounded-xl transition-colors hover:opacity-80" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>✕</button>
                </div>
                <div className="p-5 flex-1 overflow-y-auto space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>نام قالب</label>
                    <input 
                      type="text" 
                      value={presetTitle}
                      onChange={(e) => setPresetTitle(e.target.value)}
                      className="w-full rounded-xl px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="مثلاً: وظایف صبحگاهی..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>آیتم‌های الگو (انتخاب از لیست فعلی)</label>
                    <div className="space-y-2">
                      {(formData.checklistItems || []).map(item => (
                        <label key={item.id} className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors" style={{ borderColor: 'var(--border-color)' }}>
                          <input 
                            type="checkbox"
                            checked={selectedPresetItems.some(i => i.id === item.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPresetItems([...selectedPresetItems, item]);
                              } else {
                                setSelectedPresetItems(selectedPresetItems.filter(i => i.id !== item.id));
                              }
                            }}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-0"
                          />
                          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{item.title}</span>
                        </label>
                      ))}
                      {(!formData.checklistItems || formData.checklistItems.length === 0) && (
                        <p className="text-xs text-center p-4 text-gray-400 border border-dashed rounded-lg" style={{ borderColor: 'var(--border-color)' }}>
                          هیچ آیتمی در لیست وجود ندارد. ابتدا چند آیتم بسازید.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="p-5 border-t" style={{ borderColor: 'var(--border-color)' }}>
                  <button 
                    onClick={handleCreatePreset}
                    disabled={!presetTitle.trim() || selectedPresetItems.length === 0}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors shadow-xs"
                  >
                    ذخیره قالب
                  </button>
                </div>
              </div>
            )}

            {showPresetManager && (
              <div className="absolute inset-0 z-[60] flex flex-col rounded-l-2xl" style={{ background: 'var(--bg-secondary)' }}>
                <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-color)' }}>
                  <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>مدیریت قالب‌ها</h3>
                  <button onClick={() => setShowPresetManager(false)} className="p-2 rounded-xl transition-colors hover:opacity-80" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {presets.length === 0 ? (
                    <div className="p-6 text-center border border-dashed rounded-xl" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                      <p className="text-sm font-medium">قالبی یافت نشد</p>
                      <p className="text-xs mt-1">شما هنوز قالبی ذخیره نکرده‌اید.</p>
                    </div>
                  ) : (
                    presets.map(preset => (
                      <div key={preset.id} className="p-3 border rounded-xl shadow-2xs" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-input)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{preset.title}</h4>
                          <div className="flex gap-1">
                            <button 
                              onClick={() => {
                                setEditingPresetId(preset.id);
                                setPresetTitle(preset.title);
                                // Load preset items directly into the main editor
                                handleChange({ checklistItems: preset.items });
                                setShowPresetManager(false);
                              }}
                              className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 flex items-center justify-center transition-colors"
                              title="ویرایش قالب"
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button 
                              onClick={() => handleDeletePreset(preset.id)}
                              className="w-7 h-7 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center justify-center transition-colors"
                              title="حذف قالب"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <ul className="space-y-1.5 pl-2">
                          {preset.items.map((it, idx) => (
                            <li key={idx} className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 before:content-[''] before:w-1 before:h-1 before:bg-gray-300 before:rounded-full">
                              {it.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {showCreateBriefPreset && (
              <div className="absolute inset-0 z-[60] flex flex-col rounded-l-2xl" style={{ background: 'var(--bg-secondary)' }}>
                <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-color)' }}>
                  <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>ساخت قالب پروتکل جدید</h3>
                  <button onClick={() => setShowCreateBriefPreset(false)} className="p-2 rounded-xl transition-colors hover:opacity-80" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>✕</button>
                </div>
                <div className="p-5 flex-1 overflow-y-auto space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>نام قالب پروتکل</label>
                    <input 
                      type="text" 
                      value={briefPresetTitle}
                      onChange={(e) => setBriefPresetTitle(e.target.value)}
                      className="w-full rounded-xl px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      placeholder="مثلاً: پروتکل سمپلینگ عمومی..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>متن قالب (از فیلد بالا)</label>
                    <div className="p-4 rounded-xl border bg-gray-50 dark:bg-zinc-800 text-xs text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto" style={{ borderColor: 'var(--border-color)' }}>
                      {formData.briefText || 'متنی وارد نشده است...'}
                    </div>
                  </div>
                </div>
                <div className="p-5 border-t" style={{ borderColor: 'var(--border-color)' }}>
                  <button 
                    onClick={handleCreateBriefPreset}
                    disabled={!briefPresetTitle.trim() || !formData.briefText?.trim()}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors shadow-xs"
                  >
                    ذخیره قالب
                  </button>
                </div>
              </div>
            )}

            {showBriefPresetManager && (
              <div className="absolute inset-0 z-[60] flex flex-col rounded-l-2xl" style={{ background: 'var(--bg-secondary)' }}>
                <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-color)' }}>
                  <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>مدیریت قالب‌های پروتکل</h3>
                  <button onClick={() => setShowBriefPresetManager(false)} className="p-2 rounded-xl transition-colors hover:opacity-80" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {briefPresets.length === 0 ? (
                    <div className="p-6 text-center border border-dashed rounded-xl" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                      <p className="text-sm font-medium">قالب پروتکلی یافت نشد</p>
                      <p className="text-xs mt-1">شما هنوز قالبی ذخیره نکرده‌اید.</p>
                    </div>
                  ) : (
                    briefPresets.map(preset => (
                      <div key={preset.id} className="p-3 border rounded-xl shadow-2xs" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-input)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{preset.title}</h4>
                          <div className="flex gap-1">
                            <button 
                              onClick={() => {
                                setEditingBriefPresetId(preset.id);
                                setBriefPresetTitle(preset.title);
                                handleChange({ briefText: preset.text });
                                setShowBriefPresetManager(false);
                                setShowCreateBriefPreset(true);
                              }}
                              className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 flex items-center justify-center transition-colors"
                              title="ویرایش قالب"
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button 
                              onClick={() => handleDeleteBriefPreset(preset.id)}
                              className="w-7 h-7 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center justify-center transition-colors"
                              title="حذف قالب"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 max-h-12 overflow-hidden relative">
                          {preset.text}
                          <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-gray-50 dark:from-zinc-900 to-transparent"></div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {showPicker && (
              <div className="absolute inset-0 z-50 flex flex-col rounded-l-2xl" style={{ background: 'var(--bg-secondary)' }}>
                <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-color)' }}>
                  <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>انتخاب از آرشیو پروموترها</h3>
                  <button onClick={() => setShowPicker(false)} className="p-2 rounded-xl transition-colors hover:opacity-80" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>✕</button>
                </div>
                <div className="p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <input 
                    type="text" 
                    placeholder="جستجو (نام یا شماره)..." 
                    value={searchRoster}
                    onChange={(e) => setSearchRoster(e.target.value)}
                    className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {roster.filter(r => (r.full_name || '').includes(searchRoster) || (r.phone_number || '').includes(searchRoster)).map(r => (
                    <div key={r.id} className="p-3 border rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
                      style={{ borderColor: 'var(--border-color)', background: 'var(--bg-input)' }}
                      onClick={() => {
                        const members = formData.teamMembers || [];
                        const newMember = { 
                          id: `tm-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, 
                          name: r.full_name || 'بدون نام', 
                          role: 'پروموتر', 
                          phone: r.phone_number || '' 
                        };
                        handleChange({ teamMembers: [...members, newMember] });
                        setShowPicker(false);
                        setSearchRoster('');
                      }}
                    >
                      <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{r.full_name}</div>
                      <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{r.phone_number || 'بدون شماره'}</div>
                    </div>
                  ))}
                  {roster.length === 0 && (
                    <div className="text-center text-xs p-4" style={{ color: 'var(--text-muted)' }}>در حال دریافت اطلاعات... یا آرشیو خالی است.</div>
                  )}
                </div>
              </div>
            )}
            
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>تنظیمات بخش</h2>
              <button 
                onClick={onClose}
                className="p-2 rounded-xl transition-colors hover:opacity-80"
                style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>عنوان بخش</label>
                <input 
                  type="text" 
                  value={formData.title || ''}
                  onChange={(e) => handleChange({ title: e.target.value })}
                  className="w-full rounded-xl px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border"
                  style={{ 
                    background: 'var(--bg-input)', 
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  placeholder="مثلاً: فروش روزانه"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>توضیحات (اختیاری)</label>
                <textarea 
                  value={formData.description || ''}
                  onChange={(e) => handleChange({ description: e.target.value })}
                  className="w-full rounded-xl px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border resize-y min-h-[70px]"
                  style={{ 
                    background: 'var(--bg-input)', 
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  placeholder="متن راهنما برای پروموترها..."
                />
              </div>

              {/* ── Placeholder Setting: for text-entry fields ── */}
              {['number', 'text', 'textarea', 'custom', 'expenses', 'feedback', 'notes'].includes(formData.type) && (
                <div className="space-y-3 p-3.5 rounded-xl border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>⚙️ تنظیمات ورودی</p>

                  {/* Placeholder */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      متن راهنما داخل فیلد (Placeholder)
                    </label>
                    <input
                      type="text"
                      value={formData.placeholder || ''}
                      onChange={(e) => handleChange({ placeholder: e.target.value })}
                      className="w-full rounded-lg px-3 py-2 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 border"
                      style={{
                        background: 'var(--bg-secondary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)'
                      }}
                      placeholder={
                        formData.type === 'number' ? 'مثلاً: تعداد سمپل را وارد کنید...' :
                        formData.type === 'expenses' ? 'مثلاً: مبلغ هزینه (تومان)' :
                        'مثلاً: پاسخ خود را اینجا بنویسید...'
                      }
                    />
                  </div>

                  {/* Number min/max */}
                  {formData.type === 'number' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>حداقل مقدار</label>
                        <input
                          type="number"
                          value={formData.minValue ?? ''}
                          onChange={(e) => handleChange({ minValue: e.target.value === '' ? undefined : Number(e.target.value) })}
                          className="w-full rounded-lg px-3 py-1.5 text-xs border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                          placeholder="مثلاً: ۰"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>حداکثر مقدار</label>
                        <input
                          type="number"
                          value={formData.maxValue ?? ''}
                          onChange={(e) => handleChange({ maxValue: e.target.value === '' ? undefined : Number(e.target.value) })}
                          className="w-full rounded-lg px-3 py-1.5 text-xs border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                          placeholder="مثلاً: ۹۹۹"
                        />
                      </div>
                    </div>
                  )}

                  {/* Textarea rows */}
                  {formData.type === 'textarea' && (
                    <div>
                      <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>تعداد سطرهای نمایش</label>
                      <select
                        value={formData.rows || 4}
                        onChange={(e) => handleChange({ rows: Number(e.target.value) })}
                        className="w-full rounded-lg px-3 py-1.5 text-xs border focus:outline-none"
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                      >
                        {[2, 3, 4, 5, 6, 8].map(n => <option key={n} value={n}>{n} سطر</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Special Setting: Brief Text for Brief Reader */}
              {formData.type === 'brief_reader' && (

                <div>
                  <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>متن کامل پروتکل و دستورالعمل رویداد</label>
                  <MarkdownEditor 
                    value={formData.briefText || ''}
                    onChange={(val) => handleChange({ briefText: val })}
                    placeholder="دستورالعمل، قوانین برند، نحوه پرزنت محصول..."
                  />
                  <div className="flex items-center gap-2 overflow-x-auto mt-3 pb-2 scrollbar-hide">
                    <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap">قالب‌های آماده:</span>
                    <button
                      onClick={() => setShowCreateBriefPreset(true)}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors whitespace-nowrap dark:border-zinc-700 dark:text-gray-400 dark:hover:bg-zinc-800"
                    >
                      + ذخیره متن فعلی
                    </button>
                    <button
                      onClick={() => setShowBriefPresetManager(true)}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-300"
                    >
                      ⚙️ مدیریت
                    </button>
                    {briefPresets.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => handleChange({ briefText: preset.text })}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors whitespace-nowrap dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-300"
                      >
                        + {preset.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Special Setting: Advanced Checklist Editor */}
              {formData.type === 'advanced_checklist' && (
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                      📋 آیتم‌های چک‌لیست و تعیین دسترسی
                    </label>
                    <button 
                      onClick={() => {
                        const items = formData.checklistItems || [];
                        const newItem = { 
                          id: `chk-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, 
                          title: 'وظیفه جدید', 
                          role: 'promoter', 
                          attachPhoto: false, 
                          checked: false 
                        };
                        handleChange({ checklistItems: [...items, newItem] });
                        setTimeout(() => {
                          checklistEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                        }, 100);
                      }}
                      className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-xl transition-all shadow-xs flex items-center gap-1"
                    >
                      + افزودن آیتم جدید
                    </button>
                  </div>
                  
                  {/* Banner for Editing Preset */}
                  {editingPresetId && (
                    <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 mb-3 flex items-center justify-between">
                      <div className="text-xs text-indigo-800 dark:text-indigo-300 font-bold">
                        در حال ویرایش قالب: {presetTitle}
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => { 
                            setEditingPresetId(null); 
                            setPresetTitle(''); 
                          }} 
                          className="text-[10px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                        >
                          انصراف
                        </button>
                        <button 
                          onClick={async () => {
                            const updatedItems = formData.checklistItems || [];
                            const updatedPresets = presets.map(p => 
                              p.id === editingPresetId ? { ...p, title: presetTitle, items: updatedItems } : p
                            );
                            setPresets(updatedPresets);
                            try {
                              const res = await fetch(`${API_URL}/admin/checklist-presets/${editingPresetId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                                body: JSON.stringify({ title: presetTitle, items: updatedItems })
                              });
                              if (res.ok) {
                                toast.success('قالب با موفقیت بروزرسانی شد');
                                setEditingPresetId(null);
                                setPresetTitle('');
                              } else {
                                toast.error('خطا در بروزرسانی قالب');
                              }
                            } catch (e) {
                              toast.error('خطای شبکه');
                            }
                          }} 
                          className="bg-indigo-600 text-white text-[10px] px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs"
                        >
                          بروزرسانی قالب
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Presets Chips */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap">قالب‌های آماده:</span>
                    <button
                      onClick={() => {
                        setSelectedPresetItems(formData.checklistItems || []);
                        setShowCreatePreset(true);
                      }}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors whitespace-nowrap dark:border-zinc-700 dark:text-gray-400 dark:hover:bg-zinc-800"
                    >
                      + ساخت قالب
                    </button>
                    <button
                      onClick={() => setShowPresetManager(true)}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-300"
                    >
                      ⚙️ مدیریت
                    </button>
                    {presets.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          const items = formData.checklistItems || [];
                          const newItems = preset.items.map(it => ({
                            ...it,
                            id: `chk-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                            checked: false
                          }));
                          handleChange({ checklistItems: [...items, ...newItems] });
                          setTimeout(() => {
                            checklistEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                          }, 100);
                        }}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors whitespace-nowrap dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-300"
                      >
                        + {preset.title}
                      </button>
                    ))}
                  </div>

                  <Reorder.Group 
                    axis="y" 
                    values={formData.checklistItems || []} 
                    onReorder={(newOrder) => handleChange({ checklistItems: newOrder })}
                    className="space-y-2.5 mt-2"
                  >
                    {(!formData.checklistItems || formData.checklistItems.length === 0) ? (
                      <div className="p-4 text-center rounded-xl border border-dashed text-xs text-gray-400" style={{ borderColor: 'var(--border-color)' }}>
                        هیچ آیتمی در چک‌لیست وجود ندارد. روی «افزودن آیتم جدید» کلیک کنید.
                      </div>
                    ) : (
                      formData.checklistItems.map((item, idx) => (
                        <Reorder.Item 
                          key={item.id} 
                          value={item}
                          className="p-3 rounded-xl border space-y-2.5 shadow-2xs transition-colors bg-white dark:bg-zinc-900 relative" 
                          style={{ borderColor: 'var(--border-color)' }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                              <GripVertical size={16} />
                            </div>
                            <input 
                              type="text" 
                              value={item.title || ''}
                              onChange={(e) => {
                                const newTitle = e.target.value;
                                const updated = (formData.checklistItems || []).map((it, i) => 
                                  i === idx ? { ...it, title: newTitle } : it
                                );
                                handleChange({ checklistItems: updated });
                              }}
                              className="flex-1 bg-gray-50 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-gray-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder="عنوان وظیفه را وارد کنید..."
                            />
                            <button 
                              onClick={() => {
                                const updated = (formData.checklistItems || []).filter((_, i) => i !== idx);
                                handleChange({ checklistItems: updated });
                              }}
                              className="w-7 h-7 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center justify-center text-xs font-bold transition-colors shrink-0"
                              title="حذف این آیتم"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-zinc-700/50 pl-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">مسئولیت‌ها (سطح دسترسی):</span>
                              <label className="flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-300 font-medium bg-gray-50 dark:bg-zinc-800 px-2 py-1 rounded border border-gray-100 dark:border-zinc-700">
                                <input 
                                  type="checkbox" 
                                  checked={item.attachPhoto || false}
                                  onChange={(e) => {
                                    const newAttach = e.target.checked;
                                    const updated = (formData.checklistItems || []).map((it, i) => 
                                      i === idx ? { ...it, attachPhoto: newAttach } : it
                                    );
                                    handleChange({ checklistItems: updated });
                                  }}
                                  className="w-3 h-3 rounded text-indigo-600 focus:ring-0"
                                />
                                <span className="text-[9px]">📷 پیوست عکس الزامی</span>
                              </label>
                            </div>
                            
                            <div className="flex flex-col gap-1.5">
                              {[
                                { key: 'promoter', label: 'پروموتر' },
                                { key: 'supervisor', label: 'کاپیتان' },
                                { key: 'setup', label: 'تیم ست‌آپ' },
                                { key: 'collection', label: 'تیم کالکشن' }
                              ].map(r => {
                                const defaultPerm = (item.role === r.key) ? 'edit' : 'view';
                                const currentPerm = item.permissions ? item.permissions[r.key] : defaultPerm;

                                const getNewPerms = (val) => {
                                  const base = item.permissions || {
                                    promoter: item.role === 'promoter' ? 'edit' : 'view',
                                    supervisor: item.role === 'supervisor' ? 'edit' : 'view',
                                    setup: item.role === 'setup' ? 'edit' : 'view',
                                    collection: item.role === 'collection' ? 'edit' : 'hide'
                                  };
                                  return { ...base, [r.key]: val };
                                };

                                const applyPerm = (val) => {
                                  const newPerms = getNewPerms(val);
                                  const updated = (formData.checklistItems || []).map((it, i) =>
                                    i === idx ? { ...it, permissions: newPerms } : it
                                  );
                                  handleChange({ checklistItems: updated });
                                };

                                return (
                                  <div key={r.key} className="flex items-center justify-between bg-gray-50 dark:bg-zinc-800/50 px-2 py-1.5 rounded-lg border border-gray-100 dark:border-zinc-700/50">
                                    <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">{r.label}</span>
                                    <div className="flex bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-md overflow-hidden shadow-2xs">
                                      {/* فقط مشاهده */}
                                      <button
                                        title="این نقش فقط می‌تواند آیتم را ببیند"
                                        onClick={() => applyPerm('view')}
                                        className={`px-2 py-0.5 text-[9px] font-bold transition-colors ${currentPerm === 'view' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
                                      >
                                        فقط مشاهده
                                      </button>
                                      {/* ویرایش */}
                                      <button
                                        title="این نقش می‌تواند آیتم را تیک بزند"
                                        onClick={() => applyPerm('edit')}
                                        className={`px-2 py-0.5 text-[9px] font-bold border-r border-l border-gray-200 dark:border-zinc-700 transition-colors ${currentPerm === 'edit' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
                                      >
                                        ویرایش
                                      </button>
                                      {/* مخفی */}
                                      <button
                                        title="این آیتم برای این نقش نمایش داده نمی‌شود"
                                        onClick={() => applyPerm('hidden')}
                                        className={`px-2 py-0.5 text-[9px] font-bold transition-colors flex items-center gap-0.5 ${currentPerm === 'hidden' ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'text-gray-400 dark:text-gray-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 dark:hover:text-rose-400'}`}
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                        مخفی
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </Reorder.Item>
                      ))
                    )}
                    <div ref={checklistEndRef} />
                  </Reorder.Group>
                </div>
              )}

              {/* Special Setting: Mehram shelf questions editor */}
              {formData.type === 'mehram_supermarket_report' && (() => {
                const qs = getShelfQuestions(formData);
                const setQs = (next) => handleChange({ shelfQuestions: next });
                const patchQ = (qi, patch) => setQs(qs.map((q, i) => (i === qi ? { ...q, ...patch } : q)));
                const inputCls = 'bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none';
                return (
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                          📋 سوالات شلف
                        </label>
                        <p className="text-[10px] text-gray-500">
                          سوالات چندگزینه‌ای که پروموتر برای هر سوپرمارکت پاسخ می‌دهد. هر سوال حداقل ۲ گزینه دارد و پاسخ همه‌ی سوالات الزامی است.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQs([...qs, { key: `q_${Date.now()}`, title: 'سوال جدید', options: ['بله', 'خیر'] }])}
                        className="text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-xl transition-all shadow-xs shrink-0"
                      >
                        + افزودن سوال
                      </button>
                    </div>

                    {qs.length === 0 && (
                      <div className="p-4 text-center rounded-xl border border-dashed text-xs text-gray-400" style={{ borderColor: 'var(--border-color)' }}>
                        هیچ سوالی ثبت نشده است؛ پروموتر فقط عکس‌ها را ثبت می‌کند.
                      </div>
                    )}

                    <div className="space-y-2.5">
                      {qs.map((q, qi) => (
                        <div key={q.key} className="p-3 rounded-xl border space-y-2.5" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)' }}>
                          <div className="flex gap-2 items-center">
                            <span className="text-[10px] font-black text-indigo-500 w-5 text-center shrink-0">{qi + 1}</span>
                            <input
                              type="text"
                              value={q.title}
                              onChange={(e) => patchQ(qi, { title: e.target.value })}
                              className={`flex-1 font-bold ${inputCls}`}
                              placeholder="متن سوال"
                            />
                            <button type="button" disabled={qi === 0} onClick={() => { const n = [...qs]; [n[qi - 1], n[qi]] = [n[qi], n[qi - 1]]; setQs(n); }} className="text-xs px-1.5 text-gray-400 hover:text-indigo-500 disabled:opacity-30" title="بالا">↑</button>
                            <button type="button" disabled={qi === qs.length - 1} onClick={() => { const n = [...qs]; [n[qi + 1], n[qi]] = [n[qi], n[qi + 1]]; setQs(n); }} className="text-xs px-1.5 text-gray-400 hover:text-indigo-500 disabled:opacity-30" title="پایین">↓</button>
                            <button type="button" onClick={() => setQs(qs.filter((_, i) => i !== qi))} className="text-red-400 hover:text-red-600 p-1" title="حذف سوال">
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="space-y-1.5 ps-7">
                            {q.options.map((o, oi) => (
                              <div key={oi} className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  value={o}
                                  onChange={(e) => patchQ(qi, { options: q.options.map((x, i) => (i === oi ? e.target.value : x)) })}
                                  className={`flex-1 ${inputCls}`}
                                  placeholder={`گزینه ${oi + 1}`}
                                />
                                <button
                                  type="button"
                                  disabled={q.options.length <= 2}
                                  onClick={() => patchQ(qi, { options: q.options.filter((_, i) => i !== oi) })}
                                  className="text-gray-400 hover:text-red-500 disabled:opacity-30 p-1"
                                  title={q.options.length <= 2 ? 'حداقل ۲ گزینه لازم است' : 'حذف گزینه'}
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ))}
                            <button type="button" onClick={() => patchQ(qi, { options: [...q.options, ''] })} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700">
                              + افزودن گزینه
                            </button>
                            <div className="flex gap-2 items-center pt-1">
                              <span className="text-[10px] text-gray-500 shrink-0">توضیحات اجباری برای گزینه:</span>
                              <select
                                value={q.noteOn || ''}
                                onChange={(e) => patchQ(qi, { noteOn: e.target.value || undefined })}
                                className={`flex-1 ${inputCls}`}
                              >
                                <option value="">— هیچ‌کدام —</option>
                                {q.options.filter((o) => String(o).trim()).map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {Array.isArray(formData.shelfQuestions) && (
                      <button
                        type="button"
                        onClick={() => handleChange({ shelfQuestions: undefined })}
                        className="text-[10px] font-bold text-gray-500 hover:text-gray-700 underline"
                      >
                        بازگشت به سوالات پیش‌فرض
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Special Setting: Mehram product groups editor */}
              {formData.type === 'mehram_supermarket_report' && (() => {
                const gs = getProductGroups(formData);
                const setGs = (next) => handleChange({ productGroups: next });
                const inputCls = 'bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none';
                return (
                  <div className="space-y-3 pt-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                          📦 گروه محصولات
                        </label>
                        <p className="text-[10px] text-gray-500">
                          پروموتر برای هر گروه یکی از گزینه‌های «{PRODUCT_STATUSES.join('، ')}» را انتخاب می‌کند و یک عکس اجباری از گروه محصولات می‌گیرد.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setGs([...gs, { key: `g_${Date.now()}`, title: 'گروه جدید' }])}
                        className="text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-xl transition-all shadow-xs shrink-0"
                      >
                        + افزودن گروه
                      </button>
                    </div>

                    {gs.length === 0 && (
                      <div className="p-4 text-center rounded-xl border border-dashed text-xs text-gray-400" style={{ borderColor: 'var(--border-color)' }}>
                        هیچ گروهی ثبت نشده است؛ بخش گروه محصولات به پروموتر نمایش داده نمی‌شود.
                      </div>
                    )}

                    <div className="space-y-2">
                      {gs.map((g, gi) => (
                        <div key={g.key} className="flex gap-2 items-center p-2 rounded-xl border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)' }}>
                          <span className="text-[10px] font-black text-indigo-500 w-5 text-center shrink-0">{gi + 1}</span>
                          <input
                            type="text"
                            value={g.title}
                            onChange={(e) => setGs(gs.map((x, i) => (i === gi ? { ...x, title: e.target.value } : x)))}
                            className={`flex-1 font-bold ${inputCls}`}
                            placeholder="نام گروه محصول"
                          />
                          <button type="button" disabled={gi === 0} onClick={() => { const n = [...gs]; [n[gi - 1], n[gi]] = [n[gi], n[gi - 1]]; setGs(n); }} className="text-xs px-1.5 text-gray-400 hover:text-indigo-500 disabled:opacity-30" title="بالا">↑</button>
                          <button type="button" disabled={gi === gs.length - 1} onClick={() => { const n = [...gs]; [n[gi + 1], n[gi]] = [n[gi], n[gi + 1]]; setGs(n); }} className="text-xs px-1.5 text-gray-400 hover:text-indigo-500 disabled:opacity-30" title="پایین">↓</button>
                          <button type="button" onClick={() => setGs(gs.filter((_, i) => i !== gi))} className="text-red-400 hover:text-red-600 p-1" title="حذف گروه">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {Array.isArray(formData.productGroups) && (
                      <button
                        type="button"
                        onClick={() => handleChange({ productGroups: undefined })}
                        className="text-[10px] font-bold text-gray-500 hover:text-gray-700 underline"
                      >
                        بازگشت به گروه‌های پیش‌فرض
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Special Setting: BVT Products Editor */}
              {(formData.type === 'bvt_cigarette_match' || formData.type === 'bvt_sampling_report') && (
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        🚬 محصولات پیشنهادی (BVT)
                      </label>
                      <p className="text-[10px] text-gray-500">
                        مشخصات سیگارهای هدف را اینجا وارد کنید.
                      </p>
                    </div>
                    <button 
                      onClick={() => {
                        const newProd = {
                          id: `bvt_${Date.now()}`,
                          name: 'سیگار جدید',
                          image: '',
                          nicotine: 0.5,
                          nicotineLabel: '0.5mg',
                          tar: 5,
                          accent: '#6366f1'
                        };
                        handleChange({ bvtProducts: [...(formData.bvtProducts || []), newProd] });
                      }}
                      className="text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-xl transition-all shadow-xs flex items-center gap-1"
                    >
                      + افزودن محصول
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {(!formData.bvtProducts || formData.bvtProducts.length === 0) ? (
                      <div className="p-4 text-center rounded-xl border border-dashed text-xs text-gray-400" style={{ borderColor: 'var(--border-color)' }}>
                        هیچ محصولی ثبت نشده است. روی «افزودن محصول» کلیک کنید.
                      </div>
                    ) : (
                      formData.bvtProducts.map((p, idx) => (
                        <div 
                          key={p.id || `bvt-${idx}`} 
                          className="p-3 rounded-xl border space-y-3 shadow-2xs relative" 
                          style={{ background: 'var(--bg-input)', borderLeft: `4px solid ${p.accent || '#6366f1'}`, borderColor: 'var(--border-color)' }}
                        >
                          <div className="flex gap-2 items-center">
                            <input 
                              type="text" 
                              value={p.name || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                const updated = (formData.bvtProducts || []).map((item, i) => i === idx ? { ...item, name: val } : item);
                                handleChange({ bvtProducts: updated });
                              }}
                              className="flex-1 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none"
                              placeholder="نام محصول (مثلا Pall Mall Red)"
                            />
                            <button
                              onClick={() => {
                                const updated = (formData.bvtProducts || []).filter((_, i) => i !== idx);
                                handleChange({ bvtProducts: updated });
                              }}
                              className="text-gray-400 hover:text-red-500 transition-colors p-1"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] text-gray-500 mb-1 block">نیکوتین (عدد)</label>
                              <input 
                                type="number" 
                                step="0.1"
                                value={p.nicotine || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  const updated = (formData.bvtProducts || []).map((item, i) => i === idx ? { ...item, nicotine: isNaN(val) ? 0 : val } : item);
                                  handleChange({ bvtProducts: updated });
                                }}
                                className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2 py-1 text-[11px] focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-gray-500 mb-1 block">قطران (عدد - اختیاری)</label>
                              <input 
                                type="number" 
                                step="1"
                                value={p.tar || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  const updated = (formData.bvtProducts || []).map((item, i) => i === idx ? { ...item, tar: isNaN(val) ? null : val } : item);
                                  handleChange({ bvtProducts: updated });
                                }}
                                className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2 py-1 text-[11px] focus:outline-none"
                                placeholder="خالی=در نظر گرفته نمیشود"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-gray-500 mb-1 block">متن نمایشی نیکوتین</label>
                              <input 
                                type="text" 
                                value={p.nicotineLabel || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const updated = (formData.bvtProducts || []).map((item, i) => i === idx ? { ...item, nicotineLabel: val } : item);
                                  handleChange({ bvtProducts: updated });
                                }}
                                className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2 py-1 text-[11px] focus:outline-none"
                                placeholder="مثلاً 0.5mg"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-gray-500 mb-1 block">رنگ حاشیه (Accent Color)</label>
                              <div className="flex gap-1">
                                <input 
                                  type="color" 
                                  value={p.accent || '#6366f1'}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updated = (formData.bvtProducts || []).map((item, i) => i === idx ? { ...item, accent: val } : item);
                                    handleChange({ bvtProducts: updated });
                                  }}
                                  className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                                />
                                <input 
                                  type="text" 
                                  value={p.accent || '#6366f1'}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updated = (formData.bvtProducts || []).map((item, i) => i === idx ? { ...item, accent: val } : item);
                                    handleChange({ bvtProducts: updated });
                                  }}
                                  className="flex-1 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2 py-1 text-[11px] focus:outline-none"
                                />
                              </div>
                            </div>
                            <div className="col-span-2">
                              <label className="text-[9px] text-gray-500 mb-1 block">آدرس عکس (URL)</label>
                              <input 
                                type="text" 
                                value={p.image || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const updated = (formData.bvtProducts || []).map((item, i) => i === idx ? { ...item, image: val } : item);
                                  handleChange({ bvtProducts: updated });
                                }}
                                className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2 py-1 text-[11px] focus:outline-none"
                                placeholder="مثلا /images/bvt/pallmall-blue.webp"
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Special Setting: Team Directory Editor */}
              {formData.type === 'team_directory' && (
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        👥 اعضای تیم رویداد و راه‌های ارتباطی
                      </label>
                      <button 
                        onClick={handleAutoFetchTeam}
                        className="text-[10px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 px-2 py-1 rounded-lg transition-colors border border-indigo-100 dark:border-indigo-800 w-fit"
                      >
                        <RefreshCw size={12} />
                        همگام‌سازی با تیم رویداد
                      </button>
                    </div>
                    <button 
                      onClick={() => setShowPicker(true)}
                      className="text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-xl transition-all shadow-xs flex items-center gap-1"
                    >
                      + افزودن دستی
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {(!formData.teamMembers || formData.teamMembers.length === 0) ? (
                      <div className="p-4 text-center rounded-xl border border-dashed text-xs text-gray-400" style={{ borderColor: 'var(--border-color)' }}>
                        هیچ عضوی ثبت نشده است. روی «افزودن عضو جدید» کلیک کنید.
                      </div>
                    ) : (
                      formData.teamMembers.map((m, idx) => (
                        <div 
                          key={m.id || `tm-item-${idx}`} 
                          className="p-3 rounded-xl border space-y-2 shadow-2xs" 
                          style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)' }}
                        >
                          <div className="flex items-center gap-2">
                            <input 
                              type="text" 
                              value={m.name || ''}
                              onChange={(e) => {
                                const newName = e.target.value;
                                const updated = (formData.teamMembers || []).map((item, i) => 
                                  i === idx ? { ...item, name: newName } : item
                                );
                                handleChange({ teamMembers: updated });
                              }}
                              className="flex-1 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-gray-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder="نام و نام خانوادگی..."
                            />
                            <button 
                              onClick={() => {
                                const updated = (formData.teamMembers || []).filter((_, i) => i !== idx);
                                handleChange({ teamMembers: updated });
                              }}
                              className="w-7 h-7 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center justify-center text-xs font-bold transition-colors shrink-0"
                              title="حذف عضو"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <select 
                              value={m.role || 'پروموتر'}
                              onChange={(e) => {
                                const newRole = e.target.value;
                                const updated = (formData.teamMembers || []).map((item, i) => 
                                  i === idx ? { ...item, role: newRole } : item
                                );
                                handleChange({ teamMembers: updated });
                              }}
                              className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none"
                            >
                              <option value="پروموتر">پروموتر</option>
                              <option value="کاپیتان">کاپیتان</option>
                              <option value="ست‌آپ">ست‌آپ</option>
                            </select>
                            <input 
                              type="text" 
                              value={m.phone || ''}
                              onChange={(e) => {
                                const newPhone = e.target.value;
                                const updated = (formData.teamMembers || []).map((item, i) => 
                                  i === idx ? { ...item, phone: newPhone } : item
                                );
                                handleChange({ teamMembers: updated });
                              }}
                              className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200 dir-ltr text-left font-mono focus:outline-none"
                              placeholder="0912..."
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Toggles */}
              <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>بخش اجباری</h4>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>پروموترها باید این بخش را پر کنند.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={formData.required || false}
                      onChange={(e) => handleChange({ required: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {/* Gallery mode toggle for the photos field */}
                {formData.type === 'photos' && (
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-indigo-600">🖼️ دوربین + آپلود از گالری</h4>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>دو دکمه جدا: گرفتن عکس با دوربین و آپلود از گالری گوشی.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={formData.photoSource === 'both'}
                        onChange={(e) => handleChange({ photoSource: e.target.checked ? 'both' : undefined })}
                      />
                      <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                )}

                {/* Camera Lock toggle for Camera Checkin / Checkout */}
                {(formData.type === 'camera_checkin' || formData.type === 'camera_checkout') && (
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-indigo-600">🔒 قفل دوربین مستقیم</h4>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>انتخاب عکس از گالری غیرفعال است.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={formData.cameraOnly ?? true}
                        onChange={(e) => handleChange({ cameraOnly: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button 
                onClick={() => {
                  onDelete(formData.id);
                  onClose();
                }}
                className="w-full py-2.5 flex items-center justify-center gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-colors font-semibold text-sm"
              >
                <Trash2 size={16} />
                حذف بخش
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SettingsDrawer;
