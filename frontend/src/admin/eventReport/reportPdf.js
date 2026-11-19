import { jsPDF } from 'jspdf';
import { safeFileName, toFa } from './reportUtils';

export const PAGE_W = 794;
const PAGE_H = 1123;
const TOP_PAD = 56;   // continuation pages: small running header
const FOOTER = 46;
const SCALE = 2;

export const fetchAsDataUri = async (url) => {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

// The site loads Vazirmatn from a CDN stylesheet, which the SVG/foreignObject
// capture cannot fetch — so the PDF gets its own copy embedded as data URIs.
const FONT_BASE = 'https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/webfonts/';
const FONT_FILES = { 400: 'Regular', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
let fontCssCache = null;
export const loadPdfFontCss = async () => {
  if (fontCssCache) return fontCssCache;
  const faces = await Promise.all(Object.entries(FONT_FILES).map(async ([w, name]) => {
    const uri = await fetchAsDataUri(`${FONT_BASE}Vazirmatn-${name}.woff2`);
    return uri ? `@font-face{font-family:'VuPdf';src:url(${uri}) format('woff2');font-weight:${w};font-style:normal;}` : '';
  }));
  const css = faces.join('\n');
  if (faces.every(Boolean)) fontCssCache = css;
  return css;
};

export const preloadFonts = async () => {
  if (!document.fonts) return;
  try {
    await Promise.all(['400 16px VuPdf', '600 16px VuPdf', '700 16px VuPdf', '800 16px VuPdf', '900 16px VuPdf', '500 16px Vazirmatn', '700 16px Vazirmatn']
      .map(s => document.fonts.load(s, 'گزارش').catch(() => {})));
    await document.fonts.ready;
  } catch { /* best effort */ }
};

/** Every CSS rule that styles the template (.frp-*), as text. */
function templateCss() {
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; } // cross-origin sheet
    for (const r of rules || []) {
      if (r.cssText && r.cssText.includes('frp-')) out.push(r.cssText);
    }
  }
  return out.join('\n');
}

/**
 * Rasterizes the template through an SVG <foreignObject>: the browser's own
 * text engine shapes the Persian, and the font + styles travel inside the SVG
 * (an SVG image can't load anything external).
 */
async function renderToCanvas(root, fontCss, width, height, scale) {
  const clone = root.cloneNode(true);
  clone.querySelectorAll('style').forEach(el => el.remove());
  const html = new XMLSerializer().serializeToString(clone);
  const css = `${fontCss || ''}\n${templateCss()}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<foreignObject x="0" y="0" width="100%" height="100%">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;margin:0;padding:0;background:#fff">`
    + `<style><![CDATA[${css.split(']]>').join('')}]]></style>${html}</div></foreignObject></svg>`;
  const img = new Image();
  img.decoding = 'sync';
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('svg render failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  // Give the embedded fonts a beat to apply before rasterizing.
  await new Promise(r => setTimeout(r, 150));
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Where each page starts/ends (CSS px), never cutting through a `.frp-block`. */
function paginate(root, totalH) {
  const rootTop = root.getBoundingClientRect().top;
  const blocks = [...root.querySelectorAll('.frp-block')].map(el => {
    const r = el.getBoundingClientRect();
    return { top: r.top - rootTop, keep: el.classList.contains('frp-keep') };
  }).sort((a, b) => a.top - b.top);

  const pages = [];
  let cur = 0;
  while (cur < totalH - 1) {
    const avail = PAGE_H - FOOTER - (pages.length ? TOP_PAD : 0);
    const limit = cur + avail;
    if (limit >= totalH) { pages.push([cur, totalH]); break; }
    // Last block that starts after `cur` and before the page limit moves to the next page.
    // (Must make real progress; a block taller than a whole page gets a hard cut.)
    const ok = (b) => b.top - 6 > cur + 40 && b.top <= limit;
    let i = -1;
    blocks.forEach((b, k) => { if (ok(b)) i = k; });
    while (i > 0 && blocks[i - 1].keep && ok(blocks[i - 1])) i -= 1;
    const end = i >= 0 ? blocks[i].top - 6 : limit;
    pages.push([cur, end]);
    cur = end;
  }
  return pages;
}

export async function exportReportPdf(root, form, fontCss) {
  await preloadFonts();
  const prevScroll = window.scrollY;
  window.scrollTo(0, 0);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const totalH = Math.ceil(root.scrollHeight);
  try {
    const canvas = await renderToCanvas(root, fontCss, PAGE_W, totalH, SCALE);
    const pages = paginate(root, totalH);
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    const mmW = 210;
    const mmH = 297;

    pages.forEach(([from, to], idx) => {
      const page = document.createElement('canvas');
      page.width = PAGE_W * SCALE;
      page.height = PAGE_H * SCALE;
      const ctx = page.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, page.width, page.height);
      const offset = idx ? TOP_PAD : 0;
      const h = Math.min(to - from, PAGE_H - FOOTER - offset);
      ctx.drawImage(canvas, 0, from * SCALE, PAGE_W * SCALE, h * SCALE, 0, offset * SCALE, PAGE_W * SCALE, h * SCALE);

      ctx.scale(SCALE, SCALE);
      ctx.direction = 'rtl';
      if (idx) {
        ctx.fillStyle = '#3b2d4f';
        ctx.font = '700 12px VuPdf, Vazirmatn, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`گزارش ایونت — ${form.name || ''}`, PAGE_W - 40, 30);
        ctx.fillStyle = '#f5c118';
        ctx.fillRect(40, 40, PAGE_W - 80, 2);
      }
      ctx.fillStyle = '#ece9f3';
      ctx.fillRect(40, PAGE_H - FOOTER + 8, PAGE_W - 80, 1);
      ctx.fillStyle = '#8a8399';
      ctx.font = '500 10.5px VuPdf, Vazirmatn, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`صفحه ${toFa(idx + 1)} از ${toFa(pages.length)}`, PAGE_W - 40, PAGE_H - 18);
      ctx.textAlign = 'left';
      ctx.direction = 'ltr';
      ctx.font = '700 10.5px VuPdf, Vazirmatn, sans-serif';
      ctx.fillStyle = '#3b2d4f';
      ctx.fillText('VU Team', 40, PAGE_H - 18);

      if (idx) pdf.addPage();
      pdf.addImage(page.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, mmW, mmH);
    });

    pdf.save(`VU_Event_Report_${safeFileName(form.name)}.pdf`);
  } finally {
    window.scrollTo(0, prevScroll);
  }
}
