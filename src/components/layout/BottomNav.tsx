import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, MessageCircle, Link2, User, MoreHorizontal, Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
}

// Mirrors the desktop five-surface IA (product-truth-review 2026-08-09):
// Today, Twin, You, Connect + Settings in the More drawer. Memories (/brain)
// left nav in Phase 1 — it becomes an evidence view reached from You/Settings,
// not a destination.
const PRIMARY_NAV: NavItem[] = [
  { id: 'today',     label: 'Today',   icon: Home,          path: '/today' },
  { id: 'chat',      label: 'Twin',    icon: MessageCircle, path: '/talk-to-twin' },
  { id: 'identity',  label: 'You',     icon: User,          path: '/identity' },
  { id: 'connect',   label: 'Connect', icon: Link2,         path: '/connect' },
];

const MORE_NAV: NavItem[] = [
  { id: 'settings', label: 'Settings',   icon: Settings, path: '/settings' },
];

/**
 * The phone's tab bar, in the register (2026-09-12): flush to the bottom on the
 * page colour under a hairline. No floating glass pill, no shadow, no blur. The
 * current tab is ink at 500; the rest are the grey line (7.3:1), never faded
 * with opacity, which took them under AA.
 */
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

  const tabClass = (on: boolean) => cn(
    'relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors duration-150 ease-out',
    on ? 'text-[var(--rg-ink)]' : 'text-[var(--rg-ink-2)] hover:text-[var(--rg-ink)]'
  );
  const labelClass = (on: boolean) => cn('text-[13px] leading-none', on ? 'font-medium' : 'font-normal');

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgb(var(--rg-ink-rgb) / 0.32)' }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* More drawer.
          audit-2026-07-03 M1: when closed, the drawer must NOT be focusable.
          It was previously only translated off-screen (bottom:-200px) while its
          buttons stayed in the tab order on every viewport (the inline
          display:'flex' also defeated lg:hidden). visibility:hidden removes the
          whole subtree from the tab order and the accessibility tree; it is
          delayed on close so the slide-down animation still plays, and applied
          immediately on open. aria-hidden mirrors the state for AT. */}
      <div
        className="fixed left-3 right-3 z-50 flex flex-row gap-1 lg:hidden"
        aria-hidden={!drawerOpen}
        style={{
          bottom: drawerOpen ? '72px' : '-200px',
          visibility: drawerOpen ? 'visible' : 'hidden',
          pointerEvents: drawerOpen ? 'auto' : 'none',
          transition: drawerOpen
            ? 'bottom 0.25s cubic-bezier(0.32,0.72,0,1), visibility 0s'
            : 'bottom 0.25s cubic-bezier(0.32,0.72,0,1), visibility 0s linear 0.25s',
          background: 'var(--rg-white)',
          border: '1px solid var(--rg-rule)',
          borderRadius: 'var(--rg-radius-icon)',
          padding: '8px',
        }}
      >
        {MORE_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => handleNav(item.path)}
              aria-label={`Navigate to ${item.label}`}
              className={cn(tabClass(active), 'rounded-[var(--rg-radius)] hover:bg-[var(--rg-hover)]')}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className={labelClass(active)}>{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="flex flex-col items-center justify-center px-3 rounded-[var(--rg-radius)] text-[var(--rg-ink-2)] hover:bg-[var(--rg-hover)] hover:text-[var(--rg-ink)]"
          aria-label="Close more menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex lg:hidden"
        aria-label="Bottom navigation"
        style={{
          backgroundColor: 'var(--rg-page)',
          borderTop: '1px solid var(--rg-rule)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => handleNav(item.path)}
              aria-label={`Navigate to ${item.label}`}
              aria-current={active ? 'page' : undefined}
              className={tabClass(active)}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className={labelClass(active)}>{item.label}</span>
            </button>
          );
        })}

        {/* More tab */}
        <button
          type="button"
          onClick={() => setDrawerOpen(prev => !prev)}
          aria-label="More navigation options"
          aria-expanded={drawerOpen}
          className={tabClass(drawerOpen || isMoreActive)}
        >
          <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
          <span className={labelClass(drawerOpen || isMoreActive)}>More</span>
        </button>
      </nav>
    </>
  );
};
