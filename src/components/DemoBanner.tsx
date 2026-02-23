import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemo } from '../contexts/DemoContext';
import { useAuth } from '../contexts/AuthContext';
import { X, Sparkles, ArrowRight, LogOut } from 'lucide-react';

interface DemoBannerProps {
  variant?: 'top' | 'inline';
  message?: string;
  showSignUp?: boolean;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({
  variant = 'top',
  message,
  showSignUp = true,
}) => {
  const navigate = useNavigate();
  const { isDemoMode, exitDemoMode } = useDemo();
  const { isDemoMode: authDemoMode, signOut } = useAuth();

  // Don't render if not in demo mode
  if (!isDemoMode && !authDemoMode) {
    return null;
  }

  const handleSignUp = () => {
    exitDemoMode();
    navigate('/auth?mode=signup');
  };

  const handleExitDemo = async () => {
    exitDemoMode();
    await signOut(); // Clear auth state so isSignedIn becomes false
    navigate('/');
  };

  const handleDismiss = () => {
    // Just hide the banner, don't exit demo mode
    const banner = document.getElementById('demo-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  };

  if (variant === 'top') {
    return (
      <div
        id="demo-banner"
        className="sticky top-0 left-0 right-0 z-[60] bg-gradient-to-r from-[hsl(var(--claude-accent))] to-[hsl(var(--claude-accent-hover))] text-white shadow-lg"
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {message || "Demo Mode — sample data only"}
              </p>
              <p className="text-xs opacity-80 hidden sm:block">
                Connect your platforms to see your actual data
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {showSignUp && (
              <button
                onClick={handleSignUp}
                aria-label="Sign up for an account to save your data"
                className="hidden sm:flex items-center gap-2 px-4 py-1.5 bg-white text-[hsl(var(--claude-accent))] rounded-lg text-sm font-medium hover:bg-stone-100 transition-all shadow-md"
              >
                Sign up to save your data
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            <button
              onClick={handleExitDemo}
              aria-label="Exit demo mode and return to home"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/20 text-white rounded-lg text-sm font-medium hover:bg-white/30 transition-all"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Exit Demo
            </button>
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              aria-label="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Inline variant
  return (
    <div className="bg-gradient-to-r from-stone-50 to-amber-50 border border-orange-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-[hsl(var(--claude-accent))] flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-stone-900 mb-1">
            Demo Mode Active
          </h3>
          <p className="text-sm text-stone-600 mb-3">
            {message || "You're viewing sample data. Sign up to create your own Soul Signature with real platform connections."}
          </p>
          {showSignUp && (
            <button
              onClick={handleSignUp}
              aria-label="Create your real soul signature by signing up"
              className="flex items-center gap-2 px-4 py-2 bg-[hsl(var(--claude-accent))] text-white rounded-lg text-sm font-medium hover:bg-[hsl(var(--claude-accent-hover))] transition-all shadow-sm"
            >
              Create Your Real Soul Signature
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 hover:bg-stone-100 rounded transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4 text-stone-500" />
        </button>
      </div>
    </div>
  );
};

export default DemoBanner;
