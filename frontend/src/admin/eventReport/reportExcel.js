import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { fmtJalali, toFa, ratingOf, ROLE_LABEL, ageRangeText, daysWithPeople, uniquePeople, safeFileName } from './reportUtils';

const PURPLE = 'FF3B2D4F';
const YELLOW = 'FFF5C118';
const SOFT = 'FFF6F4FA';
const LINE = 'FFE4E0EC';
const FONT = 'Vazirmatn';

const border = { top: { style: 'thin', color: { argb: LINE } }, bottom: { style: 'thin', color: { argb: LINE } }, left: { style: 'thin', color: { argb: LINE } }, right: { style: 'thin', color: { argb: LINE } } };
const num = (v) => (v === '' || v === null || v === undefined ? '—' : Number(v));

export async function exportReportExcel(form) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VU Team';
  wb.created = new Date();
  const days = daysWithPeople(form);
  const rating = ratingOf(form.rating);

  // ── Sheet 1: summary ──
  const ws = wb.addWorksheet('گزارش ایونت', { views: [{ rightToLeft: true, showGridLines: false }] });
  ws.columns = [{ width: 30 }, { width: 22 }, { width: 22 }, { width: 22 }];

  ws.mergeCells('A1:D1');
  const t = ws.getCell('A1');
  t.value = `گزارش ایونت — ${form.name}`;
  t.font = { name: FONT, size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;
  ws.mergeCells('A2:D2');
  const st = ws.getCell('A2');
  st.value = [form.client_name, form.location].filter(Boolean).join('  •  ');
  st.font = { name: FONT, size: 11, color: { argb: PURPLE } };
  st.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
  st.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 22;

  let r = 4;
  const section = (title) => {
    ws.mergeCells(r, 1, r, 4);
    const c = ws.getCell(r, 1);
    c.value = title;
    c.font = { name: FONT, size: 12, bold: true, color: { argb: PURPLE } };
    c.border = { bottom: { style: 'medium', color: { argb: YELLOW } } };
    ws.getRow(r).height = 22;
    r += 1;
  };
  const kv = (label, value, wrap = false) => {
    ws.mergeCells(r, 2, r, 4);
    const a = ws.getCell(r, 1);
    const b = ws.getCell(r, 2);
    a.value = label;
    b.value = value === '' || value === null || value === undefined ? '—' : value;
    a.font = { name: FONT, size: 10, bold: true, color: { argb: 'FF5B5470' } };
    b.font = { name: FONT, size: 11, color: { argb: 'FF1F1A2B' } };
    a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
    a.border = border; b.border = border;
    a.alignment = { vertical: 'top', horizontal: 'right' };
    b.alignment = { vertical: 'top', horizontal: 'right', wrapText: true };
    if (wrap && typeof value === 'string') {
      const lines = value.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 70)), 0);
      ws.getRow(r).height = Math.min(400, Math.max(20, lines * 16));
    }
    r += 1;
  };

  section('اطلاعات کلی');
  kv('نام ایونت', form.name);
  kv('کلاینت', form.client_name);
  kv('محل برگزاری', form.location);
  kv('تعداد روزهای برگزاری', days.length);
  r += 1;

  section('روزها و ساعت برگزاری');
  days.forEach((d, i) => {
    const j = fmtJalali(d.date);
    kv(`روز ${toFa(i + 1)} — ${j.weekday} ${j.full}`, d.start || d.end ? `${d.start || '—'} تا ${d.end || '—'}` : '—');
  });
  r += 1;

  section('محصول و حمل‌ونقل');
  kv('تعداد محصول ارسال‌شده', num(form.products_sent));
  kv('تعداد محصول سمپل‌شده', num(form.sampled));
  kv('ماشین ارسال وسایل', num(form.cars_send));
  kv('ماشین برگشت اقلام', num(form.cars_return));
  kv('تعداد کل پروموترها (نفر)', uniquePeople(form));
  r += 1;

  section('ارزیابی ایونت');
  kv('نحوه برگزاری', rating ? rating.label : '');
  kv('بازه سنی مخاطبین', ageRangeText(form.age_from, form.age_to));
  kv('تخمین تعداد مخاطبین', num(form.audience_estimate));
  kv('مخاطب هدف', form.audience_fit, true);
  kv('مشکلات پیش‌آمده', form.problems, true);
  kv('موارد پیش‌آمده در ایونت', form.incidents, true);
  kv('گزارش کلی', form.summary, true);

  // ── Sheet 2: promoters ──
  const wp = wb.addWorksheet('پروموترها', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  wp.columns = [
    { header: 'روز', key: 'n', width: 8 },
    { header: 'تاریخ', key: 'date', width: 22 },
    { header: 'روز هفته', key: 'wd', width: 14 },
    { header: 'ساعت', key: 'time', width: 18 },
    { header: 'نام', key: 'name', width: 28 },
    { header: 'نقش', key: 'role', width: 14 },
  ];
  days.forEach((d, i) => {
    const j = fmtJalali(d.date);
    const time = d.start || d.end ? `${d.start || '—'} تا ${d.end || '—'}` : '';
    (d.people.length ? d.people : [{ name: '—', role: '' }]).forEach(p => {
      wp.addRow({ n: i + 1, date: j.full, wd: j.weekday, time, name: p.name, role: ROLE_LABEL[p.role] || p.role || '' });
    });
  });
  styleTable(wp);

  // ── Sheet 3: returned items ──
  const wi = wb.addWorksheet('وسایل برگشتی', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  wi.columns = [
    { header: 'ردیف', key: 'n', width: 8 },
    { header: 'وسیله', key: 'name', width: 34 },
    { header: 'تعداد', key: 'qty', width: 12 },
  ];
  form.returned_items.filter(it => it.name.trim()).forEach((it, i) => wi.addRow({ n: i + 1, name: it.name, qty: it.qty === '' ? '' : Number(it.qty) }));
  styleTable(wi);

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `VU_Event_Report_${safeFileName(form.name)}.xlsx`);
}

function styleTable(ws) {
  ws.eachRow((row, i) => {
    row.eachCell({ includeEmpty: true }, c => {
      c.border = border;
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.font = { name: FONT, size: 10.5, bold: i === 1, color: { argb: i === 1 ? 'FFFFFFFF' : 'FF1F1A2B' } };
      if (i === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } };
      else if (i % 2 === 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
    });
    row.height = i === 1 ? 24 : 20;
  });
}
