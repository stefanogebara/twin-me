import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import {
  Home,
  MessageCircle,
  Sparkles,
  Link2,
  Shield,
  TrendingUp,
  Brain,
  Database,
  HelpCircle,
  ChevronRight,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  X,
  User,
  Settings,
  LogOut,
  Music,
  Activity,
  Calendar,
  Eye
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

const mainNavItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    path: '/dashboard'
  },
  {
    id: 'connect-data',
    label: 'Connect Data',
    icon: Link2,
    path: '/get-started'
  },
  {
    id: 'soul-signature',
    label: 'Soul Signature',
    icon: Sparkles,
    path: '/soul-signature'
  },
  {
    id: 'ritual-music',
    label: 'Ritual Music',
    icon: Music,
    path: '/ritual-music'
  },
  {
    id: 'chat',
    label: 'Chat with Twin',
    icon: MessageCircle,
    path: '/talk-to-twin'
  }
];

// Twin Insights - expandable section for platform reflections
const insightNavItems: NavItem[] = [
  {
    id: 'spotify-insights',
    label: 'Music Soul',
    icon: Music,
    path: '/insights/spotify'
  },
  {
    id: 'whoop-insights',
    label: 'Body Stories',
    icon: Activity,
    path: '/insights/whoop'
  },
  {
    id: 'calendar-insights',
    label: 'Time Patterns',
    icon: Calendar,
    path: '/insights/calendar'
  }
];

export const CollapsibleSidebar: React.FC<CollapsibleSidebarProps> = ({
  isOpen,
  onClose
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { theme } = useTheme();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const isExpanded = !isCollapsed; // Use context state for sidebar expand/collapse
  const [showInsights, setShowInsights] = useState(true); // Keep Insights section open by default
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Persist Insights section state in localStorage
  useEffect(() => {
    const savedState = localStorage.getItem('sidebar-insights-open');
    if (savedState !== null) {
      setShowInsights(JSON.parse(savedState));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebar-insights-open', JSON.stringify(showInsights));
  }, [showInsights]);

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    // Only close the mobile overlay, not the sidebar itself
    // This way the More section stays expanded
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
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 z-40 transition-all duration-300 flex flex-col glass-sidebar",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isExpanded ? "w-64" : "w-20 lg:w-20",
          "lg:m-4 lg:rounded-3xl",
          "lg:overflow-visible overflow-hidden"
        )}
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

        {/* Toggle Button for Desktop - Outside scrollable area */}
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
        <div className="p-8 pb-6 flex items-center justify-center border-b border-sidebar-border">
          <button
            onClick={() => handleNavigate('/dashboard')}
            className={cn(
              "hover:opacity-80 transition-all duration-200",
              isExpanded ? "text-2xl" : "text-xl"
            )}
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 400,
              color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
            }}
            title="Twin Me"
          >
            {isExpanded ? 'Twin Me' : 'TM'}
          </button>
        </div>

        <nav className="p-4 space-y-1 flex-1" role="navigation" aria-label="Main navigation">
          {/* Main navigation items */}
          {mainNavItems.map((item) => {
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
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
                title={item.label}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                {isExpanded && <span className="text-sm font-medium">{item.label}</span>}
              </button>
            );
          })}

          {/* Twin Insights - Expandable section */}
          {isExpanded && (
            <div className="pt-4">
              <button
                onClick={() => setShowInsights(!showInsights)}
                aria-label={showInsights ? "Collapse Twin Insights section" : "Expand Twin Insights section"}
                aria-expanded={showInsights}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4" aria-hidden="true" />
                  <span className="text-sm font-medium">Twin Insights</span>
                </div>
                {showInsights ? (
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                )}
              </button>

              {showInsights && (
                <div className="mt-1 space-y-1 pl-4" role="menu" aria-label="Twin Insights submenu">
                  {insightNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);

                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavigate(item.path)}
                        role="menuitem"
                        aria-label={`Navigate to ${item.label}`}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-200",
                          active
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                            : 'text-sidebar-foreground opacity-80 hover:bg-sidebar-accent hover:opacity-100'
                        )}
                        title={item.label}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                        <span className="text-sm">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Collapsed Insights - Show as icons only */}
          {!isExpanded && (
            <div className="pt-4 space-y-1">
              {insightNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);

                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.path)}
                    className={cn(
                      "w-full flex items-center justify-center px-3 py-3 rounded-lg transition-all duration-200",
                      active
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                        : 'text-sidebar-foreground opacity-80 hover:bg-sidebar-accent hover:opacity-100'
                    )}
                    title={item.label}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        {/* User Menu at Bottom */}
        <div className="border-t border-sidebar-border p-4">
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg hover:bg-sidebar-accent transition-colors",
                isExpanded ? "px-4 py-3" : "px-2 py-3 justify-center"
              )}
              title={user?.firstName || user?.email || 'User Menu'}
            >
              <div className="w-8 h-8 bg-sidebar-primary rounded-full flex items-center justify-center text-sidebar-primary-foreground text-sm font-bold">
                {user?.firstName?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </div>
              {isExpanded && (
                <>
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
                  <ChevronDown className={cn(
                    "w-4 h-4 text-sidebar-foreground opacity-60 transition-transform",
                    showUserMenu && "rotate-180"
                  )} />
                </>
              )}
            </button>

            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-sidebar-accent border border-sidebar-border rounded-xl shadow-lg z-20 overflow-hidden">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      handleNavigate('/settings');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sidebar-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground transition-colors text-left"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="text-sm">Settings</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      handleSignOut();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-destructive hover:bg-destructive/10 transition-colors text-left border-t border-sidebar-border"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm">Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      </div>
    </>
  );
};
