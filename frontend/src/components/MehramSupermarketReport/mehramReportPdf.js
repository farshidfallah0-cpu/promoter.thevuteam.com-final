import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { fmtDate, fmtTime, fa, dayWeekdayName, fmtDistance, fmtDuration, geoVerdict, VISIT_PHOTOS, answerLabel } from './mehramVisits';

/*
 * PDF export of the Mehram report: A4 landscape pages designed in HTML and captured one by one.
 * (foreignObjectRendering is required — the default html2canvas renderer cannot join Persian letters.)
 *   1. cover + KPIs + visits per day + product availability
 *   2. promoter routes per day (admin only): stops in order, distance and time between stores
 *   3. visit cards with the answers, product status and photos
 */

const W = 1123; // A4 landscape @96dpi
const H = 794;
const INK = '#0f172a'; const MUTED = '#64748b'; const LINE = '#e2e8f0'; const ACCENT = '#6366f1';
const TONE = {
  good: ['#d1fae5', '#047857'], warn: ['#fef3c7', '#b45309'], bad: ['#fee2e2', '#b91c1c'], muted: ['#f1f5f9', '#475569'], info: ['#eef2ff', '#4338ca'],
};
const STATUS_TONE = { 'موجود': 'good', 'ناکافی': 'warn', 'موجود نیست': 'bad' };

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chip = (text, tone = 'muted', extra = '') => {
  const [bg, fg] = TONE[tone] || TONE.muted;
  return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;background:${bg};color:${fg};white-space:nowrap;${extra}">${esc(text)}</span>`;
};
const km = (m) => (m ? (m / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 }) : fa(0));

const shell = (inner, { title, sub, page, pages }) => `
  <div class="pg" style="position:relative;width:${W}px;height:${H}px;box-sizing:border-box;background:#fff;color:${INK};font-family:'Vazirmatn','IRANSans',Tahoma,sans-serif;direction:rtl;overflow:hidden">
    <div style="height:74px;padding:0 36px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(120deg,#0f172a,#312e81);color:#fff">
      <div><div style="font-size:21px;font-weight:900">${esc(title)}</div><div style="font-size:12px;opacity:.75;margin-top:3px">${esc(sub)}</div></div>
      <div style="font-size:13px;font-weight:800;letter-spacing:1px;opacity:.9">VU EVENT</div>
    </div>
    <div style="height:4px;background:linear-gradient(90deg,#6366f1,#22d3ee,#10b981)"></div>
    <div style="padding:18px 36px 0;height:${H - 74 - 4 - 38}px;box-sizing:border-box">${inner}</div>
    <div style="position:absolute;bottom:0;left:0;right:0;height:34px;padding:0 36px;display:flex;align-items:center;justify-content:space-between;font-size:11px;color:${MUTED};border-top:1px solid ${LINE}">
      <span>تهیه‌شده در ${esc(fmtDate(Date.now()))} — ${esc(fmtTime(Date.now()))}</span><span>صفحه ${fa(page)} از ${fa(pages)}</span>
    </div>
  </div>`;

const kpi = (label, value, tone = 'info') => {
  const [bg, fg] = TONE[tone];
  return `<div style="flex:1;min-width:0;padding:12px 14px;border-radius:14px;background:${bg}"><div style="font-size:11px;font-weight:700;color:${MUTED}">${esc(label)}</div><div style="font-size:26px;font-weight:900;color:${fg};margin-top:2px">${value}</div></div>`;
};

/* ── pages ── */

function coverPage(data, ctx) {
  const { totals, days, productStats } = data;
  const active = days.filter((d) => d.visits.length);
  const max = Math.max(1, ...active.map((d) => d.visits.length));
  const bars = active.slice(-14).map((d) => `
    <div style="display:flex;align-items:center;gap:10px;margin:5px 0">
      <div style="width:150px;font-size:12px;font-weight:700;text-align:right">${esc(d.label)}</div>
      <div style="flex:1;height:18px;background:#f1f5f9;border-radius:9px;overflow:hidden"><div style="width:${(d.visits.length / max) * 100}%;height:100%;background:linear-gradient(90deg,#818cf8,#6366f1);border-radius:9px"></div></div>
      <div style="width:70px;font-size:12px;font-weight:800">${fa(d.visits.length)} بازدید</div>
    </div>`).join('') || `<div style="color:${MUTED};font-size:13px">بازدیدی در این بازه ثبت نشده است.</div>`;
  const prod = productStats.map((g) => {
    const t = g['موجود'] + g['ناکافی'] + g['موجود نیست'];
    const seg = (n, c) => (n ? `<div style="width:${(n / t) * 100}%;background:${c};color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">${fa(n)}</div>` : '');
    return `<div style="margin:7px 0"><div style="font-size:12px;font-weight:700;margin-bottom:3px">${esc(g.title)}</div>
      <div style="display:flex;height:20px;border-radius:10px;overflow:hidden;background:#f1f5f9">${t ? seg(g['موجود'], '#10b981') + seg(g['ناکافی'], '#f59e0b') + seg(g['موجود نیست'], '#ef4444') : ''}</div></div>`;
  }).join('');
  const inner = `
    <div style="display:flex;gap:10px">
      ${kpi('تعداد بازدید', fa(totals.visits))}${kpi('فروشگاه بازدیدشده', fa(totals.stores))}${kpi('پروموتر فعال', fa(totals.promoters))}${kpi('روز فعال', fa(totals.days))}
      ${kpi('بازدید با کمبود محصول', fa(totals.shortage), totals.shortage ? 'bad' : 'good')}${kpi('فروشگاه ناهمکار', fa(totals.uncoop), totals.uncoop ? 'warn' : 'good')}
      ${ctx.clientView ? '' : kpi('کیلومتر مسیر', km(totals.travelM))}
    </div>
    <div style="display:flex;gap:26px;margin-top:20px">
      <div style="flex:1.15"><div style="font-size:15px;font-weight:900;margin-bottom:6px">بازدید در هر روز</div>${bars}</div>
      <div style="flex:1"><div style="font-size:15px;font-weight:900;margin-bottom:2px">وضعیت گروه محصولات</div>
        <div style="font-size:11px;color:${MUTED};margin-bottom:6px">${chip('موجود', 'good')} ${chip('ناکافی', 'warn')} ${chip('موجود نیست', 'bad')}</div>${prod}</div>
    </div>
    ${ctx.filterLines.length ? `<div style="margin-top:14px;font-size:12px;color:${MUTED}">فیلترهای خروجی: ${esc(ctx.filterLines.join(' · '))}</div>` : ''}`;
  return { inner, title: `گزارش سوپرمارکت‌ها — ${ctx.event?.name || ''}`, sub: [ctx.clientName, totals.from && `${fmtDate(totals.from)} تا ${fmtDate(totals.to)}`].filter(Boolean).join(' · ') };
}

const ROUTE_ROWS = 7;
function routePages(data, ctx) {
  const out = [];
  data.days.forEach((d) => d.people.filter((p) => p.route.stops.length || p.route.missed.length).forEach((p) => {
    const r = p.route;
    const items = [...r.stops.map((s, i) => ({ s, i })), ...r.missed.map((m) => ({ m }))];
    for (let off = 0; off < items.length; off += ROUTE_ROWS) {
      const td = (html, extra = '', attrs = '') => `<td ${attrs} style="padding:7px 6px;border-bottom:1px solid ${LINE};${extra}">${html}</td>`;
      const rows = items.slice(off, off + ROUTE_ROWS).map((it) => {
        if (it.m) {
          return `<tr style="background:#fff7f7">${td('')}${td(`${esc(it.m.store?.name || it.m.storeId)}<div style="font-size:11px;color:${MUTED};font-weight:600">${esc(it.m.store?.city || '')}</div>`, 'text-align:right;font-weight:800')}${td('در برنامه بود، انجام نشد', `color:${MUTED}`, 'colspan="3"')}${td(chip('انجام نشد', 'bad'))}${td('')}</tr>`;
        }
        const { s, i } = it;
        const odd = s.leg?.speedKmh != null && s.leg.speedKmh > 150;
        return `<tr>
          ${td(fa(i + 1), `font-weight:900;color:${ACCENT}`)}
          ${td(`${esc(s.visit.storeName)}<div style="font-size:11px;color:${MUTED};font-weight:600">${esc(s.visit.city)}${s.store?.district ? ` · ${esc(s.store.district)}` : ''}</div>`, 'text-align:right;font-weight:800')}
          ${td(fmtTime(s.visit.submittedAt))}
          ${td(s.leg && s.leg.distance != null ? fmtDistance(s.leg.distance) : '—')}
          ${td(`${s.leg ? fmtDuration(s.leg.gap) : '—'}${odd ? '<div style="color:#b91c1c;font-size:10px;font-weight:800">سرعت غیرعادی</div>' : ''}`)}
          ${td(chip(s.verdict.label, { near: 'good', far: 'warn', none: 'bad' }[s.verdict.state] || 'muted'))}
          ${td(r.plannedCount ? (s.planned ? chip('در برنامه', 'good') : chip('خارج از برنامه', 'warn')) : '')}
        </tr>`;
      }).join('');
      const head = `
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
          <div style="width:44px;height:44px;border-radius:14px;background:#eef2ff;color:${ACCENT};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900">${esc((p.name || '؟').charAt(0))}</div>
          <div style="flex:1"><div style="font-size:18px;font-weight:900">${esc(p.name)}</div><div style="font-size:12px;color:${MUTED}">${esc(d.label)}${r.startAt ? ` · ${fmtTime(r.startAt)} تا ${fmtTime(r.endAt)}` : ''}</div></div>
          <div style="display:flex;gap:8px">${chip(`${fa(r.stops.length)} بازدید`, 'info')}${r.plannedCount ? chip(`${fa(r.doneCount)} از ${fa(r.plannedCount)} برنامه`, r.doneCount === r.plannedCount ? 'good' : 'warn') : ''}${r.travelM ? chip(`${km(r.travelM)} کیلومتر`, 'muted') : ''}${r.far ? chip(`${fa(r.far)} دور از فروشگاه`, 'warn') : ''}</div>
        </div>`;
      const th = (t, w) => `<th style="padding:8px 6px;font-size:11px;color:${MUTED};background:#f8fafc;border-bottom:2px solid ${LINE};${w ? `width:${w}px` : ''}">${t}</th>`;
      out.push({
        title: 'مسیر روزانه‌ی پروموترها', sub: `${ctx.event?.name || ''} · ${d.label}`,
        inner: `${head}<table style="width:100%;border-collapse:collapse;text-align:center;font-size:13px">
          <thead><tr>${th('ردیف', 46)}${th('فروشگاه')}${th('ساعت ثبت', 80)}${th('فاصله از فروشگاه قبلی', 140)}${th('زمان از فروشگاه قبلی', 140)}${th('موقعیت هنگام ثبت', 190)}${th('برنامه', 110)}</tr></thead>
          <tbody>${rows}</tbody></table>`,
      });
    }
  }));
  return out;
}

const CARDS_PER_PAGE = 6;
function visitPages(data, ctx, photos) {
  const { visits, questions, groups } = data;
  const out = [];
  for (let i = 0; i < visits.length; i += CARDS_PER_PAGE) {
    const cards = visits.slice(i, i + CARDS_PER_PAGE).map((v) => {
      const g = geoVerdict(v.geo, v.store);
      const ans = questions.filter((q) => v.answers[q.key]).map((q) => {
        const bad = (q.key === 'storeCooperates' && ['خیر', 'همکاری نمی‌کند'].includes(v.answers[q.key])) || (q.key === 'shelfTalkerInstall' && v.answers[q.key] === 'خیر');
        return `<div style="font-size:10.5px;color:${MUTED}">${esc(q.title)}: <b style="color:${bad ? '#b91c1c' : INK}">${esc(answerLabel(q.key, v.answers[q.key]))}</b></div>`;
      }).join('');
      const dots = groups.filter((gr) => v.products[gr.key]).map((gr) => {
        const [bg, fg] = TONE[STATUS_TONE[v.products[gr.key]] || 'muted'];
        return `<span title="${esc(gr.title)}" style="display:inline-block;margin:1px 2px 1px 0;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:700;background:${bg};color:${fg}">${esc(gr.title.split(' ')[0])}: ${esc(v.products[gr.key])}</span>`;
      }).join('');
      const imgs = ctx.includePhotos ? `<div style="display:flex;gap:5px;margin-top:7px">${VISIT_PHOTOS.map(([k]) => {
        const uri = photos.get(v[k]);
        return `<div style="width:58px;height:58px;border-radius:8px;background:#f1f5f9;overflow:hidden;flex-shrink:0">${uri ? `<img src="${uri}" style="width:58px;height:58px;object-fit:cover;display:block" />` : ''}</div>`;
      }).join('')}</div>` : '';
      return `<div style="box-sizing:border-box;width:331px;height:316px;padding:11px 13px;border:1px solid ${LINE};border-radius:14px;overflow:hidden;background:#fff">
        <div style="display:flex;justify-content:space-between;gap:6px"><div style="min-width:0"><div style="font-size:14px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(v.storeName)}</div>
          <div style="font-size:11px;color:${MUTED}">${esc(v.city)}${v.store?.district ? ` · ${esc(v.store.district)}` : ''}</div></div>
          <div style="text-align:left;font-size:11px;color:${MUTED};white-space:nowrap">${esc(dayWeekdayName(v.submittedAt))}<br/>${esc(fmtTime(v.submittedAt))}</div></div>
        <div style="margin:6px 0 4px;display:flex;flex-wrap:wrap;gap:4px">${chip(v.promoterName, 'info')}${!ctx.clientView && v.calledAt ? chip('تماس گرفته شد', 'good') : ''}${ctx.clientView ? '' : chip(g.label, { near: 'good', far: 'warn', none: 'bad' }[g.state] || 'muted')}</div>
        ${ans}<div style="margin-top:5px">${dots}</div>${imgs}</div>`;
    }).join('');
    out.push({ title: 'جزئیات بازدیدها', sub: `${ctx.event?.name || ''} · بازدید ${fa(i + 1)} تا ${fa(Math.min(i + CARDS_PER_PAGE, visits.length))} از ${fa(visits.length)}`, inner: `<div style="display:flex;flex-wrap:wrap;gap:12px">${cards}</div>` });
  }
  return out;
}

/* ── photos → small data URIs (canvas html2canvas can draw) ── */
async function thumb(url) {
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    const size = 160; const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ratio = Math.max(size / bmp.width, size / bmp.height);
    const w = bmp.width * ratio; const h = bmp.height * ratio;
    c.getContext('2d').drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
    return c.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}
async function loadPhotos(visits, onProgress) {
  const urls = [...new Set(visits.flatMap((v) => VISIT_PHOTOS.map(([k]) => v[k])).filter(Boolean))];
  const map = new Map(); let done = 0;
  for (let i = 0; i < urls.length; i += 6) {
    await Promise.all(urls.slice(i, i + 6).map(async (u) => { map.set(u, await thumb(u)); done += 1; onProgress?.(`دریافت عکس‌ها ${fa(done)} از ${fa(urls.length)}`); }));
  }
  return map;
}

export async function exportMehramReportPdf({ data, event, clientName, filterLines, clientView = false, includePhotos = true, onProgress }) {
  const ctx = { event, clientName, filterLines, clientView, includePhotos };
  const photos = includePhotos ? await loadPhotos(data.visits, onProgress) : new Map();
  const pages = [coverPage(data, ctx), ...(clientView ? [] : routePages(data, ctx)), ...visitPages(data, ctx, photos)];

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:-1`;
  document.body.appendChild(host);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    for (let i = 0; i < pages.length; i += 1) {
      onProgress?.(`ساخت صفحه ${fa(i + 1)} از ${fa(pages.length)}`);
      host.innerHTML = shell(pages[i].inner, { title: pages[i].title, sub: pages[i].sub, page: i + 1, pages: pages.length });
      await Promise.all([...host.querySelectorAll('img')].map((im) => im.decode().catch(() => {})));
      const canvas = await html2canvas(host.firstElementChild, {
        scale: 1.6, backgroundColor: '#ffffff', foreignObjectRendering: true, useCORS: true, width: W, height: H, x: 0, y: 0, logging: false,
      });
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
    }
  } finally {
    host.remove();
  }
  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });
  pdf.save(`Mahram_Report_${stamp}.pdf`);
}
