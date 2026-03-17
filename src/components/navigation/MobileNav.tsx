import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Menu, X, Home, ChevronRight } from 'lucide-react';
import { navigationConfig } from '../../config/navigation';
import { cn } from '../../lib/utils';

interface MobileNavProps {
  user?: {
    name?: string;
    email?: string;
  };
  onSignOut?: () => void;
}

/**
 * Mobile Navigation Component
 *
 * Features:
 * - Hamburger menu
 * - Overlay backdrop when open
 * - Closes automatically on route change
 * - Touch-friendly spacing
 * - Nested navigation support
 * - User profile section
 */
export const MobileNav: React.FC<MobileNavProps> = ({ user, onSignOut }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const location = useLocation();

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const toggleSection = (path: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const mainRoutes = navigationConfig.routes.filter(route => route.showInHeader);

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'md:hidden p-2 rounded-lg',
          'text-[var(--foreground)]',
          'hover:bg-[var(--glass-surface-bg-subtle)]',
          'transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-[var(--accent-vibrant)]'
        )}
        aria-label="Toggle menu"
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Menu */}
      {isOpen && (
        <div
          className={cn(
            'fixed top-0 right-0 bottom-0 w-[280px] z-50',
            'bg-[var(--glass-surface-bg)]',
            'border-l border-[var(--glass-surface-border)]',
            'md:hidden overflow-y-auto'
          )}
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--glass-surface-border)]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[var(--accent-vibrant)] flex items-center justify-center">
                  <span className="text-white font-bold text-lg">T</span>
                </div>
                <span
                  className="text-lg font-semibold text-[var(--foreground)]"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    letterSpacing: '-0.02em'
                  }}
                >
                  Twin Me
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg hover:bg-[var(--glass-surface-bg-subtle)] transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1">
              {mainRoutes.map((route) => {
                const Icon = route.icon;
                const hasChildren = route.children && route.children.length > 0;
                const isExpanded = expandedSections.has(route.path);

                return (
                  <div key={route.path}>
                    <div className="space-y-1">
                      {/* Main Item */}
                      {hasChildren ? (
                        <button
                          onClick={() => toggleSection(route.path)}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-3 rounded-lg',
                            'text-[var(--foreground)]',
                            'hover:bg-[var(--glass-surface-bg-subtle)]',
                            'transition-colors duration-200'
                          )}
                        >
                          {Icon && <Icon className="w-5 h-5" />}
                          <span
                            className="flex-1 text-left text-base font-medium"
                            style={{
                              fontFamily: 'var(--font-heading)',
                              letterSpacing: '-0.01em'
                            }}
                          >
                            {route.label}
                          </span>
                          <ChevronRight
                            className={cn(
                              'w-4 h-4 transition-transform duration-200',
                              isExpanded && 'rotate-90'
                            )}
                          />
                        </button>
                      ) : (
                        <NavLink
                          to={`/${route.path}`}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 px-4 py-3 rounded-lg',
                              'transition-colors duration-200',
                              isActive
                                ? 'bg-[var(--glass-surface-bg-subtle)] text-[var(--accent-vibrant)]'
                                : 'text-[var(--foreground)] hover:bg-[var(--glass-surface-bg-subtle)]'
                            )
                          }
                        >
                          {Icon && <Icon className="w-5 h-5" />}
                          <span
                            className="text-base font-medium"
                            style={{
                              fontFamily: 'var(--font-heading)',
                              letterSpacing: '-0.01em'
                            }}
                          >
                            {route.label}
                          </span>
                        </NavLink>
                      )}

                      {/* Children */}
                      {hasChildren && isExpanded && (
                        <div className="overflow-hidden">
                          <div className="ml-8 space-y-1 py-1">
                            {route.children?.map(child => {
                              const ChildIcon = child.icon;
                              return (
                                <NavLink
                                  key={child.path}
                                  to={`/${route.path}/${child.path}`}
                                  className={({ isActive }) =>
                                    cn(
                                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                                      'transition-colors duration-200',
                                      isActive
                                        ? 'bg-[var(--glass-surface-bg-subtle)] text-[var(--accent-vibrant)]'
                                        : 'text-[var(--text-muted)] hover:bg-[var(--glass-surface-bg-subtle)]'
                                    )
                                  }
                                >
                                  {ChildIcon && <ChildIcon className="w-4 h-4" />}
                                  <span>{child.label}</span>
                                </NavLink>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </nav>

            {/* User Section */}
            {user && (
              <div className="p-4 border-t border-[var(--glass-surface-border)] space-y-3">
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--glass-surface-bg-subtle)]">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent-vibrant)] flex items-center justify-center">
                    {user.name ? (
                      <span className="text-white text-base font-medium">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    ) : (
                      <Home className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    {user.name && (
                      <span
                        className="text-sm text-[var(--foreground)] font-medium"
                        style={{
                          fontFamily: 'var(--font-heading)'
                        }}
                      >
                        {user.name}
                      </span>
                    )}
                    {user.email && (
                      <span
                        className="text-xs text-[var(--text-muted)]"
                        style={{
                          fontFamily: "'Inter', sans-serif"
                        }}
                      >
                        {user.email}
                      </span>
                    )}
                  </div>
                </div>

                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    className={cn(
                      'w-full px-4 py-2 rounded-lg',
                      'text-sm font-medium',
                      'text-[var(--text-muted)]',
                      'hover:text-[var(--accent-vibrant)]',
                      'hover:bg-[var(--glass-surface-bg-subtle)]',
                      'transition-colors duration-200'
                    )}
                    style={{
                      fontFamily: 'var(--font-heading)'
                    }}
                  >
                    Sign Out
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
