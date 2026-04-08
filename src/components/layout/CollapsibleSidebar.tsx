import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Home,
  MessageCircle,
  Sparkles,
  LayoutGrid,
  Link2,
  X,
  Settings,
  LogOut,
  Target,
  Mic,
} from 'lucide-react';
import { cn } from '@/lib/utils';


interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
}

interface CollapsibleSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

// Nav: 3 core tabs + settings (per CLAUDE.md: "Home / Chat / Me")
const navItems: NavItem[] = [
  { id: 'chat',         label: 'Talk to Twin',    icon: MessageCircle, path: '/talk-to-twin' },
  { id: 'dashboard',    label: 'Home',            icon: Home,          path: '/dashboard' },
  { id: 'me',           label: 'You',             icon: Sparkles,      path: '/identity' },
  { id: 'departments',  label: 'Departments',     icon: LayoutGrid,    path: '/departments' },
  { id: 'settings',     label: 'Settings',        icon: Settings,      path: '/settings' },
];

export const CollapsibleSidebar: React.FC<CollapsibleSidebarProps> = ({
  isOpen,
  onClose
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    // Only close the mobile overlay
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onClose}
          role="button"
          tabIndex={0}
          aria-label="Close navigation menu"
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />
      )}

      {/* Floating Pill Sidebar — always expanded on desktop, overlay on mobile */}
      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 z-40 transition-all duration-200 ease-out",
          // Mobile: slide in/out as overlay
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          // Always 240px wide
          "w-[240px]"
        )}
      >
        {/* Flat sidebar — straight edges, no pill */}
        <div
          className="flex flex-col h-full overflow-hidden"
          style={{
            background: 'rgba(255, 255, 255, 0.025)',
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <style>
            {`
              .sidebar-scroll::-webkit-scrollbar { display: none; }
              .sidebar-scroll { scrollbar-width: none; -ms-overflow-style: none; }
            `}
          </style>

          <div className="overflow-y-auto flex-1 flex flex-col sidebar-scroll">
            {/* Close button for mobile */}
            <button
              onClick={onClose}
              aria-label="Close navigation menu"
              className="absolute top-4 right-4 p-2 hover:bg-[rgba(255,255,255,0.08)] rounded-lg transition-colors lg:hidden"
            >
              <X className="w-5 h-5" style={{ color: 'var(--foreground)' }} aria-hidden="true" />
            </button>

            {/* Logo */}
            <div className="flex items-center justify-center p-5 pb-4 border-b border-[rgba(255,255,255,0.08)]">
              <button
                onClick={() => handleNavigate('/dashboard')}
                className="hover:opacity-80 transition-all duration-200 flex items-center gap-2.5"
                aria-label="Go to dashboard"
                title="Twin Me"
              >
                <img
                  src="/images/backgrounds/flower-hero.png"
                  alt="Twin Me"
                  className="object-contain drop-shadow-sm flex-shrink-0"
                  style={{ width: 32, height: 32 }}
                />
                <span
                  className="text-2xl"
                  style={{
                    fontWeight: 500,
                    letterSpacing: '-0.02em',
                    color: 'var(--foreground)'
                  }}
                >
                  Twin Me
                </span>
                <span
                  className="text-[10px] font-medium tracking-wide px-1.5 py-0.5 rounded-full self-start mt-1"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: 'rgba(255,255,255,0.6)',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  BETA
                </span>
              </button>
            </div>

            {/* Nav Items */}
            <nav className="space-y-1 flex-1 p-3" role="navigation" aria-label="Main navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);

                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.path)}
                    aria-label={`Navigate to ${item.label}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 transition-all duration-150 ease-out active:scale-[0.97]",
                      active
                        ? "rounded-full font-medium"
                        : "rounded-full hover:bg-[rgba(255,255,255,0.08)]"
                    )}
                    style={active ? {
                      background: 'rgba(255, 255, 255, 0.08)',
                    } : {
                      background: 'transparent',
                    }}
                    title={item.label}
                  >
                    <Icon
                      className="w-5 h-5 flex-shrink-0"
                      style={{ color: active ? '#F5F5F4' : 'rgba(255, 255, 255, 0.45)' }}
                      aria-hidden="true"
                    />
                    <span
                      className="text-sm truncate"
                      style={{
                        fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                        fontWeight: active ? 500 : 400,
                        color: active ? '#F5F5F4' : 'rgba(255, 255, 255, 0.45)',
                      }}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* Sign Out + User at Bottom */}
            <div className="border-t border-[rgba(255,255,255,0.08)] space-y-1 p-3">
              {/* Sign Out button */}
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-full opacity-70 hover:opacity-100 hover:bg-[rgba(255,255,255,0.08)] transition-all duration-150 ease-out active:scale-[0.97]"
                aria-label="Sign out"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" style={{ color: 'rgba(255, 255, 255, 0.45)' }} aria-hidden="true" />
                <span
                  className="text-sm"
                  style={{
                    fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
                    fontWeight: 400,
                    color: 'rgba(255, 255, 255, 0.45)',
                  }}
                >
                  Sign Out
                </span>
              </button>

              {/* User profile */}
              <button
                onClick={() => handleNavigate('/settings')}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-full hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                aria-label={`Open settings for ${user?.firstName || user?.email || 'user'}`}
                title={user?.firstName || user?.email || 'Settings'}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.10)',
                    color: '#F5F5F4',
                  }}
                >
                  {user?.firstName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {user?.firstName || 'User'}
                  </div>
                  <div
                    className="text-xs truncate"
                    style={{ color: 'rgba(255, 255, 255, 0.4)' }}
                    title={user?.email}
                  >
                    {user?.email}
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
