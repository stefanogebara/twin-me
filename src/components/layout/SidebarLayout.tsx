import React, { ReactNode, useState } from 'react';
import { CollapsibleSidebar } from './CollapsibleSidebar';
import { useSidebar } from '@/contexts/SidebarContext';
import { Menu } from 'lucide-react';

interface SidebarLayoutProps {
  children: ReactNode;
}

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isCollapsed } = useSidebar();

  // Calculate sidebar margin based on collapsed state
  // Expanded: w-64 (256px) + m-4 (16px padding) = 272px
  // Collapsed: w-20 (80px) + m-4 (16px padding) = 96px
  const sidebarWidth = isCollapsed ? 96 : 272;

  return (
    <div
      className="flex min-h-screen w-full"
      style={{ backgroundColor: '#F7F7F3' }}
    >
      {/* Mobile Menu Button - Only visible on small screens */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 left-4 z-50 p-3 rounded-2xl lg:hidden transition-all duration-200"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.18)',
          backdropFilter: 'blur(10px) saturate(140%)',
          WebkitBackdropFilter: 'blur(10px) saturate(140%)',
          border: '1px solid rgba(255, 255, 255, 0.45)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
        }}
        aria-label="Toggle menu"
      >
        <Menu
          className="w-5 h-5"
          style={{ color: '#1F1C18' }}
        />
      </button>

      {/* Collapsible Sidebar with Glass Morphism */}
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
        <div className="min-h-full pt-16 lg:pt-0">
          {children}
        </div>
      </main>
    </div>
  );
};
