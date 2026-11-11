import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, FileSpreadsheet, FileText, Loader2, Download, Image as ImageIcon } from 'lucide-react';
import { MEHRAM_CITIES } from './mehramData';
import { buildMehramData, EXPORT_ISSUES } from './mehramReportData';
import { fa, fmtDate, DAY, dayStart } from './mehramVisits';
import './mehramExport.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Export dialog of the reports page for a Mehram event. The reports page filters
 * (day, promoter, search) are already applied to `submissions`; this dialog adds the
 * city / issue filters and the format.
 */
const MehramExportModal = ({ open, onClose, field, submissions, getPromoterName, event, clientName, baseFilterLines, clientView, token }) => {
  const [format, setFormat] = useState('excel');
  const [city, setCity] = useState('all');
  const [issue, setIssue] = useState('');
  const [photos, setPhotos] = useState(true);
  const [busy, setBusy] = useState('');
  const [plans, setPlans] = useState([]);

  const base = useMemo(() => (open ? buildMehramData({ field, submissions, getPromoterName, city, issue }) : null), [open, field, submissions, getPromoterName, city, issue]);

  // Daily plan rows covering the exported period (admin accounts only).
  useEffect(() => {
    if (!open || clientView || !base?.totals.from) { setPlans([]); return; }
    const start = dayStart(base.totals.from); const end = dayStart(base.totals.to) + DAY - 1;
    axios.get(`${API_URL}/admin/mehram/day-plans?start=${start}&end=${end}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setPlans(res.data || [])).catch(() => setPlans([]));
  }, [open, clientView, token, base?.totals.from, base?.totals.to]);

  const data = useMemo(() => (open ? buildMehramData({ field, submissions, getPromoterName, city, issue, dayPlans: plans }) : null), [open, field, submissions, getPromoterName, city, issue, plans]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open || !data) return null;
  const filterLines = [
    ...baseFilterLines,
    `شهر: ${city === 'all' ? 'همه' : city}`,
    ...(issue ? [EXPORT_ISSUES[issue]] : []),
  ];
  const t = data.totals;

  const run = async () => {
    if (!data.visits.length) return toast.error('بازدیدی با این فیلترها وجود ندارد');
    setBusy('در حال آماده‌سازی...');
    try {
      if (format === 'excel') {
        const { exportMehramReportExcel } = await import('./mehramReportExcel');
        await exportMehramReportExcel({ data, event, clientName, filterLines, clientView, hasPlans: plans.length > 0 });
      } else {
        const { exportMehramReportPdf } = await import('./mehramReportPdf');
        await exportMehramReportPdf({ data, event, clientName, filterLines, clientView, includePhotos: photos, onProgress: setBusy });
      }
      toast.success(format === 'excel' ? 'فایل اکسل ساخته شد' : 'فایل PDF ساخته شد');
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('خطا در ساخت فایل خروجی');
    } finally {
      setBusy('');
    }
  };

  return createPortal(
    <div className="mex-backdrop" onClick={() => !busy && onClose()} role="presentation">
      <div className="mex" dir="rtl" role="dialog" aria-modal="true" aria-label="خروجی گزارش مهرام" onClick={(e) => e.stopPropagation()}>
        <header>
          <div><h3>خروجی گزارش سوپرمارکت‌ها</h3><small>{baseFilterLines.join(' · ')}</small></div>
          <button type="button" onClick={onClose} disabled={!!busy} aria-label="بستن"><X size={18} /></button>
        </header>

        <div className="mex-formats" role="radiogroup" aria-label="فرمت خروجی">
          <button type="button" role="radio" aria-checked={format === 'excel'} className={format === 'excel' ? 'on excel' : ''} onClick={() => setFormat('excel')}>
            <FileSpreadsheet size={22} /><b>اکسل</b><small>{clientView ? 'خلاصه، بازدیدها، پروموترها، کمبود محصول' : 'خلاصه، بازدیدها، مسیر روزانه، پروموترها، کمبود محصول، برنامه'}</small>
          </button>
          <button type="button" role="radio" aria-checked={format === 'pdf'} className={format === 'pdf' ? 'on pdf' : ''} onClick={() => setFormat('pdf')}>
            <FileText size={22} /><b>PDF</b><small>گزارش مصور با نمودار، مسیر پروموترها و عکس‌ها</small>
          </button>
        </div>

        <div className="mex-fields">
          <label>شهر
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="all">همه‌ی شهرها</option>
              {MEHRAM_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>نوع بازدیدها
            <select value={issue} onChange={(e) => setIssue(e.target.value)}>
              {Object.entries(EXPORT_ISSUES).filter(([k]) => !clientView || !['far', 'noGeo'].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          {format === 'pdf' && (
            <label className="mex-check"><input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} />
              <ImageIcon size={15} /> عکس‌های بازدید در PDF باشد <small>(ساخت فایل کمی طول می‌کشد)</small></label>
          )}
        </div>

        <div className="mex-preview">
          <span><b>{fa(t.visits)}</b> بازدید</span><span><b>{fa(t.stores)}</b> فروشگاه</span><span><b>{fa(t.promoters)}</b> پروموتر</span><span><b>{fa(t.days)}</b> روز</span>
          {t.from && <small>{fmtDate(t.from)} تا {fmtDate(t.to)}</small>}
        </div>
        <p className="mex-hint">روز، پروموتر و جستجو همان فیلترهایی هستند که در صفحه‌ی گزارش‌ها انتخاب کرده‌اید. برای خروجی یک روز، همان روز را در نوار بالای صفحه انتخاب کنید.</p>

        <footer>
          <button type="button" className="ghost" onClick={onClose} disabled={!!busy}>انصراف</button>
          <button type="button" className="go" onClick={run} disabled={!!busy || !t.visits}>
            {busy ? <><Loader2 size={16} className="mex-spin" /> {busy}</> : <><Download size={16} /> دریافت {format === 'excel' ? 'اکسل' : 'PDF'}</>}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
};

export default MehramExportModal;
