import React, { forwardRef } from 'react';
import { fmtJalali, toFa, fmtCount, ratingOf, RATINGS, fmtTimeRange, ageRangeText, daysWithPeople, uniquePeople } from './reportUtils';

// A4 at 96dpi = 794 × 1123 CSS px. Every `.frp-block` is a unit the paginator
// never splits; `.frp-keep` blocks (section titles) stay with the block after them.
const Stat = ({ label, value, accent }) => (
  <div className="frp-stat" style={{ '--acc': accent }}>
    <div className="frp-stat-value">{value === '' || value === null || value === undefined ? '—' : value}</div>
    <div className="frp-stat-label">{label}</div>
  </div>
);

const Title = ({ children, n }) => (
  <div className="frp-title frp-block frp-keep">
    <span className="frp-title-n">{toFa(String(n).padStart(2, '0'))}</span>
    <span>{children}</span>
    <span className="frp-title-line" />
  </div>
);

const TextBox = ({ label, text, highlight, empty = 'موردی ثبت نشده' }) => (
  <div className={`frp-textbox frp-block ${highlight ? 'is-hl' : ''}`}>
    <div className="frp-textbox-label">{label}</div>
    <div className={`frp-textbox-body ${text?.trim() ? '' : 'is-empty'}`}>{text?.trim() ? toFa(text) : empty}</div>
  </div>
);

const FinalReportPdf = forwardRef(({ form, assets }, ref) => {
  const days = daysWithPeople(form);
  const rating = ratingOf(form.rating);
  const ratingIdx = rating ? RATINGS.findIndex(r => r.key === rating.key) : -1;
  const items = form.returned_items.filter(it => it.name.trim());
  const firstDay = days[0] ? fmtJalali(days[0].date) : null;
  const lastDay = days.length > 1 ? fmtJalali(days[days.length - 1].date) : null;
  let n = 0;

  return (
    <div className="frp-root" ref={ref} dir="rtl">
      {assets?.fontCss && <style>{assets.fontCss}</style>}
      <div className="frp-hero frp-block">
        <div className="frp-hero-glow" />
        <div className="frp-hero-main">
          <div className="frp-kicker">گزارش ایونت</div>
          <div className="frp-event-name">{form.name || '—'}</div>
          <div className="frp-hero-meta">
            {form.client_name && <span className="frp-chip-y">{form.client_name}</span>}
            {form.location && <span>{toFa(form.location)}</span>}
            {firstDay && <span>{firstDay.full}{lastDay ? ` تا ${lastDay.full}` : ''}</span>}
          </div>
        </div>
        <div className="frp-logos">
          {assets?.clientLogo && <div className="frp-logo-tile"><img src={assets.clientLogo} alt="" /></div>}
          {assets?.vuLogo && <div className="frp-logo-tile"><img src={assets.vuLogo} alt="" /></div>}
        </div>
      </div>

      <div className="frp-stats frp-block">
        <Stat label="روز برگزاری" value={toFa(days.length)} accent="#7c5cff" />
        <Stat label="پروموتر (نفر)" value={toFa(uniquePeople(form))} accent="#f5c118" />
        <Stat label="محصول ارسال‌شده" value={fmtCount(form.products_sent)} accent="#3b82f6" />
        <Stat label="محصول سمپل‌شده" value={fmtCount(form.sampled)} accent="#10b981" />
      </div>

      <Title n={++n}>روزها، ساعت برگزاری و تیم</Title>
      {days.length === 0 && <div className="frp-empty frp-block">روزی ثبت نشده</div>}
      {days.map((d, i) => {
        const j = fmtJalali(d.date);
        return (
          <div className="frp-day frp-block" key={d.date + i}>
            <div className="frp-day-head">
              <div className="frp-day-badge">روز {toFa(i + 1)}</div>
              <div className="frp-day-date"><b>{j.weekday}</b> {j.full}</div>
              {fmtTimeRange(d.start, d.end) && <div className="frp-day-time">{fmtTimeRange(d.start, d.end)}</div>}
              <div className="frp-day-count">{toFa(d.people.length)} نفر</div>
            </div>
            <div className="frp-people">
              {d.people.length === 0 && <span className="frp-muted">—</span>}
              {d.people.map((p, k) => (
                <span key={k} className={`frp-person ${p.role === 'supervisor' ? 'is-sup' : ''}`}>
                  {p.name}{p.role === 'supervisor' && <small>سوپروایزر</small>}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      <Title n={++n}>لجستیک</Title>
      <div className="frp-logi frp-block">
        <div className="frp-card">
          <div className="frp-card-label">وسایل برگشتی</div>
          {items.length === 0 ? <div className="frp-muted">موردی ثبت نشده</div> : (
            <div className="frp-items">
              {items.map((it, i) => (
                <div className="frp-item" key={i}>
                  <span className="frp-item-n">{toFa(i + 1)}</span>
                  <span className="frp-item-name">{toFa(it.name)}</span>
                  {it.qty !== '' && it.qty !== undefined && <span className="frp-item-qty">× {toFa(it.qty)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="frp-cars">
          <div className="frp-car">
            <div className="frp-car-v">{form.cars_send === '' ? '—' : toFa(form.cars_send)}</div>
            <div className="frp-car-l">ماشین ارسال وسایل</div>
          </div>
          <div className="frp-car">
            <div className="frp-car-v">{form.cars_return === '' ? '—' : toFa(form.cars_return)}</div>
            <div className="frp-car-l">ماشین برگشت اقلام</div>
          </div>
        </div>
      </div>

      <Title n={++n}>ارزیابی ایونت</Title>
      <div className="frp-eval frp-block">
        <div className="frp-card frp-rating">
          <div className="frp-card-label">نحوه برگزاری</div>
          <div className="frp-rating-value" style={{ color: rating?.color || '#9a93ad' }}>{rating ? rating.label : 'ثبت نشده'}</div>
          <div className="frp-meter">
            {[...RATINGS].reverse().map((r) => {
              const idx = RATINGS.findIndex(x => x.key === r.key);
              const on = ratingIdx !== -1 && idx >= ratingIdx;
              return <span key={r.key} style={{ background: on ? rating.color : '#ece9f3' }} />;
            })}
          </div>
        </div>
        <div className="frp-card">
          <div className="frp-card-label">بازه سنی مخاطبین</div>
          <div className="frp-card-value">{ageRangeText(form.age_from, form.age_to) || '—'}</div>
        </div>
        <div className="frp-card">
          <div className="frp-card-label">تخمین تعداد مخاطبین</div>
          <div className="frp-card-value">{form.audience_estimate === '' ? '—' : `${fmtCount(form.audience_estimate)} نفر`}</div>
        </div>
      </div>
      <TextBox label="مخاطب هدف" text={form.audience_fit} />
      <TextBox label="مشکلات پیش‌آمده" text={form.problems} />
      <TextBox label="موارد پیش‌آمده در ایونت" text={form.incidents} empty="موردی نبوده" />

      <Title n={++n}>گزارش کلی</Title>
      <TextBox label="جمع‌بندی" text={form.summary} highlight />
      <div className="frp-end frp-block">VU Team</div>
    </div>
  );
});

export default FinalReportPdf;
