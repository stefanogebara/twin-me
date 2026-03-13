import React from 'react';
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
    <div className="max-w-[680px] mx-auto px-6 py-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          >
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
              style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500, color: colors.text }}
            >
              Your Digital Life
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              What your browsing reveals about you
            </p>
          </div>
        </div>
      </div>

      {/* Extension Install Banner */}
      <div
        className="p-4 rounded-lg mb-6 cursor-pointer transition-opacity hover:opacity-80"
        style={{
          border: '1px solid rgba(255,255,255,0.06)',
          backgroundColor: 'rgba(255,255,255,0.02)',
          borderLeft: `3px solid ${colors.webAccent}`,
        }}
        onClick={() => navigate('/get-started')}
      >
        <div className="flex items-center gap-3">
          <Layout className="w-5 h-5 flex-shrink-0" style={{ color: colors.webAccent }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: colors.text }}>
              Install the browser extension to unlock your digital life
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Capture browsing patterns, reading habits, search queries, and content preferences to discover what your digital footprint reveals about you.
            </p>
          </div>
          <ArrowLeft className="w-4 h-4 rotate-180 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />
        </div>
      </div>

      {/* Preview sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div
          className="p-5 rounded-lg"
          style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
            <span className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Interest Categories</span>
          </div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            See what topics dominate your browsing - from technology to entertainment, health to news.
          </p>
        </div>
        <div
          className="p-5 rounded-lg"
          style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
            <span className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Search Patterns</span>
          </div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Discover what questions drive your curiosity and how your interests evolve over time.
          </p>
        </div>
        <div
          className="p-5 rounded-lg"
          style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
            <span className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Reading Profile</span>
          </div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Your reading depth, engagement patterns, and the type of content that captures your attention.
          </p>
        </div>
        <div
          className="p-5 rounded-lg"
          style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
            <span className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Digital Rhythms</span>
          </div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            When you browse, what pulls you in at different times of day, and your online activity patterns.
          </p>
        </div>
      </div>

      {/* Twin observation placeholder */}
      <div
        className="p-5 rounded-lg text-center"
        style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
      >
        <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.3)', opacity: 0.4 }} />
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Once your browsing data flows in, your twin will discover patterns and share observations about your digital life.
        </p>
      </div>
    </div>
  );
};
