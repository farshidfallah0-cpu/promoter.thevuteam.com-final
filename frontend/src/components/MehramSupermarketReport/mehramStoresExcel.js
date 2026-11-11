import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { MEHRAM_CITIES } from './mehramData';
import { visitWeekCount, weekStart, weekName, weekLabel, fmtDate, fmtTime, isShortage, STATUS_TONE, answerTone, answerLabel, VISIT_PHOTOS, geoVerdict } from './mehramVisits';

/*
 * Excel export of the Mehram stores tab — exactly the stores the filters show.
 *   «خلاصه»       per-city coverage + the filters used
 *   «فروشگاه‌ها»   one row per store: info, status in the selected period, latest answers
 *   «بازدیدها»     one row per visit in the selected period: every answer, note, product and photo link
 */

const FONT = 'Tahoma';
export const C = {
  navy: 'FF0F172A', slate: 'FF334155', muted: 'FF64748B', accent: 'FF6366F1', accentLight: 'FFEEF2FF',
  green: 'FF059669', greenLight: 'FFD1FAE5', red: 'FFDC2626', redLight: 'FFFEE2E2', amber: 'FFB45309', amberLight: 'FFFEF3C7',
  zebra: 'FFF8FAFC', border: 'FFE2E8F0', white: 'FFFFFFFF', link: 'FF2563EB',
};
export const TONE_FILL = { good: [C.greenLight, C.green], warn: [C.amberLight, C.amber], bad: [C.redLight, C.red] };

export const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
export const font = (o = {}) => ({ name: FONT, size: 10, color: { argb: C.slate }, ...o });
export const border = () => { const s = { style: 'thin', color: { argb: C.border } }; return { top: s, bottom: s, left: s, right: s }; };

export const LINK_NOTICE = 'تمامی لینک ها تنها تا 30 روز بعد از اپریشن فعال می باشند';

export function banner(ws, cols, title, lines) {
  const last = ws.getColumn(cols).letter;
  ws.mergeCells(`A1:${last}1`);
  const t = ws.getCell('A1');
  t.value = title;
  t.font = font({ size: 16, bold: true, color: { argb: C.white } });
  t.fill = fill(C.navy);
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;
  ws.mergeCells(`A2:${last}2`);
  ws.getCell('A2').fill = fill(C.accent);
  ws.getRow(2).height = 4;
  lines.filter(Boolean).forEach((line) => {
    const r = ws.addRow([line]);
    ws.mergeCells(`A${r.number}:${last}${r.number}`);
    r.getCell(1).font = font({ color: { argb: C.muted } });
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    r.height = 20;
  });
  // Every sheet carries photo links; they expire.
  const n = ws.addRow([LINK_NOTICE]);
  ws.mergeCells(`A${n.number}:${last}${n.number}`);
  n.getCell(1).font = font({ bold: true, color: { argb: 'FF92400E' } });
  n.getCell(1).fill = fill('FFFEF3C7');
  n.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  n.height = 22;
  ws.addRow([]);
}

/** columns: [{ header, width, align, tone?(value, rowObj), link? }]; rows: arrays of cell values. */
export function table(ws, columns, rows, { tones = [] } = {}) {
  const head = ws.addRow(columns.map((c) => c.header));
  head.height = 32;
  head.eachCell((cell) => {
    cell.font = font({ bold: true, color: { argb: C.white } });
    cell.fill = fill(C.navy);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border();
  });
  rows.forEach((vals, i) => {
    const r = ws.addRow(vals);
    r.height = 22;
    columns.forEach((col, ci) => {
      const cell = r.getCell(ci + 1);
      cell.font = font();
      cell.border = border();
      cell.alignment = { horizontal: col.align || 'center', vertical: 'middle', wrapText: !!col.wrap };
      if (i % 2 === 1) cell.fill = fill(C.zebra);
      const tone = tones[i]?.[ci];
      if (tone && TONE_FILL[tone]) {
        cell.fill = fill(TONE_FILL[tone][0]);
        cell.font = font({ bold: true, color: { argb: TONE_FILL[tone][1] } });
      }
      const v = vals[ci];
      if (v && typeof v === 'object' && v.hyperlink) cell.font = font({ color: { argb: C.link }, underline: true });
    });
  });
  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 14; });
  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: head.number, showGridLines: false }];
  if (rows.length) ws.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number + rows.length, column: columns.length } };
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

export const sheet = (wb, name, tab) => wb.addWorksheet(name, { views: [{ rightToLeft: true }], properties: { tabColor: { argb: tab } } });
export const link = (url, text) => (url ? { text, hyperlink: url } : '');

export async function exportMehramStoresExcel({ rows, scopeRows, week, catalog, clientView, filterLines }) {
  // `rows` = the stores listed (all filters). `scopeRows` = the same filters except the visit status, so the
  // summary and option counts stay right (visited vs not visited) even when the list shows only one of them.
  const scope = scopeRows || rows;
  // The client's copy carries no promoter names and no work schedule: those columns are dropped
  // by index from the header, every row and every tone row, so the three stay aligned.
  // The storefront selfie shows the promoter — not part of the client's copy either.
  const photos = clientView ? VISIT_PHOTOS.filter(([k]) => k !== 'storefrontSelfie') : VISIT_PHOTOS;
  const strip = (drop) => (arr) => (clientView ? arr.filter((_, i) => !drop.includes(i)) : arr);
  const periodName = week === 'all' ? 'همه هفته‌ها' : `${weekName(week)} (${weekLabel(week)})`;
  const generated = `تاریخ تهیه: ${fmtDate(Date.now())} — ساعت ${fmtTime(Date.now())}`;
  const { questions, groups } = catalog;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VU Event';
  wb.created = new Date();

  /* ── 1) Summary per city ── */
  {
    const ws = sheet(wb, 'خلاصه', C.navy);
    const cols = [
      { header: 'شهر', width: 18 }, { header: 'تعداد فروشگاه', width: 14 }, { header: 'فروشگاه بازدیدشده', width: 14 },
      { header: 'فروشگاه بازدیدنشده', width: 14 }, { header: 'درصد پوشش', width: 13 }, { header: 'تعداد گزارش ثبت‌شده', width: 14 },
      { header: 'فروشگاه با کمبود محصول', width: 18 }, { header: 'در برنامه', width: 11 }, { header: 'برنامه انجام‌شده', width: 13 },
      { header: 'پروموترها', width: 34, wrap: true, align: 'right' },
    ];
    const sumKeep = strip([7, 8, 9]);
    banner(ws, sumKeep(cols).length, 'گزارش بازدید فروشگاه‌های مهرام', [
      `بازه: ${periodName}`, filterLines.join(' · '),
      clientView ? 'فقط گزارش‌های تاییدشده‌ی مهرام در این فایل شمرده شده است' : '',
      'فروشگاه بازدیدشده = فروشگاهی که در بازه حداقل یک بار بازدید شده (هر فروشگاه در هر هفته یک بازدید حساب می‌شود) · تعداد گزارش ثبت‌شده = همه‌ی گزارش‌های ذخیره‌شده، حتی اگر یک فروشگاه در یک هفته دوباره گزارش شده باشد',
      generated,
    ]);
    const byCity = new Map();
    scope.forEach((r) => {
      const c = byCity.get(r.store.city) || { total: 0, visited: 0, visits: 0, shortage: 0, planned: 0, plannedDone: 0, promoters: new Set() };
      if (r.plan) { c.planned += 1; if (r.inWeek.length) c.plannedDone += 1; }
      c.total += 1;
      if (r.inWeek.length) c.visited += 1;
      c.visits += r.inWeek.length;
      if (r.inWeek.some((v) => Object.values(v.products || {}).some(isShortage))) c.shortage += 1;
      r.inWeek.forEach((v) => c.promoters.add(v.promoterName));
      byCity.set(r.store.city, c);
    });
    const cities = [...byCity.entries()].sort((a, b) => (MEHRAM_CITIES.indexOf(a[0]) + 1 || 99) - (MEHRAM_CITIES.indexOf(b[0]) + 1 || 99));
    // Not-visited and the percentage are live formulas of the cells next to them, so editing a count recalculates the row.
    const first = ws.rowCount + 2; // the header row is added by table(), the data starts right below it
    const pct = (b, c) => ({ formula: `IFERROR(C${b}/B${b},0)`, result: c.total ? c.visited / c.total : 0 });
    const data = cities.map(([city, c], i) => {
      const r = first + i;
      return [city, c.total, c.visited, { formula: `B${r}-C${r}`, result: c.total - c.visited }, pct(r, c), c.visits, c.shortage, c.planned, c.plannedDone, [...c.promoters].join('، ')];
    });
    const lastCity = first + cities.length - 1;
    const T = cities.reduce((a, [, c]) => ({ total: a.total + c.total, visited: a.visited + c.visited, visits: a.visits + c.visits, shortage: a.shortage + c.shortage, planned: a.planned + c.planned, done: a.done + c.plannedDone }),
      { total: 0, visited: 0, visits: 0, shortage: 0, planned: 0, done: 0 });
    const tr = lastCity + 1;
    const sum = (col, result) => ({ formula: `SUM(${col}${first}:${col}${lastCity})`, result });
    data.push(['جمع کل', sum('B', T.total), sum('C', T.visited), { formula: `B${tr}-C${tr}`, result: T.total - T.visited }, pct(tr, T),
      sum('F', T.visits), sum('G', T.shortage), sum('H', T.planned), sum('I', T.done), '']);
    const tones = data.map((d) => { const v = d[4].result; return [null, null, null, null, v >= 0.75 ? 'good' : v >= 0.4 ? 'warn' : 'bad']; });
    table(ws, sumKeep(cols), data.map(sumKeep), { tones });
    ws.getColumn(5).numFmt = '0%';
    const last = ws.lastRow;
    last.eachCell((cell) => { cell.font = font({ bold: true, color: { argb: C.navy } }); cell.border = { ...border(), top: { style: 'medium', color: { argb: C.navy } } }; });
  }

  /* ── 1b) Option counts: what the promoters answered, per question and product group ── */
  {
    const ws = sheet(wb, 'گزینه‌ها', C.amber);
    const vs = scope.flatMap((r) => r.inWeek);
    banner(ws, 4, 'پراکندگی پاسخ‌ها', [`بازه: ${periodName}`, `${vs.length.toLocaleString('fa-IR')} بازدید ثبت‌شده در بازه`, 'هر درصد = سهم آن گزینه از بازدیدهایی که همان سؤال را پاسخ داده‌اند']);
    const rowsOut = []; const tones = [];
    const add = (title, options, valueOf, toneOf) => {
      const counts = new Map(options.map((o) => [o, 0]));
      let other = 0;
      vs.forEach((v) => { const a = valueOf(v); if (!a) return; if (counts.has(a)) counts.set(a, counts.get(a) + 1); else other += 1; });
      const list = [...counts.entries()]; if (other) list.push(['سایر', other]);
      list.forEach(([opt, n]) => { rowsOut.push([title, opt, n, null]); tones.push([null, toneOf(opt) || null]); });
    };
    questions.forEach((q) => add(q.title, q.options, (v) => answerLabel(q.key, v.answers?.[q.key]), (o) => answerTone(q.key, o)));
    groups.forEach((g) => add(g.title, ['موجود', 'ناکافی', 'موجود نیست'], (v) => v.products?.[g.key], (o) => STATUS_TONE[o]));
    const first = ws.rowCount + 2;
    const totalOf = new Map();
    rowsOut.forEach((r) => totalOf.set(r[0], (totalOf.get(r[0]) || 0) + r[2]));
    rowsOut.forEach((r, i) => { r[3] = { formula: `IFERROR(C${first + i}/SUMIFS(C$${first}:C$${first + rowsOut.length - 1},A$${first}:A$${first + rowsOut.length - 1},A${first + i}),0)`, result: totalOf.get(r[0]) ? r[2] / totalOf.get(r[0]) : 0 }; });
    table(ws, [{ header: 'سؤال / گروه محصول', width: 38, align: 'right' }, { header: 'گزینه', width: 22 }, { header: 'تعداد بازدید', width: 14 }, { header: 'درصد', width: 11 }], rowsOut, { tones });
    ws.getColumn(4).numFmt = '0%';
  }

  /* ── 2) Stores ── */
  {
    const ws = sheet(wb, 'فروشگاه‌ها', C.accent);
    const cols = [
      { header: 'کد مشتری', width: 13 }, { header: 'نام فروشگاه', width: 22, align: 'right' }, { header: 'شهر', width: 12 },
      { header: 'منطقه', width: 12 }, { header: 'کلاس', width: 8 }, { header: 'نام فروشنده', width: 20, align: 'right' },
      { header: 'موبایل', width: 14 }, { header: 'تلفن', width: 13 }, { header: 'آدرس', width: 40, align: 'right', wrap: true },
      { header: `وضعیت (${week === 'all' ? 'همه هفته‌ها' : weekName(week)})`, width: 16 },
      { header: 'برنامه (پروموتر)', width: 20 },
      { header: 'پروموتر', width: 20 }, { header: 'تاریخ بازدید', width: 14 }, { header: 'تعداد بازدید در بازه', width: 12 },
      { header: 'کل بازدیدها', width: 11 }, { header: 'آخرین بازدید', width: 14 }, { header: 'آخرین پروموتر', width: 18 },
      ...questions.map((q) => ({ header: q.title, width: 18, wrap: true })),
      ...groups.map((g) => ({ header: g.title, width: 16, wrap: true })),
      { header: 'لوکیشن', width: 14 },
    ];
    const stKeep = strip([10, 11, 16]);
    banner(ws, stKeep(cols).length, 'فروشگاه‌ها', [`بازه: ${periodName}`, filterLines.join(' · '), 'ستون‌های سوال و گروه محصولات = آخرین بازدید در بازه']);
    const tones = [];
    const data = rows.map((r) => {
      const { store, inWeek, all } = r;
      const latest = inWeek[0];
      const tone = Array(17).fill(null);
      tone[9] = inWeek.length ? 'good' : 'bad';
      tone[10] = r.plan ? (inWeek.length ? 'good' : 'warn') : null;
      questions.forEach((q) => tone.push(latest?.answers?.[q.key] ? answerTone(q.key, latest.answers[q.key]) || null : null));
      groups.forEach((g) => tone.push(STATUS_TONE[latest?.products?.[g.key]] || null));
      tones.push(stKeep(tone));
      return stKeep([
        store.id, store.name, store.city, store.district || '', store.customerClass || '', store.sellerName || '',
        store.mobile || '', store.landline || '', store.address || '',
        inWeek.length ? 'بازدید شده' : 'بازدید نشده',
        r.plan?.personName || '',
        [...new Set(inWeek.map((v) => v.promoterName))].join('، '),
        latest ? fmtDate(latest.submittedAt) : '', visitWeekCount(inWeek), visitWeekCount(all),
        all[0] ? fmtDate(all[0].submittedAt) : '', all[0]?.promoterName || '',
        ...questions.map((q) => answerLabel(q.key, latest?.answers?.[q.key])),
        ...groups.map((g) => latest?.products?.[g.key] || ''),
        store.lat != null ? link(`https://www.google.com/maps?q=${store.lat},${store.lng}`, 'نقشه') : '',
      ]);
    });
    table(ws, stKeep(cols), data, { tones });
  }

  /* ── 3) Visits ── */
  {
    const ws = sheet(wb, 'بازدیدها', C.green);
    const visits = rows.flatMap((r) => r.inWeek.map((v) => ({ v, store: r.store })))
      .sort((a, b) => a.v.submittedAt - b.v.submittedAt);
    const noteQs = questions.filter((q) => visits.some(({ v }) => v.notes?.[q.key]));
    const cols = [
      { header: 'هفته', width: 22 }, { header: 'تاریخ', width: 12 }, { header: 'ساعت', width: 8 },
      { header: 'پروموتر', width: 18 }, { header: 'شهر', width: 12 }, { header: 'کد مشتری', width: 13 },
      { header: 'نام فروشگاه', width: 22, align: 'right' }, { header: 'تماس با فروشنده', width: 13 },
      ...(clientView ? [] : [{ header: 'موقعیت پروموتر', width: 22, wrap: true }, { header: 'فاصله از فروشگاه (متر)', width: 13 }]),
      ...questions.map((q) => ({ header: q.title, width: 18, wrap: true })),
      ...noteQs.map((q) => ({ header: `توضیحات: ${q.title}`, width: 30, wrap: true, align: 'right' })),
      ...groups.map((g) => ({ header: g.title, width: 16, wrap: true })),
      ...photos.map(([, label]) => ({ header: `عکس ${label}`, width: 14 })),
      ...(clientView ? [] : [{ header: 'تایید برای کلاینت', width: 13 }]),
    ];
    const viKeep = strip([3, 7]);
    banner(ws, viKeep(cols).length, clientView ? 'بازدیدها' : 'بازدیدهای پروموترها', [`بازه: ${periodName}`, filterLines.join(' · ')]);
    const tones = [];
    const data = visits.map(({ v, store }) => {
      const tone = Array(clientView ? 6 : 7).fill(null);
      if (!clientView) tone.push(v.calledAt ? 'good' : 'warn');
      const g = v.geo ? geoVerdict(v.geo, store) : null;
      if (!clientView) tone.push(g ? ({ near: 'good', far: 'warn', none: 'bad' }[g.state] || null) : null, null);
      questions.forEach((q) => tone.push(v.answers?.[q.key] ? answerTone(q.key, v.answers[q.key]) || null : null));
      noteQs.forEach(() => tone.push(null));
      groups.forEach((g) => tone.push(STATUS_TONE[v.products?.[g.key]] || null));
      photos.forEach(() => tone.push(null));
      if (!clientView) tone.push(v.approved ? 'good' : 'warn');
      tones.push(tone);
      const w = weekStart(v.submittedAt);
      return viKeep([
        `${weekName(w)} (${weekLabel(w)})`, fmtDate(v.submittedAt), fmtTime(v.submittedAt), v.promoterName,
        store.city, store.id, store.name, v.calledAt ? `بله — ${fmtTime(v.calledAt)}` : 'خیر',
        ...(clientView ? [] : [g ? g.label : 'ثبت نشده (قبل از فعال شدن)', g?.distance != null ? Math.round(g.distance) : '']),
        ...questions.map((q) => answerLabel(q.key, v.answers?.[q.key])),
        ...noteQs.map((q) => v.notes?.[q.key] || ''),
        ...groups.map((g) => v.products?.[g.key] || ''),
        ...photos.map(([k]) => link(v[k], 'مشاهده')),
        ...(clientView ? [] : [v.approved ? 'تایید شده' : 'تایید نشده']),
      ]);
    });
    table(ws, viKeep(cols), data, { tones });
  }

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Mahram_Stores_${stamp}.xlsx`);
}
