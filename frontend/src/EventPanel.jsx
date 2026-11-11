import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DatePicker, { DateObject } from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import './EventPanel.css';
import SectionBuilder from './components/SectionBuilder/SectionBuilder';
import LocationPickerModal from './components/LocationPickerModal';
import { parseLatLngFromMapsUrl } from './components/BVTCigaretteMatch/cigaretteDatabase';

const FIELD_TYPES = [
  { type: 'text', label: 'متن', icon: '📝', desc: 'ورودی متنی آزاد' },
  { type: 'number', label: 'عدد', icon: '🔢', desc: 'ورودی عددی' },

  { type: 'phone', label: 'شماره تماس', icon: '📱', desc: 'شماره موبایل' },
  { type: 'location', label: 'لوکیشن', icon: '📍', desc: 'موقعیت مکانی' },
  { type: 'image', label: 'آپلود عکس', icon: '🖼️', desc: 'آپلود از گالری' },
  { type: 'camera', label: 'دوربین', icon: '📷', desc: 'عکس از دوربین' },
  { type: 'select', label: 'انتخابی (کشویی)', icon: '📋', desc: 'منو کشویی، یک گزینه' },
  { type: 'choice', label: 'چند گزینه‌ای', icon: '🔘', desc: 'دکمه‌ای، تک یا چند انتخابی' },
  { type: 'email', label: 'ایمیل', icon: '📧', desc: 'ورودی ایمیل' },
  { type: 'signature', label: 'امضا', icon: '✍️', desc: 'امضای دیجیتال با انگشت/ماوس' },
  { type: 'textarea', label: 'متن بلند', icon: '📄', desc: 'توضیحات طولانی' },
  { type: 'date', label: 'تاریخ', icon: '📅', desc: 'انتخاب تاریخ' },
  { type: 'time', label: 'ساعت', icon: '⏰', desc: 'انتخاب ساعت' },
  { type: 'checkbox', label: 'چک باکس', icon: '☑️', desc: 'بله / خیر' },
  { type: 'rating', label: 'امتیاز', icon: '⭐', desc: 'ستاره‌دهی' },
  { type: 'divider', label: 'جداکننده', icon: '➖', desc: 'خط جداکننده' },
  { type: 'heading', label: 'عنوان بخش', icon: '🏷️', desc: 'عنوان گروه فیلدها' },
];

const AUTO_FILL_OPTIONS = [
  { value: '', label: 'بدون مقدار خودکار' },
  { value: 'username', label: 'نام کاربری' },
  { value: 'full_name', label: 'نام و نام خانوادگی' },
  { value: 'phone_number', label: 'شماره موبایل' },
  { value: 'team_name', label: 'نام تیم' },
  { value: 'date_now', label: 'تاریخ امروز' },
  { value: 'time_now', label: 'ساعت الان' },
];

const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_15 = ['00', '15', '30', '45'];
const parseHM = (t) => {
  const [h, m] = (t || '00:00').split(':');
  return { h: h || '00', m: m || '00' };
};

const COLUMN_OPTIONS = [
  { value: 1, label: '۱ ستون' },
  { value: 2, label: '۲ ستون' },
  { value: 3, label: '۳ ستون' },
  { value: 4, label: '۴ ستون' },
];

let fieldIdCounter = Date.now();
const newField = (type) => ({
  id: fieldIdCounter++,
  type,
  label: FIELD_TYPES.find(f => f.type === type)?.label || type,
  placeholder: '',
  required: false,
  autoFill: '',
  options: ['select', 'choice'].includes(type) ? ['گزینه ۱', 'گزینه ۲'] : [],
  columns: 1,
  width: 1, // 1=full, relative to grid
  multiple: ['image', 'camera'].includes(type) ? true : (type === 'choice' ? false : undefined),
});

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function EventPanel({ renderHeader }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editSlug = searchParams.get('edit');
  const [eventId, setEventId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (editSlug) {
      setIsEditing(true);
      fetch(`${API_URL}/events/${editSlug}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.id) {
             setEventId(data.id);
             setEventName(data.name || '');
             setEventSlug(data.slug || '');
             setClientName(data.client_name || '');
             setMobileColumns(data.mobile_columns || 2);
             setDesktopColumns(data.desktop_columns || 3);
             setEnableVoice(data.enable_voice !== false);
             setEnableChat(data.enable_chat || false);
             setFields(data.fields || []);
             setSetupPreFields(data.setup_pre_fields || []);
             setSetupPostFields(data.setup_post_fields || []);
             setEventLocation(data.location || '');
             setReportLocation(data.report_location || '');
             setReportLocationImage(data.report_location_image || '');
             setLocationLabel(data.location_label || '');
             setEventDescription(data.description || '');
             setEventType(data.event_type || '');
             setRequiresPromoter(data.promoter_count > 0);
             setPromoterCount(data.promoter_count !== undefined ? data.promoter_count : 1);
             setRequiresSetup(data.requires_setup || false);
             setSetupCount(data.setup_count !== undefined ? data.setup_count : 1);
             setSetupDate(data.setup_date || null);
             setSetupTimeIn(data.setup_time_in || '00:00');
             setSetupTimeOut(data.setup_time_out || '00:00');
             setRequiresCollection(data.requires_collection || false);
             setCollectionCount(data.collection_count !== undefined ? data.collection_count : 1);
             setCollectionDate(data.collection_date || null);
             setCollectionTimeIn(data.collection_time_in || '00:00');
             setCollectionTimeOut(data.collection_time_out || '00:00');
             setRequiresSupervisor(data.requires_supervisor || false);
             setSupervisorCount(data.supervisor_count !== undefined ? data.supervisor_count : 1);
             setRequiresTransport(data.requires_transport || false);
             setTransportCount(data.transport_count !== undefined ? data.transport_count : 1);
             setRequiresSampling(data.requires_sampling || false);
             setSamplingCount(data.sampling_count !== undefined ? data.sampling_count : 2000);
             
             if (data.start_date || data.end_date) {
                const dates = [];
                if (data.start_date) {
                  dates.push(...data.start_date.split(',').map(s => s.trim()).filter(Boolean));
                }
                // Only push end_date if it's not already included and not empty
                if (data.end_date && !dates.includes(data.end_date)) {
                  dates.push(...data.end_date.split(',').map(s => s.trim()).filter(Boolean));
                }
                setEventDates(dates);
             }
             if (data.start_time) setStartTime(data.start_time);
             if (data.end_time) setEndTime(data.end_time);
             if (data.custom_times) {
               setUseCustomTimes(true);
               setCustomTimes(data.custom_times);
             } else {
               setUseCustomTimes(false);
               setCustomTimes({});
             }
          }
        })
        .catch(err => console.error(err));
    }
  }, [editSlug]);
  const [step, setStep] = useState(1);
  const [eventName, setEventName] = useState('');
  const [eventSlug, setEventSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const [slugError, setSlugError] = useState('');
  const [mobileColumns, setMobileColumns] = useState(2);
  const [desktopColumns, setDesktopColumns] = useState(3);
  const [enableVoice, setEnableVoice] = useState(true);
  const [enableChat, setEnableChat] = useState(false);
  const [fields, setFields] = useState([]);
  const [setupPreFields, setSetupPreFields] = useState([]);
  const [setupPostFields, setSetupPostFields] = useState([]);
  const [builderMode, setBuilderMode] = useState('promoter'); // 'promoter' | 'setupPre' | 'setupPost'

  // ── New Step-1 fields ──
  const [clientName, setClientName] = useState('');
  const [eventDates, setEventDates] = useState([]);
  // The time pickers below always display a value (falling back to 00:00 via
  // parseHM), so the state must start non-empty too — otherwise the UI shows
  // "00:00" while the actual saved start_time is '', silently breaking any
  // lateness comparison against it (admin ReportsTab, promoter check-in UI) for
  // events where the admin never touched these dropdowns.
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('00:00');
  const [useCustomTimes, setUseCustomTimes] = useState(false);
  const [customTimes, setCustomTimes] = useState({});
  const [requiresPromoter, setRequiresPromoter] = useState(true);
  const [promoterCount, setPromoterCount] = useState(1);
  const [requiresSetup, setRequiresSetup] = useState(false);
  const [setupCount, setSetupCount] = useState(1);
  const [setupDate, setSetupDate] = useState(null);
  const [setupTimeIn, setSetupTimeIn] = useState('00:00');
  const [setupTimeOut, setSetupTimeOut] = useState('00:00');
  const [requiresCollection, setRequiresCollection] = useState(false);
  const [collectionCount, setCollectionCount] = useState(1);
  const [collectionDate, setCollectionDate] = useState(null);
  const [collectionTimeIn, setCollectionTimeIn] = useState('00:00');
  const [collectionTimeOut, setCollectionTimeOut] = useState('00:00');
  const [requiresSupervisor, setRequiresSupervisor] = useState(false);
  const [supervisorCount, setSupervisorCount] = useState(1);
  const [requiresTransport, setRequiresTransport] = useState(false);
  const [transportCount, setTransportCount] = useState(1);
  const [requiresSampling, setRequiresSampling] = useState(false);
  const [samplingCount, setSamplingCount] = useState(2000);
  const [eventLocation, setEventLocation] = useState('');
  const [reportLocation, setReportLocation] = useState('');
  const [reportLocationImage, setReportLocationImage] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [eventDescription, setEventDescription] = useState('');
  const [eventType, setEventType] = useState('');
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (isEditing) return;
    if (!eventName && !clientName) {
      setEventSlug('');
      setSlugError('');
      return;
    }
    const combined = `${eventName ? eventName.trim() : ''}-${clientName ? clientName.trim() : ''}`;
    let clean = combined.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
    clean = clean.replace(/-+/g, '-').replace(/^-|-$/g, '');
    setEventSlug(clean);
    setSlugError(clean.length > 0 && clean.length < 2 ? 'حداقل ۲ کاراکتر' : '');
  }, [eventName, clientName, isEditing]);

  const EVENT_TYPES = [
    { value: '', label: 'انتخاب نوع ایونت...' },
    { value: 'activation', label: '🎯 اکتیویشن' },
    { value: 'sampling', label: '🧪 سمپلینگ' },
    { value: 'exhibition', label: '🏛️ نمایشگاه' },
    { value: 'conference', label: '🎤 کنفرانس' },
    { value: 'launch', label: '🚀 لانچ محصول' },
    { value: 'other', label: '📌 سایر' },
  ];

  const [dbClients, setDbClients] = useState([]);
  const [isAddingNewClient, setIsAddingNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/clients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDbClients(data);
      }
    } catch (err) {
      console.error("Error fetching clients:", err);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const allClients = dbClients.map(c => c.name).sort();

  const handleAddNewClient = async () => {
    const trimmed = newClientName.trim().toLowerCase().replace(/[^a-zA-Z0-9\s-]/g, '');
    if (!trimmed) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed })
      });
      await fetchClients();
      setClientName(trimmed);
    } catch (e) {
      console.error("Error saving client to DB", e);
    }
    setNewClientName('');
    setIsAddingNewClient(false);
  };

  const activeFields = builderMode === 'promoter' ? fields : builderMode === 'setupPre' ? setupPreFields : setupPostFields;
  const setActiveFields = (newFields) => {
    if (typeof newFields === 'function') {
      newFields = newFields(activeFields);
    }
    if (builderMode === 'promoter') setFields(newFields);
    else if (builderMode === 'setupPre') setSetupPreFields(newFields);
    else setSetupPostFields(newFields);
  };

  const getDynamicSteps = () => {
    const s = [{ mode: 'promoter', label: 'پروموتر' }];
    if (requiresSetup) s.push({ mode: 'setupPre', label: 'ست‌آپ' });
    if (requiresCollection || requiresTransport) s.push({ mode: 'setupPost', label: requiresCollection ? 'کالکشن' : 'ترنسپورتیشن' });
    return s;
  };
  const dynamicSteps = getDynamicSteps();

  const goNext = () => {
    if (step === 1) {
      setStep(2);
      setBuilderMode('promoter');
    } else {
      const idx = dynamicSteps.findIndex(s => s.mode === builderMode);
      if (idx !== -1 && idx < dynamicSteps.length - 1) {
        setBuilderMode(dynamicSteps[idx + 1].mode);
      }
    }
  };

  const goBack = () => {
    if (step === 1) return;
    const idx = dynamicSteps.findIndex(s => s.mode === builderMode);
    if (idx > 0) {
      setBuilderMode(dynamicSteps[idx - 1].mode);
    } else {
      setStep(1);
    }
  };
  const [selectedField, setSelectedField] = useState(null);
  const [draggingType, setDraggingType] = useState(null);
  const [draggingFieldId, setDraggingFieldId] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('fields');
  const canvasRef = useRef(null);

  // هیستوری ایونت‌ها
  const [showHistory, setShowHistory] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const fetchEvents = async () => {
    setLoadingEvents(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_URL}/admin/events`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setEvents(await res.json());
    } finally { setLoadingEvents(false); }
  };

  const deleteEvent = async (id) => {
    if (!confirm('مطمئنی که میخوای این ایونت رو حذف کنی؟')) return;
    const token = localStorage.getItem('token');
    await fetch(`${API_URL}/admin/events/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    fetchEvents();
  };

  // ویرایش قالب: از داخل مودال «افزودن بخش جدید» (AddSectionModal) صدا زده می‌شود.
  // فیلدهای قالب را در بوم فعلی بارگذاری می‌کند تا با همان ابزار همیشگی
  // (افزودن/حذف/تنظیمات فیلد) ویرایش شوند، بعد با نام/توضیحات قابل تغییر دوباره ذخیره شود.
  const [editingTemplateId, setEditingTemplateId] = useState(null);

  const handleEditTemplate = (tpl) => {
    // Load the template's fields straight onto the canvas — the admin edits them
    // with the normal add/remove/settings tools, then hits "ذخیره قالب" (now showing
    // as "بروزرسانی قالب" while editingTemplateId is set) when actually done.
    setActiveFields(tpl.sections || []);
    setTemplateName(tpl.name);
    setTemplateDescription(tpl.description || '');
    setEditingTemplateId(tpl.id);
  };

  const cancelEditTemplate = () => {
    setEditingTemplateId(null);
    setTemplateName('');
    setTemplateDescription('');
  };

  // --- slug ---
  const handleSlugChange = (val) => {
    const clean = val.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
    setEventSlug(clean);
    setSlugError(clean.length < 2 ? 'حداقل ۲ کاراکتر' : '');
  };

  // --- drag from sidebar ---
  const onSidebarDragStart = (type) => setDraggingType(type);
  const onSidebarDragEnd = () => setDraggingType(null);

  // --- drop on canvas ---
  const onCanvasDrop = (e) => {
    e.preventDefault();
    if (draggingType) {
      const f = newField(draggingType);
      if (dragOverIndex !== null) {
        const next = [...activeFields];
        next.splice(dragOverIndex, 0, f);
        setActiveFields(next);
      } else {
        setActiveFields(prev => [...prev, f]);
      }
      setSelectedField(f.id);
      setSidebarTab('settings');
    } else if (draggingFieldId && dragOverIndex !== null) {
      const from = activeFields.findIndex(f => f.id === draggingFieldId);
      if (from !== -1 && from !== dragOverIndex) {
        const next = [...activeFields];
        const [moved] = next.splice(from, 1);
        next.splice(dragOverIndex, 0, moved);
        setActiveFields(next);
      }
    }
    setDraggingType(null);
    setDraggingFieldId(null);
    setDragOverIndex(null);
  };

  const onCanvasDragOver = (e, idx) => {
    e.preventDefault();
    setDragOverIndex(idx);
  };

  // --- field drag reorder ---
  const onFieldDragStart = (id) => setDraggingFieldId(id);
  const onFieldDragEnd = () => { setDraggingFieldId(null); setDragOverIndex(null); };

  // --- field ops ---
  const deleteField = (id) => {
    setActiveFields(prev => prev.filter(f => f.id !== id));
    if (selectedField === id) setSelectedField(null);
  };

  const duplicateField = (id) => {
    const idx = activeFields.findIndex(f => f.id === id);
    if (idx === -1) return;
    const copy = { ...fields[idx], id: fieldIdCounter++ };
    const next = [...activeFields];
    next.splice(idx + 1, 0, copy);
    setActiveFields(next);
    setSelectedField(copy.id);
  };

  const updateField = (id, patch) => {
    setActiveFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  };

  const selected = activeFields.find(f => f.id === selectedField);

  // --- preview renderer ---
  const renderFieldPreview = (f) => {
    switch (f.type) {
      case 'text': return <input className="ep-input" placeholder={f.placeholder || f.label} disabled />;
      case 'number': return <input className="ep-input" type="number" placeholder={f.placeholder || '۰'} disabled />;

      case 'phone': return <input className="ep-input" placeholder="۰۹۱۲۳۴۵۶۷۸۹" disabled />;
      case 'textarea': return <textarea className="ep-input ep-textarea" placeholder={f.placeholder || f.label} disabled />;
      case 'date': return <input className="ep-input" type="date" disabled />;
      case 'time': return <input className="ep-input" type="time" disabled />;
      case 'select': {
        const opts = f.options.filter(Boolean);
        return <select className="ep-input" disabled><option>{opts[0] || 'انتخاب کنید'}</option></select>;
      }
      case 'choice': {
        const opts = f.options.filter(Boolean);
        return (
          <div className="ep-choice-preview">
            {(opts.length ? opts : ['گزینه ۱', 'گزینه ۲']).map((opt, i) => (
              <span key={i} className="ep-choice-chip">{opt}</span>
            ))}
          </div>
        );
      }
      case 'email': return <input className="ep-input" type="email" placeholder={f.placeholder || 'example@mail.com'} disabled />;
      case 'signature': return <div className="ep-upload-box">✍️ امضای دیجیتال</div>;
      case 'checkbox': return <label className="ep-checkbox"><input type="checkbox" disabled /><span>{f.label}</span></label>;
      case 'rating': return <div className="ep-stars">{'⭐'.repeat(5)}</div>;
      case 'location': return <div className="ep-input ep-location-preview">📍 دریافت موقعیت</div>;
      case 'image': return <div className="ep-upload-box">🖼️ آپلود عکس</div>;
      case 'camera': return <div className="ep-upload-box">📷 عکس از دوربین</div>;
      case 'divider': return <hr className="ep-divider" />;
      case 'heading': return <h3 className="ep-heading">{f.label}</h3>;
      default: return <input className="ep-input" disabled />;
    }
  };

  const handleSaveEvent = async () => {
    setSaving(true);
    const token = localStorage.getItem('token');
    try {
      const cleanFields = fields.map(f =>
        ['select', 'choice'].includes(f.type) ? { ...f, options: f.options.filter(Boolean) } : f
      );
      const payload = {
        name: eventName,
        slug: eventSlug,
        fields: cleanFields,
        setup_pre_fields: setupPreFields,
        setup_post_fields: setupPostFields,
        mobile_columns: mobileColumns,
        desktop_columns: desktopColumns,
        enable_chat: enableChat,
        client_name: clientName,
        start_date: eventDates.length > 0 ? eventDates.map(d => d.format ? d.format('YYYY/MM/DD') : (typeof d === 'string' ? d : d.toString())).join(', ') : null,
        start_time: startTime,
        end_date: null, // We store all dates in start_date as a comma-separated string
        end_time: endTime,
        promoter_count: requiresPromoter ? promoterCount : 0,
        requires_setup: requiresSetup,
        setup_count: requiresSetup ? setupCount : 0,
        setup_date: requiresSetup && setupDate ? (setupDate.format ? setupDate.format('YYYY/MM/DD') : (typeof setupDate === 'string' ? setupDate : setupDate.toString())) : null,
        setup_time_in: requiresSetup ? setupTimeIn : null,
        setup_time_out: requiresSetup ? setupTimeOut : null,
        requires_collection: requiresCollection,
        collection_count: requiresCollection ? collectionCount : 0,
        collection_date: requiresCollection && collectionDate ? (collectionDate.format ? collectionDate.format('YYYY/MM/DD') : (typeof collectionDate === 'string' ? collectionDate : collectionDate.toString())) : null,
        collection_time_in: requiresCollection ? collectionTimeIn : null,
        collection_time_out: requiresCollection ? collectionTimeOut : null,
        requires_supervisor: requiresSupervisor,
        supervisor_count: requiresSupervisor ? supervisorCount : 0,
        requires_transport: requiresTransport,
        transport_count: requiresTransport ? transportCount : 0,
        requires_sampling: requiresSampling,
        sampling_count: requiresSampling ? samplingCount : 0,
        location: eventLocation,
        report_location: reportLocation,
        report_location_image: reportLocationImage,
        location_label: locationLabel,
        description: eventDescription,
        event_type: eventType,
        custom_times: useCustomTimes ? customTimes : null
      };

      const url = eventId ? `${API_URL}/admin/events/${eventId}` : `${API_URL}/admin/events`;
      const method = eventId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'خطا در ذخیره ایونت');
      }
      const saved = await res.json();
      
      // Redirect back to admin dashboard after successful save
      window.location.href = '/admin';
      
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      alert("لطفاً نام قالب را وارد کنید");
      return;
    }
    if (activeFields.length === 0) {
      alert("هیچ فیلدی برای ذخیره وجود ندارد");
      return;
    }

    setSavingTemplate(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        name: templateName.trim(),
        description: templateDescription.trim() || 'قالب سفارشی ساخته شده توسط ادمین',
        sections: activeFields
      };

      const isEdit = !!editingTemplateId;
      const res = await fetch(`${API_URL}/admin/templates${isEdit ? `/${editingTemplateId}` : ''}`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'خطا در ذخیره قالب');
      }

      alert(isEdit ? "قالب با موفقیت بروزرسانی شد!" : "قالب با موفقیت ذخیره شد!");
      setShowTemplateModal(false);
      setTemplateName('');
      setTemplateDescription('');
      setEditingTemplateId(null);
    } catch (e) {
      alert(e.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  const renderUnifiedHeader = () => {
    if (!renderHeader) return null;

    if (step === 1) {
      return renderHeader(null, null);
    }

    const customActions = (
      <div className="ep-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {editingTemplateId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, padding: '6px 12px', fontSize: '0.8rem', color: '#818cf8', fontWeight: 600 }}>
            <span>✏️ در حال ویرایش قالب: {templateName}</span>
            <button style={{ background: 'transparent', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
              onClick={cancelEditTemplate}>انصراف</button>
          </div>
        )}
        {saveSuccess && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: '6px 12px', fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
            <span>✅ ایونت ذخیره شد</span>
            <button style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
              onClick={() => window.open(saveSuccess, '_blank')}>مشاهده ایونت</button>
            <button style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}
              onClick={() => setSaveSuccess('')}>✕</button>
          </div>
        )}
        {saveError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '6px 12px', fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>
            <span>⚠️ {saveError}</span>
            <button style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}
              onClick={() => setSaveError('')}>✕</button>
          </div>
        )}

        {/* Back Button to Step 1 Settings */}
        <button
          onClick={() => setStep(1)}
          disabled={saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--bg-input, rgba(255,255,255,0.8))',
            border: '1px solid var(--border-color, #e5e7eb)',
            borderRadius: '12px',
            padding: '7px 14px',
            fontSize: '0.8rem',
            fontWeight: '600',
            color: 'var(--text-primary, #374151)',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
            transition: 'all 0.2s ease'
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>ویرایش مشخصات</span>
        </button>

        {/* Ultra Premium Save Event Button */}
        <button
          disabled={saving}
          onClick={handleSaveEvent}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: saving
              ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
              : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            padding: '8px 18px',
            fontSize: '0.85rem',
            fontWeight: '700',
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: saving
              ? 'none'
              : '0 4px 16px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: 'scale(1)',
            opacity: saving ? 0.7 : 1
          }}
          onMouseEnter={(e) => {
            if (!saving) {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.45), inset 0 1px 0 rgba(255,255,255,0.2)';
            }
          }}
          onMouseLeave={(e) => {
            if (!saving) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)';
            }
          }}
          onMouseDown={(e) => {
            if (!saving) {
              e.currentTarget.style.transform = 'scale(0.97)';
            }
          }}
          onMouseUp={(e) => {
            if (!saving) {
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
        >
          {saving ? (
            <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H16L21 8V19C21 20.1046 20.1046 21 19 21Z" />
              <path d="M17 21V13H7V21" />
              <path d="M7 3V8H15" />
            </svg>
          )}
          <span>{saving ? 'در حال ذخیره...' : 'ذخیره ایونت'}</span>
        </button>

        {/* Save Template Button */}
        <button
          onClick={() => {
            if (!editingTemplateId) { setTemplateName(''); setTemplateDescription(''); }
            setShowTemplateModal(true);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--bg-card, #1e1e1e)',
            border: '1px solid var(--border-color, #333)',
            borderRadius: '12px',
            padding: '8px 14px',
            fontSize: '0.8rem',
            fontWeight: '600',
            color: 'var(--text-primary, #fff)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          <span>{editingTemplateId ? 'بروزرسانی قالب' : 'ذخیره قالب'}</span>
        </button>
      </div>
    );

    return renderHeader(customActions, null);
  };

  return (
    <div className="ep-root" style={step === 2 ? { height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' } : {}}>
      {/* ===== HISTORY MODAL ===== */}
      {showHistory && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowHistory(false)}
          style={{ zIndex: 300 }}>
          <div className="modal-content" style={{ background: 'var(--card-bg, #141414)', border: '1px solid #222', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>📜 ایونتهای ساخته شده</h2>
              <button className="ep-back-btn" onClick={() => setShowHistory(false)}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: 16 }}>
              {loadingEvents ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>در حال بارگذاری...</div>
              ) : events.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💭</div>
                  <p>هیچ ایونتی هنوز نساختهای</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {events.map(ev => (
                    <div key={ev.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 4 }}>{ev.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#666', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span>🔗 /{ev.slug}</span>
                          <span>📱 {ev.mobile_columns}× 🖥️ {ev.desktop_columns}×</span>
                          <span>📌 {ev.fields?.length || 0} فیلد</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button className="ep-btn ep-btn-ghost" style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                          onClick={() => window.open(`${window.location.origin}/${ev.slug}`, '_blank')}>
                          🔗 باز کن
                        </button>
                        <button className="ep-btn ep-btn-ghost" style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                          onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/${ev.slug}`); }}>
                          📋 کپی
                        </button>
                        <button className="ep-btn ep-btn-danger" style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                          onClick={() => deleteEvent(ev.id)}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== TEMPLATE SAVE MODAL ===== */}
      {showTemplateModal && (
        <div className="modal-overlay" onClick={e => {
          if (e.target !== e.currentTarget) return;
          setShowTemplateModal(false);
          if (!editingTemplateId) { setTemplateName(''); setTemplateDescription(''); }
        }}
          style={{ zIndex: 400 }}>
          <div className="modal-content" style={{ background: 'var(--bg-secondary, #141414)', border: '1px solid var(--border-color, #222)', borderRadius: 20, width: '100%', maxWidth: 460, padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
              </div>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary, #fff)', fontSize: '1.05rem', fontWeight: 700 }}>{editingTemplateId ? 'ویرایش قالب' : 'ذخیره به عنوان قالب'}</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted, #888)' }}>{activeFields.length} فیلد {editingTemplateId ? 'در این قالب' : 'ذخیره می‌شود'}</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #aaa)', marginBottom: 6 }}>نام قالب *</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="مثال: فرم سمپلینگ ویژه"
                  autoFocus
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-color, #333)', background: 'var(--bg-input, #1a1a1a)', color: 'var(--text-primary, #fff)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #aaa)', marginBottom: 6 }}>توضیحات (اختیاری)</label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="کاربرد این قالب را توضیح دهید..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-color, #333)', background: 'var(--bg-input, #1a1a1a)', color: 'var(--text-primary, #fff)', fontSize: '0.85rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowTemplateModal(false);
                  if (!editingTemplateId) { setTemplateName(''); setTemplateDescription(''); }
                }}
                style={{ padding: '9px 18px', borderRadius: 10, background: 'var(--bg-input, #333)', color: 'var(--text-secondary, #aaa)', border: '1px solid var(--border-color, #444)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                لغو
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={savingTemplate}
                style={{ padding: '9px 20px', borderRadius: 10, background: savingTemplate ? '#6b7280' : 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', border: 'none', cursor: savingTemplate ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', gap: 8, alignItems: 'center', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}>
                {savingTemplate ? 'درحال ذخیره...' : (editingTemplateId ? '✓ بروزرسانی قالب' : '✓ ذخیره قالب')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="ep-layout-container fade-in" style={step === 2 ? { flex: 1, height: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } : {}}>
        {renderUnifiedHeader()}



        {/* ===== STEP 1: INFO ===== */}
        {step === 1 && (
          <div className="ep-step1-wrapper">
            <div className="ep-step1-premium-card">

              {/* ── Card Header ── */}
              <div className="ep-s1-header">
                <div className="ep-s1-icon-ring">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5A2.25 2.25 0 015.25 5.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                </div>
                <div>
                  <h2 className="ep-s1-title">ایونت جدید</h2>
                  <p className="ep-s1-sub">اطلاعات پایه رویداد را وارد کنید</p>
                </div>
              </div>

              {/* ── Section: اطلاعات اصلی ── */}
              <div className="ep-s1-section">
                <div className="ep-s1-section-label">
                  <span className="ep-s1-section-dot" />
                  اطلاعات اصلی
                </div>

                <div className="ep-s1-grid ep-s1-grid-3">
                  {/* Event Name */}
                  <div className="ep-s1-field">
                    <label className="ep-s1-label">
                      <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" /></svg>
                      نام ایونت <span className="ep-s1-req">*</span>
                    </label>
                    <input
                      className="ep-s1-input"
                      placeholder="e.g. spring-campaign"
                      dir="ltr"
                      value={eventName}
                      onChange={e => setEventName(e.target.value.replace(/[^a-zA-Z0-9\s-]/g, ''))}
                    />
                  </div>

                  {/* Client Name */}
                  <div className="ep-s1-field">
                    <label className="ep-s1-label">
                      <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                      کلاینت <span className="ep-s1-req">*</span>
                    </label>

                    {!isAddingNewClient ? (
                      <select
                        className="ep-s1-input ep-s1-select"
                        value={clientName}
                        onChange={e => {
                          if (e.target.value === '__NEW_CLIENT__') {
                            setIsAddingNewClient(true);
                          } else {
                            setClientName(e.target.value);
                          }
                        }}
                        dir="ltr"
                      >
                        <option value="">انتخاب کلاینت...</option>
                        {allClients.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        <option value="__NEW_CLIENT__">➕ افزودن کلاینت جدید...</option>
                      </select>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          className="ep-s1-input"
                          placeholder="نام کلاینت جدید..."
                          dir="ltr"
                          value={newClientName}
                          onChange={e => setNewClientName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAddNewClient()}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="ep-btn ep-btn-primary"
                          style={{ padding: '8px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                          onClick={handleAddNewClient}
                        >
                          افزودن
                        </button>
                        <button
                          type="button"
                          className="ep-btn ep-btn-ghost"
                          style={{ padding: '8px 10px', fontSize: '0.8rem' }}
                          onClick={() => { setIsAddingNewClient(false); setNewClientName(''); }}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Event URL */}
                  <div className="ep-s1-field">
                    <label className="ep-s1-label">
                      <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" /></svg>
                      آدرس URL <span className="ep-s1-req">*</span>
                    </label>
                    <div className="ep-s1-slug-row">
                      <span className="ep-s1-slug-prefix">{window.location.origin}/</span>
                      <input
                        className="ep-s1-input ep-s1-slug-input"
                        placeholder="event-slug"
                        value={eventSlug}
                        dir="ltr"
                        onChange={e => handleSlugChange(e.target.value)}
                      />
                    </div>
                    {slugError && <span className="ep-s1-error">{slugError}</span>}
                    {eventSlug && !slugError && (
                      <span className="ep-s1-slug-ok">✓ {window.location.origin}/{eventSlug}</span>
                    )}
                  </div>

                  {/* Location */}
                  <div className="ep-s1-field ep-s1-col-full">
                    <label className="ep-s1-label">
                      <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                      لوکیشن ایونت
                    </label>
                    <input
                      className="ep-s1-input"
                      placeholder="آدرس یا محل برگزاری ایونت..."
                      value={eventLocation}
                      onChange={e => setEventLocation(e.target.value)}
                    />
                  </div>

                  {/* Report Pin Location (used on the Mission Complete PDF) */}
                  <div className="ep-s1-field ep-s1-col-full">
                    <label className="ep-s1-label">
                      <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                      لوکیشن دقیق (برای گزارش PDF)
                    </label>
                    {reportLocationImage ? (
                      <div className="ep-s1-location-preview">
                        <img src={reportLocationImage} alt="لوکیشن پین‌شده" onClick={() => setLocationPickerOpen(true)} />
                        <div className="ep-s1-location-preview-actions">
                          <button type="button" onClick={() => setLocationPickerOpen(true)}>ویرایش لوکیشن</button>
                          <button type="button" className="danger" onClick={() => { setReportLocation(''); setReportLocationImage(''); }}>حذف</button>
                        </div>
                      </div>
                    ) : reportLocation ? (
                      // Point saved but its map image couldn't be generated — make
                      // that visible instead of looking like nothing was saved.
                      <div className="ep-s1-location-preview-actions">
                        <button type="button" onClick={() => setLocationPickerOpen(true)}>📍 لوکیشن ثبت شده (بدون تصویر نقشه) — ساخت دوباره تصویر</button>
                        <button type="button" className="danger" onClick={() => { setReportLocation(''); setReportLocationImage(''); }}>حذف</button>
                      </div>
                    ) : (
                      <button type="button" className="ep-s1-location-pick-btn" onClick={() => setLocationPickerOpen(true)}>
                        📍 انتخاب دقیق روی نقشه
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {locationPickerOpen && (
                <LocationPickerModal
                  initialLatLng={parseLatLngFromMapsUrl(reportLocation)}
                  initialLocationLabel={locationLabel}
                  token={localStorage.getItem('token')}
                  onLabelChange={setLocationLabel}
                  onClose={() => setLocationPickerOpen(false)}
                  onConfirm={({ report_location, report_location_image, location_label }) => {
                    setReportLocation(report_location);
                    setReportLocationImage(report_location_image);
                    if (location_label !== undefined) setLocationLabel(location_label);
                    setLocationPickerOpen(false);
                  }}
                />
              )}

              {/* ── Section: زمان‌بندی ── */}
              <div className="ep-s1-section">
                <div className="ep-s1-section-label">
                  <span className="ep-s1-section-dot" style={{ background: '#f59e0b' }} />
                  زمان‌بندی
                </div>
                <div className="ep-s1-grid">

                  {/* Event Dates */}
                  <div className="ep-s1-field ep-s1-col2">
                    <label className="ep-s1-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <div>
                        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                        تاریخ ایونت <span className="ep-s1-req">*</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>تعیین ساعت متفاوت</span>
                        <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px', margin: 0 }}>
                          <input 
                            type="checkbox" 
                            checked={useCustomTimes} 
                            onChange={e => setUseCustomTimes(e.target.checked)} 
                            style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                          />
                          <span style={{ 
                            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, 
                            backgroundColor: useCustomTimes ? '#10b981' : 'rgba(100,116,139,0.4)', 
                            transition: '.4s', borderRadius: '34px' 
                          }}>
                            <span style={{ 
                              position: 'absolute', height: '16px', width: '16px', 
                              left: useCustomTimes ? '18px' : '2px', bottom: '2px', 
                              backgroundColor: '#e2e8f0', transition: '.4s', borderRadius: '50%', 
                              boxShadow: '0 2px 4px rgba(0,0,0,0.3)' 
                            }}></span>
                          </span>
                        </label>
                      </div>
                    </label>
                    <DatePicker
                      multiple
                      calendar={persian}
                      locale={persian_fa}
                      value={eventDates}
                      onChange={(dates) => {
                        setEventDates(dates);
                        const newCustom = { ...customTimes };
                        dates.forEach(d => {
                          const ds = d.format ? d.format() : d;
                          if (!newCustom[ds]) newCustom[ds] = { start: '00:00', end: '00:00' };
                        });
                        setCustomTimes(newCustom);
                      }}
                      calendarPosition="bottom-right"
                      render={(value, openCalendar) => (
                        <div className="ep-s1-datepicker-trigger ep-s1-multi-date" onClick={openCalendar}>
                          <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16, color: '#6366f1', flexShrink: 0 }}><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                          <div className="ep-s1-date-chips-container">
                            {eventDates.length > 0 ? eventDates.map((date, i) => (
                              <span key={i} className="ep-s1-date-chip">{date.format ? date.format() : date}</span>
                            )) : <span className="ep-s1-placeholder">چند تاریخ انتخاب کنید...</span>}
                          </div>
                          {eventDates.length > 0 && <button type="button" className="ep-s1-date-clear" onClick={e => { e.stopPropagation(); setEventDates([]); }}>×</button>}
                        </div>
                      )}
                    />
                  </div>

                  {!useCustomTimes ? (
                    <>
                      {/* Start Time */}
                      <div className="ep-s1-field" style={{ marginTop: '10px' }}>
                        <label className="ep-s1-label">
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                          ساعت شروع
                        </label>
                        <div className="ep-s1-time-wrapper ep-s1-time-select-group">
                          <select
                            className="ep-s1-input ep-s1-select ep-s1-time-select"
                            value={parseHM(startTime).h}
                            onChange={e => setStartTime(`${e.target.value}:${parseHM(startTime).m}`)}
                          >
                            {HOURS_24.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                          <span className="ep-s1-time-colon">:</span>
                          <select
                            className="ep-s1-input ep-s1-select ep-s1-time-select"
                            value={parseHM(startTime).m}
                            onChange={e => setStartTime(`${parseHM(startTime).h}:${e.target.value}`)}
                          >
                            {MINUTES_15.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* End Time */}
                      <div className="ep-s1-field" style={{ marginTop: '10px' }}>
                        <label className="ep-s1-label">
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                          ساعت پایان
                        </label>
                        <div className="ep-s1-time-wrapper ep-s1-time-select-group">
                          <select
                            className="ep-s1-input ep-s1-select ep-s1-time-select"
                            value={parseHM(endTime).h}
                            onChange={e => setEndTime(`${e.target.value}:${parseHM(endTime).m}`)}
                          >
                            {HOURS_24.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                          <span className="ep-s1-time-colon">:</span>
                          <select
                            className="ep-s1-input ep-s1-select ep-s1-time-select"
                            value={parseHM(endTime).m}
                            onChange={e => setEndTime(`${parseHM(endTime).h}:${e.target.value}`)}
                          >
                            {MINUTES_15.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="ep-s1-col2 ep-custom-times-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#cbd5e1' }}>ساعت‌بندی مجزا برای هر روز:</h4>
                      {eventDates.length === 0 ? (
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>ابتدا تاریخ ایونت را انتخاب کنید.</p>
                      ) : (
                        eventDates.map((d, idx) => {
                          const dateStr = d.format ? d.format() : d;
                          const tStart = customTimes[dateStr]?.start || '00:00';
                          const tEnd = customTimes[dateStr]?.end || '00:00';
                          
                          return (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                              <div style={{ fontWeight: '600', color: '#e2e8f0', minWidth: '80px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16, color: '#6366f1' }}><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                                {dateStr}
                              </div>
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                                {/* Start Time */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>شروع:</span>
                                  <div className="ep-s1-time-select-group" style={{ display: 'flex', alignItems: 'center' }}>
                                    <select
                                      className="ep-s1-input ep-s1-select ep-s1-time-select"
                                      value={parseHM(tStart).h}
                                      onChange={e => {
                                        const newTimes = { ...customTimes };
                                        if (!newTimes[dateStr]) newTimes[dateStr] = { start: '00:00', end: '00:00' };
                                        newTimes[dateStr].start = `${e.target.value}:${parseHM(tStart).m}`;
                                        setCustomTimes(newTimes);
                                      }}
                                    >
                                      {HOURS_24.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <span className="ep-s1-time-colon">:</span>
                                    <select
                                      className="ep-s1-input ep-s1-select ep-s1-time-select"
                                      value={parseHM(tStart).m}
                                      onChange={e => {
                                        const newTimes = { ...customTimes };
                                        if (!newTimes[dateStr]) newTimes[dateStr] = { start: '00:00', end: '00:00' };
                                        newTimes[dateStr].start = `${parseHM(tStart).h}:${e.target.value}`;
                                        setCustomTimes(newTimes);
                                      }}
                                    >
                                      {MINUTES_15.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                  </div>
                                </div>
                                
                                {/* End Time */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>پایان:</span>
                                  <div className="ep-s1-time-select-group" style={{ display: 'flex', alignItems: 'center' }}>
                                    <select
                                      className="ep-s1-input ep-s1-select ep-s1-time-select"
                                      value={parseHM(tEnd).h}
                                      onChange={e => {
                                        const newTimes = { ...customTimes };
                                        if (!newTimes[dateStr]) newTimes[dateStr] = { start: '00:00', end: '00:00' };
                                        newTimes[dateStr].end = `${e.target.value}:${parseHM(tEnd).m}`;
                                        setCustomTimes(newTimes);
                                      }}
                                    >
                                      {HOURS_24.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <span className="ep-s1-time-colon">:</span>
                                    <select
                                      className="ep-s1-input ep-s1-select ep-s1-time-select"
                                      value={parseHM(tEnd).m}
                                      onChange={e => {
                                        const newTimes = { ...customTimes };
                                        if (!newTimes[dateStr]) newTimes[dateStr] = { start: '00:00', end: '00:00' };
                                        newTimes[dateStr].end = `${parseHM(tEnd).h}:${e.target.value}`;
                                        setCustomTimes(newTimes);
                                      }}
                                    >
                                      {MINUTES_15.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section: نیازمندی‌ها ── */}
              <div className="ep-s1-section">
                <div className="ep-s1-section-label">
                  <span className="ep-s1-section-dot" style={{ background: '#10b981' }} />
                  نیازمندی‌ها
                </div>
                <div className="ep-s1-grid ep-s1-grid-5">

                  {/* Promoters */}
                  <div className="ep-s1-field">
                    <div className="ep-s1-toggle-card" onClick={() => setRequiresPromoter(v => !v)}>
                      <div className="ep-s1-toggle-card-info">
                        <svg viewBox="0 0 20 20" fill="currentColor" style={{ color: requiresPromoter ? '#6366f1' : '#6b7280' }}><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 12.094A5.973 5.973 0 004 15v1H1v-1a3 3 0 013.75-2.906z" /></svg>
                        <div>
                          <div className="ep-s1-toggle-card-title">پروموترها</div>
                          <div className="ep-s1-toggle-card-sub">نیاز به پروموتر</div>
                        </div>
                      </div>
                      <div className={`ep-s1-toggle ${requiresPromoter ? 'on' : ''}`}>
                        <span className="ep-s1-toggle-knob" />
                      </div>
                    </div>
                    {requiresPromoter && (
                      <div className="ep-s1-counter-box mt-3 fade-in">
                        <label className="ep-s1-label">تعداد پروموتر</label>
                        <div className="ep-s1-counter">
                          <button type="button" className="ep-s1-counter-btn" onClick={() => setPromoterCount(c => Math.max(0, c - 1))}>
                            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                          </button>
                          <span className="ep-s1-counter-val">{promoterCount}</span>
                          <button type="button" className="ep-s1-counter-btn" onClick={() => setPromoterCount(c => c + 1)}>
                            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Supervisor */}
                  <div className="ep-s1-field">
                    <div className="ep-s1-toggle-card" onClick={() => setRequiresSupervisor(v => !v)}>
                      <div className="ep-s1-toggle-card-info">
                        <svg viewBox="0 0 20 20" fill="currentColor" style={{ color: requiresSupervisor ? '#6366f1' : '#6b7280' }}><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                        <div>
                          <div className="ep-s1-toggle-card-title">کاپیتان</div>
                          <div className="ep-s1-toggle-card-sub">نیاز به سرپرست / ناظر</div>
                        </div>
                      </div>
                      <div className={`ep-s1-toggle ${requiresSupervisor ? 'on' : ''}`}>
                        <span className="ep-s1-toggle-knob" />
                      </div>
                    </div>
                    {requiresSupervisor && (
                      <div className="ep-s1-counter-box mt-3 fade-in">
                        <label className="ep-s1-label">تعداد کاپیتان</label>
                        <div className="ep-s1-counter">
                          <button type="button" className="ep-s1-counter-btn" onClick={() => setSupervisorCount(c => Math.max(0, c - 1))}>
                            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                          </button>
                          <span className="ep-s1-counter-val">{supervisorCount}</span>
                          <button type="button" className="ep-s1-counter-btn" onClick={() => setSupervisorCount(c => c + 1)}>
                            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Setup & Collection */}
                  <div className="ep-s1-field">
                    <div className="ep-s1-toggle-card" onClick={() => {
                      setRequiresSetup(v => {
                        const next = !v;
                        if (!next) setRequiresCollection(false);
                        else setRequiresCollection(collectionCount > 0);
                        return next;
                      });
                    }}>
                      <div className="ep-s1-toggle-card-info">
                        <svg viewBox="0 0 20 20" fill="currentColor" style={{ color: requiresSetup ? '#6366f1' : '#6b7280' }}><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>
                        <div>
                          <div className="ep-s1-toggle-card-title">ست‌آپ / کالکشن</div>
                          <div className="ep-s1-toggle-card-sub">ست‌آپ قبل / کالکشن بعد ایونت</div>
                        </div>
                      </div>
                      <div className={`ep-s1-toggle ${requiresSetup ? 'on' : ''}`}>
                        <span className="ep-s1-toggle-knob" />
                      </div>
                    </div>

                    {requiresSetup && (
                      <div className="fade-in mt-2" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          
                          <div className="ep-s1-counter-box" style={{ marginTop: 0 }}>
                            <label className="ep-s1-label">تعداد ست‌آپ (قبل)</label>
                            <div className="ep-s1-counter">
                              <button type="button" className="ep-s1-counter-btn" onClick={() => setSetupCount(c => Math.max(0, c - 1))}>
                                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                              </button>
                              <span className="ep-s1-counter-val">{setupCount}</span>
                              <button type="button" className="ep-s1-counter-btn" onClick={() => setSetupCount(c => c + 1)}>
                                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                              </button>
                            </div>
                          </div>

                          {setupCount > 0 && (
                            <>
                              <div className="ep-s1-row fade-in">
                                <div className="ep-s1-col">
                                  <label className="ep-s1-label">تاریخ ست‌آپ</label>
                                  <DatePicker
                                    value={setupDate}
                                    onChange={setSetupDate}
                                    calendar={persian}
                                    locale={persian_fa}
                                    calendarPosition="bottom-right"
                                    render={(value, openCalendar) => (
                                      <div className="ep-s1-datepicker-trigger ep-s1-multi-date" onClick={openCalendar}>
                                        <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16, color: '#6366f1', flexShrink: 0 }}><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                                        <div className="ep-s1-date-chips-container">
                                          {setupDate ? (
                                            <span className="ep-s1-date-chip">{setupDate.format ? setupDate.format() : setupDate}</span>
                                          ) : (
                                            <span className="ep-s1-placeholder">انتخاب تاریخ...</span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  />
                                </div>
                              </div>

                              <div className="ep-s1-row fade-in">
                                <div className="ep-s1-col">
                                  <label className="ep-s1-label">ساعت ورود</label>
                                  <div className="ep-s1-time-wrapper ep-s1-time-select-group">
                                    <select className="ep-s1-input ep-s1-select ep-s1-time-select" value={parseHM(setupTimeIn).h} onChange={e => setSetupTimeIn(`${e.target.value}:${parseHM(setupTimeIn).m}`)}>
                                      {HOURS_24.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <span className="ep-s1-time-colon">:</span>
                                    <select className="ep-s1-input ep-s1-select ep-s1-time-select" value={parseHM(setupTimeIn).m} onChange={e => setSetupTimeIn(`${parseHM(setupTimeIn).h}:${e.target.value}`)}>
                                      {MINUTES_15.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                  </div>
                                </div>

                              </div>
                            </>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div className="ep-s1-counter-box" style={{ marginTop: 0 }}>
                            <label className="ep-s1-label">تعداد کالکشن (بعد)</label>
                            <div className="ep-s1-counter">
                              <button type="button" className="ep-s1-counter-btn" onClick={() => setCollectionCount(c => {
                                const next = Math.max(0, c - 1);
                                setRequiresCollection(next > 0);
                                return next;
                              })}>
                                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                              </button>
                              <span className="ep-s1-counter-val">{collectionCount}</span>
                              <button type="button" className="ep-s1-counter-btn" onClick={() => setCollectionCount(c => {
                                const next = c + 1;
                                setRequiresCollection(true);
                                return next;
                              })}>
                                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                              </button>
                            </div>
                          </div>
                          
                          {requiresCollection && (
                            <>
                              <div className="ep-s1-row fade-in">
                                <div className="ep-s1-col">
                                  <label className="ep-s1-label">تاریخ کالکشن</label>
                                  <DatePicker
                                    value={collectionDate}
                                    onChange={setCollectionDate}
                                    calendar={persian}
                                    locale={persian_fa}
                                    calendarPosition="bottom-right"
                                    render={(value, openCalendar) => (
                                      <div className="ep-s1-datepicker-trigger ep-s1-multi-date" onClick={openCalendar}>
                                        <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16, color: '#6366f1', flexShrink: 0 }}><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                                        <div className="ep-s1-date-chips-container">
                                          {collectionDate ? (
                                            <span className="ep-s1-date-chip">{collectionDate.format ? collectionDate.format() : collectionDate}</span>
                                          ) : (
                                            <span className="ep-s1-placeholder">انتخاب تاریخ...</span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  />
                                </div>
                              </div>

                              <div className="ep-s1-row fade-in">
                                <div className="ep-s1-col">
                                  <label className="ep-s1-label">ساعت ورود</label>
                                  <div className="ep-s1-time-wrapper ep-s1-time-select-group">
                                    <select className="ep-s1-input ep-s1-select ep-s1-time-select" value={parseHM(collectionTimeIn).h} onChange={e => setCollectionTimeIn(`${e.target.value}:${parseHM(collectionTimeIn).m}`)}>
                                      {HOURS_24.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <span className="ep-s1-time-colon">:</span>
                                    <select className="ep-s1-input ep-s1-select ep-s1-time-select" value={parseHM(collectionTimeIn).m} onChange={e => setCollectionTimeIn(`${parseHM(collectionTimeIn).h}:${e.target.value}`)}>
                                      {MINUTES_15.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                  </div>
                                </div>

                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Transport */}
                  <div className="ep-s1-field">
                    <div className="ep-s1-toggle-card" onClick={() => setRequiresTransport(v => !v)}>
                      <div className="ep-s1-toggle-card-info">
                        <svg viewBox="0 0 20 20" fill="currentColor" style={{ color: requiresTransport ? '#6366f1' : '#6b7280' }}><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" /></svg>
                        <div>
                          <div className="ep-s1-toggle-card-title">حمل و نقل</div>
                          <div className="ep-s1-toggle-card-sub">ایاب و ذهاب</div>
                        </div>
                      </div>
                      <div className={`ep-s1-toggle ${requiresTransport ? 'on' : ''}`}>
                        <span className="ep-s1-toggle-knob" />
                      </div>
                    </div>
                    {requiresTransport && (
                      <div className="ep-s1-counter-box mt-3 fade-in">
                        <label className="ep-s1-label">تعداد وسیله نقلیه</label>
                        <div className="ep-s1-counter">
                          <button type="button" className="ep-s1-counter-btn" onClick={() => setTransportCount(c => Math.max(0, c - 1))}>
                            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                          </button>
                          <span className="ep-s1-counter-val">{transportCount}</span>
                          <button type="button" className="ep-s1-counter-btn" onClick={() => setTransportCount(c => c + 1)}>
                            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sampling */}
                  <div className="ep-s1-field">
                    <div className="ep-s1-toggle-card" onClick={() => setRequiresSampling(v => !v)}>
                      <div className="ep-s1-toggle-card-info">
                        <svg viewBox="0 0 20 20" fill="currentColor" style={{ color: requiresSampling ? '#6366f1' : '#6b7280' }}><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" /><path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                        <div>
                          <div className="ep-s1-toggle-card-title">سمپلینگ محصول</div>
                          <div className="ep-s1-toggle-card-sub">توزیع نمونه</div>
                        </div>
                      </div>
                      <div className={`ep-s1-toggle ${requiresSampling ? 'on' : ''}`}>
                        <span className="ep-s1-toggle-knob" />
                      </div>
                    </div>
                    {requiresSampling && (
                      <div className="ep-s1-counter-box mt-3 fade-in">
                        <label className="ep-s1-label">تعداد نمونه محصول</label>
                        <input
                          type="number"
                          min="0"
                          className="ep-s1-input"
                          placeholder="مثلا 2000"
                          value={samplingCount}
                          onChange={e => setSamplingCount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                        />
                      </div>
                    )}
                  </div>

                </div>
              </div>


              {/* ── Section: توضیحات ── */}
              <div className="ep-s1-section">
                <div className="ep-s1-section-label">
                  <span className="ep-s1-section-dot" style={{ background: '#06b6d4' }} />
                  توضیحات (اختیاری)
                </div>
                <textarea
                  className="ep-s1-input ep-s1-textarea"
                  placeholder="توضیحات اضافی درباره ایونت..."
                  rows={3}
                  value={eventDescription}
                  onChange={e => setEventDescription(e.target.value)}
                />
              </div>

              {/* ── FOOTER ── */}
              <div className="ep-s1-footer">
                <button type="button" className="ep-s1-cancel-btn" onClick={() => navigate('/admin')}>
                  انصراف
                </button>
                <button
                  className="ep-s1-next-btn"
                  disabled={!eventName || !eventSlug || !!slugError || !clientName}
                  onClick={goNext}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                  <span>ادامه — ساخت فرم</span>
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ===== STEP 2: BUILDER ===== */}
        {step === 2 && (
          <div className="flex-1 w-full h-full overflow-hidden p-2 md:p-3">
            <SectionBuilder
              activeFields={activeFields}
              setActiveFields={setActiveFields}
              eventId={eventId}
              onEditTemplate={handleEditTemplate}
            />
          </div>
        )}
      </div>
    </div>
  );
}
