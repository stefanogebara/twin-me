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
        className="rounded-[32px] px-5 pr-3 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-300 hover:shadow-[0_12px_48px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)]"
        style={{
          background: 'var(--glass-surface-bg, rgba(244,241,236,0.7))',
          backdropFilter: 'blur(19.65px)',
          WebkitBackdropFilter: 'blur(19.65px)',
          border: '1px solid var(--glass-surface-border, #d9d1cb)',
        }}
      >
        <div className="flex justify-between items-center">
          {/* Brand */}
          <div
            className="text-2xl cursor-pointer hover:opacity-80 transition-opacity tracking-[-0.02em]"
            style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontWeight: 400, color: 'var(--foreground, #1b1818)' }}
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
                      flex items-center gap-2 px-4 py-2.5 rounded-full
                      font-medium text-sm transition-all duration-300
                      ${active
                        ? 'shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                        : 'hover:opacity-80'
                      }
                    `}
                    style={active ? {
                      background: 'var(--accent-vibrant-glow, rgba(255,255,255,0.06))',
                      color: 'var(--accent-vibrant, rgba(255,255,255,0.85))',
                    } : {
                      color: 'var(--text-secondary, #4a4242)',
                    }}
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
              className="flex items-center gap-2 px-4 py-2 rounded-full hover:opacity-80 transition-all duration-300"
              style={{
                background: 'rgba(17,15,15,0.05)',
                border: '1px solid var(--glass-surface-border, #d9d1cb)',
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: 'var(--button-bg-dark, #252222)', color: '#fdfcfb' }}
              >
                {user?.firstName?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </div>
              <span className="text-sm font-medium hidden md:block" style={{ color: 'var(--foreground, #1b1818)' }}>
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
                <div
                  className="absolute right-0 mt-2 w-48 rounded-2xl z-50 overflow-hidden"
                  style={{
                    background: 'var(--glass-surface-bg, rgba(244,241,236,0.7))',
                    backdropFilter: 'blur(42px)',
                    WebkitBackdropFilter: 'blur(42px)',
                    border: '1px solid var(--glass-surface-border, #d9d1cb)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                  }}
                >
                  <div className="p-3" style={{ borderBottom: '1px solid var(--card-separator, rgba(50,47,47,0.05))' }}>
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground, #1b1818)' }}>
                      {user?.fullName || user?.email || 'User'}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted, #86807b)' }}>
                      {user?.email}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      handleNavigate('/settings');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:opacity-80 transition-colors text-left"
                    style={{ color: 'var(--text-secondary, #4a4242)' }}
                  >
                    <User className="w-4 h-4" />
                    <span className="text-sm font-medium">Settings</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      handleSignOut();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50/50 transition-colors text-left"
                    style={{ borderTop: '1px solid var(--card-separator, rgba(50,47,47,0.05))' }}
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
