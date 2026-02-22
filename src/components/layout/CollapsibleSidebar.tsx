import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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
  Settings,
  LogOut,
  Music,
  Calendar,
  Eye,
  Video,
  Globe,
  BookOpen,
  Target,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Clay3DIcon, CLAY_ICON_MAP } from '@/components/Clay3DIcon';

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
    id: 'brain',
    label: 'Twin\'s Brain',
    icon: Brain,
    path: '/brain'
  },
  {
    id: 'journal',
    label: 'Soul Journal',
    icon: BookOpen,
    path: '/journal'
  },
  {
    id: 'goals',
    label: 'Goals',
    icon: Target,
    path: '/goals'
  },
  {
    id: 'personality',
    label: 'Personality',
    icon: TrendingUp,
    path: '/personality'
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
    id: 'calendar-insights',
    label: 'Time Patterns',
    icon: Calendar,
    path: '/insights/calendar'
  },
  {
    id: 'youtube-insights',
    label: 'Content World',
    icon: Video,
    path: '/insights/youtube'
  },
  {
    id: 'web-insights',
    label: 'Digital Life',
    icon: Globe,
    path: '/insights/web'
  }
];

export const CollapsibleSidebar: React.FC<CollapsibleSidebarProps> = ({
  isOpen,
  onClose
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const isExpanded = !isCollapsed; // Use context state for sidebar expand/collapse
  const [showInsights, setShowInsights] = useState(true); // Keep Insights section open by default

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
                  fontWeight: 500,
                  color: '#1F1C18'
                }}
              >
                Twin Me
              </span>
            )}
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
                    ? 'bg-sidebar-accent border-l-[3px] border-l-emerald-500 text-sidebar-accent-foreground font-semibold'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent border-l-[3px] border-l-transparent'
                )}
                title={item.label}
              >
                {CLAY_ICON_MAP[item.id] ? (
                  <Clay3DIcon name={CLAY_ICON_MAP[item.id]} size="sm" className={cn("transition-transform", active && "scale-110")} />
                ) : (
                  <Icon className={cn("w-5 h-5", active && "text-emerald-500")} aria-hidden="true" />
                )}
                {isExpanded && <span className="text-sm">{item.label}</span>}
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
                            ? 'bg-sidebar-accent border-l-[3px] border-l-emerald-500 text-sidebar-accent-foreground font-semibold'
                            : 'text-sidebar-foreground opacity-80 hover:bg-sidebar-accent hover:opacity-100 border-l-[3px] border-l-transparent'
                        )}
                        title={item.label}
                      >
                        {CLAY_ICON_MAP[item.id] ? (
                          <Clay3DIcon name={CLAY_ICON_MAP[item.id]} size="xs" className={cn("transition-transform", active && "scale-110")} />
                        ) : (
                          <Icon className={cn("w-4 h-4", active && "text-emerald-500")} aria-hidden="true" />
                        )}
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
                        ? 'bg-sidebar-accent border-l-[3px] border-l-emerald-500'
                        : 'text-sidebar-foreground opacity-80 hover:bg-sidebar-accent hover:opacity-100 border-l-[3px] border-l-transparent'
                    )}
                    title={item.label}
                  >
                    {CLAY_ICON_MAP[item.id] ? (
                      <Clay3DIcon name={CLAY_ICON_MAP[item.id]} size="xs" className={cn("transition-transform", active && "scale-110")} />
                    ) : (
                      <Icon className={cn("w-4 h-4", active ? "text-emerald-500" : "")} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        {/* Admin Section */}
        <div className="px-4 pb-2">
          <button
            onClick={() => handleNavigate('/admin/llm-costs')}
            aria-label="Navigate to LLM Costs"
            aria-current={isActive('/admin/llm-costs') ? 'page' : undefined}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg transition-all duration-200",
              isExpanded ? "px-4 py-3" : "px-3 py-3 justify-center",
              isActive('/admin/llm-costs')
                ? 'bg-sidebar-accent border-l-[3px] border-l-emerald-500 text-sidebar-accent-foreground font-semibold'
                : 'text-sidebar-foreground opacity-70 hover:bg-sidebar-accent hover:opacity-100 border-l-[3px] border-l-transparent'
            )}
            title="LLM Costs"
          >
            <BarChart3 className={cn("w-5 h-5", isActive('/admin/llm-costs') && "text-emerald-500")} aria-hidden="true" />
            {isExpanded && <span className="text-sm">LLM Costs</span>}
          </button>
        </div>

        {/* Sign Out + User at Bottom */}
        <div className="border-t border-sidebar-border p-4 space-y-1">
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
    </>
  );
};
