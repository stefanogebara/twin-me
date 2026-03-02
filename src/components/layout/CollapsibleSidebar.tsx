import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebar } from '@/contexts/SidebarContext';
import {
  Home,
  MessageCircle,
  Sparkles,
  Link2,
  Brain,
  ChevronRight,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  X,
  Settings,
  LogOut,
  BookOpen,
  Target,
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

// 3 primary tabs
const mainNavItems: NavItem[] = [
  { id: 'dashboard', label: 'Home',  icon: Home,          path: '/dashboard' },
  { id: 'chat',      label: 'Chat',  icon: MessageCircle, path: '/talk-to-twin' },
  { id: 'me',        label: 'You',   icon: Sparkles,      path: '/identity' },
];

// Everything else — shown in a collapsible "More" section
const moreNavItems: NavItem[] = [
  { id: 'goals',        label: 'Your Goals',      icon: Target,     path: '/goals' },
  { id: 'brain',        label: 'Memory Explorer', icon: Brain,      path: '/brain' },
  { id: 'interview',    label: 'Your Interview',  icon: BookOpen,   path: '/interview' },
  { id: 'connect-data', label: 'Connect Data',    icon: Link2,      path: '/get-started' },
  { id: 'settings',     label: 'Settings',        icon: Settings,   path: '/settings' },
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
  const moreActive = moreNavItems.some(i => location.pathname === i.path);
  const [showMore, setShowMore] = useState(false);

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
          "fixed top-0 left-0 bottom-0 z-40 transition-all duration-300 flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isExpanded ? "w-64" : "w-20 lg:w-20",
          "lg:m-4 lg:rounded-2xl",
          "lg:overflow-visible overflow-hidden border-r border-[#E8E3DC]"
        )}
        style={{ backgroundColor: '#f8f1e8' }}
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
                  fontWeight: 400,
                  color: '#000000'
                }}
              >
                Twin Me
              </span>
            )}
          </button>
        </div>

        <nav className="p-4 space-y-1 flex-1" role="navigation" aria-label="Main navigation">
          {/* 3 primary tabs */}
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path) ||
              (item.id === 'me' && moreActive && !mainNavItems.filter(i => i.id !== 'me').some(i => isActive(i.path)));

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
                    ? isExpanded
                      ? 'bg-sidebar-accent border-l-[3px] border-l-[#000] text-sidebar-accent-foreground font-semibold'
                      : 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                    : isExpanded
                      ? 'text-sidebar-foreground hover:bg-sidebar-accent border-l-[3px] border-l-transparent'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
                title={item.label}
              >
                {CLAY_ICON_MAP[item.id] ? (
                  <Clay3DIcon name={CLAY_ICON_MAP[item.id]} size="sm" className={cn("transition-transform", active && "scale-110")} />
                ) : (
                  <Icon className={cn("w-5 h-5", active && "text-[#000]")} aria-hidden="true" />
                )}
                {isExpanded && <span className="text-sm font-semibold">{item.label}</span>}
              </button>
            );
          })}

          {/* More — collapsible (expanded sidebar only) */}
          {isExpanded && (
            <div className="pt-3">
              <button
                onClick={() => setShowMore(o => !o)}
                aria-label={showMore ? "Collapse More section" : "Expand More section"}
                aria-expanded={showMore || moreActive}
                className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              >
                <span className="text-xs font-medium uppercase tracking-wide opacity-60">More</span>
                {showMore || moreActive ? (
                  <ChevronDown className="w-3.5 h-3.5 opacity-50" aria-hidden="true" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 opacity-50" aria-hidden="true" />
                )}
              </button>

              {(showMore || moreActive) && (
                <div className="mt-1 space-y-0.5 pl-2">
                  {moreNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavigate(item.path)}
                        aria-label={`Navigate to ${item.label}`}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200",
                          active
                            ? 'bg-sidebar-accent border-l-[3px] border-l-[#000] text-sidebar-accent-foreground font-semibold'
                            : 'text-sidebar-foreground opacity-70 hover:bg-sidebar-accent hover:opacity-100 border-l-[3px] border-l-transparent'
                        )}
                        title={item.label}
                      >
                        <Icon className={cn("w-4 h-4", active && "text-[#000]")} aria-hidden="true" />
                        <span className="text-sm">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>

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
