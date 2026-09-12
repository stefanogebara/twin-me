import React, { ReactNode, useState, useEffect } from 'react';
import { CollapsibleSidebar } from './CollapsibleSidebar';
import { BottomNav } from './BottomNav';
import BetaFeedbackWidget from '../BetaFeedbackWidget';
import PWAInstallPrompt from '../PWAInstallPrompt';
import { Menu } from 'lucide-react';

interface SidebarLayoutProps {
  children: ReactNode;
}

// The register's sidebar is 200px of plain text links (CollapsibleSidebar).
const SIDEBAR_WIDTH_EXPANDED = 200;
const SIDEBAR_WIDTH_COLLAPSED = 64;

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    const handler = () => {
      setSidebarCollapsed(localStorage.getItem('sidebar_collapsed') === 'true');
    };
    window.addEventListener('storage', handler);
    window.addEventListener('sidebar-toggle', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('sidebar-toggle', handler);
    };
  }, []);

  return (
    <div
      className="flex min-h-screen w-full overflow-x-hidden"
    >
      {/* The menu button, phones only: the page colour with a hairline, a 4px
          corner. No glass, no shadow. */}
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 left-4 z-50 inline-grid place-items-center w-10 h-10 lg:hidden transition-colors duration-150 ease-out hover:bg-[var(--rg-field)]"
        style={{
          backgroundColor: 'var(--rg-page)',
          border: '1px solid var(--rg-rule)',
          borderRadius: 'var(--rg-radius)',
        }}
        aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={sidebarOpen}
      >
        <Menu
          className="w-4 h-4"
          style={{ color: 'var(--rg-ink)' }}
          aria-hidden="true"
        />
      </button>

      {/* The sidebar: plain text links on the page */}
      <CollapsibleSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area - fixed margin for always-expanded sidebar */}
      <main
        id="main-content"
        className="relative flex-1 overflow-y-auto transition-all duration-200 ease-out"
        style={{
          zIndex: 0,
          isolation: 'isolate',
        }}
      >
        <style>{`
          @media (min-width: 1024px) {
            main {
              margin-left: ${sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED}px !important;
              transition: margin-left 200ms ease-out;
            }
          }
        `}</style>
        <div className="min-h-full pt-16 pb-24 lg:pt-0 lg:pb-0">
          {children}
        </div>
      </main>

      {/* Bottom nav bar -- mobile only (hidden on lg+) */}
      <BottomNav />

      {/* Beta feedback widget -- floating on all authenticated pages */}
      <BetaFeedbackWidget />

      {/* PWA install prompt -- subtle bottom banner */}
      <PWAInstallPrompt />
    </div>
  );
};
