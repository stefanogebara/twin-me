import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Menu, X, Home, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
 * - Hamburger menu with smooth animations
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

  const menuVariants = {
    closed: {
      x: '100%',
      transition: {
        type: 'tween',
        duration: 0.3,
        ease: 'easeInOut'
      }
    },
    open: {
      x: 0,
      transition: {
        type: 'tween',
        duration: 0.3,
        ease: 'easeInOut'
      }
    }
  };

  const overlayVariants = {
    closed: {
      opacity: 0,
      transition: {
        duration: 0.2
      }
    },
    open: {
      opacity: 1,
      transition: {
        duration: 0.2
      }
    }
  };

  const itemVariants = {
    closed: { opacity: 0, x: 20 },
    open: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: i * 0.05,
        duration: 0.2
      }
    })
  };

  const mainRoutes = navigationConfig.routes.filter(route => route.showInHeader);

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'md:hidden p-2 rounded-lg',
          'text-[hsl(var(--claude-text))]',
          'hover:bg-[hsl(var(--claude-surface-raised))]',
          'transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-[hsl(var(--claude-accent))]'
        )}
        aria-label="Toggle menu"
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            variants={overlayVariants}
            initial="closed"
            animate="open"
            exit="closed"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={cn(
              'fixed top-0 right-0 bottom-0 w-[280px] z-50',
              'bg-[hsl(var(--claude-surface))]',
              'border-l border-[hsl(var(--claude-border))]',
              'md:hidden overflow-y-auto'
            )}
            variants={menuVariants}
            initial="closed"
            animate="open"
            exit="closed"
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--claude-border))]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[hsl(var(--claude-accent))] flex items-center justify-center">
                    <span className="text-white font-bold text-lg">T</span>
                  </div>
                  <span
                    className="text-lg font-semibold text-[hsl(var(--claude-text))]"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      letterSpacing: '-0.02em'
                    }}
                  >
                    Twin Me
                  </span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-lg hover:bg-[hsl(var(--claude-surface-raised))] transition-colors"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation */}
              <nav className="flex-1 p-4 space-y-1">
                {mainRoutes.map((route, index) => {
                  const Icon = route.icon;
                  const hasChildren = route.children && route.children.length > 0;
                  const isExpanded = expandedSections.has(route.path);

                  return (
                    <motion.div
                      key={route.path}
                      custom={index}
                      variants={itemVariants}
                      initial="closed"
                      animate="open"
                    >
                      <div className="space-y-1">
                        {/* Main Item */}
                        {hasChildren ? (
                          <button
                            onClick={() => toggleSection(route.path)}
                            className={cn(
                              'w-full flex items-center gap-3 px-4 py-3 rounded-lg',
                              'text-[hsl(var(--claude-text))]',
                              'hover:bg-[hsl(var(--claude-surface-raised))]',
                              'transition-colors duration-200'
                            )}
                          >
                            {Icon && <Icon className="w-5 h-5" />}
                            <span
                              className="flex-1 text-left text-base font-medium"
                              style={{
                                fontFamily: 'var(--_typography---font--styrene-a)',
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
                                  ? 'bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-accent))]'
                                  : 'text-[hsl(var(--claude-text))] hover:bg-[hsl(var(--claude-surface-raised))]'
                              )
                            }
                          >
                            {Icon && <Icon className="w-5 h-5" />}
                            <span
                              className="text-base font-medium"
                              style={{
                                fontFamily: 'var(--_typography---font--styrene-a)',
                                letterSpacing: '-0.01em'
                              }}
                            >
                              {route.label}
                            </span>
                          </NavLink>
                        )}

                        {/* Children */}
                        <AnimatePresence>
                          {hasChildren && isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
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
                                            ? 'bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-accent))]'
                                            : 'text-[hsl(var(--claude-text-muted))] hover:bg-[hsl(var(--claude-surface-raised))]'
                                        )
                                      }
                                    >
                                      {ChildIcon && <ChildIcon className="w-4 h-4" />}
                                      <span>{child.label}</span>
                                    </NavLink>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })}
              </nav>

              {/* User Section */}
              {user && (
                <div className="p-4 border-t border-[hsl(var(--claude-border))] space-y-3">
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[hsl(var(--claude-surface-raised))]">
                    <div className="w-10 h-10 rounded-full bg-[hsl(var(--claude-accent))] flex items-center justify-center">
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
                          className="text-sm text-[hsl(var(--claude-text))] font-medium"
                          style={{
                            fontFamily: 'var(--_typography---font--styrene-a)'
                          }}
                        >
                          {user.name}
                        </span>
                      )}
                      {user.email && (
                        <span
                          className="text-xs text-[hsl(var(--claude-text-muted))]"
                          style={{
                            fontFamily: 'var(--_typography---font--tiempos)'
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
                        'text-[hsl(var(--claude-text-muted))]',
                        'hover:text-[hsl(var(--claude-accent))]',
                        'hover:bg-[hsl(var(--claude-surface-raised))]',
                        'transition-colors duration-200'
                      )}
                      style={{
                        fontFamily: 'var(--_typography---font--styrene-a)'
                      }}
                    >
                      Sign Out
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
