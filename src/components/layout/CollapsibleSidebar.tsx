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
  ChevronsLeft,
  ChevronsRight,
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

// The five-surface IA (product-truth-review 2026-08-09): Today, Twin, You,
// Connect, Settings. A surface earns a nav slot only if a user would type its
// URL from memory; everything else is a card in Today, a section in You, or a
// message from the twin.
// Removed 2026-08-10 (Phase 1): Money (frozen — route alive, no nav),
// Download app (desktop is no longer the bet), History import (absorbed into
// Connect). Prior removals 2026-06-12: Knowledge, Inbox, Meetings — viewers
// over backend intelligence, usage 1-3 of 21 users.
const navItems: NavItem[] = [
  { id: 'today',        label: 'Today',           icon: Home,          path: '/today' },
  { id: 'chat',         label: 'Talk to Twin',    icon: MessageCircle, path: '/talk-to-twin' },
  { id: 'me',           label: 'You',             icon: Sparkles,      path: '/identity' },
  { id: 'connect',      label: 'Connect',         icon: Link2,         path: '/connect' },
  { id: 'settings',     label: 'Settings',        icon: Settings,      path: '/settings' },
];

/**
 * The signed-in sidebar, in the register (2026-09-12): a 200px column of plain
 * text links on the page, a hairline on its right. The current link is ink and
 * underlined; nothing is filled. Every line is 13px, and weight marks the current
 * one. Collapsed (desktop only) it keeps just the icons, the current one in ink.
 */
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

  const rowClass = cn(
    'group w-full flex items-center min-h-8 rounded-[var(--rg-radius)] transition-colors duration-150 ease-out',
    isCollapsed ? 'justify-center px-0 py-1.5 hover:bg-[var(--rg-hover)]' : 'gap-3 px-3 py-1.5'
  );

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-[rgb(var(--rg-ink-rgb)_/_0.32)] z-40 lg:hidden"
          onClick={onClose}
          role="button"
          tabIndex={0}
          aria-label="Close navigation menu"
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />
      )}

      {/* Desktop: expandable/collapsible. Mobile: an overlay behind the menu button. */}
      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 z-40 transition-[width,transform] duration-200 ease-out",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isCollapsedPref ? "w-[200px] lg:w-[64px]" : "w-[200px]",
        )}
      >
        <div
          className="flex flex-col h-full overflow-hidden"
          style={{
            background: 'var(--rg-page)',
            borderRight: '1px solid var(--rg-rule)',
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
              className="absolute top-4 right-3 inline-grid place-items-center w-8 h-8 rounded-[var(--rg-radius)] hover:bg-[var(--rg-hover)] transition-colors lg:hidden"
            >
              <X className="w-4 h-4 text-[var(--rg-ink)]" aria-hidden="true" />
            </button>

            {/* Wordmark */}
            <div className={cn(
              "flex items-center",
              isCollapsed ? "justify-center p-3" : "justify-start px-4 pt-6 pb-5"
            )}>
              <button
                type="button"
                onClick={() => handleNavigate('/today')}
                className="hover:opacity-80 transition-opacity duration-200 flex items-center gap-2"
                aria-label="Go to dashboard"
                title="Twin Me"
              >
                <img
                  src="/images/backgrounds/flower-hero.png"
                  alt=""
                  className="object-contain flex-shrink-0"
                  style={{ width: 24, height: 24 }}
                />
                {!isCollapsed && (
                  <>
                    <span className="text-[15px] font-medium tracking-[-0.02em] text-[var(--rg-ink)]">
                      Twin Me
                    </span>
                    <span className="text-[13px] font-[350] text-[var(--rg-ink-3)]">
                      Beta
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Nav Items */}
            <nav className={cn("flex-1 flex flex-col", isCollapsed ? "px-2 gap-1" : "px-1 gap-0.5")} role="navigation" aria-label="Main navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                // One-interface (2026-06-12): inbox page + its pending badge
                // removed; badge plumbing kept for future per-item counts.
                const badgeCount: number = 0;

                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => handleNavigate(item.path)}
                    aria-label={
                      badgeCount > 0
                        ? `Navigate to ${item.label} (${badgeCount} pending)`
                        : `Navigate to ${item.label}`
                    }
                    aria-current={active ? 'page' : undefined}
                    className={rowClass}
                    title={item.label}
                  >
                    <div className="relative flex-shrink-0">
                      <Icon
                        className={cn(
                          'w-4 h-4',
                          active ? 'text-[var(--rg-ink)]' : 'text-[var(--rg-ink-2)] group-hover:text-[var(--rg-ink)]'
                        )}
                        aria-hidden="true"
                      />
                      {/* Collapsed sidebar: a dot on the icon when there's a count.
                          The full number below only renders when expanded. */}
                      {badgeCount > 0 && isCollapsed && (
                        <span
                          className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--rg-ink)]"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    {!isCollapsed && (
                      <>
                        <span
                          className={cn(
                            'text-[13px] leading-5 truncate flex-1 text-left',
                            active
                              ? 'font-medium text-[var(--rg-ink)] underline decoration-1 underline-offset-4'
                              : 'font-normal text-[var(--rg-ink-2)] group-hover:text-[var(--rg-ink)]'
                          )}
                        >
                          {item.label}
                        </span>
                        {badgeCount > 0 && (
                          <span
                            className="ml-auto inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-[13px] font-medium rounded-full bg-[var(--rg-ink)] text-[var(--rg-page)]"
                            style={{ lineHeight: 1 }}
                            aria-hidden="true"
                          >
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Sign out, the account, and the collapse toggle */}
            <div className={cn("border-t border-[var(--rg-rule)] flex flex-col gap-0.5", isCollapsed ? "p-2" : "px-1 py-3")}>
              <button
                type="button"
                onClick={handleSignOut}
                className={rowClass}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="w-4 h-4 flex-shrink-0 text-[var(--rg-ink-2)] group-hover:text-[var(--rg-ink)]" aria-hidden="true" />
                {!isCollapsed && (
                  <span className="text-[13px] leading-5 text-[var(--rg-ink-2)] group-hover:text-[var(--rg-ink)]">
                    Sign out
                  </span>
                )}
              </button>

              {/* The account. The avatar is a circle because it is an avatar. */}
              <button
                type="button"
                onClick={() => handleNavigate('/settings')}
                className={cn(rowClass, !isCollapsed && 'py-2')}
                aria-label={`Open settings for ${user?.firstName || user?.email || 'user'}`}
                title={user?.firstName || user?.email || 'Settings'}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-medium flex-shrink-0 bg-[var(--rg-field)] text-[var(--rg-ink)]">
                  {user?.firstName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </div>
                {!isCollapsed && (
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-[13px] leading-5 font-medium truncate text-[var(--rg-ink)]">
                      {user?.firstName || 'User'}
                    </div>
                    <div
                      className="text-[13px] leading-[19.5px] font-[350] truncate text-[var(--rg-ink-3)]"
                      title={user?.email}
                    >
                      {user?.email}
                    </div>
                  </div>
                )}
              </button>

              {/* Collapse/Expand toggle — desktop only.
                  audit-2026-05-13 M2: data-testid is a stable handle for
                  automated probes. aria-label swaps with state so screen
                  reader users hear the action that will happen on click,
                  but a selector like [aria-label*="Collapse"] only matches
                  in one state. data-testid + aria-expanded give audits a
                  reliable selector regardless of which way the button is
                  currently pointing. */}
              <button
                type="button"
                onClick={toggleCollapse}
                className="hidden lg:flex w-full min-h-8 items-center justify-center rounded-[var(--rg-radius)] hover:bg-[var(--rg-hover)] transition-colors duration-150 ease-out"
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!isCollapsed}
                data-testid="sidebar-collapse-toggle"
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isCollapsed
                  ? <ChevronsRight className="w-4 h-4 text-[var(--rg-ink-2)]" aria-hidden="true" />
                  : <ChevronsLeft className="w-4 h-4 text-[var(--rg-ink-2)]" aria-hidden="true" />
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
