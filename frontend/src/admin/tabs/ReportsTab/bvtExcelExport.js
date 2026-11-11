import ExcelJS from 'exceljs';

/*
 * BVT Excel export — the same data the BVT PDF shows (event header, operation
 * summary, accepted/rejected demographics, sampled products, rejection
 * reasons, itemized handouts, map points) plus everything the PDF leaves out
 * (rejected entries in full, manual notes, tar/nicotine, location accuracy,
 * per-promoter and per-day breakdowns, the daily sampling-count form).
 *
 * One workbook, one concern per sheet, every table with a frozen header and
 * autofilter so it can be sorted/pivoted directly.
 */

const FONT = 'Tahoma';
const C = {
  navy: 'FF0F172A',
  slate: 'FF334155',
  muted: 'FF64748B',
  sky: 'FF0EA5E9',
  skyLight: 'FFE0F2FE',
  green: 'FF059669',
  greenLight: 'FFD1FAE5',
  red: 'FFDC2626',
  redLight: 'FFFEE2E2',
  amber: 'FFB45309',
  amberLight: 'FFFEF3C7',
  zebra: 'FFF8FAFC',
  border: 'FFE2E8F0',
  white: 'FFFFFFFF',
  totalBg: 'FFF1F5F9',
};

const LOCATION_ERRORS = {
  denied: 'دسترسی موقعیت رد شد',
  unavailable: 'موقعیت در دسترس نبود',
  unsupported: 'مرورگر پشتیبانی نمی‌کند',
  low_accuracy: 'دقت پایین GPS',
  pending: 'دریافت نشد (برنامه قبل از دریافت بسته شد)',
};

const AGE_KEYS = ['18-30', '+30'];
const GENDER_KEYS = ['مرد', 'زن'];

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const font = (o = {}) => ({ name: FONT, size: 10, color: { argb: C.slate }, ...o });
const thinBorder = () => {
  const side = { style: 'thin', color: { argb: C.border } };
  return { top: side, bottom: side, left: side, right: side };
};
const pct = (part, whole) => (whole > 0 ? part / whole : 0);

const tehranDateFa = (ms) => new Date(ms).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
const tehranWeekdayFa = (ms) => new Date(ms).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran', weekday: 'long' });
const tehranTimeFa = (ms) => new Date(ms).toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' });
// Sortable day key (YYYY-MM-DD, Tehran local)
const tehranDayKey = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });

const parseLatLng = (url) => {
  const m = String(url || '').match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
};

const fmtMg = (v) => (v === null || v === undefined || v === '' ? '' : Number(v));

/* ───────────── sheet-building helpers ───────────── */

// Dark title band across `cols` columns + light meta lines under it.
function writeBanner(ws, cols, title, metaLines = []) {
  const last = ws.getColumn(cols).letter;
  ws.mergeCells(`A1:${last}1`);
  const t = ws.getCell('A1');
  t.value = title;
  t.font = font({ size: 16, bold: true, color: { argb: C.white } });
  t.fill = fill(C.navy);
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 38;

  ws.mergeCells(`A2:${last}2`);
  const accent = ws.getCell('A2');
  accent.fill = fill(C.sky);
  ws.getRow(2).height = 4;

  metaLines.forEach((line) => {
    const r = ws.addRow([line]);
    ws.mergeCells(`A${r.number}:${last}${r.number}`);
    r.getCell(1).font = font({ color: { argb: C.muted } });
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    r.height = 20;
  });
  ws.addRow([]);
}

function writeSectionTitle(ws, cols, text) {
  const r = ws.addRow([text]);
  const last = ws.getColumn(cols).letter;
  ws.mergeCells(`A${r.number}:${last}${r.number}`);
  const c = r.getCell(1);
  c.font = font({ size: 12, bold: true, color: { argb: C.navy } });
  c.fill = fill(C.skyLight);
  c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  c.border = { right: { style: 'thick', color: { argb: C.sky } } };
  r.height = 24;
  return r;
}

function styleHeader(row) {
  row.height = 30;
  row.eachCell((cell) => {
    cell.font = font({ bold: true, color: { argb: C.white } });
    cell.fill = fill(C.navy);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });
}

/**
 * Appends a table. `columns`: [{ header, width?, numFmt?, align? }].
 * Returns { headerRow, firstRow, lastRow } row numbers.
 */
function writeTable(ws, columns, rows, { totals = null, zebra = true, rowStyle } = {}) {
  const headerRow = ws.addRow(columns.map((c) => c.header));
  styleHeader(headerRow);
  const firstRow = headerRow.number + 1;

  rows.forEach((vals, i) => {
    const r = ws.addRow(vals);
    r.height = 20;
    columns.forEach((col, ci) => {
      const cell = r.getCell(ci + 1);
      cell.font = font();
      cell.border = thinBorder();
      cell.alignment = { horizontal: col.align || 'center', vertical: 'middle', wrapText: !!col.wrap };
      if (col.numFmt) cell.numFmt = col.numFmt;
      if (zebra && i % 2 === 1) cell.fill = fill(C.zebra);
    });
    if (rowStyle) rowStyle(r, i);
  });

  const lastRow = firstRow + rows.length - 1;

  if (totals && rows.length > 0) {
    const r = ws.addRow(totals.map((t, ci) => {
      if (t === 'SUM') {
        const L = ws.getColumn(ci + 1).letter;
        return { formula: `SUM(${L}${firstRow}:${L}${lastRow})` };
      }
      return t;
    }));
    r.height = 22;
    columns.forEach((col, ci) => {
      const cell = r.getCell(ci + 1);
      cell.font = font({ bold: true, color: { argb: C.navy } });
      cell.fill = fill(C.totalBg);
      cell.border = { ...thinBorder(), top: { style: 'medium', color: { argb: C.navy } } };
      cell.alignment = { horizontal: col.align || 'center', vertical: 'middle' };
      if (col.numFmt) cell.numFmt = col.numFmt;
    });
  }
  return { headerRow: headerRow.number, firstRow, lastRow };
}

function setWidths(ws, widths) {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

// Single-table sheet: banner + table, header frozen, autofilter on.
function tableSheet(wb, name, title, metaLines, columns, rows, opts = {}) {
  const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true }], properties: { tabColor: { argb: opts.tab || C.sky } } });
  setWidths(ws, columns.map((c) => c.width || 16));
  writeBanner(ws, columns.length, title, metaLines);
  const { headerRow, lastRow } = writeTable(ws, columns, rows, opts);
  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: headerRow, showGridLines: false }];
  if (rows.length) {
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: columns.length } };
  }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  return ws;
}

/* ───────────── data collection ───────────── */

function collectEntries({ submissions, bvtField, getPromoterName, resolveProduct }) {
  const entries = [];
  submissions.forEach((s) => {
    const hist = s.data?.[`${bvtField.id}_history`] || [];
    const promoter = getPromoterName(s);
    hist.forEach((h) => {
      const rejected = h.status === 'rejected';
      const product = resolveProduct(h);
      const coords = parseLatLng(h.location);
      entries.push({
        raw: h,
        promoter,
        rejected,
        manual: !!h.manual,
        time: Number(h.time) || null,
        gender: h.gender || 'نامشخص',
        age: h.ageRange || 'نامشخص',
        productKey: product?.id || h.recommendedName || 'نامشخص',
        productName: product?.name || h.recommendedName || 'نامشخص',
        product,
        // Manual entries keep the promoter's free-typed note in targetName
        target: h.manual ? '' : (h.targetName || 'نامشخص'),
        note: h.note || (h.manual ? (h.targetName || '') : ''),
        overridden: !!h.overridden,
        suggestedName: h.suggestedName || '',
        reason: rejected ? (h.rejectionReason || 'نامشخص') : '',
        location: h.location || '',
        coords,
      });
    });
  });
  entries.sort((a, b) => (a.time || 0) - (b.time || 0));
  return entries;
}

function clusterPoints(entries) {
  const pts = entries.filter((e) => e.coords).map((e) => ({ ...e.coords, e }));
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dist = (a, b) => {
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const used = new Array(pts.length).fill(false);
  const clusters = [];
  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue;
    const group = [pts[i]];
    used[i] = true;
    for (let j = i + 1; j < pts.length; j++) {
      if (!used[j] && dist(pts[i], pts[j]) <= 20) { group.push(pts[j]); used[j] = true; }
    }
    clusters.push({
      lat: group.reduce((s, p) => s + p.lat, 0) / group.length,
      lng: group.reduce((s, p) => s + p.lng, 0) / group.length,
      accepted: group.filter((p) => !p.e.rejected).length,
      rejected: group.filter((p) => p.e.rejected).length,
      promoters: [...new Set(group.map((p) => p.e.promoter))].join('، '),
      first: Math.min(...group.map((p) => p.e.time || Infinity)),
      last: Math.max(...group.map((p) => p.e.time || 0)),
    });
  }
  return clusters.sort((a, b) => (b.accepted + b.rejected) - (a.accepted + a.rejected));
}

/* ───────────── main ───────────── */

export async function buildBvtWorkbook({
  event,
  clientName,
  dateRangeFa,
  daysCount,
  filtersText,
  submissions,
  bvtField,
  samplingField,
  samplingProducts,
  activeProducts,
  getPromoterName,
  resolveProduct,
}) {
  const entries = collectEntries({ submissions, bvtField, getPromoterName, resolveProduct });
  const accepted = entries.filter((e) => !e.rejected);
  const rejected = entries.filter((e) => e.rejected);
  const total = entries.length;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'VU Event Platform';
  wb.created = new Date();

  const eventName = event?.name || '';
  const exportedAt = new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'long', timeStyle: 'short' });
  const meta = [
    `کلاینت: ${clientName || '—'}   |   تاریخ اجرا: ${dateRangeFa || '—'}   |   لوکیشن: ${event?.location || '—'}`,
    `تاریخ خروجی: ${exportedAt}${filtersText ? `   |   فیلتر: ${filtersText}` : ''}`,
  ];

  /* ══ Sheet 1: Summary dashboard ══ */
  {
    const ws = wb.addWorksheet('خلاصه گزارش', { views: [{ rightToLeft: true, showGridLines: false }], properties: { tabColor: { argb: C.navy } } });
    const COLS = 6;
    setWidths(ws, [30, 16, 16, 16, 16, 16]);
    writeBanner(ws, COLS, `گزارش BVT — ${eventName}`, meta);

    // Event info card
    writeSectionTitle(ws, COLS, 'مشخصات ایونت');
    [
      ['نام ایونت', eventName],
      ['کلاینت', clientName || '—'],
      ['تاریخ اجرا', dateRangeFa || '—'],
      ['مدت زمان', `${daysCount || 1} روز`],
      ['لوکیشن', event?.location || '—'],
    ].forEach(([k, v], i) => {
      const r = ws.addRow([k, v]);
      ws.mergeCells(`B${r.number}:F${r.number}`);
      r.getCell(1).font = font({ bold: true });
      r.getCell(1).fill = fill(C.zebra);
      r.getCell(2).font = font({ color: { argb: C.navy } });
      r.getCell(2).alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
      [1, 2].forEach((c) => { r.getCell(c).border = thinBorder(); });
      r.height = 20;
      if (i === 0) r.getCell(2).font = font({ bold: true, size: 11, color: { argb: C.navy } });
    });
    ws.addRow([]);

    // KPIs
    writeSectionTitle(ws, COLS, 'خلاصه عملیات');
    const located = entries.filter((e) => e.coords).length;
    const kpis = [
      ['پروموتر', event?.promoter_count || 0, null],
      ['کاپیتان', event?.supervisor_count || 0, null],
      ['پشتیبانی', event?.transport_count || 0, null],
      ['کل برخوردها (پذیرش + عدم پذیرش)', total, null],
      ['توزیع شده (پذیرفته)', accepted.length, C.green],
      ['عدم پذیرش', rejected.length, C.red],
      ['نرخ پذیرش', { v: pct(accepted.length, total), fmt: '0.0%' }, C.sky],
      ['ثبت با تطبیق سیگار (پیشنهاد ویژه)', entries.filter((e) => !e.manual && !e.overridden).length, null],
      ['تغییر پیشنهاد توسط پروموتر', entries.filter((e) => e.overridden).length, C.amber],
      ['ثبت دستی (بدون جستجو)', entries.filter((e) => e.manual).length, C.amber],
      ['ثبت دارای لوکیشن', located, null],
      ['ثبت بدون لوکیشن', total - located, null],
    ];
    kpis.forEach(([k, v, color], i) => {
      const val = v && typeof v === 'object' ? v.v : v;
      const r = ws.addRow([k, val]);
      r.getCell(1).font = font({ bold: true });
      r.getCell(2).font = font({ bold: true, size: 12, color: { argb: color || C.navy } });
      r.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      if (v && typeof v === 'object') r.getCell(2).numFmt = v.fmt;
      else r.getCell(2).numFmt = '#,##0';
      [1, 2].forEach((c) => {
        r.getCell(c).border = thinBorder();
        if (i % 2 === 1) r.getCell(c).fill = fill(C.zebra);
      });
      r.height = 20;
    });
    ws.addRow([]);

    // Demographic cross-tabs (gender × age), accepted and rejected
    const crossTab = (list, title) => {
      writeSectionTitle(ws, COLS, title);
      const rows = GENDER_KEYS.map((g) => {
        const byG = list.filter((e) => e.gender === g);
        return [g, ...AGE_KEYS.map((a) => byG.filter((e) => e.age === a).length), byG.length, pct(byG.length, list.length)];
      });
      const unknown = list.filter((e) => !GENDER_KEYS.includes(e.gender));
      if (unknown.length) rows.push(['نامشخص', ...AGE_KEYS.map((a) => unknown.filter((e) => e.age === a).length), unknown.length, pct(unknown.length, list.length)]);
      writeTable(ws, [
        { header: 'جنسیت' },
        { header: 'رده سنی ۱۸-۳۰', numFmt: '#,##0' },
        { header: 'رده سنی +۳۰', numFmt: '#,##0' },
        { header: 'مجموع', numFmt: '#,##0' },
        { header: 'سهم', numFmt: '0.0%' },
      ], rows, { totals: ['مجموع', 'SUM', 'SUM', 'SUM', 'SUM'] });
      ws.addRow([]);
    };
    crossTab(accepted, 'دموگرافی دریافت‌کنندگان (پذیرفته)');
    crossTab(rejected, 'دموگرافی عدم پذیرش');

    // Acceptance rate per demographic segment
    writeSectionTitle(ws, COLS, 'نرخ پذیرش به تفکیک دموگرافی');
    const segRows = [];
    GENDER_KEYS.forEach((g) => AGE_KEYS.forEach((a) => {
      const seg = entries.filter((e) => e.gender === g && e.age === a);
      const acc = seg.filter((e) => !e.rejected).length;
      segRows.push([`${g} — ${a}`, acc, seg.length - acc, seg.length, pct(acc, seg.length)]);
    }));
    writeTable(ws, [
      { header: 'گروه' },
      { header: 'پذیرفته', numFmt: '#,##0' },
      { header: 'عدم پذیرش', numFmt: '#,##0' },
      { header: 'کل', numFmt: '#,##0' },
      { header: 'نرخ پذیرش', numFmt: '0.0%' },
    ], segRows, {
      rowStyle: (r) => {
        const c = r.getCell(5);
        const v = c.value || 0;
        c.font = font({ bold: true, color: { argb: v >= 0.6 ? C.green : v >= 0.35 ? C.amber : C.red } });
      },
    });

    ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  /* ══ Sheet 2: Products ══ */
  {
    const map = {};
    // seed with every active product so zero-sample packs still appear
    activeProducts.forEach((p) => { map[p.id] = { name: p.name, product: p, list: [] }; });
    accepted.forEach((e) => {
      if (!map[e.productKey]) map[e.productKey] = { name: e.productName, product: e.product, list: [] };
      map[e.productKey].list.push(e);
    });
    const rows = Object.entries(map)
      .sort((a, b) => b[1].list.length - a[1].list.length)
      .map(([key, p]) => [
        p.name,
        fmtMg(p.product?.tar),
        fmtMg(p.product?.nicotine),
        p.list.length,
        pct(p.list.length, accepted.length),
        p.list.filter((e) => e.gender === 'مرد').length,
        p.list.filter((e) => e.gender === 'زن').length,
        p.list.filter((e) => e.age === '18-30').length,
        p.list.filter((e) => e.age === '+30').length,
        p.list.filter((e) => !e.manual && !e.overridden).length,
        p.list.filter((e) => e.overridden).length,
        p.list.filter((e) => e.manual).length,
        rejected.filter((e) => e.productKey === key).length,
      ]);
    tableSheet(wb, 'محصولات سمپل شده', `محصولات سمپل شده — ${eventName}`, meta, [
      { header: 'محصول', width: 28, align: 'right' },
      { header: 'قطران (mg)', width: 11 },
      { header: 'نیکوتین (mg)', width: 11 },
      { header: 'تعداد توزیع', width: 12, numFmt: '#,##0' },
      { header: 'سهم از توزیع', width: 12, numFmt: '0.0%' },
      { header: 'مرد', width: 9, numFmt: '#,##0' },
      { header: 'زن', width: 9, numFmt: '#,##0' },
      { header: '۱۸-۳۰', width: 9, numFmt: '#,##0' },
      { header: '+۳۰', width: 9, numFmt: '#,##0' },
      { header: 'طبق پیشنهاد ویژه', width: 13, numFmt: '#,##0' },
      { header: 'انتخاب دستی پروموتر', width: 14, numFmt: '#,##0' },
      { header: 'ثبت دستی', width: 10, numFmt: '#,##0' },
      { header: 'پیشنهاد رد شده', width: 13, numFmt: '#,##0' },
    ], rows, { totals: ['مجموع', '', '', 'SUM', 'SUM', 'SUM', 'SUM', 'SUM', 'SUM', 'SUM', 'SUM', 'SUM', 'SUM'], tab: C.green });
  }

  /* ══ Sheet 3: Rejection reasons ══ */
  {
    const map = {};
    rejected.forEach((e) => { (map[e.reason] = map[e.reason] || []).push(e); });
    const rows = Object.entries(map)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([reason, list]) => [
        reason,
        list.filter((e) => e.age === '18-30').length,
        list.filter((e) => e.age === '+30').length,
        list.filter((e) => e.gender === 'مرد').length,
        list.filter((e) => e.gender === 'زن').length,
        list.length,
        pct(list.length, rejected.length),
      ]);
    tableSheet(wb, 'دلایل عدم پذیرش', `دلایل عدم پذیرش — ${eventName}`, meta, [
      { header: 'دلیل عدم پذیرش', width: 48, align: 'right', wrap: true },
      { header: '۱۸-۳۰', width: 10, numFmt: '#,##0' },
      { header: '+۳۰', width: 10, numFmt: '#,##0' },
      { header: 'مرد', width: 10, numFmt: '#,##0' },
      { header: 'زن', width: 10, numFmt: '#,##0' },
      { header: 'مجموع', width: 11, numFmt: '#,##0' },
      { header: 'سهم از عدم پذیرش', width: 15, numFmt: '0.0%' },
    ], rows, { totals: ['مجموع', 'SUM', 'SUM', 'SUM', 'SUM', 'SUM', 'SUM'], tab: C.red });
  }

  /* ══ Sheet 4: Promoter performance ══ */
  {
    const map = {};
    entries.forEach((e) => { (map[e.promoter] = map[e.promoter] || []).push(e); });
    const rows = Object.entries(map)
      .map(([name, list]) => {
        const acc = list.filter((e) => !e.rejected);
        const days = new Set(list.filter((e) => e.time).map((e) => tehranDayKey(e.time))).size;
        return [
          name, days, acc.length, list.length - acc.length, list.length, pct(acc.length, list.length),
          acc.filter((e) => e.manual).length,
          acc.filter((e) => e.gender === 'مرد').length, acc.filter((e) => e.gender === 'زن').length,
          acc.filter((e) => e.age === '18-30').length, acc.filter((e) => e.age === '+30').length,
          days ? Math.round((acc.length / days) * 10) / 10 : 0,
        ];
      })
      .sort((a, b) => b[2] - a[2]);
    tableSheet(wb, 'عملکرد پروموترها', `عملکرد پروموترها — ${eventName}`, meta, [
      { header: 'پروموتر', width: 24, align: 'right' },
      { header: 'روزهای فعال', width: 11, numFmt: '#,##0' },
      { header: 'توزیع شده', width: 11, numFmt: '#,##0' },
      { header: 'عدم پذیرش', width: 11, numFmt: '#,##0' },
      { header: 'کل برخورد', width: 11, numFmt: '#,##0' },
      { header: 'نرخ پذیرش', width: 11, numFmt: '0.0%' },
      { header: 'ثبت دستی', width: 10, numFmt: '#,##0' },
      { header: 'مرد', width: 8, numFmt: '#,##0' },
      { header: 'زن', width: 8, numFmt: '#,##0' },
      { header: '۱۸-۳۰', width: 8, numFmt: '#,##0' },
      { header: '+۳۰', width: 8, numFmt: '#,##0' },
      { header: 'میانگین توزیع روزانه', width: 15, numFmt: '0.0' },
    ], rows, { totals: ['مجموع', '', 'SUM', 'SUM', 'SUM', pct(accepted.length, total), 'SUM', 'SUM', 'SUM', 'SUM', 'SUM', ''], tab: 'FF8B5CF6' });
  }

  /* ══ Sheet 5: Daily breakdown ══ */
  {
    const map = {};
    entries.filter((e) => e.time).forEach((e) => {
      const k = tehranDayKey(e.time);
      (map[k] = map[k] || []).push(e);
    });
    const rows = Object.keys(map).sort().map((k) => {
      const list = map[k];
      const acc = list.filter((e) => !e.rejected);
      const t0 = list[0].time;
      const times = list.map((e) => e.time);
      return [
        tehranDateFa(t0), tehranWeekdayFa(t0),
        acc.length, list.length - acc.length, list.length, pct(acc.length, list.length),
        acc.filter((e) => e.gender === 'مرد').length, acc.filter((e) => e.gender === 'زن').length,
        acc.filter((e) => e.age === '18-30').length, acc.filter((e) => e.age === '+30').length,
        new Set(list.map((e) => e.promoter)).size,
        tehranTimeFa(Math.min(...times)), tehranTimeFa(Math.max(...times)),
      ];
    });
    tableSheet(wb, 'آمار روزانه', `آمار روزانه — ${eventName}`, meta, [
      { header: 'تاریخ', width: 13 },
      { header: 'روز هفته', width: 11 },
      { header: 'توزیع شده', width: 11, numFmt: '#,##0' },
      { header: 'عدم پذیرش', width: 11, numFmt: '#,##0' },
      { header: 'کل برخورد', width: 11, numFmt: '#,##0' },
      { header: 'نرخ پذیرش', width: 11, numFmt: '0.0%' },
      { header: 'مرد', width: 8, numFmt: '#,##0' },
      { header: 'زن', width: 8, numFmt: '#,##0' },
      { header: '۱۸-۳۰', width: 8, numFmt: '#,##0' },
      { header: '+۳۰', width: 8, numFmt: '#,##0' },
      { header: 'پروموتر فعال', width: 11, numFmt: '#,##0' },
      { header: 'اولین ثبت', width: 10 },
      { header: 'آخرین ثبت', width: 10 },
    ], rows, { totals: ['مجموع', '', 'SUM', 'SUM', 'SUM', pct(accepted.length, total), 'SUM', 'SUM', 'SUM', 'SUM', '', '', ''], tab: C.amber });
  }

  /* ══ Sheet 6: Every logged entry ══ */
  {
    const rows = entries.map((e, i) => {
      const h = e.raw;
      return [
        i + 1,
        e.time ? tehranDateFa(e.time) : '',
        e.time ? tehranTimeFa(e.time) : '',
        e.promoter,
        e.rejected ? 'عدم پذیرش' : 'توزیع شده',
        e.manual ? 'ثبت دستی' : e.overridden ? 'تغییر پیشنهاد' : 'پیشنهاد ویژه',
        e.target,
        fmtMg(h.targetTar),
        fmtMg(h.targetNicotine),
        e.suggestedName,
        e.productName,
        fmtMg(e.product?.tar),
        fmtMg(e.product?.nicotine),
        e.gender,
        e.age,
        e.reason,
        e.note,
        e.location ? { text: '📍 نقشه', hyperlink: e.location } : '',
        e.coords ? e.coords.lat : '',
        e.coords ? e.coords.lng : '',
        h.locationAccuracy != null ? Math.round(h.locationAccuracy) : '',
        !e.location ? (LOCATION_ERRORS[h.locationError] || h.locationError || 'ثبت نشده') : '',
      ];
    });
    tableSheet(wb, 'جزئیات ثبت‌ها', `جزئیات کامل ثبت‌ها — ${eventName}`, meta, [
      { header: 'ردیف', width: 7 },
      { header: 'تاریخ', width: 12 },
      { header: 'ساعت', width: 8 },
      { header: 'پروموتر', width: 20, align: 'right' },
      { header: 'وضعیت', width: 12 },
      { header: 'نوع ثبت', width: 12 },
      { header: 'سیگار فعلی مشتری', width: 24, align: 'right' },
      { header: 'قطران سیگار فعلی', width: 11 },
      { header: 'نیکوتین سیگار فعلی', width: 11 },
      { header: 'پیشنهاد سیستم', width: 24, align: 'right' },
      { header: 'محصول ارائه‌شده', width: 26, align: 'right' },
      { header: 'قطران محصول', width: 10 },
      { header: 'نیکوتین محصول', width: 10 },
      { header: 'جنسیت', width: 8 },
      { header: 'رده سنی', width: 9 },
      { header: 'دلیل عدم پذیرش', width: 36, align: 'right', wrap: true },
      { header: 'توضیحات پروموتر', width: 34, align: 'right', wrap: true },
      { header: 'لوکیشن', width: 10 },
      { header: 'عرض جغرافیایی', width: 12, numFmt: '0.000000' },
      { header: 'طول جغرافیایی', width: 12, numFmt: '0.000000' },
      { header: 'دقت GPS (متر)', width: 11 },
      { header: 'علت نبود لوکیشن', width: 18, align: 'right' },
    ], rows, {
      rowStyle: (r) => {
        const status = r.getCell(5);
        const isRej = status.value === 'عدم پذیرش';
        status.font = font({ bold: true, color: { argb: isRej ? C.red : C.green } });
        status.fill = fill(isRej ? C.redLight : C.greenLight);
        const type = r.getCell(6);
        if (type.value !== 'پیشنهاد ویژه') { type.font = font({ bold: true, color: { argb: C.amber } }); type.fill = fill(C.amberLight); }
        if (type.value === 'تغییر پیشنهاد') r.getCell(10).font = font({ strike: true, color: { argb: C.muted } });
        const loc = r.getCell(18);
        if (loc.value && loc.value.hyperlink) loc.font = font({ color: { argb: 'FF2563EB' }, underline: true });
      },
    });
  }

  /* ══ Overrides: promoter handed out something other than the suggestion ══ */
  {
    const list = entries.filter((e) => e.overridden);
    const rows = list.map((e, i) => [
      i + 1,
      e.time ? tehranDateFa(e.time) : '',
      e.time ? tehranTimeFa(e.time) : '',
      e.promoter,
      e.rejected ? 'عدم پذیرش' : 'توزیع شده',
      e.target,
      fmtMg(e.raw.targetTar),
      fmtMg(e.raw.targetNicotine),
      e.suggestedName,
      e.productName,
      fmtMg(e.product?.nicotine),
      e.gender,
      e.age,
      e.note || '—',
      e.reason,
    ]);
    tableSheet(wb, 'تغییر پیشنهادها', `انتخاب دستی پروموتر به جای پیشنهاد ویژه — ${eventName}`, meta, [
      { header: 'ردیف', width: 7 },
      { header: 'تاریخ', width: 12 },
      { header: 'ساعت', width: 8 },
      { header: 'پروموتر', width: 20, align: 'right' },
      { header: 'وضعیت', width: 12 },
      { header: 'سیگار مخاطب', width: 24, align: 'right' },
      { header: 'قطران', width: 9 },
      { header: 'نیکوتین', width: 9 },
      { header: 'پیشنهاد سیستم', width: 24, align: 'right' },
      { header: 'انتخاب پروموتر', width: 24, align: 'right' },
      { header: 'نیکوتین انتخاب', width: 11 },
      { header: 'جنسیت', width: 8 },
      { header: 'رده سنی', width: 9 },
      { header: 'توضیحات پروموتر', width: 40, align: 'right', wrap: true },
      { header: 'دلیل عدم پذیرش', width: 30, align: 'right', wrap: true },
    ], rows, {
      tab: 'FFEA580C',
      rowStyle: (r) => {
        r.getCell(9).font = font({ strike: true, color: { argb: C.muted } });
        r.getCell(10).font = font({ bold: true, color: { argb: C.amber } });
        const st = r.getCell(5);
        st.font = font({ bold: true, color: { argb: st.value === 'عدم پذیرش' ? C.red : C.green } });
      },
    });
  }

  /* ══ Sheet 7: Distribution points (same ≤20 m clustering as the PDF map) ══ */
  {
    const clusters = clusterPoints(entries);
    const rows = clusters.map((c, i) => [
      i + 1, c.accepted, c.rejected, c.accepted + c.rejected,
      c.lat, c.lng,
      { text: '📍 مشاهده روی نقشه', hyperlink: `https://www.google.com/maps?q=${c.lat.toFixed(6)},${c.lng.toFixed(6)}` },
      c.promoters,
      isFinite(c.first) ? `${tehranDateFa(c.first)} ${tehranTimeFa(c.first)}` : '',
      c.last ? `${tehranDateFa(c.last)} ${tehranTimeFa(c.last)}` : '',
    ]);
    tableSheet(wb, 'نقاط توزیع', `نقاط توزیع (شعاع ۲۰ متر) — ${eventName}`, meta, [
      { header: 'نقطه', width: 7 },
      { header: 'توزیع شده', width: 11, numFmt: '#,##0' },
      { header: 'عدم پذیرش', width: 11, numFmt: '#,##0' },
      { header: 'کل', width: 9, numFmt: '#,##0' },
      { header: 'عرض جغرافیایی', width: 13, numFmt: '0.000000' },
      { header: 'طول جغرافیایی', width: 13, numFmt: '0.000000' },
      { header: 'نقشه', width: 18 },
      { header: 'پروموترها', width: 30, align: 'right', wrap: true },
      { header: 'اولین ثبت', width: 18 },
      { header: 'آخرین ثبت', width: 18 },
    ], rows, {
      totals: ['مجموع', 'SUM', 'SUM', 'SUM', '', '', '', '', '', ''],
      tab: 'FF14B8A6',
      rowStyle: (r) => { r.getCell(7).font = font({ color: { argb: 'FF2563EB' }, underline: true }); },
    });
  }

  /* ══ Sheet 8: Daily sampling-count form (bvt_sampling_report), if the event has it ══ */
  if (samplingField) {
    const rows = submissions
      .map((s) => {
        const counts = s.data?.[`${samplingField.id}_counts`] || {};
        const vals = samplingProducts.map((p) => Number(counts[p.id]) || 0);
        const sum = vals.reduce((a, b) => a + b, 0);
        const when = s.first_submitted_at || s.submitted_at;
        return { when: when ? new Date(when).getTime() : 0, row: [getPromoterName(s), ...vals, sum], sum };
      })
      .filter((r) => r.sum > 0)
      .sort((a, b) => a.when - b.when)
      .map((r) => [r.when ? tehranDateFa(r.when) : '', ...r.row]);
    tableSheet(wb, 'فرم سمپلینگ روزانه', `فرم شمارش سمپلینگ روزانه — ${eventName}`, meta, [
      { header: 'تاریخ', width: 12 },
      { header: 'پروموتر', width: 22, align: 'right' },
      ...samplingProducts.map((p) => ({ header: p.name, width: 16, numFmt: '#,##0' })),
      { header: 'مجموع', width: 11, numFmt: '#,##0' },
    ], rows, { totals: ['مجموع', '', ...samplingProducts.map(() => 'SUM'), 'SUM'], tab: 'FF64748B' });
  }

  return wb;
}
