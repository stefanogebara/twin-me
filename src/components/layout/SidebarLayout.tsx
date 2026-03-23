import React, { ReactNode, useState } from 'react';
import { CollapsibleSidebar } from './CollapsibleSidebar';
import { BottomNav } from './BottomNav';
import BetaFeedbackWidget from '../BetaFeedbackWidget';
import { useSidebar } from '@/contexts/SidebarContext';
import { Menu } from 'lucide-react';

interface SidebarLayoutProps {
  children: ReactNode;
}

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isCollapsed } = useSidebar();

  // Calculate sidebar margin based on collapsed state
  // Sidebar is flush (no margin), so width = element width directly
  // Expanded: w-64 = 256px, Collapsed: w-20 = 80px
  const sidebarWidth = isCollapsed ? 80 : 256;

  return (
    <div
      className="flex min-h-screen w-full"
    >
      {/* Mobile Menu Button - Only visible on small screens */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 left-4 z-50 p-3 rounded-2xl lg:hidden transition-all duration-150 ease-out active:scale-95"
        style={{
          backgroundColor: 'var(--input)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid var(--surface-solid)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.30)',
        }}
        aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={sidebarOpen}
      >
        <Menu
          className="w-5 h-5"
          style={{ color: 'var(--foreground)' }}
          aria-hidden="true"
        />
      </button>

      {/* Collapsible Sidebar with Liquid Glass */}
      <CollapsibleSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area - margin adjusts based on sidebar collapsed state */}
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
              margin-left: ${sidebarWidth}px !important;
            }
          }
        `}</style>
        <div className="min-h-full pt-16 pb-20 lg:pt-0 lg:pb-0">
          {children}
        </div>
      </main>

      {/* Bottom nav bar — mobile only (hidden on lg+) */}
      <BottomNav />

      {/* Beta feedback widget — floating on all authenticated pages */}
      <BetaFeedbackWidget />
    </div>
  );
};
