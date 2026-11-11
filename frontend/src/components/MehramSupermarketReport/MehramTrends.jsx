import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Download, Loader2, TrendingUp, Package, FileSpreadsheet } from 'lucide-react';
import { MEHRAM_STORES } from './mehramData';
import { weekStart, weekName, weekLabel, fa, isShortage, geoVerdict, WEEK_MS } from './mehramVisits';

/*
 * «روند و گزارش هفتگی»: week-over-week coverage (one series → one sequential hue,
 * no legend; the title names it), product shortages as a heatmap table (one hue,
 * every cell labelled, so it is also the table view), and every week as a ready
 * report with its Excel download.
 */
const WEEKS_SHOWN = 12;

// Chart colours from the reference palette, stepped per theme (not an automatic flip).
const PALETTE = {
  light: { bar: '#2a78d6', text: '#52514e', grid: 'rgba(0,0,0,0.08)', heat: '235, 104, 52' },
  dark: { bar: '#3987e5', text: '#c3c2b7', grid: 'rgba(255,255,255,0.08)', heat: '217, 89, 38' },
};
const useTheme = () => {
  const read = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
};

const shortDate = (ms) => new Date(ms).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran', day: 'numeric', month: 'short' });

/** Per-week stats over `stores` (already city-filtered). */
export const weekStats = (visits, stores, groups) => {
  const storeIds = new Set(stores.map((s) => s.id));
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const byWeek = new Map();
  visits.forEach((v) => {
    if (!storeIds.has(v.storeId)) return;
    const w = weekStart(v.submittedAt);
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w).push(v);
  });
  const current = weekStart(Date.now());
  if (!byWeek.has(current)) byWeek.set(current, []);
  return [...byWeek.entries()].sort((a, b) => b[0] - a[0]).slice(0, WEEKS_SHOWN).map(([w, vs]) => {
    // Latest visit per store in that week decides the store's state.
    const latest = new Map();
    vs.forEach((v) => { const p = latest.get(v.storeId); if (!p || v.submittedAt > p.submittedAt) latest.set(v.storeId, v); });
    const lv = [...latest.values()];
    const product = Object.fromEntries(groups.map((g) => {
      const answered = lv.filter((v) => v.products?.[g.key]);
      const short = answered.filter((v) => isShortage(v.products[g.key]));
      return [g.key, { answered: answered.length, short: short.length }];
    }));
    return {
      week: w,
      visited: latest.size,
      total: stores.length,
      pct: stores.length ? Math.round((latest.size / stores.length) * 100) : 0,
      visits: vs.length,
      promoters: [...new Set(vs.map((v) => v.promoterName))],
      shortageStores: lv.filter((v) => Object.values(v.products || {}).some(isShortage)).length,
      far: vs.filter((v) => geoVerdict(v.geo, storeById.get(v.storeId)).state === 'far').length,
      product,
    };
  });
};

const CoverageTooltip = ({ active, payload, clientView }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="mst-tip">
      <b>{weekName(d.week)}</b>
      <small>{weekLabel(d.week)}</small>
      <span>{fa(d.visited)} از {fa(d.total)} فروشگاه ({fa(d.pct)}٪)</span>
      <span>{fa(d.visits)} بازدید{clientView ? '' : ` · ${fa(d.promoters.length)} پروموتر`}</span>
    </div>
  );
};

const MehramTrends = ({ visits, cityFilter, groups, clientView, onExportWeek, exportingWeek }) => {
  const theme = useTheme();
  const pal = PALETTE[theme];
  const stores = useMemo(() => MEHRAM_STORES.filter((s) => cityFilter === 'all' || s.city === cityFilter), [cityFilter]);
  const stats = useMemo(() => weekStats(visits, stores, groups), [visits, stores, groups]);
  const chartData = useMemo(() => [...stats].reverse().map((s) => ({ ...s, label: shortDate(s.week) })), [stats]);
  const heatWeeks = chartData.slice(-8);
  const scope = cityFilter === 'all' ? 'همه شهرها' : cityFilter;

  return (
    <div className="mst-trends">
      <section className="mst-panel">
        <header className="mst-panel-head">
          <h3><TrendingUp size={16} /> پوشش هفتگی فروشگاه‌ها</h3>
          <small>تعداد فروشگاه‌های بازدیدشده در هر هفته · {scope} ({fa(stores.length)} فروشگاه)</small>
        </header>
        <div className="mst-chart" style={{ color: pal.text }}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 12, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke={pal.grid} />
              <XAxis dataKey="label" tick={{ fill: 'currentColor', fontSize: 11 }} axisLine={false} tickLine={false} reversed />
              <YAxis allowDecimals={false} tickFormatter={(n) => fa(n)} tick={{ fill: 'currentColor', fontSize: 11 }} axisLine={false} tickLine={false} orientation="right" width={34} />
              <Tooltip content={<CoverageTooltip clientView={clientView} />} cursor={{ fill: pal.grid }} />
              <Bar dataKey="visited" fill={pal.bar} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {groups.length > 0 && (
        <section className="mst-panel">
          <header className="mst-panel-head">
            <h3><Package size={16} /> کمبود گروه محصولات در هر هفته</h3>
            <small>درصد فروشگاه‌های بازدیدشده که «ناکافی» یا «موجود نیست» گزارش شده‌اند — هر چه پررنگ‌تر، کمبود بیشتر</small>
          </header>
          <div className="mst-heat-wrap">
            <table className="mst-heat">
              <thead>
                <tr>
                  <th scope="col">گروه محصول</th>
                  {heatWeeks.map((w) => <th scope="col" key={w.week} title={weekLabel(w.week)}>{w.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.key}>
                    <th scope="row">{g.title}</th>
                    {heatWeeks.map((w) => {
                      const c = w.product[g.key];
                      if (!c?.answered) return <td key={w.week} className="empty">—</td>;
                      const pct = Math.round((c.short / c.answered) * 100);
                      return (
                        <td key={w.week} style={{ background: `rgba(${pal.heat}, ${0.08 + (pct / 100) * 0.67})` }}
                          title={`${g.title} — ${weekName(w.week)}: ${fa(c.short)} از ${fa(c.answered)} فروشگاه`}>
                          {fa(pct)}٪
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mst-panel">
        <header className="mst-panel-head">
          <h3><FileSpreadsheet size={16} /> گزارش‌های هفتگی</h3>
          <small>هر هفته (شنبه تا جمعه) یک گزارش آماده — {scope}</small>
        </header>
        <div className="mst-weekly">
          {stats.map((s) => (
            <div className="mst-weekly-row" key={s.week}>
              <div className="mst-weekly-name">
                <b>{weekName(s.week)}</b>
                <small>{weekLabel(s.week)}{s.week + WEEK_MS > Date.now() ? ' · در جریان' : ''}</small>
              </div>
              <div className="mst-weekly-cov">
                <span>{fa(s.visited)}/{fa(s.total)}</span>
                <div className="mst-progress"><span style={{ width: `${s.pct}%` }} /></div>
              </div>
              <span className="mst-weekly-stat"><b>{fa(s.visits)}</b> بازدید</span>
              {!clientView && <span className="mst-weekly-stat"><b>{fa(s.promoters.length)}</b> پروموتر</span>}
              <span className={`mst-weekly-stat ${s.shortageStores ? 'bad' : ''}`}><b>{fa(s.shortageStores)}</b> کمبود</span>
              {!clientView && <span className={`mst-weekly-stat ${s.far ? 'warn' : ''}`}><b>{fa(s.far)}</b> خارج از محدوده</span>}
              <button type="button" className="mst-btn" disabled={!s.visits || exportingWeek === s.week} onClick={() => onExportWeek(s.week)}>
                {exportingWeek === s.week ? <Loader2 size={14} className="mst-spin" /> : <Download size={14} />} اکسل
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default MehramTrends;
