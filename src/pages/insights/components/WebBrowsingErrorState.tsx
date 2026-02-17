import React from 'react';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { Globe, ArrowLeft, Search, BarChart3, BookOpen, Clock, Layout, Sparkles } from 'lucide-react';

interface WebBrowsingErrorStateProps {
  colors: {
    text: string;
    textSecondary: string;
    webAccent: string;
    webBg: string;
  };
  theme: string;
  navigate: (path: string) => void;
}

export const WebBrowsingErrorState: React.FC<WebBrowsingErrorStateProps> = ({
  colors,
  theme,
  navigate,
}) => {
  return (
    <PageLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-lg glass-button">
            <ArrowLeft className="w-5 h-5" style={{ color: colors.text }} />
          </button>
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: colors.webBg }}
          >
            <Globe className="w-6 h-6" style={{ color: colors.webAccent }} />
          </div>
          <div>
            <h1
              className="text-2xl"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: colors.text }}
            >
              Your Digital Life
            </h1>
            <p className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
              What your browsing reveals about you
            </p>
          </div>
        </div>
      </div>

      {/* Extension Install Banner */}
      <GlassPanel
        className="!p-4 mb-6 cursor-pointer transition-opacity hover:opacity-80"
        style={{ borderLeft: `3px solid ${colors.webAccent}` }}
        onClick={() => navigate('/get-started')}
      >
        <div className="flex items-center gap-3">
          <Layout className="w-5 h-5 flex-shrink-0" style={{ color: colors.webAccent }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: colors.text }}>
              Install the browser extension to unlock your digital life
            </p>
            <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
              Capture browsing patterns, reading habits, search queries, and content preferences to discover what your digital footprint reveals about you.
            </p>
          </div>
          <ArrowLeft className="w-4 h-4 rotate-180 flex-shrink-0" style={{ color: colors.textSecondary }} />
        </div>
      </GlassPanel>

      {/* Preview sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <GlassPanel className="!p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4" style={{ color: colors.textSecondary }} />
            <span className="text-sm uppercase tracking-wider" style={{ color: colors.textSecondary }}>Interest Categories</span>
          </div>
          <p className="text-xs" style={{ color: colors.textSecondary, opacity: 0.6 }}>
            See what topics dominate your browsing - from technology to entertainment, health to news.
          </p>
        </GlassPanel>
        <GlassPanel className="!p-5">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4" style={{ color: colors.textSecondary }} />
            <span className="text-sm uppercase tracking-wider" style={{ color: colors.textSecondary }}>Search Patterns</span>
          </div>
          <p className="text-xs" style={{ color: colors.textSecondary, opacity: 0.6 }}>
            Discover what questions drive your curiosity and how your interests evolve over time.
          </p>
        </GlassPanel>
        <GlassPanel className="!p-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4" style={{ color: colors.textSecondary }} />
            <span className="text-sm uppercase tracking-wider" style={{ color: colors.textSecondary }}>Reading Profile</span>
          </div>
          <p className="text-xs" style={{ color: colors.textSecondary, opacity: 0.6 }}>
            Your reading depth, engagement patterns, and the type of content that captures your attention.
          </p>
        </GlassPanel>
        <GlassPanel className="!p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4" style={{ color: colors.textSecondary }} />
            <span className="text-sm uppercase tracking-wider" style={{ color: colors.textSecondary }}>Digital Rhythms</span>
          </div>
          <p className="text-xs" style={{ color: colors.textSecondary, opacity: 0.6 }}>
            When you browse, what pulls you in at different times of day, and your online activity patterns.
          </p>
        </GlassPanel>
      </div>

      {/* Twin observation placeholder */}
      <GlassPanel className="!p-5 text-center">
        <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: colors.textSecondary, opacity: 0.4 }} />
        <p className="text-sm" style={{ color: colors.textSecondary }}>
          Once your browsing data flows in, your twin will discover patterns and share observations about your digital life.
        </p>
      </GlassPanel>
    </PageLayout>
  );
};
