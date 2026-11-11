import React, { useMemo } from 'react';
import { Minus, Plus, Droplet, Package } from 'lucide-react';
import { BVT_PRODUCTS } from '../BVTCigaretteMatch/cigaretteDatabase';
import '../BVTCigaretteMatch/bvt.css';
import './bvtSampling.css';

const MAX_COUNT = 99999;

const faToEn = (s) => String(s ?? '')
  .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

const clampCount = (n) => Math.max(0, Math.min(MAX_COUNT, Number.isFinite(n) ? Math.floor(n) : 0));

/**
 * Promoter-facing "BVT sampling report": one card per BVT pack (same visual
 * design as the BVT cigarette-match cards) with its own counter box underneath
 * — tap +/− or type the number of samples handed out for that pack.
 *
 * Talks to the form only through the generic (fieldId, value) writer, exactly
 * like BVTCigaretteMatch: `${field.id}_counts` holds { [productId]: number }
 * and `field.id` itself holds the grand total (so anything that just reads a
 * field's value — progress bars, exports — sees a plain number).
 */
const BVTSamplingReport = ({ field, counts, onChange }) => {
  const products = field?.bvtProducts?.length ? field.bvtProducts : BVT_PRODUCTS;
  const safeCounts = counts && typeof counts === 'object' ? counts : {};

  const total = useMemo(
    () => products.reduce((sum, p) => sum + (Number(safeCounts[p.id]) || 0), 0),
    [products, safeCounts]
  );

  const setCount = (productId, rawValue) => {
    const next = { ...safeCounts, [productId]: clampCount(rawValue) };
    const nextTotal = products.reduce((sum, p) => sum + (Number(next[p.id]) || 0), 0);
    onChange(`${field.id}_counts`, next);
    onChange(field.id, nextTotal);
  };

  return (
    <div className="bvts-field">
      <div className="bvts-total-bar">
        <span className="bvts-total-icon"><Package size={18} /></span>
        <div className="bvts-total-text">
          <span className="bvts-total-label">مجموع سمپل‌های ثبت‌شده</span>
          <span className="bvts-total-hint">برای هر محصول تعداد سمپل توزیع‌شده را ثبت کنید</span>
        </div>
        <span className="bvts-total-num">{total.toLocaleString('fa-IR')}</span>
      </div>

      <div className="bvt-products-grid bvts-grid">
        {products.map((p) => {
          const count = Number(safeCounts[p.id]) || 0;
          return (
            <div key={p.id} className="bvts-item" style={{ '--bvt-accent': p.accent }}>
              <div className={`bvt-product-card bvts-card ${count > 0 ? 'bvts-card--active' : ''}`}>
                <div className="bvt-product-glow" />
                <div className="bvt-product-img-wrap">
                  {p.image
                    ? <img src={p.image} alt="" className="bvt-product-img" loading="lazy" />
                    : <Package size={26} />}
                </div>
                <span className="bvt-product-name">{p.name}</span>
                {p.nicotineLabel && (
                  <div className="bvt-product-specs">
                    <span className="bvt-spec-badge nic">
                      <span className="bvt-spec-icon"><Droplet size={11} /></span>
                      {p.nicotineLabel}
                    </span>
                  </div>
                )}
              </div>

              <div className="bvts-counter-box">
                <span className="bvts-counter-label">تعداد سمپل</span>
                <div className="bvts-counter-row">
                  <button
                    type="button"
                    className="bvts-step-btn minus"
                    onClick={() => setCount(p.id, count - 1)}
                    disabled={count <= 0}
                    aria-label={`کم کردن ${p.name}`}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    className="bvts-count-input"
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="0"
                    value={count === 0 ? '' : String(count)}
                    onChange={(e) => {
                      const digits = faToEn(e.target.value).replace(/[^0-9]/g, '');
                      setCount(p.id, digits === '' ? 0 : parseInt(digits, 10));
                    }}
                    onFocus={(e) => e.target.select()}
                    aria-label={`تعداد سمپل ${p.name}`}
                  />
                  <button
                    type="button"
                    className="bvts-step-btn plus"
                    onClick={() => setCount(p.id, count + 1)}
                    aria-label={`اضافه کردن ${p.name}`}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BVTSamplingReport;
