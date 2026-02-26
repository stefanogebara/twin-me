import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Home,
  MessageCircle,
  User,
  ChevronDown,
  ChevronRight,
  Link2,
  Sparkles,
  Brain,
  Target,
  BookOpen,
  Settings,
  LogOut,
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
}

const PRIMARY_NAV: NavItem[] = [
  { id: 'home',  label: 'Home',  icon: Home,          path: '/dashboard' },
  { id: 'chat',  label: 'Chat',  icon: MessageCircle, path: '/talk-to-twin' },
  { id: 'me',    label: 'Me',    icon: User,          path: '/soul-signature' },
];

const MORE_NAV: NavItem[] = [
  { id: 'soul-signature', label: 'Soul Signature', icon: Sparkles,  path: '/soul-signature' },
  { id: 'goals',          label: 'Goals',          icon: Target,    path: '/goals' },
  { id: 'brain',          label: "Twin's Brain",   icon: Brain,     path: '/brain' },
  { id: 'journal',        label: 'Journal',        icon: BookOpen,  path: '/journal' },
  { id: 'connect',        label: 'Connect Data',   icon: Link2,     path: '/get-started' },
  { id: 'settings',       label: 'Settings',       icon: Settings,  path: '/settings' },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  // Expand "More" automatically when a More page is active
  const moreActive = MORE_NAV.some(i => isActive(i.path));

  const handleNavigate = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex flex-col h-screen w-72 md:w-64 bg-[hsl(var(--claude-surface))] border-r border-[hsl(var(--claude-border))]">
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 md:p-6 border-b border-[hsl(var(--claude-border))]">
        <div className="w-8 h-8 bg-[hsl(var(--claude-accent))] rounded-lg flex items-center justify-center text-white font-bold text-lg">
          T
        </div>
        <div>
          <h1 className="text-[hsl(var(--claude-text))] font-semibold text-lg">Twin Me</h1>
          <p className="text-[hsl(var(--claude-text-muted))] text-xs">Soul Signature Platform</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
        {/* 3 primary tabs */}
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path) || (item.id === 'me' && moreActive && !PRIMARY_NAV.some(p => p.id !== 'me' && isActive(p.path)));
          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.path)}
              aria-label={`Navigate to ${item.label}`}
              aria-current={active ? 'page' : undefined}
              className={`
                w-full flex items-center gap-3 px-3 py-3 rounded-lg
                transition-all duration-150 group relative
                ${active
                  ? 'bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-text))] shadow-sm'
                  : 'text-[hsl(var(--claude-text-muted))] hover:bg-[hsl(var(--claude-surface-raised))]/60 hover:text-[hsl(var(--claude-text))]'
                }
              `}
            >
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[hsl(var(--claude-text))]" />
              )}
              <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              <span className="text-sm font-semibold">{item.label}</span>
            </button>
          );
        })}

        {/* More section */}
        <div className="mt-3">
          <button
            onClick={() => setMoreOpen(o => !o)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[hsl(var(--claude-text-muted))] hover:text-[hsl(var(--claude-text))] transition-colors text-xs font-medium uppercase tracking-wide"
          >
            {moreOpen || moreActive ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            More
          </button>

          {(moreOpen || moreActive) && (
            <div className="mt-1 space-y-0.5">
              {MORE_NAV.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.path)}
                    aria-label={`Navigate to ${item.label}`}
                    aria-current={active ? 'page' : undefined}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2 rounded-lg
                      transition-all duration-150 relative
                      ${active
                        ? 'bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-text))]'
                        : 'text-[hsl(var(--claude-text-muted))] hover:bg-[hsl(var(--claude-surface-raised))]/60 hover:text-[hsl(var(--claude-text))]'
                      }
                    `}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-[hsl(var(--claude-text))]" />
                    )}
                    <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      {/* User profile + sign out */}
      <div className="border-t border-[hsl(var(--claude-border))] p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-[hsl(var(--claude-surface-raised))] rounded-full flex items-center justify-center text-[hsl(var(--claude-text))]">
            <User className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[hsl(var(--claude-text))] truncate">
              {user?.fullName || user?.email || 'User'}
            </p>
            <p className="text-xs text-[hsl(var(--claude-text-muted))] truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          aria-label="Sign out of your account"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[hsl(var(--claude-text-muted))] hover:bg-[hsl(var(--claude-surface-raised))] hover:text-[hsl(var(--claude-text))] transition-all duration-150"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
};
