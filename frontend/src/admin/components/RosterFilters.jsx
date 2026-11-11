import React, { useMemo } from 'react';
import CityPicker from './CityPicker';
import MultiSelectDropdown from './MultiSelectDropdown';
import { EMPTY_ROSTER_FILTERS, rosterFilterCount, rosterCities } from '../utils/rosterFilters';

const TITLES = ['Rookie', 'Pro', 'Expert', 'Elite'];

/**
 * The filter bar of the promoter archive (archive tab) and of the «add promoter to this event» modal: search, gender,
 * title, city, badges (several at once) and — only inside an event — «هست / نیست در این ایونت».
 */
const RosterFilters = ({ filters, onChange, roster, badges, shown, showPresence = false, compact = false }) => {
  const set = (patch) => onChange({ ...filters, ...patch });
  const cities = useMemo(() => rosterCities(roster), [roster]);
  const cityOptions = useMemo(() => cities.map(([c]) => c), [cities]);
  const cityCounts = useMemo(() => new Map(cities), [cities]);
  const badgeOptions = useMemo(() => badges.map((b) => ({ id: b.id, label: b.name, image: b.image_url, color: b.color })), [badges]);
  const active = rosterFilterCount(filters);

  return (
    <div className={`rf ${compact ? 'rf--compact' : ''}`}>
      <div className="admin-search-bar rf-search" style={{ margin: 0 }}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="15" height="15">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input placeholder="جستجو: نام، شماره تماس، شهر یا نام کاربری..." value={filters.q} onChange={(e) => set({ q: e.target.value })} aria-label="جستجو" />
        {filters.q && <button type="button" className="rf-clear-q" onClick={() => set({ q: '' })} aria-label="پاک کردن جستجو">×</button>}
      </div>
      <div className="rf-row">
        <div className="rc-filter-group" role="radiogroup" aria-label="جنسیت">
          {[['all', 'همه'], ['male', 'آقا'], ['female', 'خانم'], ['unset', 'نامشخص']].map(([k, label]) => (
            <button type="button" key={k} className={`rc-filter-btn ${filters.gender === k ? 'active' : ''}`} onClick={() => set({ gender: k })}>{label}</button>
          ))}
        </div>
        <div className="rc-filter-group" role="radiogroup" aria-label="تایتل">
          <button type="button" className={`rc-filter-btn ${filters.title === 'all' ? 'active' : ''}`} onClick={() => set({ title: 'all' })}>همه تایتل‌ها</button>
          {TITLES.map((t) => (
            <button type="button" key={t} className={`rc-filter-btn rc-title-${t.toLowerCase()} ${filters.title === t ? 'active' : ''}`} onClick={() => set({ title: filters.title === t ? 'all' : t })}>{t}</button>
          ))}
        </div>
      </div>
      <div className="rf-row rf-row--drops">
        <CityPicker value={filters.city} onChange={(c) => set({ city: c })} options={cityOptions} counts={cityCounts} allowCustom={false} placeholder="همه شهرها" clearLabel="همه شهرها" />
        <MultiSelectDropdown label="بج‌ها" options={badgeOptions} value={filters.badgeIds} onChange={(ids) => set({ badgeIds: ids })}
          mode={filters.badgeMode} onModeChange={(m) => set({ badgeMode: m })} modeLabels={['داشتن همه', 'داشتن یکی از']} />
        {showPresence && (
          <div className="rc-filter-group" role="radiogroup" aria-label="حضور در ایونت">
            {[['all', 'همه'], ['in', 'در این ایونت هست'], ['out', 'در این ایونت نیست']].map(([k, l]) => (
              <button type="button" key={k} className={`rc-filter-btn ${filters.presence === k ? 'active' : ''}`} onClick={() => set({ presence: k })}>{l}</button>
            ))}
          </div>
        )}
        {active > 0 && <button type="button" className="rf-reset" onClick={() => onChange({ ...EMPTY_ROSTER_FILTERS })}>↺ پاک کردن فیلترها ({active.toLocaleString('fa-IR')})</button>}
        <span className="rc-count">{shown.toLocaleString('fa-IR')} نفر</span>
      </div>
    </div>
  );
};

export default RosterFilters;
