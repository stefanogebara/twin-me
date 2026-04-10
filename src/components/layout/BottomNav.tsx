import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, MessageCircle, User, Settings, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomNavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
}

const bottomNavItems: BottomNavItem[] = [
  { id: 'dashboard',  label: 'Home',     icon: Home,          path: '/dashboard' },
  { id: 'chat',       label: 'Twin',     icon: MessageCircle, path: '/talk-to-twin' },
  { id: 'identity',   label: 'You',      icon: User,          path: '/identity' },
  { id: 'wiki',       label: 'Wiki',     icon: BookOpen,      path: '/wiki' },
  { id: 'settings',   label: 'Settings', icon: Settings,      path: '/settings' },
];

export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
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
      {bottomNavItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.path);

        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            aria-label={`Navigate to ${item.label}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center gap-1 py-3 mx-1 rounded-2xl transition-all duration-150 ease-out active:scale-95',
              active
                ? 'opacity-100'
                : 'opacity-50 hover:opacity-75'
            )}
            style={{
              backgroundColor: active ? 'rgba(255,132,0,0.12)' : 'transparent',
            }}
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
    </nav>
  );
};
