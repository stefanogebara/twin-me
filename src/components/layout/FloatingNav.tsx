import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Home,
  Sparkles,
  Shield,
  Link2,
  TrendingUp,
  Brain,
  HelpCircle,
  Activity,
  Database,
  User,
  LogOut
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
}

const navItems: NavItem[] = [
  {
    id: 'home',
    label: 'Dashboard',
    icon: Home,
    path: '/dashboard'
  },
  {
    id: 'soul-signature',
    label: 'Soul Signature',
    icon: Sparkles,
    path: '/soul-signature'
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: Shield,
    path: '/privacy-spectrum'
  },
  {
    id: 'platforms',
    label: 'Platforms',
    icon: Link2,
    path: '/get-started'
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: TrendingUp,
    path: '/insights'
  },
  {
    id: 'training',
    label: 'Training',
    icon: Brain,
    path: '/training'
  },
  {
    id: 'platform-status',
    label: 'Status',
    icon: Activity,
    path: '/platform-status'
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: Database,
    path: '/memory-dashboard'
  },
  {
    id: 'help',
    label: 'Help',
    icon: HelpCircle,
    path: '/help'
  }
];

export const FloatingNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = React.useState(false);

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-6xl px-6">
      <div
        className="backdrop-blur-xl border border-white/12/50 rounded-full px-8 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-300 hover:shadow-[0_12px_48px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]"
        style={{ backgroundColor: 'rgba(28, 25, 23, 0.85)' }}
      >
        <div className="flex justify-between items-center">
          {/* Brand */}
          <div
            className="text-2xl font-bold text-foreground cursor-pointer hover:text-muted-foreground transition-colors"
            style={{ fontFamily: '"Instrument Serif", var(--font-heading), Georgia, serif', fontWeight: 500 }}
            onClick={() => handleNavigate('/dashboard')}
          >
            Twin Me
          </div>

          {/* Navigation Links */}
          <ul className="hidden lg:flex gap-6 list-none items-center">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);

              return (
                <li key={item.id}>
                  <button
                    onClick={() => handleNavigate(item.path)}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-full
                      font-medium text-sm transition-all duration-300
                      ${active
                        ? 'bg-black text-white shadow-[0_2px_8px_rgba(0,0,0,0.12)]'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/12 transition-all duration-300"
            >
              <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center text-white text-xs font-bold">
                {user?.firstName?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </div>
              <span className="text-sm font-medium text-foreground hidden md:block">
                {user?.firstName || 'User'}
              </span>
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <>
                {/* Backdrop to close menu */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowUserMenu(false)}
                />

                {/* Menu */}
                <div className="absolute right-0 mt-2 w-48 backdrop-blur-xl bg-[rgba(40,37,36,0.95)] border border-white/12 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.40)] z-50 overflow-hidden">
                  <div className="p-3 border-b border-white/12/50">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user?.fullName || user?.email || 'User'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user?.email}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      handleNavigate('/settings');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-muted-foreground hover:bg-white/12/50 hover:text-foreground transition-colors text-left"
                  >
                    <User className="w-4 h-4" />
                    <span className="text-sm font-medium">Settings</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      handleSignOut();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-900/20/50 transition-colors text-left border-t border-white/12/50"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm font-medium">Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
