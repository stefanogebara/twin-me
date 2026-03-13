import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, MessageCircle, User, Settings } from 'lucide-react';
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
  { id: 'settings',   label: 'Settings', icon: Settings,      path: '/settings' },
];

export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex lg:hidden"
      aria-label="Bottom navigation"
      style={{
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom)',
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
              'relative flex flex-1 flex-col items-center justify-center gap-1 py-3 transition-all duration-200',
              active
                ? 'opacity-100'
                : 'opacity-50 hover:opacity-75 active:opacity-90'
            )}
          >
            <Icon
              className={cn('w-5 h-5 transition-transform duration-200', active && 'scale-110')}
              style={{ color: active ? 'var(--accent-vibrant)' : 'var(--sidebar-foreground)' }}
              aria-hidden="true"
            />
            <span
              className="text-[10px] font-semibold leading-none"
              style={{ color: active ? 'var(--accent-vibrant)' : 'var(--sidebar-foreground)' }}
            >
              {item.label}
            </span>
            {active && (
              <span
                className="absolute bottom-0 h-[2px] w-8 rounded-t-full"
                style={{ background: 'var(--accent-vibrant)' }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
};
