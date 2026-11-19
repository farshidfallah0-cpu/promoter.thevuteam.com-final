import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { roleName, dayLabel, fromKey, jalali } from './payrollUtils';

const FONT = 'Vazirmatn';
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
const FILLS = {
  paid: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } },
  unpaid: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } },
  pending: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } },
  total: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } },
  fri: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } },
};
const BORDER = { style: 'thin', color: { argb: 'FFD1D5DB' } };
const MONEY = '#,##0';

function sheet(wb, name, columns) {
  const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 14, style: { font: { name: FONT, size: 10 }, alignment: { vertical: 'middle', horizontal: c.align || 'center', wrapText: !!c.wrap }, numFmt: c.money ? MONEY : undefined } }));
  const h = ws.getRow(1);
  h.height = 26;
  h.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' }, size: 10.5 };
    cell.fill = HEAD_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}
const borderAll = (ws) => ws.eachRow((row) => row.eachCell({ includeEmpty: true }, (cell) => { cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }; }));
const totalRow = (ws, values) => {
  const r = ws.addRow(values);
  r.font = { name: FONT, bold: true, size: 10.5 };
  r.eachCell({ includeEmpty: true }, (c) => { c.fill = FILLS.total; });
  r.height = 22;
  return r;
};

export async function exportPayrollExcel({ title, days, workdays, pending, payments }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VU Event';
  wb.created = new Date();

  // ── 1) Per-person summary: the sheet the payments are made from ──
  const people = new Map();
  workdays.forEach((w) => {
    const p = people.get(w.person_key) || { name: w.person_name, phone: w.phone, days: 0, total: 0, paid: 0, unpaid: 0, unpaidDays: 0, roles: new Set(), events: new Set(), pending: 0 };
    p.days += 1; p.total += w.amount;
    if (w.paid) p.paid += w.amount; else { p.unpaid += w.amount; p.unpaidDays += 1; }
    p.roles.add(roleName(w.role)); p.events.add(w.event_name);
    people.set(w.person_key, p);
  });
  pending.forEach((w) => {
    const p = people.get(w.person_key) || { name: w.person_name, phone: w.phone, days: 0, total: 0, paid: 0, unpaid: 0, unpaidDays: 0, roles: new Set(), events: new Set(), pending: 0 };
    p.pending += 1; p.events.add(w.event_name); people.set(w.person_key, p);
  });
  const list = [...people.values()].sort((a, b) => b.unpaid - a.unpaid || b.total - a.total);

  const s1 = sheet(wb, 'خلاصه پرداخت', [
    { header: 'ردیف', key: 'i', width: 6 }, { header: 'نام و نام خانوادگی', key: 'name', width: 26, align: 'right' }, { header: 'موبایل', key: 'phone', width: 15 },
    { header: 'روز کاری تاییدشده', key: 'days', width: 12 }, { header: 'جمع کارکرد (تومان)', key: 'total', width: 18, money: true },
    { header: 'پرداخت‌شده (تومان)', key: 'paid', width: 18, money: true }, { header: 'مانده قابل پرداخت (تومان)', key: 'unpaid', width: 20, money: true },
    { header: 'روزهای پرداخت‌نشده', key: 'unpaidDays', width: 12 }, { header: 'روز در انتظار تایید', key: 'pending', width: 12 },
    { header: 'نقش‌ها', key: 'roles', width: 18 }, { header: 'ایونت‌ها', key: 'events', width: 34, align: 'right', wrap: true },
    { header: 'شماره کارت / شبا', key: 'card', width: 26 }, { header: 'امضا / تایید دریافت', key: 'sign', width: 18 },
  ]);
  list.forEach((p, i) => {
    const r = s1.addRow({ i: i + 1, name: p.name, phone: p.phone || '', days: p.days, total: p.total, paid: p.paid, unpaid: p.unpaid, unpaidDays: p.unpaidDays, pending: p.pending, roles: [...p.roles].join('، '), events: [...p.events].join('، ') });
    r.height = 20;
    if (p.unpaid > 0) r.getCell('unpaid').fill = FILLS.unpaid;
    else if (p.days) r.getCell('unpaid').fill = FILLS.paid;
  });
  const n1 = list.length + 1;
  // Row 1 becomes the title row below (insertRow does not shift formulas), so data sits in rows 3..n1+1.
  totalRow(s1, ['', 'جمع کل', '', { formula: `SUM(D3:D${n1 + 1})` }, { formula: `SUM(E3:E${n1 + 1})` }, { formula: `SUM(F3:F${n1 + 1})` }, { formula: `SUM(G3:G${n1 + 1})` }, { formula: `SUM(H3:H${n1 + 1})` }, { formula: `SUM(I3:I${n1 + 1})` }]);
  borderAll(s1);
  s1.insertRow(1, [`شیت پرداخت حقوق — ${title}`]);
  s1.mergeCells(1, 1, 1, 13);
  Object.assign(s1.getRow(1), { height: 30 });
  s1.getCell('A1').font = { name: FONT, bold: true, size: 14, color: { argb: 'FF312E81' } };
  s1.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  s1.views = [{ rightToLeft: true, state: 'frozen', ySplit: 2 }];
  s1.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 13 } };

  // ── 2) Every workday ──
  const s2 = sheet(wb, 'جزئیات روزها', [
    { header: 'تاریخ', key: 'date', width: 13 }, { header: 'روز هفته', key: 'wd', width: 10 }, { header: 'نام', key: 'name', width: 24, align: 'right' },
    { header: 'موبایل', key: 'phone', width: 14 }, { header: 'ایونت', key: 'event', width: 24, align: 'right' }, { header: 'کلاینت', key: 'client', width: 14 },
    { header: 'نقش', key: 'role', width: 11 }, { header: 'دستمزد روزانه', key: 'rate', width: 15, money: true }, { header: 'پاداش / کسر', key: 'adj', width: 13, money: true },
    { header: 'مبلغ', key: 'amount', width: 15, money: true }, { header: 'وضعیت', key: 'status', width: 15 }, { header: 'تاریخ پرداخت', key: 'paidAt', width: 13 },
    { header: 'تاییدکننده', key: 'by', width: 12 }, { header: 'یادداشت', key: 'note', width: 26, align: 'right', wrap: true },
  ]);
  const rows2 = [...workdays.map((w) => ({ ...w, _s: w.paid ? 'paid' : 'unpaid' })), ...pending.map((w) => ({ ...w, _s: 'pending', amount: null, rate: null, adjustment: null }))]
    .sort((a, b) => a.day.localeCompare(b.day) || (a.person_name || '').localeCompare(b.person_name || '', 'fa'));
  rows2.forEach((w) => {
    const r = s2.addRow({
      date: dayLabel(w.day, 'YYYY/MM/DD'), wd: dayLabel(w.day, 'dddd'), name: w.person_name, phone: w.phone || '', event: w.event_name, client: w.client_name || '',
      role: roleName(w.role), rate: w.rate, adj: w.adjustment || null, amount: w.amount,
      status: { paid: 'پرداخت شده', unpaid: 'تایید · پرداخت‌نشده', pending: 'در انتظار تایید' }[w._s],
      paidAt: w.paid_at ? jalali(new Date(w.paid_at)).format('YYYY/MM/DD') : '', by: w.approved_by || '', note: w.note || '',
    });
    r.getCell('status').fill = FILLS[w._s];
  });
  const n2 = rows2.length + 1;
  totalRow(s2, ['', '', 'جمع', '', '', '', '', '', { formula: `SUM(I2:I${n2})` }, { formula: `SUM(J2:J${n2})` }]);
  borderAll(s2);

  // ── 3) Payments ──
  const s3 = sheet(wb, 'پرداخت‌ها', [
    { header: 'تاریخ پرداخت', key: 'date', width: 14 }, { header: 'نام', key: 'name', width: 24, align: 'right' }, { header: 'تعداد روز', key: 'days', width: 10 },
    { header: 'مبلغ (تومان)', key: 'amount', width: 17, money: true }, { header: 'روش', key: 'method', width: 14 }, { header: 'شماره پیگیری', key: 'ref', width: 18 },
    { header: 'ثبت‌کننده', key: 'by', width: 12 }, { header: 'توضیحات', key: 'note', width: 28, align: 'right', wrap: true }, { header: 'وضعیت', key: 'st', width: 12 },
  ]);
  payments.forEach((p) => {
    const r = s3.addRow({ date: jalali(new Date(p.paid_at)).format('YYYY/MM/DD'), name: p.person_name, days: p.days_count, amount: p.amount, method: p.method || '', ref: p.reference || '', by: p.paid_by || '', note: p.note || '', st: p.cancelled_at ? 'لغو شده' : 'انجام شده' });
    if (p.cancelled_at) r.font = { name: FONT, size: 10, strike: true, color: { argb: 'FF9CA3AF' } };
  });
  totalRow(s3, ['', 'جمع (بدون لغوشده‌ها)', payments.filter((p) => !p.cancelled_at).reduce((n, p) => n + p.days_count, 0), payments.filter((p) => !p.cancelled_at).reduce((n, p) => n + p.amount, 0)]);
  s3.getCell(`D${payments.length + 2}`).numFmt = MONEY;
  borderAll(s3);

  // ── 4) Calendar: person × day ──
  const s4 = wb.addWorksheet('تقویم کاری', { views: [{ rightToLeft: true, state: 'frozen', xSplit: 1, ySplit: 1 }] });
  s4.columns = [{ header: 'نام', key: 'name', width: 24 }, ...days.map((k) => ({ header: `${fromKey(k).format('dd')}\n${fromKey(k).format('D')}`, key: k, width: 9 })), { header: 'جمع', key: 'sum', width: 15 }];
  s4.getRow(1).height = 32;
  s4.getRow(1).eachCell((c, col) => {
    c.font = { name: FONT, bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    c.fill = HEAD_FILL;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (col > 1 && col <= days.length + 1 && fromKey(days[col - 2]).weekDay.index === 6) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9F1239' } };
  });
  const cal = new Map();
  workdays.forEach((w) => {
    const p = cal.get(w.person_key) || { name: w.person_name, cells: {}, sum: 0 };
    const c = p.cells[w.day] || { amount: 0, paid: true };
    c.amount += w.amount; c.paid = c.paid && w.paid; p.cells[w.day] = c; p.sum += w.amount;
    cal.set(w.person_key, p);
  });
  pending.forEach((w) => {
    const p = cal.get(w.person_key) || { name: w.person_name, cells: {}, sum: 0 };
    if (!p.cells[w.day]) p.cells[w.day] = { pending: true };
    cal.set(w.person_key, p);
  });
  [...cal.values()].sort((a, b) => b.sum - a.sum).forEach((p) => {
    const r = s4.addRow({ name: p.name, sum: p.sum, ...Object.fromEntries(Object.entries(p.cells).map(([k, c]) => [k, c.pending ? '؟' : c.amount])) });
    r.font = { name: FONT, size: 9 };
    r.getCell('sum').numFmt = MONEY;
    days.forEach((k) => {
      const c = p.cells[k]; const cell = r.getCell(k);
      cell.alignment = { horizontal: 'center' };
      if (!c) { if (fromKey(k).weekDay.index === 6) cell.fill = FILLS.fri; return; }
      cell.numFmt = MONEY;
      cell.fill = c.pending ? FILLS.pending : c.paid ? FILLS.paid : FILLS.unpaid;
    });
  });
  borderAll(s4);
  const legend = s4.addRow([]);
  s4.addRow(['راهنما: سبز = پرداخت شده · زرد = تایید شده و پرداخت‌نشده · خاکستری (؟) = گزارش دارد ولی هنوز تایید نشده']).font = { name: FONT, size: 9, italic: true };
  void legend;

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `شیت پرداخت - ${title}.xlsx`);
}
