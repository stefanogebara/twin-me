import { NavLink } from 'react-router-dom';
import { User } from 'lucide-react';
import { navigationConfig } from '../../config/navigation';
import { cn } from '../../lib/utils';

/**
 * Header Component
 *
 * Features:
 * - Top navigation (X level)
 * - Active state with accent color
 * - User profile section
 * - Claude dark theme
 */

interface HeaderProps {
  user?: {
    name?: string;
    email?: string;
  };
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onSignOut }) => {
  const mainRoutes = navigationConfig.routes.filter(route => route.showInHeader);

  return (
    <header className="h-16 bg-[hsl(var(--claude-surface))] border-b border-[hsl(var(--claude-border))] sticky top-0 z-50">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Logo / Brand */}
        <NavLink
          to="/"
          className="flex items-center gap-2"
        >
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
        </NavLink>

        {/* Main Navigation (X level) */}
        <nav className="flex items-center gap-1" aria-label="Main navigation">
          {mainRoutes.map((route) => {
            const Icon = route.icon;
            return (
              <NavLink
                key={route.path}
                to={`/${route.path}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg transition-all',
                    'hover:bg-[hsl(var(--claude-surface-raised))]',
                    isActive
                      ? 'bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-accent))]'
                      : 'text-[hsl(var(--claude-text-muted))]'
                  )
                }
              >
                {Icon && <Icon className="w-4 h-4" />}
                <span
                  className="text-sm font-medium"
                  style={{
                    fontFamily: 'var(--_typography---font--styrene-a)',
                    letterSpacing: '-0.01em'
                  }}
                >
                  {route.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Section */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--claude-surface-raised))]">
              <div className="w-8 h-8 rounded-full bg-[hsl(var(--claude-accent))] flex items-center justify-center">
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
                    className="text-sm text-[hsl(var(--claude-text))]"
                    style={{
                      fontFamily: 'var(--_typography---font--styrene-a)',
                      fontWeight: 500
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
                className="px-3 py-2 text-sm text-[hsl(var(--claude-text-muted))] hover:text-[hsl(var(--claude-accent))] transition-colors"
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
    </header>
  );
};
