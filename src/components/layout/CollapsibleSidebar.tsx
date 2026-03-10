import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebar } from '@/contexts/SidebarContext';
import {
  Home,
  MessageCircle,
  Sparkles,
  Link2,
  Brain,
  ChevronsLeft,
  ChevronsRight,
  X,
  Settings,
  LogOut,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

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

const navItems: NavItem[] = [
  { id: 'chat',         label: 'Talk to Twin',    icon: MessageCircle, path: '/talk-to-twin' },
  { id: 'dashboard',    label: 'Home',            icon: Home,          path: '/dashboard' },
  { id: 'me',           label: 'You',             icon: Sparkles,      path: '/identity' },
  { id: 'goals',        label: 'Goals',            icon: Target,        path: '/goals' },
  { id: 'brain',        label: 'Memory Explorer', icon: Brain,         path: '/brain' },
  { id: 'connect-data', label: 'Connect Data',    icon: Link2,         path: '/get-started' },
  { id: 'settings',     label: 'Settings',        icon: Settings,      path: '/settings' },
];

export const CollapsibleSidebar: React.FC<CollapsibleSidebarProps> = ({
  isOpen,
  onClose
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const isExpanded = !isCollapsed;

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    // Only close the mobile overlay, not the sidebar itself
    if (window.innerWidth < 1024) { // lg breakpoint
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

      {/* Sidebar wrapper — overflow-visible so the toggle button can protrude */}
      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 z-40 transition-all duration-300",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isExpanded ? "w-64" : "w-20 lg:w-20",
          "lg:m-4",
          "overflow-visible"
        )}
      >
        {/* Toggle Button for Desktop - rendered in wrapper so it can overflow */}
        <button
          onClick={toggleSidebar}
          aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={isExpanded}
          className="hidden lg:flex absolute top-8 w-8 h-8 bg-sidebar-primary hover:opacity-90 text-sidebar-primary-foreground rounded-full items-center justify-center transition-all shadow-xl hover:shadow-2xl hover:scale-110 z-50 border-2 border-sidebar"
          style={{
            right: '-16px'
          }}
          title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isExpanded ? (
            <ChevronsLeft className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronsRight className="w-4 h-4" aria-hidden="true" />
          )}
        </button>

        {/* Inner glass container — overflow-hidden clips content to rounded corners */}
        <div
          className="flex flex-col h-full overflow-hidden lg:rounded-2xl"
          style={{
            backgroundColor: 'var(--glass-surface-bg)',
            backdropFilter: 'blur(20px) saturate(140%)',
            WebkitBackdropFilter: 'blur(20px) saturate(140%)',
            border: '1px solid var(--glass-surface-border)',
            boxShadow: 'var(--glass-shadow), inset 0 1px 0 var(--glass-inset-highlight)',
          }}
        >
        <style>
          {`
            /* Hide Scrollbar */
            .sidebar-scroll::-webkit-scrollbar {
              display: none;
            }

            /* Firefox */
            .sidebar-scroll {
              scrollbar-width: none;
            }

            /* IE and Edge */
            .sidebar-scroll {
              -ms-overflow-style: none;
            }
          `}
        </style>

        <div className="overflow-y-auto flex-1 flex flex-col sidebar-scroll">
        {/* Close button for mobile */}
        <button
          onClick={onClose}
          aria-label="Close navigation menu"
          className="absolute top-4 right-4 p-2 hover:bg-sidebar-accent rounded-lg transition-colors lg:hidden"
        >
          <X className="w-5 h-5 text-sidebar-foreground" aria-hidden="true" />
        </button>

        {/* Logo */}
        <div className="p-6 pb-5 flex items-center justify-center border-b border-sidebar-border">
          <button
            onClick={() => handleNavigate('/dashboard')}
            className={cn(
              "hover:opacity-80 transition-all duration-200 flex items-center gap-2.5",
              isExpanded ? "" : "justify-center"
            )}
            title="Twin Me"
          >
            <img
              src="/images/backgrounds/flower-hero.png"
              alt="Twin Me"
              className="object-contain drop-shadow-sm flex-shrink-0"
              style={{ width: isExpanded ? 36 : 32, height: isExpanded ? 36 : 32 }}
            />
            {isExpanded && (
              <span
                className="text-2xl heading-serif"
                style={{
                  fontWeight: 400,
                  color: 'var(--foreground)'
                }}
              >
                Twin Me
              </span>
            )}
          </button>
        </div>

        <nav className="p-4 space-y-1 flex-1" role="navigation" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.path)}
                aria-label={`Navigate to ${item.label}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg transition-all duration-200",
                  isExpanded ? "px-4 py-3" : "px-3 py-3 justify-center",
                  active
                    ? "font-semibold"
                    : isExpanded
                      ? 'text-sidebar-foreground hover:bg-sidebar-accent'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
                style={active ? {
                  background: 'var(--accent-vibrant-glow)',
                  borderRadius: '9999px',
                  color: 'var(--sidebar-accent-foreground)',
                } : undefined}
                title={item.label}
              >
                <Icon
                  className={cn("w-5 h-5 transition-transform", active && "scale-110")}
                  style={active ? { color: 'var(--accent-vibrant)' } : undefined}
                  aria-hidden="true"
                />
                {isExpanded && <span className="text-sm font-semibold">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Theme Toggle + Sign Out + User at Bottom */}
        <div className="border-t border-sidebar-border p-4 space-y-1">
          {/* Theme toggle */}
          <ThemeToggle expanded={isExpanded} className="w-full" />

          {/* Sign Out button - always visible */}
          <button
            onClick={handleSignOut}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg text-sidebar-foreground opacity-70 hover:opacity-100 hover:bg-sidebar-accent transition-all duration-200",
              isExpanded ? "px-4 py-3" : "px-3 py-3 justify-center"
            )}
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
            {isExpanded && <span className="text-sm">Sign Out</span>}
          </button>

          {/* User profile */}
          <button
            onClick={() => handleNavigate('/settings')}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg hover:bg-sidebar-accent transition-colors",
              isExpanded ? "px-4 py-3" : "px-2 py-3 justify-center"
            )}
            title={user?.firstName || user?.email || 'Settings'}
          >
            <div className="w-8 h-8 bg-sidebar-primary rounded-full flex items-center justify-center text-sidebar-primary-foreground text-sm font-bold">
              {user?.firstName?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
            {isExpanded && (
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium text-sidebar-foreground truncate">
                  {user?.firstName || 'User'}
                </div>
                <div
                  className="text-xs text-sidebar-foreground opacity-60 truncate"
                  title={user?.email}
                >
                  {user?.email}
                </div>
              </div>
            )}
          </button>
        </div>
        </div>
        </div>
      </div>
    </>
  );
};
