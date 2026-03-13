import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { User, LogOut, Settings, Menu } from 'lucide-react';

interface MinimalTopBarProps {
  onMenuClick?: () => void;
}

export const MinimalTopBar: React.FC<MinimalTopBarProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = React.useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 border-b border-white/10/60" style={{ backgroundColor: 'var(--background)' }}>
      <div className="flex items-center justify-between px-6 py-4">
        {/* Left: Menu + Logo */}
        <div className="flex items-center gap-4">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="p-2 hover:bg-white/12 rounded-lg transition-colors lg:hidden"
            >
              <Menu className="w-5 h-5 text-muted-foreground" />
            </button>
          )}

          <button
            onClick={() => navigate('/dashboard')}
            className="text-2xl font-bold text-foreground hover:text-muted-foreground transition-colors"
            style={{ fontFamily: '"Instrument Serif", var(--font-heading), Georgia, serif', fontWeight: 500 }}
          >
            Twin Me
          </button>
        </div>

        {/* Right: User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 px-4 py-2 rounded-full hover:bg-white/12 transition-colors"
          >
            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-sm font-bold">
              {user?.firstName?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
            <span className="text-sm font-medium text-foreground hidden md:block">
              {user?.firstName || 'User'}
            </span>
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowUserMenu(false)}
              />

              <div className="absolute right-0 mt-2 w-56 rounded-lg z-50 overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                <div className="p-4 border-b border-white/10">
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
                    navigate('/settings');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-muted-foreground hover:bg-white/5 transition-colors text-left"
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-sm">Settings</span>
                </button>

                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    handleSignOut();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-900/20 transition-colors text-left border-t border-white/10"
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
  );
};
