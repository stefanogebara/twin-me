/**
 * Brain Page
 *
 * The main page for exploring the Twin's Brain knowledge graph.
 * Uses the platform's PageLayout for consistent styling.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import BrainExplorer from '@/components/BrainExplorer';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDemo } from '@/contexts/DemoContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { Sparkles, Zap, GitBranch, Layers } from 'lucide-react';
import { Clay3DIcon } from '@/components/Clay3DIcon';

const BrainPage: React.FC = () => {
  const { isSignedIn, isLoaded } = useAuth();
  const { theme } = useTheme();
  const { isDemoMode } = useDemo();
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
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse">
              <Clay3DIcon name="brain" size={32} />
            </div>
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
              <Clay3DIcon name="brain" size={40} />
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

  if (isDemoMode) {
    const demoNodes = [
      { label: 'Music Taste', icon: '🎵', category: 'personality' },
      { label: 'Work Patterns', icon: '💼', category: 'behavior' },
      { label: 'Sleep Cycles', icon: '🌙', category: 'health' },
      { label: 'Curiosity', icon: '🔍', category: 'personality' },
      { label: 'Social Energy', icon: '💬', category: 'behavior' },
      { label: 'Creativity', icon: '🎨', category: 'personality' },
    ];

    return (
      <PageLayout maxWidth="xl">
        <div className="text-center mb-8">
          <motion.div
            className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(78, 205, 196, 0.2) 0%, rgba(69, 183, 209, 0.2) 100%)'
            }}
            initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          >
            <Clay3DIcon name="brain" size={40} />
          </motion.div>
          <motion.h1
            className="text-3xl mb-3"
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: textColor }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            Your Twin's Brain
          </motion.h1>
          <motion.p
            className="max-w-lg mx-auto"
            style={{ color: textSecondary }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            A living 3D knowledge graph that maps everything unique about you - your interests, patterns, personality traits, and connections between them.
          </motion.p>
        </div>

        <GlassPanel className="!p-8 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <img src="/images/backgrounds/flower-hero.png" alt="" className="w-5 h-5 object-contain drop-shadow-sm" />
            <h3 className="text-lg" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: textColor }}>
              Knowledge Graph Preview
            </h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {demoNodes.map((node, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-4 rounded-xl transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: subtleBg,
                  border: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`
                }}
              >
                <span className="text-2xl">{node.icon}</span>
                <div>
                  <p className="text-sm font-medium" style={{ color: textColor }}>{node.label}</p>
                  <p className="text-xs" style={{ color: textMuted }}>{node.category}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6" style={{ color: textMuted }}>
            <div className="flex items-center gap-2 text-sm">
              <Layers className="w-4 h-4" />
              <span>42 nodes</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <GitBranch className="w-4 h-4" />
              <span>67 connections</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4" />
              <span>6 clusters</span>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="text-center !p-6">
          <p className="text-sm mb-4" style={{ color: textSecondary }}>
            Connect your real platforms to build a personalized 3D knowledge graph with interactive exploration.
          </p>
          <button
            onClick={() => navigate('/get-started')}
            className="flex items-center gap-2 px-6 py-3 rounded-xl mx-auto transition-all hover:scale-[1.02]"
            style={{ backgroundColor: '#4ECDC4', color: '#232320' }}
          >
            <Sparkles className="w-4 h-4" />
            Connect Platforms to Explore
          </button>
        </GlassPanel>
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
