import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, MapPin, X, CheckCircle2, Droplet, Flame, PenLine, Sparkles } from 'lucide-react';
import { toast } from 'react-toastify';
import { BVT_PRODUCTS, searchCigarettes, matchBvtProduct } from './cigaretteDatabase';
import { startLocationService, getUsableFix, waitForFix, getFailureReason, getLocationStatus, subscribeLocation } from '../../utils/locationService';
import './bvt.css';

// GeolocationPositionError.code: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE
// (GPS/location services off at the OS or browser level, or an insecure/http
// origin on a real device), 3 = TIMEOUT. Surfacing which one it is turns a
// silently-null location into something actually diagnosable.
const describeGeoError = (err) => {
  if (!err) return 'موقعیت مکانی دریافت نشد';
  if (err.code === 1) return 'دسترسی به موقعیت مکانی رد شده — از تنظیمات مرورگر/گوشی اجازه بده';
  if (err.code === 2) return 'موقعیت مکانی در دسترس نیست — GPS یا Location Service گوشی/سیستم را روشن کن';
  if (err.code === 3) return 'دریافت موقعیت مکانی طول کشید — دوباره تلاش کن';
  return 'موقعیت مکانی دریافت نشد';
};

let lastLocationWarnAt = 0;
// One toast per minute at most — a run of handouts must not spam the promoter.
const warnLocationFailure = (fail) => {
  if (Date.now() - lastLocationWarnAt < 60000) return;
  lastLocationWarnAt = Date.now();
  if (fail.reason === 'low_accuracy') {
    toast.warn(`دقت موقعیت مکانی کافی نبود (حدود ${fail.accuracy} متر) — GPS گوشی را روشن و «دقت بالا» را فعال کن`);
  } else if (fail.reason === 'unsupported') {
    toast.warn('این مرورگر از موقعیت مکانی پشتیبانی نمی‌کند — از Chrome یا Safari استفاده کن');
  } else {
    toast.warn(`${describeGeoError({ code: fail.reason === 'denied' ? 1 : (fail.code || 2) })} — توزیع بدون لوکیشن ثبت شد`);
  }
};

const SpecBadge = ({ kind, children }) => (
  <span className={`bvt-spec-badge ${kind}`}>
    <span className="bvt-spec-icon">{kind === 'nic' ? <Droplet size={11} /> : <Flame size={11} />}</span>
    {children}
  </span>
);

/**
 * Self-contained promoter-facing field: search the target smoker's current
 * cigarette (by name or nicotine mg), get a matched BVT product recommendation,
 * confirm + geotag the handout, or log one manually without a match, and keep
 * a running log of every handout that day.
 *
 * Deliberately isolated from EventForm.jsx's own state — it only talks to the
 * rest of the app through the two props below, the same generic (fieldId,
 * value) writer every other field type already uses, so nothing here can
 * reach into or depend on EventForm's internals.
 */
const BVTCigaretteMatch = ({ field, history, onChange }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
    const [justConfirmed, setJustConfirmed] = useState(false);
  const [manualTarget, setManualTarget] = useState(null);
  const [manualNote, setManualNote] = useState('');
  const [gender, setGender] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [isRejected, setIsRejected] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  // Product the promoter picked by hand instead of the system's "پیشنهاد ویژه"
  // (null = hand out the recommended one). The searched customer cigarette is
  // kept, so the report still shows what the customer was smoking.
  const [chosenProduct, setChosenProduct] = useState(null);
  const [matchNote, setMatchNote] = useState('');
  const wrapRef = useRef(null);

  const REJECTION_REASONS = [
    "به سیگار فعلی خودم وفادارم",
    "تمایلی به تغییر برند ندارم",
    "این برند را نمیشناسم",
    "برند پیشنهادی برایم جذاب نیست",
    "ظاهر و طراحی پاکت برایم جذاب نیست",
    "این محصول با سیگاری که معمولاً مصرف میکنم همخوان نیست",
    "تفاوت مشخصی نسبت به سیگار فعلیام نمیبینم",
    "تصویر و جایگاه برند برایم جذاب نیست",
    "برندهای رقیب این دسته را ترجیح میدهم",
    "سیگار سبکتر ترجیح میدم",
    "سیگار سنگینتر ترجیح میدم",
    "سایر"
  ];

  const safeHistory = history || [];
  const activeBvtProducts = field?.bvtProducts?.length ? field.bvtProducts : BVT_PRODUCTS;
  const results = useMemo(() => searchCigarettes(query), [query]);
  const recommended = useMemo(() => (selected ? matchBvtProduct(selected, activeBvtProducts) : null), [selected, activeBvtProducts]);
  const givenProduct = chosenProduct || recommended;
  const isOverride = !!(chosenProduct && recommended && chosenProduct.id !== recommended.id);

  // Location comes from the shared locationService (one warm GPS fix for the
  // whole app). A handout is saved INSTANTLY with whatever fix is already warm;
  // if none is ready yet, the entry is saved right away and the location is
  // attached to it a moment later — the promoter never waits on GPS.
  const [gpsState, setGpsState] = useState(() => getLocationStatus().state);
  useEffect(() => {
    startLocationService();
    const sync = () => setGpsState(getLocationStatus().state);
    sync();
    return subscribeLocation(sync);
  }, []);

  // Latest props for the async patch below (it can fire seconds after render).
  const historyRef = useRef(safeHistory);
  historyRef.current = safeHistory;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const fieldIdRef = useRef(field.id);
  fieldIdRef.current = field.id;

  const toLocation = (fix) => ({
    url: `https://maps.google.com/?q=${fix.lat},${fix.lng}`,
    accuracy: Math.round(fix.accuracy === Infinity ? 0 : fix.accuracy),
  });

  const patchEntry = (id, patch) => {
    if (!historyRef.current.some((e) => e.id === id)) return;
    const next = historyRef.current.map((e) => (e.id === id ? { ...e, ...patch } : e));
    historyRef.current = next;
    onChangeRef.current(`${fieldIdRef.current}_history`, next);
  };

  // Fill in a location for an already-saved entry once a fix is available.
  const attachLocationLater = (id) => {
    waitForFix(25000).then((fix) => {
      if (fix) {
        const loc = toLocation(fix);
        patchEntry(id, { location: loc.url, locationAccuracy: loc.accuracy, locationError: null });
        return;
      }
      const fail = getFailureReason();
      patchEntry(id, { location: null, locationAccuracy: fail.accuracy, locationError: fail.reason });
      warnLocationFailure(fail);
    });
  };

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pickCigarette = (c) => {
    setManualTarget(null);
    setChosenProduct(null);
    setSelected(c);
    setQuery(c.name);
    setOpen(false);
  };

  const clearSelection = () => {
    setSelected(null);
    setQuery('');
    setChosenProduct(null);
    setMatchNote('');
  };

  // With a searched cigarette on screen, tapping a pack means "give this one
  // instead" (keeps the customer's cigarette); without one it's a manual entry.
  const onProductTap = (p) => {
    if (selected && recommended) {
      setChosenProduct(p.id === recommended.id ? null : p);
      return;
    }
    openManualEntry(p);
  };

  const openManualEntry = (product) => {
    setSelected(null);
    setQuery('');
    setManualTarget(product);
    setManualNote('');
  };

  const logDistribution = ({ targetName, targetTar, targetNicotine, product, suggested, manual, note, logGender, logAgeRange, logStatus, logRejectionReason }) => {
    const entryId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fix = getUsableFix();
    const loc = fix ? toLocation(fix) : { url: null, accuracy: null };

    const entry = {
      id: entryId,
      targetName,
      targetTar: targetTar ?? null,
      targetNicotine: targetNicotine ?? null,
      recommendedId: product.id,
      recommendedName: product.name,
      // What the system suggested for this customer; differs from
      // recommendedId/Name (the pack actually offered) when overridden.
      suggestedId: suggested?.id ?? null,
      suggestedName: suggested?.name ?? null,
      overridden: !!(suggested && suggested.id !== product.id),
      note: note || null,
      manual: !!manual,
      gender: logGender,
      ageRange: logAgeRange,
      status: logStatus,
      rejectionReason: logRejectionReason,
      time: Date.now(),
      location: loc.url,
      // Accuracy (metres) of the fix, or why there is none — lets the admin
      // tell a precise pin from a missing one instead of guessing.
      locationAccuracy: loc.accuracy ?? null,
      // 'pending' = saved without waiting; replaced once a fix arrives (or
      // with the failure reason). Stays 'pending' only if the app was closed.
      locationError: loc.url ? null : 'pending',
    };
    const nextHistory = [entry, ...safeHistory];
    onChange(`${field.id}_history`, nextHistory);
    historyRef.current = nextHistory;
    onChange(field.id, nextHistory.length);
    if (!loc.url) attachLocationLater(entryId);
    setJustConfirmed(true);
    setTimeout(() => setJustConfirmed(false), 1800);
    clearSelection();
    setManualTarget(null);
    setManualNote('');
    setChosenProduct(null);
    setMatchNote('');
    setGender('');
    setAgeRange('');
    setIsRejected(false);
    setRejectionReason('');
  };

  const confirmDistribution = () => {
    if (!selected || !givenProduct) return;
    logDistribution({
      targetName: selected.name,
      targetTar: selected.tar,
      targetNicotine: selected.nicotine,
      product: givenProduct,
      suggested: recommended,
      note: matchNote.trim(),
      logGender: gender,
      logAgeRange: ageRange,
      logStatus: isRejected ? 'rejected' : 'accepted',
      logRejectionReason: isRejected ? rejectionReason : null,
    });
  };

  const confirmManual = () => {
    if (!manualTarget) return;
    const note = manualNote.trim();
    const parsedNicotine = /^\d+(\.\d+)?$/.test(note) ? parseFloat(note) : null;
    logDistribution({
      targetName: parsedNicotine != null ? `ثبت دستی (نیکوتین ${note}mg)` : (note || 'ثبت دستی بدون تطبیق'),
      targetNicotine: parsedNicotine,
      product: manualTarget,
      manual: true,
      note,
      logGender: gender,
      logAgeRange: ageRange,
      logStatus: isRejected ? 'rejected' : 'accepted',
      logRejectionReason: isRejected ? rejectionReason : null,
    });
  };

  return (
    <div className="bvt-match-field" ref={wrapRef}>
      {(gpsState === 'denied' || gpsState === 'unsupported') && (
        <div style={{ fontSize: '0.78rem', lineHeight: 1.7, padding: '8px 10px', marginBottom: 8, borderRadius: 10, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
          {gpsState === 'denied'
            ? '📍 دسترسی موقعیت مکانی بسته است؛ توزیع‌ها بدون لوکیشن ثبت می‌شوند. از تنظیمات مرورگر اجازه (Allow) بده.'
            : '📍 این مرورگر از موقعیت مکانی پشتیبانی نمی‌کند؛ از Chrome یا Safari استفاده کن.'}
        </div>
      )}
      <div className="bvt-demographics">
        <div className="bvt-demo-row">
          <span className="bvt-demo-label">جنسیت:</span>
          <div className="bvt-demo-options">
            <button type="button" className={`bvt-demo-btn ${gender === 'مرد' ? 'active' : ''}`} onClick={() => setGender('مرد')}>مرد</button>
            <button type="button" className={`bvt-demo-btn ${gender === 'زن' ? 'active' : ''}`} onClick={() => setGender('زن')}>زن</button>
          </div>
        </div>
        {gender && (
          <div className="bvt-demo-row slide-down">
            <span className="bvt-demo-label">بازه سنی:</span>
            <div className="bvt-demo-options">
              <button type="button" className={`bvt-demo-btn ${ageRange === '18-30' ? 'active' : ''}`} onClick={() => setAgeRange('18-30')}>18-30</button>
              <button type="button" className={`bvt-demo-btn ${ageRange === '+30' ? 'active' : ''}`} onClick={() => setAgeRange('+30')}>+30 سال</button>
            </div>
          </div>
        )}
      </div>

      {gender && ageRange && (
        <div className="bvt-search-box slide-down">
        <Search size={16} className="bvt-search-icon" />
        <input
          className="bvt-search-input"
          placeholder="نام سیگار یا عدد نیکوتین را جستجو کن... (مثلا وینستون یا 0.7)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); setManualTarget(null); setChosenProduct(null); setOpen(true); }}
          onFocus={() => query && setOpen(true)}
        />
        {selected && (
          <button type="button" className="bvt-clear-btn" onClick={clearSelection}>
            <X size={14} />
          </button>
        )}
        {open && results.length > 0 && (
          <div className="bvt-dropdown">
            {results.map((c) => (
              <div key={c.id} className="bvt-dropdown-item" onClick={() => pickCigarette(c)}>
                <span className="bvt-dd-name">{c.name}</span>
                <span className="bvt-dd-specs">
                  <SpecBadge kind="tar">{c.tarLabel || `${c.tar}`}</SpecBadge>
                  <SpecBadge kind="nic">{c.nicotineLabel || `${c.nicotine}`}</SpecBadge>
                </span>
              </div>
            ))}
          </div>
        )}
        {open && query && results.length === 0 && (
          <div className="bvt-dropdown">
            <div className="bvt-dropdown-empty">چیزی با این نام یا میزان نیکوتین پیدا نشد</div>
          </div>
        )}
      </div>
      )}

      {selected && gender && ageRange && (
        <div className="bvt-target-card">
          <span className="bvt-target-label">سیگار مخاطب:</span>
          <span className="bvt-target-name">{selected.name}</span>
          <SpecBadge kind="tar">قطران {selected.tarLabel || `${selected.tar}mg`}</SpecBadge>
          <SpecBadge kind="nic">نیکوتین {selected.nicotineLabel || `${selected.nicotine}mg`}</SpecBadge>
          {recommended && (
            <span className="bvt-target-hint">
              <PenLine size={11} /> برای دادن محصول دیگری به جای پیشنهاد ویژه، روی آن بزنید
            </span>
          )}
        </div>
      )}

      {gender && ageRange && (
      <div className="bvt-products-grid">
        {activeBvtProducts.map((p) => {
          const isRecommended = recommended?.id === p.id;
          const isManualTarget = manualTarget?.id === p.id;
          const isChosen = isOverride && chosenProduct?.id === p.id;
          const isSkipped = isRecommended && isOverride;
          return (
            <div
              key={p.id}
              className={`bvt-product-card ${isRecommended ? 'recommended' : ''} ${isSkipped ? 'recommended-skipped' : ''} ${isRecommended && justConfirmed ? 'confirmed-pulse' : ''} ${isManualTarget || isChosen ? 'manual-active' : ''}`}
              style={{ '--bvt-accent': p.accent }}
              onClick={() => onProductTap(p)}
            >
              <div className="bvt-product-glow" />
              {isRecommended && (
                <span className="bvt-recommend-badge">
                  <Sparkles size={11} /> پیشنهاد ویژه
                </span>
              )}
              {isChosen && (
                <span className="bvt-choice-badge">
                  <PenLine size={11} /> انتخاب شما
                </span>
              )}
              <button
                type="button"
                className="bvt-manual-hint"
                title={selected ? 'دادن این محصول به جای پیشنهاد ویژه' : 'ثبت دستی بدون تطبیق'}
                onClick={(e) => { e.stopPropagation(); onProductTap(p); }}
              >
                <PenLine size={11} />
              </button>
              <div className="bvt-product-img-wrap">
                <img src={p.image} alt="" className="bvt-product-img" loading="lazy" />
              </div>
              <span className="bvt-product-name">{p.name}</span>
              <div className="bvt-product-specs">
                <SpecBadge kind="nic">{p.nicotineLabel}</SpecBadge>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {selected && recommended && gender && ageRange && (
        <div className="bvt-action-section">
          {isOverride && (
            <div className="bvt-override-box">
              <div className="bvt-override-head">
                <span className="bvt-override-title"><PenLine size={13} /> انتخاب دستی به جای پیشنهاد سیستم</span>
                <button type="button" className="bvt-override-reset" onClick={() => setChosenProduct(null)}>
                  <Sparkles size={11} /> بازگشت به پیشنهاد
                </button>
              </div>
              <div className="bvt-override-flow">
                <div className="bvt-override-step">
                  <span className="bvt-override-step-label">سیگار مخاطب</span>
                  <span className="bvt-override-step-val">{selected.name}</span>
                </div>
                <div className="bvt-override-step skipped">
                  <span className="bvt-override-step-label">پیشنهاد سیستم</span>
                  <span className="bvt-override-step-val">{recommended.name}</span>
                </div>
                <div className="bvt-override-step chosen">
                  <span className="bvt-override-step-label">انتخاب شما</span>
                  <span className="bvt-override-step-val">{chosenProduct.name}</span>
                </div>
              </div>
            </div>
          )}

          <textarea
            className={`bvt-manual-input bvt-note-input ${isOverride ? 'is-override' : ''}`}
            rows={2}
            placeholder={isOverride
              ? 'دلیل انتخاب این محصول را بنویسید (مثلا: مشتری طعم سبک‌تر خواست)'
              : 'توضیحات (اختیاری)'}
            value={matchNote}
            onChange={(e) => setMatchNote(e.target.value)}
          />

          {!isRejected ? (
            <div className="bvt-accept-reject-row">
              <button type="button" className="bvt-ar-btn accept" onClick={() => setIsRejected(false)}>پذیرفت</button>
              <button type="button" className="bvt-ar-btn reject" onClick={() => setIsRejected(true)}>نپذیرفت</button>
            </div>
          ) : (
            <div className="bvt-acceptance-box">
              <div className="bvt-acceptance-header">
                <span className="bvt-acceptance-label">علت عدم پذیرش:</span>
                <button type="button" className="bvt-acceptance-cancel" onClick={() => setIsRejected(false)}>انصراف</button>
              </div>
              <select className="bvt-reject-select" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)}>
                <option value="">انتخاب کنید...</option>
                {REJECTION_REASONS.map((r, i) => <option key={i} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <button
            type="button"
            className={`bvt-confirm-btn ${isRejected ? 'danger' : ''}`}
            onClick={confirmDistribution}
            disabled={isRejected && !rejectionReason}
          >
            <>
                <CheckCircle2 size={16} /> {isRejected ? 'ثبت عدم پذیرش' : `تایید و ثبت توزیع ${givenProduct.name}`}
              </>
          </button>
        </div>
      )}

      {manualTarget && gender && ageRange && (
        <div className="bvt-manual-panel">
          <div className="bvt-manual-header">
            <img src={manualTarget.image} alt="" className="bvt-manual-thumb" />
            <span className="bvt-manual-title">ثبت دستی بدون تطبیق: {manualTarget.name}</span>
            <button type="button" className="bvt-manual-close" onClick={() => { setManualTarget(null); setManualNote(''); setIsRejected(false); setRejectionReason(''); }}>
              <X size={13} />
            </button>
          </div>
          <input
            className="bvt-manual-input"
            placeholder="توضیح کوتاه یا عدد نیکوتین (اختیاری)"
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
          />

          {!isRejected ? (
            <div className="bvt-accept-reject-row">
              <button type="button" className="bvt-ar-btn accept" onClick={() => setIsRejected(false)}>پذیرفت</button>
              <button type="button" className="bvt-ar-btn reject" onClick={() => setIsRejected(true)}>نپذیرفت</button>
            </div>
          ) : (
            <div className="bvt-acceptance-box">
              <div className="bvt-acceptance-header">
                <span className="bvt-acceptance-label">علت عدم پذیرش:</span>
                <button type="button" className="bvt-acceptance-cancel" onClick={() => setIsRejected(false)}>انصراف</button>
              </div>
              <select className="bvt-reject-select" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)}>
                <option value="">انتخاب کنید...</option>
                {REJECTION_REASONS.map((r, i) => <option key={i} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          <button
            type="button"
            className={`bvt-confirm-btn manual ${isRejected ? 'danger' : ''}`}
            onClick={confirmManual}
            disabled={isRejected && !rejectionReason}
          >
            <>
                <CheckCircle2 size={16} /> {isRejected ? 'ثبت عدم پذیرش دستی' : 'ثبت توزیع دستی'}
              </>
          </button>
        </div>
      )}

      {safeHistory.length > 0 && (
        <div className="bvt-history">
          <div className="bvt-history-title">📋 تاریخچه توزیع امروز ({safeHistory.length})</div>
          <div className="bvt-history-list">
            {safeHistory.map((h) => (
              <div key={h.id} className="bvt-history-row">
                <img
                  src={
                    (activeBvtProducts.find((p) => p.id === h.recommendedId)
                      || activeBvtProducts.find((p) => p.name === h.recommendedName)
                      || BVT_PRODUCTS.find((p) => p.id === h.recommendedId)
                      || BVT_PRODUCTS.find((p) => p.name === h.recommendedName))?.image
                  }
                  alt=""
                  className="bvt-history-thumb"
                />
                <div className="bvt-history-info">
                  <span className="bvt-history-main">
                    {h.status === 'rejected' && <span className="bvt-history-manual-tag" style={{color:'#f43f5e', background:'rgba(244,63,94,0.1)', borderColor:'rgba(244,63,94,0.3)'}}>رد شده</span>}
                    {h.manual && <span className="bvt-history-manual-tag">دستی</span>}
                    {h.overridden && <span className="bvt-history-manual-tag">تغییر پیشنهاد</span>}
                    {h.targetName} ← {h.recommendedName}
                  </span>
                  {h.overridden && h.suggestedName && (
                    <span className="bvt-history-note">پیشنهاد سیستم: {h.suggestedName}</span>
                  )}
                  {h.note && !h.manual && (
                    <span className="bvt-history-note">📝 {h.note}</span>
                  )}
                  <span className="bvt-history-time">
                    {h.gender} {h.ageRange} • {new Date(h.time).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {h.location && (
                  <a href={h.location} target="_blank" rel="noreferrer" className="bvt-history-loc">
                    <MapPin size={13} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BVTCigaretteMatch;
