import React from 'react';
import './PageLoader.css';

/**
 * The one loader of the whole site. `fullscreen` covers the viewport (route / auth checks);
 * otherwise it fills the space of the panel or tab that is loading. `compact` = small inline use.
 */
const PageLoader = ({ label = '', fullscreen = false, compact = false }) => (
  <div className={`vu-loader ${fullscreen ? 'is-full' : ''} ${compact ? 'is-compact' : ''}`} role="status" aria-live="polite">
    <div className="vu-loader-mark" aria-hidden="true">
      <span className="vu-loader-ring" />
      <span className="vu-loader-core" />
    </div>
    {label ? <p className="vu-loader-label">{label}<i /><i /><i /></p> : <span className="vu-loader-sr">در حال بارگذاری</span>}
  </div>
);

export default PageLoader;
