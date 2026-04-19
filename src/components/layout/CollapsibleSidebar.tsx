import React, { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Home,
  MessageCircle,
  Sparkles,
  Link2,
  X,
  Settings,
  LogOut,
  Target,
  Mic,
  ChevronsLeft,
  ChevronsRight,
  BookOpen,
  Brain,
  Building2,
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
  { id: 'brain',        label: 'Memories',        icon: Brain,         path: '/brain' },
  { id: 'wiki',         label: 'Knowledge',       icon: BookOpen,      path: '/wiki' },
  { id: 'departments',  label: 'Departments',     icon: Building2,     path: '/departments' },
  { id: 'connect',      label: 'Connect',         icon: Link2,         path: '/connect' },
  { id: 'settings',     label: 'Settings',        icon: Settings,      path: '/settings' },
];

export const CollapsibleSidebar: React.FC<CollapsibleSidebarProps> = ({
  isOpen,
  onClose
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();

  const [isCollapsedPref, setIsCollapsedPref] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  // Only apply collapsed state on desktop (lg: 1024px+)
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Collapsed only applies on desktop
  const isCollapsed = isDesktop && isCollapsedPref;

  const toggleCollapse = useCallback(() => {
    setIsCollapsedPref(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      window.dispatchEvent(new Event('sidebar-toggle'));
      return next;
    });
  }, []);

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

      {/* Flat sidebar — desktop: expandable/collapsible, mobile: overlay */}
      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 z-40 transition-[width,transform] duration-200 ease-out",
          // Mobile: always full-width overlay, slide in/out
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          // Mobile: always 240px. Desktop: respect collapsed preference
          isCollapsedPref ? "w-[240px] lg:w-[64px]" : "w-[240px]",
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
              type="button"
              onClick={onClose}
              aria-label="Close navigation menu"
              className="absolute top-4 right-4 p-2 hover:bg-[rgba(255,255,255,0.08)] rounded-lg transition-colors lg:hidden"
            >
              <X className="w-5 h-5" style={{ color: 'var(--foreground)' }} aria-hidden="true" />
            </button>

            {/* Logo */}
            <div className={cn(
              "flex items-center border-b border-[rgba(255,255,255,0.08)]",
              isCollapsed ? "justify-center p-3 pb-3" : "justify-center p-5 pb-4"
            )}>
              <button
                type="button"
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
                {!isCollapsed && (
                  <>
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
                  </>
                )}
              </button>
            </div>

            {/* Nav Items */}
            <nav className={cn("space-y-1 flex-1", isCollapsed ? "p-2" : "p-3")} role="navigation" aria-label="Main navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);

                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => handleNavigate(item.path)}
                    aria-label={`Navigate to ${item.label}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      "w-full flex items-center transition-all duration-150 ease-out active:scale-[0.97]",
                      isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-4 py-2.5",
                      active
                        ? "rounded-full font-medium"
                        : "rounded-full hover:bg-[rgba(255,255,255,0.08)]"
                    )}
                    style={active ? {
                      background: 'var(--accent-vibrant-glow)',
                    } : {
                      background: 'transparent',
                    }}
                    title={item.label}
                  >
                    <Icon
                      className="w-5 h-5 flex-shrink-0"
                      style={{ color: active ? 'var(--accent-vibrant)' : 'rgba(255, 255, 255, 0.45)' }}
                      aria-hidden="true"
                    />
                    {!isCollapsed && (
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
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Sign Out + User at Bottom */}
            <div className={cn("border-t border-[rgba(255,255,255,0.08)] space-y-1", isCollapsed ? "p-2" : "p-3")}>
              {/* Sign Out button */}
              <button
                type="button"
                onClick={handleSignOut}
                className={cn(
                  "w-full flex items-center rounded-full opacity-70 hover:opacity-100 hover:bg-[rgba(255,255,255,0.08)] transition-all duration-150 ease-out active:scale-[0.97]",
                  isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-4 py-2.5"
                )}
                aria-label="Sign out"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5 flex-shrink-0" style={{ color: 'rgba(255, 255, 255, 0.45)' }} aria-hidden="true" />
                {!isCollapsed && (
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
                )}
              </button>

              {/* User profile */}
              <button
                type="button"
                onClick={() => handleNavigate('/settings')}
                className={cn(
                  "w-full flex items-center rounded-full hover:bg-[rgba(255,255,255,0.08)] transition-colors",
                  isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-4 py-2.5"
                )}
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
                {!isCollapsed && (
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
                )}
              </button>

              {/* Collapse/Expand toggle — desktop only */}
              <button
                type="button"
                onClick={toggleCollapse}
                className="hidden lg:flex w-full items-center justify-center py-2 rounded-full hover:bg-[rgba(255,255,255,0.08)] transition-all duration-150 ease-out"
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isCollapsed
                  ? <ChevronsRight className="w-4 h-4" style={{ color: 'rgba(255, 255, 255, 0.35)' }} aria-hidden="true" />
                  : <ChevronsLeft className="w-4 h-4" style={{ color: 'rgba(255, 255, 255, 0.35)' }} aria-hidden="true" />
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
