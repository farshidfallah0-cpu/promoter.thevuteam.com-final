import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';

export default function CrewHeader({ theme, toggleTheme, eventName }) {
  return (
    <header className="crew-header-premium">
      <div className="crew-header-bg" />
      <div className="crew-header-inner">

        {/* Brand: Logo + Event Name */}
        <motion.div
          className="crew-header-brand"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="crew-logo-container">
            <div className="crew-logo-glow" />
            <img src="/images/vuLogo.png" alt="VU" className="crew-logo-img" />
          </div>

          {eventName && (
            <div className="crew-header-event-info">
              <span className="crew-header-app-label" style={{ color: 'var(--primary-color)' }}>VU Events</span>
              <span className="crew-header-event-name">{eventName}</span>
            </div>
          )}
        </motion.div>

        {/* Theme Toggle only */}
        <motion.button
          type="button"
          onClick={toggleTheme}
          whileTap={{ scale: 0.88 }}
          className="crew-theme-btn"
          title={theme === 'light' ? 'حالت شب' : 'حالت روز'}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </motion.button>
      </div>
    </header>
  );
}
