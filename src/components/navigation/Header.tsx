import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { User, Menu, X } from 'lucide-react';
import { navigationConfig } from '../../config/navigation';
import { cn } from '../../lib/utils';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Header Component
 *
 * Features:
 * - Top navigation (X level)
 * - Liquid glass morphism styling
 * - Active state with accent color
 * - User profile section
 * - Theme-aware design
 * - Mobile responsive with menu
 */

interface HeaderProps {
  user?: {
    name?: string;
    email?: string;
  };
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onSignOut }) => {
  const { theme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mainRoutes = navigationConfig.routes.filter(route => route.showInHeader);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 m-4 rounded-2xl"
      style={{
        backgroundColor: theme === 'dark'
          ? 'rgba(45, 45, 41, 0.8)'
          : 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        border: theme === 'dark'
          ? '1px solid rgba(193, 192, 182, 0.1)'
          : '1px solid rgba(0, 0, 0, 0.06)',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.3)'
          : '0 8px 32px rgba(0, 0, 0, 0.08)'
      }}
    >
      <div className="h-16 px-6 flex items-center justify-between">
        {/* Logo / Brand */}
        <NavLink
          to="/"
          className="flex items-center gap-2"
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: '#78716c'
            }}
          >
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 400,
              letterSpacing: '-0.02em',
              fontSize: '1.125rem',
              color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
            }}
          >
            Twin Me
          </span>
        </NavLink>

        {/* Main Navigation (X level) - Desktop */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
          {mainRoutes.map((route) => {
            const Icon = route.icon;
            return (
              <NavLink
                key={route.path}
                to={`/${route.path}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg transition-all'
                  )
                }
                style={({ isActive }) => ({
                  backgroundColor: isActive
                    ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)')
                    : 'transparent',
                  color: isActive
                    ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                    : (theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : 'rgba(12, 10, 9, 0.6)')
                })}
              >
                {Icon && <Icon className="w-4 h-4" />}
                <span
                  className="text-sm font-medium"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    letterSpacing: '-0.01em'
                  }}
                >
                  {route.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 rounded-lg transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
            backgroundColor: mobileMenuOpen
              ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)')
              : 'transparent'
          }}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* User Section - Desktop */}
        {user && (
          <div className="hidden md:flex items-center gap-3">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{
                backgroundColor: theme === 'dark'
                  ? 'rgba(193, 192, 182, 0.1)'
                  : 'rgba(0, 0, 0, 0.05)'
              }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: '#78716c'
                }}
              >
                {user.name ? (
                  <span className="text-white text-sm font-medium">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <User className="w-4 h-4 text-white" />
                )}
              </div>
              <div className="flex flex-col">
                {user.name && (
                  <span
                    className="text-sm"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 500,
                      color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    }}
                  >
                    {user.name}
                  </span>
                )}
                {user.email && (
                  <span
                    className="text-xs"
                    style={{
                      fontFamily: 'var(--font-body)',
                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : 'rgba(12, 10, 9, 0.6)'
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
                className="px-3 py-2 text-sm transition-colors rounded-lg"
                style={{
                  fontFamily: 'var(--font-heading)',
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : 'rgba(12, 10, 9, 0.6)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#78716c';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = theme === 'dark'
                    ? 'rgba(193, 192, 182, 0.7)'
                    : 'rgba(12, 10, 9, 0.6)';
                }}
              >
                Sign Out
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className="md:hidden px-4 pb-4"
          style={{
            borderTop: theme === 'dark'
              ? '1px solid rgba(193, 192, 182, 0.1)'
              : '1px solid rgba(0, 0, 0, 0.06)'
          }}
        >
          <nav className="flex flex-col gap-1 pt-4" aria-label="Mobile navigation">
            {mainRoutes.map((route) => {
              const Icon = route.icon;
              return (
                <NavLink
                  key={route.path}
                  to={`/${route.path}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-4 py-3 rounded-lg transition-all'
                    )
                  }
                  style={({ isActive }) => ({
                    backgroundColor: isActive
                      ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)')
                      : 'transparent',
                    color: isActive
                      ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                      : (theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : 'rgba(12, 10, 9, 0.6)')
                  })}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  <span
                    className="text-sm font-medium"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      letterSpacing: '-0.01em'
                    }}
                  >
                    {route.label}
                  </span>
                </NavLink>
              );
            })}
          </nav>

          {/* Mobile User Section */}
          {user && (
            <div
              className="mt-4 pt-4"
              style={{
                borderTop: theme === 'dark'
                  ? '1px solid rgba(193, 192, 182, 0.1)'
                  : '1px solid rgba(0, 0, 0, 0.06)'
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: '#78716c'
                    }}
                  >
                    {user.name ? (
                      <span className="text-white text-sm font-medium">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    ) : (
                      <User className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    {user.name && (
                      <span
                        className="text-sm"
                        style={{
                          fontFamily: 'var(--font-heading)',
                          fontWeight: 500,
                          color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                        }}
                      >
                        {user.name}
                      </span>
                    )}
                    {user.email && (
                      <span
                        className="text-xs"
                        style={{
                          fontFamily: 'var(--font-body)',
                          color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : 'rgba(12, 10, 9, 0.6)'
                        }}
                      >
                        {user.email}
                      </span>
                    )}
                  </div>
                </div>

                {onSignOut && (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onSignOut();
                    }}
                    className="px-3 py-2 text-sm transition-colors rounded-lg"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : 'rgba(12, 10, 9, 0.6)'
                    }}
                  >
                    Sign Out
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
