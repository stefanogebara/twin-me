import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, LogOut, Settings, ChevronDown } from 'lucide-react';

const UserProfile = () => {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  if (!user) return null;

  // Extract first letter for avatar fallback
  const avatarLetter = user.firstName?.charAt(0)?.toUpperCase() ||
                      user.email?.charAt(0)?.toUpperCase() ||
                      'U';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* User Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:shadow-md"
        style={{
          backgroundColor: 'var(--_color-theme---surface)',
          borderColor: 'var(--_color-theme---border)',
          color: 'var(--_color-theme---text)'
        }}
      >
        {/* User Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
          style={{
            backgroundColor: 'var(--_color-theme---accent)',
            color: 'white'
          }}
        >
          {user.profileImageUrl ? (
            <img
              src={user.profileImageUrl}
              alt={user.fullName || user.email}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            avatarLetter
          )}
        </div>

        {/* User Name */}
        <span className="text-sm font-medium max-w-32 truncate">
          {user.firstName || user.email?.split('@')[0] || 'User'}
        </span>

        {/* Dropdown Arrow */}
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--_color-theme---text-secondary)' }}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-56 rounded-xl border shadow-lg z-50 py-2"
          style={{
            backgroundColor: 'var(--_color-theme---surface)',
            borderColor: 'var(--_color-theme---border)'
          }}
        >
          {/* User Info Header */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--_color-theme---border)' }}>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--_color-theme---accent)',
                  color: 'white'
                }}
              >
                {user.profileImageUrl ? (
                  <img
                    src={user.profileImageUrl}
                    alt={user.fullName || user.email}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-lg font-semibold">{avatarLetter}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold truncate"
                  style={{ color: 'var(--_color-theme---text)' }}
                >
                  {user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User'}
                </p>
                <p
                  className="text-xs truncate"
                  style={{ color: 'var(--_color-theme---text-secondary)' }}
                >
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                window.location.href = '/settings';
              }}
              className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-opacity-50 transition-colors"
              style={{
                color: 'var(--_color-theme---text)',
                backgroundColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--_color-theme---surface-raised)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm">Settings</span>
            </button>

            <button
              onClick={handleSignOut}
              className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-opacity-50 transition-colors"
              style={{
                color: 'var(--_color-theme---text)',
                backgroundColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--_color-theme---surface-raised)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;