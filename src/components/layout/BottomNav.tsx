import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, MessageCircle, Link2, User, MoreHorizontal, Brain, BookOpen, Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
}

const PRIMARY_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Home',    icon: Home,          path: '/dashboard' },
  { id: 'chat',      label: 'Twin',    icon: MessageCircle, path: '/talk-to-twin' },
  { id: 'connect',   label: 'Connect', icon: Link2,         path: '/connect' },
  { id: 'identity',  label: 'You',     icon: User,          path: '/identity' },
];

const MORE_NAV: NavItem[] = [
  { id: 'brain',    label: 'Memories',   icon: Brain,    path: '/brain' },
  { id: 'wiki',     label: 'Knowledge',  icon: BookOpen, path: '/wiki' },
  { id: 'settings', label: 'Settings',   icon: Settings, path: '/settings' },
];

export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer whenever the route changes
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const isActive = (path: string) => location.pathname.startsWith(path);
  const isMoreActive = MORE_NAV.some(item => isActive(item.path));

  const handleNav = (path: string) => {
    setDrawerOpen(false);
    navigate(path);
  };

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* More drawer */}
      <div
        className="fixed left-3 right-3 z-50 lg:hidden"
        style={{
          bottom: drawerOpen ? '76px' : '-200px',
          transition: 'bottom 0.25s cubic-bezier(0.32,0.72,0,1)',
          background: 'rgba(19,18,26,0.97)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: '20px',
          padding: '12px 8px',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'row',
          gap: '4px',
        }}
      >
        {MORE_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.path)}
              aria-label={`Navigate to ${item.label}`}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 py-3 rounded-2xl transition-all duration-150 active:scale-95"
              style={{ backgroundColor: active ? 'rgba(255,255,255,0.10)' : 'transparent' }}
            >
              <Icon
                className="w-5 h-5"
                style={{ color: active ? '#F5F5F4' : 'rgba(245,245,244,0.5)' }}
              />
              <span
                className="text-[10px] font-semibold leading-none"
                style={{ color: active ? '#F5F5F4' : 'rgba(245,245,244,0.5)' }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setDrawerOpen(false)}
          className="flex flex-col items-center justify-center gap-1 py-3 px-3 rounded-2xl transition-all duration-150 active:scale-95"
          style={{ color: 'rgba(245,245,244,0.3)' }}
          aria-label="Close more menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-3 left-3 right-3 z-50 flex lg:hidden"
        aria-label="Bottom navigation"
        style={{
          backgroundColor: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border)',
          borderRadius: '32px',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.path)}
              aria-label={`Navigate to ${item.label}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1 py-3 mx-1 rounded-2xl transition-all duration-150 ease-out active:scale-95',
                active ? 'opacity-100' : 'opacity-50 hover:opacity-75'
              )}
              style={{ backgroundColor: active ? 'rgba(255,255,255,0.10)' : 'transparent' }}
            >
              <Icon
                className={cn('w-5 h-5 transition-transform duration-150 ease-out', active && 'scale-110')}
                style={{ color: active ? '#F5F5F4' : 'var(--sidebar-foreground)' }}
                aria-hidden="true"
              />
              <span
                className="text-[10px] font-semibold leading-none"
                style={{ color: active ? '#F5F5F4' : 'var(--sidebar-foreground)' }}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        {/* More tab */}
        <button
          onClick={() => setDrawerOpen(prev => !prev)}
          aria-label="More navigation options"
          aria-expanded={drawerOpen}
          className={cn(
            'relative flex flex-1 flex-col items-center justify-center gap-1 py-3 mx-1 rounded-2xl transition-all duration-150 ease-out active:scale-95',
            (drawerOpen || isMoreActive) ? 'opacity-100' : 'opacity-50 hover:opacity-75'
          )}
          style={{ backgroundColor: (drawerOpen || isMoreActive) ? 'rgba(255,255,255,0.10)' : 'transparent' }}
        >
          <MoreHorizontal
            className={cn('w-5 h-5 transition-transform duration-150 ease-out', (drawerOpen || isMoreActive) && 'scale-110')}
            style={{ color: (drawerOpen || isMoreActive) ? '#F5F5F4' : 'var(--sidebar-foreground)' }}
            aria-hidden="true"
          />
          <span
            className="text-[10px] font-semibold leading-none"
            style={{ color: (drawerOpen || isMoreActive) ? '#F5F5F4' : 'var(--sidebar-foreground)' }}
          >
            More
          </span>
        </button>
      </nav>
    </>
  );
};
