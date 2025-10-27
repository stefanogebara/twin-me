import React, { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Menu, X } from 'lucide-react';

interface SidebarLayoutProps {
  children: ReactNode;
}

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-[hsl(var(--claude-bg))]">
      {/* Mobile Menu Button - Only visible on small screens */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-[hsl(var(--claude-surface))] border border-[hsl(var(--claude-border))] shadow-lg lg:hidden"
        aria-label="Toggle menu"
      >
        {sidebarOpen ? (
          <X className="w-6 h-6 text-[hsl(var(--claude-text))]" />
        ) : (
          <Menu className="w-6 h-6 text-[hsl(var(--claude-text))]" />
        )}
      </button>

      {/* Mobile Overlay - Only visible when sidebar is open on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed lg:relative
          h-screen
          z-40
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Add padding for mobile menu button */}
        <div className="min-h-full pt-16 lg:pt-0">
          {children}
        </div>
      </main>
    </div>
  );
};
