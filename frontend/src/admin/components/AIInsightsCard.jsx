import React, { useState, useEffect } from 'react';
import './aiInsightsCard.css';

export const AIInsightsCard = ({ stats, topPromoters }) => {
  const [insight, setInsight] = useState(0);
  
  const insights = [
    {
      type: 'top-promoter',
      icon: '🏆',
      title: 'برترین پروموتر',
      value: topPromoters[0]?.name || 'نامشخص',
      metric: `${topPromoters[0]?.sales || 0} تومان`,
      color: '#f59e0b'
    },
    {
      type: 'growth-rate',
      icon: '📈',
      title: 'نرخ رشد',
      value: '+12%',
      metric: 'این هفته',
      color: '#3b82f6'
    },
    {
      type: 'today-performance',
      icon: '⚡',
      title: 'فعالیت امروز',
      value: stats.todayVisits,
      metric: `از ${stats.totalReports} کل`,
      color: '#8b5cf6'
    }
  ];
  
  useEffect(() => {
    const interval = setInterval(() => {
      setInsight(prev => (prev + 1) % insights.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [insights.length]);
  
  const currentInsight = insights[insight];
  
  return (
    <div className="ai-insights-card">
      <div className="ai-insights-header">
        <div className="ai-insights-badge">
          <span className="badge-pulse"></span>
          <span>تحلیل هوشمند</span>
        </div>
        <span className="ai-insights-dots">
          {insights.map((_, i) => (
            <span 
              key={i} 
              className={`dot ${i === insight ? 'active' : ''}`}
              onClick={() => setInsight(i)}
            ></span>
          ))}
        </span>
      </div>
      
      <div className="ai-insights-content">
        <div className="insight-item-wrapper" key={insight}>
          <div className="insight-icon" style={{ color: currentInsight.color }}>
            {currentInsight.icon}
          </div>
          <div className="insight-text">
            <h4>{currentInsight.title}</h4>
            <p className="insight-value">{currentInsight.value}</p>
            <span className="insight-metric">{currentInsight.metric}</span>
          </div>
        </div>
      </div>
      
      <div className="ai-insights-footer">
        <span className="footer-text">💡 برای تحلیل دقیق‌تر به تب "تحلیل هوشمند" بروید</span>
      </div>
    </div>
  );
};
