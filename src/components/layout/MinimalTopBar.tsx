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
    <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-stone-200/60">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Left: Menu + Logo */}
        <div className="flex items-center gap-4">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="p-2 hover:bg-stone-100 rounded-lg transition-colors lg:hidden"
            >
              <Menu className="w-5 h-5 text-stone-600" />
            </button>
          )}

          <button
            onClick={() => navigate('/dashboard')}
            className="text-2xl font-bold text-stone-900 hover:text-stone-700 transition-colors"
            style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500 }}
          >
            Twin Me
          </button>
        </div>

        {/* Right: User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 px-4 py-2 rounded-full hover:bg-stone-100 transition-colors"
          >
            <div className="w-8 h-8 bg-stone-900 rounded-full flex items-center justify-center text-white text-sm font-bold">
              {user?.firstName?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
            <span className="text-sm font-medium text-stone-900 hidden md:block">
              {user?.firstName || 'User'}
            </span>
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowUserMenu(false)}
              />

              <div className="absolute right-0 mt-2 w-56 bg-white border border-stone-200 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="p-4 border-b border-stone-200">
                  <p className="text-sm font-medium text-stone-900 truncate">
                    {user?.fullName || user?.email || 'User'}
                  </p>
                  <p className="text-xs text-stone-600 truncate">
                    {user?.email}
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate('/settings');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-stone-700 hover:bg-stone-50 transition-colors text-left"
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-sm">Settings</span>
                </button>

                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    handleSignOut();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors text-left border-t border-stone-200"
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
