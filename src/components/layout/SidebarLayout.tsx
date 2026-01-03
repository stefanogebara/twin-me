import React, { ReactNode, useState } from 'react';
import { CollapsibleSidebar } from './CollapsibleSidebar';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { Menu } from 'lucide-react';

interface SidebarLayoutProps {
  children: ReactNode;
}

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme } = useTheme();
  const { isCollapsed } = useSidebar();

  // Calculate sidebar margin based on collapsed state
  // Expanded: w-64 (256px) + m-4 (16px padding) = 272px
  // Collapsed: w-20 (80px) + m-4 (16px padding) = 96px
  const sidebarWidth = isCollapsed ? 96 : 272;

  return (
    <div
      className="flex min-h-screen w-full"
      style={{
        backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA'
      }}
    >
      {/* Mobile Menu Button - Only visible on small screens */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 left-4 z-50 p-3 rounded-xl lg:hidden transition-all duration-200"
        style={{
          backgroundColor: theme === 'dark'
            ? 'rgba(45, 45, 41, 0.8)'
            : 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          border: theme === 'dark'
            ? '1px solid rgba(193, 192, 182, 0.1)'
            : '1px solid rgba(0, 0, 0, 0.06)',
          boxShadow: theme === 'dark'
            ? '0 8px 32px rgba(0, 0, 0, 0.3)'
            : '0 8px 32px rgba(0, 0, 0, 0.08)'
        }}
        aria-label="Toggle menu"
      >
        <Menu
          className="w-5 h-5"
          style={{
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
          }}
        />
      </button>

      {/* Collapsible Sidebar with Glass Morphism */}
      <CollapsibleSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area - margin adjusts based on sidebar collapsed state */}
      <main
        className="flex-1 overflow-y-auto relative transition-all duration-300"
        style={{
          marginLeft: window.innerWidth >= 1024 ? `${sidebarWidth}px` : '0',
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
