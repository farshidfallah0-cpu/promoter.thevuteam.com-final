import React from 'react';
import './WelcomeToast.css';

/** Minimal login greeting: «Welcome <username>». Rendered inside a react-toastify toast. */
const WelcomeToast = ({ name }) => {
  const who = String(name || '').trim() || 'there';
  return (
    <div className="vu-welcome" dir="ltr">
      <span className="vu-welcome-avatar" aria-hidden="true">{who.charAt(0).toUpperCase()}</span>
      <span className="vu-welcome-text">
        <small>Welcome</small>
        <b>{who}</b>
      </span>
      <span className="vu-welcome-wave" aria-hidden="true">👋</span>
    </div>
  );
};

export default WelcomeToast;
