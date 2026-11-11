import React from 'react';

export const MiniChart = ({ data }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  
  return (
    <div className="mini-chart">
      <div className="mini-chart-bars">
        {data.map((item, i) => (
          <div key={i} className="mini-chart-bar-wrapper">
            <div className="mini-chart-value">{item.value}</div>
            <div 
              className="mini-chart-bar" 
              style={{ height: `${Math.max((item.value / max) * 100, 5)}%` }}
            />
            <span className="mini-chart-day">{item.day}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CircularProgress = ({ value, max, label, color }) => {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  return (
    <div className="circular-progress">
      <svg viewBox="0 0 100 100">
        <circle className="progress-bg" cx="50" cy="50" r="45" />
        <circle 
          className="progress-bar" 
          cx="50" cy="50" r="45"
          style={{ 
            strokeDasharray: circumference,
            strokeDashoffset: strokeDashoffset,
            stroke: color 
          }}
        />
      </svg>
      <div className="progress-content">
        <span className="progress-value">{Math.round(percentage)}%</span>
        <span className="progress-label">{label}</span>
      </div>
    </div>
  );
};

export const PieChart = ({ data, title, description, chartNumber }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const createArcPath = (startAngle, endAngle, radius = 80) => {
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;
    
    const x1 = 150 + radius * Math.cos(startRad);
    const y1 = 150 + radius * Math.sin(startRad);
    const x2 = 150 + radius * Math.cos(endRad);
    const y2 = 150 + radius * Math.sin(endRad);
    
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
    
    return `M 150 150 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  };

  const getSliceData = () => {
    let angle = 0;
    return data.map((item) => {
      const sliceAngle = (item.value / total) * 360;
      const startAngle = angle;
      const endAngle = angle + sliceAngle;
      const midAngle = angle + sliceAngle / 2;
      const midRad = (midAngle - 90) * Math.PI / 180;
      
      const innerRadius = 80;
      const outerRadius = 95;
      const labelRadius = 130;
      
      const innerX = 150 + innerRadius * Math.cos(midRad);
      const innerY = 150 + innerRadius * Math.sin(midRad);
      
      const outerX = 150 + outerRadius * Math.cos(midRad);
      const outerY = 150 + outerRadius * Math.sin(midRad);
      
      const labelX = 150 + labelRadius * Math.cos(midRad);
      const labelY = 150 + labelRadius * Math.sin(midRad);
      
      const textAnchor = labelX > 150 ? 'start' : 'end';
      const lineEndX = labelX > 150 ? labelX + 25 : labelX - 25;

      angle += sliceAngle;

      return {
          ...item,
          startAngle,
          endAngle,
          innerX, innerY, outerX, outerY, labelX, labelY, lineEndX, textAnchor,
          color: item.color
      };
    });
  };

  const slicesData = getSliceData();

  return (
    <div className="chart-card-container">
      <div className="chart-number">{chartNumber}</div>
      <div className="chart-description">
        <div className="chart-arrow">◀</div>
        <p>{description}</p>
      </div>
      <div className="pie-chart-wrapper" style={{ overflow: 'visible' }}>
        <svg viewBox="0 0 300 300" className="pie-chart-svg" style={{ overflow: 'visible' }}>
          {slicesData.map((item, index) => (
            <path
              key={`slice-${index}`}
              d={createArcPath(item.startAngle, item.endAngle - 0.5)}
              fill={item.color}
              className="pie-slice"
            />
          ))}
          {slicesData.map((item, index) => (
            <g key={`label-${index}`}>
              <polyline
                points={`${item.innerX},${item.innerY} ${item.outerX},${item.outerY} ${item.labelX},${item.labelY} ${item.lineEndX},${item.labelY}`}
                fill="none"
                stroke={item.color}
                strokeWidth="1.5"
                opacity="0.8"
              />
              <circle cx={item.lineEndX} cy={item.labelY} r="3" fill={item.color} />
              <text
                x={item.lineEndX > 150 ? item.lineEndX + 8 : item.lineEndX - 8}
                y={item.labelY - 6}
                textAnchor={item.textAnchor}
                fill={item.color}
                fontSize="11"
                fontWeight="bold"
                className="pie-label-percent"
              >
                {item.value.toFixed(1)}%
              </text>
              <text
                x={item.lineEndX > 150 ? item.lineEndX + 8 : item.lineEndX - 8}
                y={item.labelY + 8}
                textAnchor={item.textAnchor}
                fill="#666"
                fontSize="9"
                className="pie-label-name"
              >
                {item.name.length > 12 ? item.name.substring(0, 12) + '...' : item.name}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <h3 className="chart-title">{title}</h3>
    </div>
  );
};
