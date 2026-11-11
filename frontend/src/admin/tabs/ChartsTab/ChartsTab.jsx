import PageLoader from '../../../components/PageLoader';
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PieChart } from '../../components/SharedCharts';
import './charts.css';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const ChartsTab = ({ token }) => {
  const [chartsData, setChartsData] = useState({
    packageSales: [],
    businessTypeSales: [],
    categorySales: [],
    loading: true
  });

  useEffect(() => {
    fetchChartsData();
  }, []);

  const fetchChartsData = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/charts-data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setChartsData({
        ...res.data,
        loading: false
      });
    } catch (err) {
      console.error('Error fetching charts data:', err);
      // Mock data on error
      setChartsData({
        packageSales: [
          { name: 'پکیج یک', value: 66.67, color: '#f97316', amount: 450000000 },
          { name: 'پکیج دو', value: 5.78, color: '#8b5cf6', amount: 39000000 },
          { name: 'پکیج سه', value: 27.55, color: '#06b6d4', amount: 186000000 },
        ],
        businessTypeSales: [
          { name: 'لوازم خانگی', value: 58.17, color: '#f97316', amount: 392000000 },
          { name: 'خدمات و کسب و کار', value: 0.87, color: '#22c55e', amount: 5900000 },
          { name: 'وسایل نقلیه', value: 6.23, color: '#3b82f6', amount: 42000000 },
          { name: 'لوازم شخصی', value: 17.89, color: '#a855f7', amount: 121000000 },
          { name: 'موبایل و تبلت', value: 3.23, color: '#ec4899', amount: 22000000 },
          { name: 'ورزش فرهنگ فراغت', value: 2.67, color: '#14b8a6', amount: 18000000 },
          { name: 'صنعتی اداری تجاری', value: 8.67, color: '#eab308', amount: 58500000 },
          { name: 'لوازم الکترونیکی', value: 1.78, color: '#6366f1', amount: 12000000 },
        ],
        categorySales: [
          { name: 'لوازم خانگی', value: 62.89, color: '#f97316', amount: 424000000 },
          { name: 'ورزش فرهنگ فراغت', value: 0.43, color: '#14b8a6', amount: 2900000 },
          { name: 'صنعتی اداری تجاری', value: 26.73, color: '#eab308', amount: 180000000 },
          { name: 'موبایل و تبلت', value: 4.12, color: '#ec4899', amount: 28000000 },
          { name: 'لوازم شخصی', value: 0.81, color: '#a855f7', amount: 5500000 },
          { name: 'خدمات و کسب و کار', value: 3.06, color: '#22c55e', amount: 21000000 },
          { name: 'وسایل نقلیه', value: 1.41, color: '#3b82f6', amount: 9500000 },
        ],
        loading: false
      });
    }
  };

  if (chartsData.loading) {
    return (
      <PageLoader label="در حال بارگذاری نمودارها" />
    );
  }

  return (
    <div className="charts-container">
      <div className="charts-header">
        <h2>📈 تحلیل آماری فروش</h2>
        <p>نمایش سهم فروش بر اساس پکیج‌ها، نوع کسب و کار و کتگوری‌های شغلی</p>
      </div>
      
      <div className="charts-grid">
        <PieChart 
          data={chartsData.packageSales}
          title="سهم فروش پکیج‌ها"
          description="این نمودار، سهم هر یک از پکیج‌های شیپور از کل فروش این کمپین را نمایش می‌دهد."
          chartNumber="۱"
        />
        <PieChart 
          data={chartsData.businessTypeSales}
          title="توزیع شاپ‌ها بر اساس کتگوری شغلی"
          description="این نمودار نشان می‌دهد شاپ‌های ایجادشده در طول کمپین، چگونه میان کتگوری‌های مختلف شغلی توزیع شده‌اند."
          chartNumber="۲"
        />
        <PieChart 
          data={chartsData.categorySales}
          title="سهم درآمد کتگوری‌های شغلی"
          description="در این نمودار، سهم هر کتگوری شغلی از مجموع درآمد ایجادشده در کمپین نمایش داده شده است."
          chartNumber="۳"
        />
      </div>

      <div className="charts-summary">
        <div className="summary-card">
          <h4>📦 خلاصه پکیج‌ها</h4>
          <div className="summary-list">
            {chartsData.packageSales.map((item, idx) => (
              <div key={idx} className="summary-item">
                <div className="summary-color" style={{ background: item.color }}></div>
                <span className="summary-name">{item.name}</span>
                <span className="summary-percent">{item.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="summary-card">
          <h4>🏪 خلاصه کتگوری‌ها</h4>
          <div className="summary-list">
            {chartsData.businessTypeSales.slice(0, 5).map((item, idx) => (
              <div key={idx} className="summary-item">
                <div className="summary-color" style={{ background: item.color }}></div>
                <span className="summary-name">{item.name}</span>
                <span className="summary-percent">{item.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
