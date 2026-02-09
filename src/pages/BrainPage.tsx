/**
 * Brain Page
 *
 * The main page for exploring the Twin's Brain knowledge graph.
 * Uses the platform's PageLayout for consistent styling.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import BrainExplorer from '@/components/BrainExplorer';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { Brain, Sparkles } from 'lucide-react';

const BrainPage: React.FC = () => {
  const { isSignedIn, isLoaded } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();

  // Theme-aware colors
  const textColor = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
  const textSecondary = theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e';
  const textMuted = theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c';
  const subtleBg = theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)';

  // Wait for auth to load
  if (!isLoaded) {
    return (
      <PageLayout maxWidth="xl">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full animate-pulse" style={{
              background: 'linear-gradient(135deg, rgba(193, 192, 182, 0.2) 0%, rgba(193, 192, 182, 0.1) 100%)'
            }} />
            <Brain className="w-8 h-8 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" style={{ color: textSecondary }} />
          </div>
          <p style={{ color: textSecondary }}>
            Loading...
          </p>
        </div>
      </PageLayout>
    );
  }

  if (!isSignedIn) {
    return (
      <PageLayout maxWidth="md">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <GlassPanel className="text-center max-w-md mx-auto">
            <div className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, rgba(78, 205, 196, 0.2) 0%, rgba(69, 183, 209, 0.2) 100%)'
            }}>
              <Brain className="w-10 h-10" style={{ color: '#4ECDC4' }} />
            </div>
            <h1
              className="text-2xl mb-3"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 400,
                color: textColor
              }}
            >
              Explore Your Brain
            </h1>
            <p className="mb-6" style={{ color: textSecondary }}>
              Sign in to discover your knowledge graph - a living map of your interests, patterns, and connections.
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="flex items-center gap-2 px-6 py-3 rounded-xl mx-auto transition-all hover:scale-[1.02]"
              style={{
                backgroundColor: '#4ECDC4',
                color: '#232320'
              }}
            >
              <Sparkles className="w-4 h-4" />
              Sign In to Explore
            </button>
          </GlassPanel>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout maxWidth="xl">
      {/* Brain Explorer */}
      <BrainExplorer />
    </PageLayout>
  );
};

export default BrainPage;
