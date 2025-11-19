import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Home,
  Link2,
  Sparkles,
  MessageCircle,
  Brain,
  Settings,
  Shield,
  HelpCircle,
  LogOut,
  User,
  Music,
  Zap
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
  description?: string;
}

const primaryNavItems: NavItem[] = [
  {
    id: 'todays-twin',
    label: "Today's Twin",
    icon: Zap,
    path: '/todays-twin',
    description: 'Your daily ritual preparation'
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    path: '/dashboard',
    description: 'Overview of your soul signature'
  },
  {
    id: 'rituals',
    label: 'Music Rituals',
    icon: Music,
    path: '/rituals',
    description: 'Your presentation ritual patterns'
  },
  {
    id: 'connectors',
    label: 'Connect Data',
    icon: Link2,
    path: '/get-started',
    description: 'Connect your platforms'
  },
  {
    id: 'soul-signature',
    label: 'Soul Signature',
    icon: Sparkles,
    path: '/soul-signature',
    description: 'Discover your digital identity'
  },
  {
    id: 'chat',
    label: 'Chat with Twin',
    icon: MessageCircle,
    path: '/talk-to-twin',
    description: 'Interact with your twin'
  },
  {
    id: 'training',
    label: 'Model Training',
    icon: Brain,
    path: '/training',
    description: 'Train your soul signature model'
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    path: '/settings',
    description: 'Configure your twin'
  }
];

const secondaryNavItems: NavItem[] = [
  {
    id: 'privacy',
    label: 'Privacy Controls',
    icon: Shield,
    path: '/privacy-spectrum',
    description: 'Manage your data sharing'
  },
  {
    id: 'help',
    label: 'Help & Docs',
    icon: HelpCircle,
    path: '/help',
    description: 'Get support'
  }
];

interface SidebarProps {
  onNavigate?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    onNavigate?.(); // Close mobile menu if provided
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex flex-col h-screen w-72 md:w-64 bg-[hsl(var(--claude-surface))] border-r border-[hsl(var(--claude-border))]">
      {/* Logo & Brand */}
      <div className="flex items-center gap-3 p-4 md:p-6 border-b border-[hsl(var(--claude-border))]">
        <div className="w-8 h-8 bg-[hsl(var(--claude-accent))] rounded-lg flex items-center justify-center text-white font-bold text-lg">
          T
        </div>
        <div>
          <h1 className="text-[hsl(var(--claude-text))] font-semibold text-lg">
            Twin Me
          </h1>
          <p className="text-[hsl(var(--claude-text-muted))] text-xs">
            Soul Signature Platform
          </p>
        </div>
      </div>

      {/* Primary Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-3 space-y-1">
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.path)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                  transition-all duration-150 group
                  ${active
                    ? 'bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-accent))]'
                    : 'text-[hsl(var(--claude-text-muted))] hover:bg-[hsl(var(--claude-surface-raised))] hover:text-[hsl(var(--claude-text))]'
                  }
                `}
              >
                <Icon
                  className={`w-5 h-5 ${active ? 'text-[hsl(var(--claude-accent))]' : ''}`}
                />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-[hsl(var(--claude-border))]" />

        {/* Secondary Navigation */}
        <div className="px-3 space-y-1">
          {secondaryNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.path)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                  transition-all duration-150
                  ${active
                    ? 'bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-accent))]'
                    : 'text-[hsl(var(--claude-text-muted))] hover:bg-[hsl(var(--claude-surface-raised))] hover:text-[hsl(var(--claude-text))]'
                  }
                `}
              >
                <Icon
                  className={`w-5 h-5 ${active ? 'text-[hsl(var(--claude-accent))]' : ''}`}
                />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* User Profile Section */}
      <div className="border-t border-[hsl(var(--claude-border))] p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-[hsl(var(--claude-surface-raised))] rounded-full flex items-center justify-center text-[hsl(var(--claude-text))]">
            <User className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[hsl(var(--claude-text))] truncate">
              {user?.fullName || user?.email || 'User'}
            </p>
            <p className="text-xs text-[hsl(var(--claude-text-muted))] truncate">
              {user?.email}
            </p>
          </div>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[hsl(var(--claude-text-muted))] hover:bg-[hsl(var(--claude-surface-raised))] hover:text-[hsl(var(--claude-text))] transition-all duration-150"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
};
