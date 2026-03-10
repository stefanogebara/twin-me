import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SundustSidebar } from './SundustSidebar';
import '../sundust.css';

const PAGE_TITLES: Record<string, string> = {
  '/prototype/dashboard': 'Home',
  '/prototype/chat': 'Talk to Twin',
  '/prototype/identity': 'Identity',
  '/prototype/goals': 'Goals',
  '/prototype/brain': 'Brain',
  '/prototype/settings': 'Settings',
};

export const PrototypeLayout: React.FC = () => {
  const [isLight, setIsLight] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();

  const pageTitle = PAGE_TITLES[location.pathname] || 'Twin Me';

  return (
    <div
      className={`sundust${isLight ? ' light' : ''}`}
      style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}
    >
      <SundustSidebar
        isLight={isLight}
        onToggleTheme={() => setIsLight(v => !v)}
        isCollapsed={isCollapsed}
        onToggleCollapsed={() => setIsCollapsed(v => !v)}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Top bar */}
        <div className="sd-topbar">
          {/* Left: logo + separator + page breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
            }}>
              <img
                src="/images/backgrounds/flower.png"
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <span style={{
              fontSize: 18,
              color: 'var(--sd-text-muted)',
              fontFamily: 'Inter, sans-serif',
              lineHeight: 1,
              userSelect: 'none',
            }}>/</span>
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--sd-fg)',
              fontFamily: 'Inter, sans-serif',
            }}>
              {pageTitle}
            </span>
          </div>

          {/* Right: Share button + avatar pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button style={{
              background: 'var(--sd-glass-bg)',
              border: '1px solid var(--sd-glass-border)',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--sd-text-secondary)',
              cursor: 'pointer',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              fontFamily: 'Inter, sans-serif',
              height: 24,
              display: 'flex',
              alignItems: 'center',
            }}>Share</button>
            <div style={{
              background: 'rgba(255,115,0,0.6)',
              borderRadius: 6,
              padding: '2px 6px',
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              fontFamily: 'Inter, sans-serif',
              cursor: 'pointer',
              height: 24,
              display: 'flex',
              alignItems: 'center',
            }}>S</div>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};
