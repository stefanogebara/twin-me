import React, { ReactNode, useState } from 'react';
import { CollapsibleSidebar } from './CollapsibleSidebar';
import { BottomNav } from './BottomNav';
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
        className="fixed top-4 left-4 z-50 p-3 rounded-2xl lg:hidden transition-all duration-200"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.30)',
        }}
        aria-label="Toggle menu"
      >
        <Menu
          className="w-5 h-5"
          style={{ color: 'var(--foreground)' }}
        />
      </button>

      {/* Collapsible Sidebar with Liquid Glass */}
      <CollapsibleSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area - margin adjusts based on sidebar collapsed state */}
      <main
        className="relative flex-1 overflow-y-auto transition-all duration-300"
        style={{
          marginLeft: window.innerWidth >= 1024 ? `${sidebarWidth}px` : '0',
          zIndex: 0,
          isolation: 'isolate',
        }}
      >
        <style>{`
          @media (max-width: 1023px) {
            main {
              margin-left: 0 !important;
            }
          }
        `}</style>
        <div className="min-h-full pt-16 pb-20 lg:pt-0 lg:pb-0">
          {children}
        </div>
      </main>

      {/* Bottom nav bar — mobile only (hidden on lg+) */}
      <BottomNav />
    </div>
  );
};
