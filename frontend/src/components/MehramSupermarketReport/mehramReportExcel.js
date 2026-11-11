import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { C, font, fill, border, banner, table, sheet, link } from './mehramStoresExcel';
import { STORE_BY_ID } from './mehramReportData';
import { fmtDate, fmtTime, dayWeekdayName, isShortage, STATUS_TONE, answerTone, answerLabel, VISIT_PHOTOS, geoVerdict, fmtDuration } from './mehramVisits';

/*
 * Excel export of the Mehram report (reports page). Honors the reports page filters
 * (day, promoter, search) plus the city / issue picked in the export dialog.
 *   «خلاصه»         KPIs + one row per day
 *   «بازدیدها»      one row per visit: every answer, note, product status, photo link, location check
 *   «مسیر روزانه»   per promoter and day: stops in order, distance + time from the previous store
 *   «پروموترها»     per-promoter totals
 *   «کمبود محصول»   one row per product group that was short in a visit
 *   «برنامه روزانه» planned vs done (our admins only, when a daily plan exists)
 */

const km = (m) => (m ? Math.round(m / 100) / 10 : 0);

function kpiBlock(ws, cols, items) {
  // Two rows per KPI strip: label row + big value row, `per` KPIs per line.
  const per = Math.max(2, Math.min(items.length, Math.floor(cols / 2)));
  for (let i = 0; i < items.length; i += per) {
    const slice = items.slice(i, i + per);
    const lab = ws.addRow([]);
    const val = ws.addRow([]);
    lab.height = 18; val.height = 30;
    slice.forEach(([label, value, tone], j) => {
      const c0 = 1 + j * 2;
      [lab, val].forEach((r) => ws.mergeCells(r.number, c0, r.number, c0 + 1));
      const l = lab.getCell(c0); const v = val.getCell(c0);
      l.value = label; v.value = value;
      const [bg, fg] = tone === 'bad' ? [C.redLight, C.red] : tone === 'warn' ? [C.amberLight, C.amber] : tone === 'good' ? [C.greenLight, C.green] : [C.accentLight, C.accent];
      l.font = font({ size: 9, bold: true, color: { argb: C.muted } });
      v.font = font({ size: 16, bold: true, color: { argb: fg } });
      [l, v].forEach((c) => { c.fill = fill(bg); c.alignment = { horizontal: 'center', vertical: 'middle' }; });
    });
    ws.addRow([]);
  }
}

export async function exportMehramReportExcel({ data, event, clientName, filterLines, clientView = false, hasPlans = false }) {
  const { visits, days, promoters, questions, groups, totals } = data;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VU Event';
  wb.created = new Date();
  const title = `گزارش سوپرمارکت‌ها — ${event?.name || ''}`;
  const meta = [
    [clientName && `کارفرما: ${clientName}`, totals.from && `بازه: ${fmtDate(totals.from)} تا ${fmtDate(totals.to)}`].filter(Boolean).join(' · '),
    filterLines.join(' · '),
    `تاریخ تهیه: ${fmtDate(Date.now())} — ساعت ${fmtTime(Date.now())}`,
  ].filter(Boolean);

  /* 1) Summary */
  {
    const ws = sheet(wb, 'خلاصه', C.navy);
    const cols = [
      { header: 'روز', width: 24 }, { header: 'تعداد بازدید', width: 12 }, { header: 'فروشگاه', width: 11 }, { header: 'پروموتر', width: 11 },
      { header: 'فروشگاه با کمبود', width: 14 }, { header: 'در برنامه', width: 11 }, { header: 'انجام‌شده از برنامه', width: 14 }, { header: 'درصد انجام برنامه', width: 13 },
      ...(clientView ? [] : [{ header: 'مسیر طی‌شده (کیلومتر)', width: 15 }]),
    ];
    banner(ws, Math.max(cols.length, 8), title, meta);
    kpiBlock(ws, 8, [
      ['تعداد گزارش ثبت‌شده', totals.visits], ['فروشگاه بازدیدشده', totals.stores], ['پروموتر فعال', totals.promoters], ['روز فعال', totals.days],
      ['بازدید با کمبود محصول', totals.shortage, totals.shortage ? 'bad' : 'good'], ['فروشگاه ناهمکار', totals.uncoopStores, totals.uncoopStores ? 'warn' : 'good'],
      ...(clientView ? [] : [['تماس با فروشنده', totals.called, 'good'], ['دور از فروشگاه', totals.far, totals.far ? 'warn' : 'good'], ['کیلومتر مسیر', km(totals.travelM)]]),
    ]);
    const rows = days.filter((d) => d.visits.length || d.planned).map((d) => [
      d.label, d.visits.length, d.stores, d.people.filter((p) => p.visits.length).length, d.shortageStores, d.planned || '', d.planned ? d.done : '',
      d.planned ? d.done / d.planned : '', ...(clientView ? [] : [km(d.travelM)]),
    ]);
    rows.push(['جمع کل', totals.visits, totals.stores, totals.promoters, '', totals.planned || '', totals.planned ? totals.done : '', totals.planned ? totals.done / totals.planned : '', ...(clientView ? [] : [km(totals.travelM)])]);
    table(ws, cols, rows, { tones: rows.map((r) => [null, null, null, null, r[4] ? 'bad' : null, null, null, r[7] === '' ? null : r[7] >= 0.8 ? 'good' : r[7] >= 0.5 ? 'warn' : 'bad']) });
    ws.getColumn(8).numFmt = '0%';
    ws.lastRow.eachCell((cell) => { cell.font = font({ bold: true, color: { argb: C.navy } }); cell.border = { ...border(), top: { style: 'medium', color: { argb: C.navy } } }; });
    // Data bars on the daily visit count (Excel draws them; viewers that don't just show the numbers).
    const first = ws.lastRow.number - rows.length + 1;
    if (rows.length > 1) {
      ws.addConditionalFormatting({
        ref: `B${first}:B${ws.lastRow.number - 1}`,
        rules: [{ type: 'dataBar', priority: 1, gradient: false, color: { argb: 'FF818CF8' }, minLength: 0, maxLength: 100, cfvo: [{ type: 'min' }, { type: 'max' }] }],
      });
    }
  }

  /* 2) Visits */
  {
    const ws = sheet(wb, 'بازدیدها', C.green);
    const noteQs = questions.filter((q) => visits.some((v) => v.notes?.[q.key]));
    const cols = [
      { header: 'روز', width: 12 }, { header: 'تاریخ', width: 12 }, { header: 'ساعت', width: 8 }, { header: 'پروموتر', width: 18 },
      { header: 'شهر', width: 12 }, { header: 'منطقه', width: 12 }, { header: 'کد مشتری', width: 13 }, { header: 'نام فروشگاه', width: 22, align: 'right' },
      ...(clientView ? [] : [{ header: 'تماس با فروشنده', width: 13 }, { header: 'موقعیت پروموتر', width: 24, wrap: true }, { header: 'فاصله از فروشگاه (متر)', width: 13 }]),
      ...questions.map((q) => ({ header: q.title, width: 18, wrap: true })),
      ...noteQs.map((q) => ({ header: `توضیحات: ${q.title}`, width: 30, wrap: true, align: 'right' })),
      ...groups.map((g) => ({ header: g.title, width: 16, wrap: true })),
      ...VISIT_PHOTOS.map(([, label]) => ({ header: `عکس ${label}`, width: 14 })),
      ...(clientView ? [] : [{ header: 'تایید برای کلاینت', width: 13 }]),
    ];
    banner(ws, cols.length, 'بازدیدهای پروموترها', [filterLines.join(' · ')]);
    const tones = [];
    const rows = visits.map((v) => {
      const g = geoVerdict(v.geo, v.store);
      const tone = Array(8).fill(null);
      if (!clientView) tone.push(v.calledAt ? 'good' : 'warn', { near: 'good', far: 'warn', none: 'bad' }[g.state] || null, null);
      questions.forEach((q) => tone.push(v.answers[q.key] ? answerTone(q.key, v.answers[q.key]) || null : null));
      noteQs.forEach(() => tone.push(null));
      groups.forEach((gr) => tone.push(STATUS_TONE[v.products[gr.key]] || null));
      VISIT_PHOTOS.forEach(() => tone.push(null));
      if (!clientView) tone.push(v.approved ? 'good' : 'warn');
      tones.push(tone);
      return [
        dayWeekdayName(v.submittedAt), fmtDate(v.submittedAt), fmtTime(v.submittedAt), v.promoterName,
        v.city, v.store?.district || '', v.storeId, v.storeName,
        ...(clientView ? [] : [v.calledAt ? `بله — ${fmtTime(v.calledAt)}` : 'خیر', g.label, g.distance != null ? Math.round(g.distance) : '']),
        ...questions.map((q) => answerLabel(q.key, v.answers[q.key])),
        ...noteQs.map((q) => v.notes[q.key] || ''),
        ...groups.map((gr) => v.products[gr.key] || ''),
        ...VISIT_PHOTOS.map(([k]) => link(v[k], 'مشاهده')),
        ...(clientView ? [] : [v.approved ? 'تایید شده' : 'تایید نشده']),
      ];
    });
    table(ws, cols, rows, { tones });
  }

  /* 3) Route per promoter and day */
  if (!clientView) {
    const ws = sheet(wb, 'مسیر روزانه', C.accent);
    const cols = [
      { header: 'روز', width: 22 }, { header: 'پروموتر', width: 18 }, { header: 'ردیف', width: 7 }, { header: 'ساعت', width: 8 },
      { header: 'نام فروشگاه', width: 24, align: 'right' }, { header: 'شهر', width: 12 }, { header: 'منطقه', width: 12 },
      { header: 'از فروشگاه قبلی', width: 22, align: 'right' }, { header: 'فاصله از قبلی (متر)', width: 14 }, { header: 'زمان از قبلی', width: 16 },
      { header: 'سرعت میانگین (km/h)', width: 13 }, { header: 'در برنامه؟', width: 11 }, { header: 'موقعیت', width: 26, wrap: true },
    ];
    banner(ws, cols.length, 'مسیر پروموترها در هر روز', [...meta.slice(1, 2), 'فاصله و زمان بین دو بازدید پشت‌سرهم؛ موقعیت هر بازدید همان لحظه‌ی سلفی سردر ثبت شده است']);
    const tones = []; const rows = [];
    days.forEach((d) => d.people.forEach((p) => {
      p.route.stops.forEach((s, i) => {
        const odd = s.leg?.speedKmh != null && s.leg.speedKmh > 150;
        tones.push([null, null, null, null, null, null, null, null, null, null, odd ? 'bad' : null,
          p.route.plannedCount ? (s.planned ? 'good' : 'warn') : null, { near: 'good', far: 'warn', none: 'bad' }[s.verdict.state] || null]);
        rows.push([
          d.label, p.name, i + 1, fmtTime(s.visit.submittedAt), s.visit.storeName, s.visit.city, s.store?.district || '',
          s.leg?.from?.name || '', s.leg?.distance != null ? Math.round(s.leg.distance) : '', s.leg ? fmtDuration(s.leg.gap) : '',
          s.leg?.speedKmh != null ? Math.round(s.leg.speedKmh) : '', p.route.plannedCount ? (s.planned ? 'بله' : 'خارج از برنامه') : '', s.verdict.label,
        ]);
      });
      p.route.missed.forEach((m) => {
        tones.push([null, null, null, null, null, null, null, null, null, null, null, 'bad', null]);
        rows.push([d.label, p.name, '', '', m.store?.name || m.storeId, m.store?.city || '', m.store?.district || '', '', '', '', '', 'انجام نشد', '']);
      });
    }));
    table(ws, cols, rows, { tones });
  }

  /* 4) Promoters */
  {
    const ws = sheet(wb, 'پروموترها', C.amber);
    const cols = [
      { header: 'پروموتر', width: 22, align: 'right' }, { header: 'روز فعال', width: 10 }, { header: 'تعداد بازدید', width: 12 }, { header: 'فروشگاه متفاوت', width: 13 },
      { header: 'میانگین بازدید در روز', width: 14 }, { header: 'بازدید با کمبود', width: 13 },
      ...(clientView ? [] : [{ header: 'مسیر (کیلومتر)', width: 13 }, { header: 'دور از فروشگاه', width: 12 }, { header: 'بدون موقعیت', width: 12 }, { header: 'خارج از برنامه', width: 12 }, { header: 'انجام‌شده از برنامه', width: 14 }]),
      { header: 'اولین بازدید', width: 16 }, { header: 'آخرین بازدید', width: 16 },
    ];
    banner(ws, cols.length, 'عملکرد پروموترها', meta.slice(1, 2));
    const rows = promoters.map((p) => [
      p.name, p.days, p.visits, p.stores.size, Math.round((p.visits / (p.days || 1)) * 10) / 10, p.shortage,
      ...(clientView ? [] : [km(p.travelM), p.far, p.noFix, p.offPlan, p.planned ? `${p.done} از ${p.planned}` : '']),
      `${fmtDate(p.first)} ${fmtTime(p.first)}`, `${fmtDate(p.last)} ${fmtTime(p.last)}`,
    ]);
    table(ws, cols, rows, { tones: promoters.map((p) => [null, null, null, null, null, p.shortage ? 'warn' : null, ...(clientView ? [] : [null, p.far ? 'warn' : null, p.noFix ? 'bad' : null, p.offPlan ? 'warn' : null])]) });
  }

  /* 5) Product shortages */
  {
    const ws = sheet(wb, 'کمبود محصول', C.red);
    const cols = [
      { header: 'تاریخ', width: 12 }, { header: 'پروموتر', width: 18 }, { header: 'شهر', width: 12 }, { header: 'کد مشتری', width: 13 },
      { header: 'نام فروشگاه', width: 24, align: 'right' }, { header: 'گروه محصول', width: 30, align: 'right' }, { header: 'وضعیت', width: 12 },
      { header: 'نام فروشنده', width: 20, align: 'right' }, { header: 'موبایل', width: 14 }, { header: 'عکس گروه محصولات', width: 16 },
    ];
    banner(ws, cols.length, 'کمبود محصول در فروشگاه‌ها', meta.slice(1, 2));
    const rows = []; const tones = [];
    visits.forEach((v) => groups.forEach((g) => {
      if (!isShortage(v.products[g.key])) return;
      tones.push([null, null, null, null, null, null, STATUS_TONE[v.products[g.key]]]);
      rows.push([fmtDate(v.submittedAt), v.promoterName, v.city, v.storeId, v.storeName, g.title, v.products[g.key], v.store?.sellerName || '', v.store?.mobile || '', link(v.productsPhoto, 'مشاهده')]);
    }));
    table(ws, cols, rows, { tones });
  }

  /* 6) Daily plan vs done */
  if (!clientView && hasPlans) {
    const ws = sheet(wb, 'برنامه روزانه', C.accent);
    const cols = [
      { header: 'روز', width: 22 }, { header: 'پروموتر', width: 18 }, { header: 'ردیف در برنامه', width: 11 }, { header: 'نام فروشگاه', width: 24, align: 'right' },
      { header: 'شهر', width: 12 }, { header: 'منطقه', width: 12 }, { header: 'وضعیت', width: 14 }, { header: 'ساعت بازدید', width: 12 },
    ];
    banner(ws, cols.length, 'برنامه‌ی روزانه و وضعیت انجام', meta.slice(1, 2));
    const rows = []; const tones = [];
    days.forEach((d) => d.people.forEach((p) => {
      p.planned.forEach((pl, i) => {
        const v = p.visits.find((x) => x.storeId === pl.storeId);
        const st = STORE_BY_ID.get(pl.storeId);
        tones.push([null, null, null, null, null, null, v ? 'good' : 'bad']);
        rows.push([d.label, p.name, i + 1, st?.name || pl.storeId, st?.city || '', st?.district || '', v ? 'انجام شد' : 'انجام نشد', v ? fmtTime(v.submittedAt) : '']);
      });
    }));
    table(ws, cols, rows, { tones });
  }

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Mahram_Report_${stamp}.xlsx`);
}
