import React, { ReactNode, useState, useEffect } from 'react';
import { CollapsibleSidebar } from './CollapsibleSidebar';
import { BottomNav } from './BottomNav';
import BetaFeedbackWidget from '../BetaFeedbackWidget';
import PWAInstallPrompt from '../PWAInstallPrompt';

interface SidebarLayoutProps {
  children: ReactNode;
}

// The register's sidebar is 200px of plain text links (CollapsibleSidebar).
const SIDEBAR_WIDTH_EXPANDED = 200;
const SIDEBAR_WIDTH_COLLAPSED = 64;

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children }) => {
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
      {/* One way to move on each screen: the sidebar on a desktop, the tab bar on a phone.
          The hamburger that used to open the sidebar over the tab bar was a second bar
          leading to the same places. */}
      <CollapsibleSidebar isOpen={false} onClose={() => {}} />

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
        <div className="min-h-full pt-6 pb-24 lg:pt-0 lg:pb-0">
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
