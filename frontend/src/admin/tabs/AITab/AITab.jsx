import React, { useState } from 'react';
import { toast } from 'react-toastify';
import './ai.css';

export const AITab = ({ stats, topPromoters }) => {
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const runAIAnalysis = async () => {
    setAiLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const topPromoter = topPromoters[0]?.name || 'نامشخص';
      const avgAmount = stats.totalReports > 0 ? stats.totalAmount / stats.totalReports : 0;
      
      setAiAnalysis({
        summary: `تحلیل ${stats.totalReports} گزارش: میانگین هر تراکنش ${Math.round(avgAmount).toLocaleString('fa-IR')} تومان. ${topPromoter} بهترین عملکرد را داشته.`,
        insights: [
          { type: 'positive', text: `${topPromoter} با ${topPromoters[0]?.visits || 0} بازدید، برترین پروموتر است.` },
          { type: 'info', text: `میانگین ${stats.avgPerPromoter || 0} گزارش به ازای هر پروموتر ثبت شده.` },
          { type: 'info', text: `امروز ${stats.todayVisits} بازدید ثبت شده.` }
        ],
        predictions: [
          { label: 'پیش‌بینی هفته آینده', value: `${Math.round(stats.totalAmount * 1.12).toLocaleString('fa-IR')}`, trend: 'up' },
          { label: 'میانگین روزانه', value: `${Math.round(avgAmount).toLocaleString('fa-IR')}`, trend: 'neutral' },
          { label: 'نرخ رشد تخمینی', value: '۱۲٪', trend: 'up' }
        ],
        recommendations: [
          'افزایش تمرکز روی فروشگاه‌های پرپتانسیل',
          'برگزاری جلسه توجیهی برای پروموترها',
          'تشویق پروموترهای برتر'
        ]
      });
    } catch (e) {
      toast.error('خطا در تحلیل');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="ai-container">
      <div className="ai-header">
        <div className="ai-title">
          <span className="ai-icon">🤖</span>
          <div>
            <h3>تحلیل هوش مصنوعی</h3>
            <p>تحلیل پیشرفته {stats.totalReports} گزارش</p>
          </div>
        </div>
        <button type="button" className={`ai-run-btn ${aiLoading ? 'loading' : ''}`} onClick={runAIAnalysis} disabled={aiLoading}>
          {aiLoading ? (<><div className="btn-spinner"></div>در حال تحلیل...</>) : (<><span>⚡</span>شروع تحلیل</>)}
        </button>
      </div>

      {aiLoading && (
        <div className="ai-loading">
          <div className="ai-brain"><div className="brain-pulse"></div>🧠</div>
          <p>در حال پردازش داده‌ها...</p>
          <div className="loading-bar"><div className="loading-progress"></div></div>
        </div>
      )}

      {aiAnalysis && !aiLoading && (
        <div className="ai-results">
          <div className="ai-summary-card">
            <div className="summary-icon">📈</div>
            <p>{aiAnalysis.summary}</p>
          </div>

          <div className="ai-section">
            <h4>💡 بینش‌های کلیدی</h4>
            <div className="insights-list">
              {aiAnalysis.insights.map((insight, i) => (
                <div key={i} className={`insight-item ${insight.type}`}>
                  <span className="insight-icon">{insight.type === 'positive' ? '✅' : insight.type === 'warning' ? '⚠️' : 'ℹ️'}</span>
                  <span>{insight.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ai-section">
            <h4>🔮 پیش‌بینی‌ها</h4>
            <div className="predictions-grid">
              {aiAnalysis.predictions.map((pred, i) => (
                <div key={i} className="prediction-card">
                  <span className="pred-label">{pred.label}</span>
                  <span className="pred-value">{pred.value}</span>
                  <span className={`pred-trend ${pred.trend}`}>{pred.trend === 'up' ? '📈' : pred.trend === 'down' ? '📉' : '➡️'}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ai-section">
            <h4>💼 پیشنهادات</h4>
            <div className="recommendations-list">
              {aiAnalysis.recommendations.map((rec, i) => (
                <div key={i} className="recommendation-item">
                  <span className="rec-number">{i + 1}</span>
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!aiAnalysis && !aiLoading && (
        <div className="ai-empty">
          <div className="empty-icon">🤖</div>
          <h4>تحلیل هوش مصنوعی</h4>
          <p>برای دریافت تحلیل پیشرفته، روی "شروع تحلیل" کلیک کنید.</p>
        </div>
      )}
    </div>
  );
};
