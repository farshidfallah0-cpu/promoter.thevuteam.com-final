import React, { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { fa, toman, tomanShort, shortDay, ROLES } from './payrollUtils';

const C = { paid: '#10b981', unpaid: '#f59e0b', pending: '#64748b', grid: 'rgba(255,255,255,0.06)', axis: 'rgba(255,255,255,0.45)' };
const PALETTE = ['#818cf8', '#f59e0b', '#22d3ee', '#f472b6', '#a3e635', '#fb7185', '#38bdf8', '#c084fc', '#facc15', '#2dd4bf'];

function Tip({ active, payload, label, money = true }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="pr-tip">
      {label && <b>{label}</b>}
      {payload.map((p) => (
        <span key={p.dataKey || p.name}><i style={{ background: p.color || p.payload?.fill }} />{p.name}: {money ? toman(p.value) : fa(p.value)}</span>
      ))}
    </div>
  );
}

// Name on the right of the axis, reading RTL, outside the bars.
const NameTick = ({ x, y, payload }) => (
  <text x={x + 8} y={y} dy={4} textAnchor="start" fill="#e2e8f0" fontSize={12} style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}>{payload.value}</text>
);

function Card({ title, sub, children, wide }) {
  return (
    <div className={`pr-chart ${wide ? 'wide' : ''}`}>
      <div className="pr-chart-head"><b>{title}</b>{sub && <span>{sub}</span>}</div>
      {children}
    </div>
  );
}

export default function ChartsView({ days, workdays, pending }) {
  const daily = useMemo(() => {
    const m = Object.fromEntries(days.map((k) => [k, { day: shortDay(k), paid: 0, unpaid: 0, people: new Set(), pending: 0 }]));
    workdays.forEach((w) => { const d = m[w.day]; if (!d) return; d[w.paid ? 'paid' : 'unpaid'] += w.amount; d.people.add(w.person_key); });
    pending.forEach((w) => { if (m[w.day]) m[w.day].pending += 1; });
    let run = 0;
    return days.map((k) => { const d = m[k]; run += d.paid + d.unpaid; return { ...d, people: d.people.size, cumulative: run }; });
  }, [days, workdays, pending]);

  const topPeople = useMemo(() => {
    const m = new Map();
    workdays.forEach((w) => {
      const p = m.get(w.person_key) || { name: w.person_name, paid: 0, unpaid: 0 };
      p[w.paid ? 'paid' : 'unpaid'] += w.amount;
      m.set(w.person_key, p);
    });
    return [...m.values()].sort((a, b) => (b.paid + b.unpaid) - (a.paid + a.unpaid)).slice(0, 12);
  }, [workdays]);

  const byEvent = useMemo(() => {
    const m = new Map();
    workdays.forEach((w) => m.set(w.event_name || '—', (m.get(w.event_name || '—') || 0) + w.amount));
    const arr = [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    if (arr.length > 8) { const rest = arr.splice(7); arr.push({ name: 'سایر', value: rest.reduce((n, x) => n + x.value, 0) }); }
    return arr;
  }, [workdays]);

  const byRole = useMemo(() => ROLES.map((r) => ({
    name: r.label, color: r.color, value: workdays.filter((w) => w.role === r.key).length,
  })).filter((r) => r.value), [workdays]);

  const total = workdays.reduce((n, w) => n + w.amount, 0);
  if (!workdays.length && !pending.length) return <div className="pr-empty"><b>برای نمودار داده‌ای در این بازه نیست</b></div>;

  return (
    <div className="pr-charts">
      <Card title="هزینه‌ی روزانه" sub={`جمع بازه: ${toman(total)}`} wide>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={daily} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="prPaid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.paid} stopOpacity={0.55} /><stop offset="100%" stopColor={C.paid} stopOpacity={0.02} /></linearGradient>
              <linearGradient id="prUnpaid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.unpaid} stopOpacity={0.55} /><stop offset="100%" stopColor={C.unpaid} stopOpacity={0.02} /></linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="day" tick={{ fill: C.axis, fontSize: 11 }} interval="preserveStartEnd" reversed />
            <YAxis tickFormatter={tomanShort} tick={{ fill: C.axis, fontSize: 11 }} width={70} orientation="right" />
            <Tooltip content={<Tip />} />
            <Area type="monotone" dataKey="paid" name="پرداخت‌شده" stackId="1" stroke={C.paid} fill="url(#prPaid)" strokeWidth={2} />
            <Area type="monotone" dataKey="unpaid" name="پرداخت‌نشده" stackId="1" stroke={C.unpaid} fill="url(#prUnpaid)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card title="نفرات فعال در هر روز" sub="روزهای تاییدشده و در انتظار تایید">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={daily} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="day" tick={{ fill: C.axis, fontSize: 10 }} interval="preserveStartEnd" reversed />
            <YAxis allowDecimals={false} tick={{ fill: C.axis, fontSize: 11 }} width={30} orientation="right" />
            <Tooltip content={<Tip money={false} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="people" name="تاییدشده" stackId="a" fill="#818cf8" radius={[0, 0, 0, 0]} />
            <Bar dataKey="pending" name="در انتظار" stackId="a" fill={C.pending} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="نقش‌ها" sub="تعداد روز کاری به تفکیک نقش">
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={byRole} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} stroke="none">
              {byRole.map((r) => <Cell key={r.name} fill={r.color} />)}
            </Pie>
            <Tooltip content={<Tip money={false} />} />
            <Legend formatter={(v) => <span style={{ color: '#cbd5e1', fontSize: 12 }}>{v}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card title="بیشترین کارکرد" sub="۱۲ نفر اول · پرداخت‌شده و مانده" wide>
        <ResponsiveContainer width="100%" height={Math.max(220, topPeople.length * 34)}>
          <BarChart data={topPeople} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} horizontal={false} />
            <XAxis type="number" tickFormatter={tomanShort} tick={{ fill: C.axis, fontSize: 11 }} reversed />
            <YAxis type="category" dataKey="name" tick={<NameTick />} width={140} orientation="right" />
            <Tooltip content={<Tip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="paid" name="پرداخت‌شده" stackId="a" fill={C.paid} />
            <Bar dataKey="unpaid" name="مانده" stackId="a" fill={C.unpaid} radius={[6, 0, 0, 6]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="هزینه به تفکیک ایونت">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={byEvent} dataKey="value" nameKey="name" innerRadius={50} outerRadius={95} paddingAngle={2} stroke="none">
              {byEvent.map((e, i) => <Cell key={e.name} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip content={<Tip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pr-pie-legend">
          {byEvent.map((e, i) => <span key={e.name}><i style={{ background: PALETTE[i % PALETTE.length] }} />{e.name}<b>{tomanShort(e.value)}</b></span>)}
        </div>
      </Card>

      <Card title="روند تجمعی هزینه" sub="جمع کارکرد از ابتدای بازه">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={daily} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
            <defs><linearGradient id="prCum" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#818cf8" stopOpacity={0.5} /><stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="day" tick={{ fill: C.axis, fontSize: 10 }} interval="preserveStartEnd" reversed />
            <YAxis tickFormatter={tomanShort} tick={{ fill: C.axis, fontSize: 11 }} width={70} orientation="right" />
            <Tooltip content={<Tip />} />
            <Area type="monotone" dataKey="cumulative" name="تجمعی" stroke="#818cf8" fill="url(#prCum)" strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
