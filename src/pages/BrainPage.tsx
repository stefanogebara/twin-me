/**
 * Twin's Brain Page
 *
 * Two sections:
 * 1. Discoveries - Patterns the twin has noticed about you
 * 2. Your Data   - What platforms shape your twin + connection status
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { Clay3DIcon } from '@/components/Clay3DIcon';
import { authFetch } from '@/services/api/apiBase';
import {
  Sparkles,
  Link2,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Insight {
  id?: string;
  title?: string;
  content: string;
  category?: string;
  confidence?: string;
  createdAt?: string;
}

const PLATFORM_META: Record<string, { label: string; icon: string; description: string }> = {
  spotify: {
    label: 'Spotify',
    icon: '🎵',
    description: 'Music taste, listening patterns, mood'
  },
  google_calendar: {
    label: 'Google Calendar',
    icon: '📅',
    description: 'Schedule, events, time patterns'
  },
  youtube: {
    label: 'YouTube',
    icon: '▶️',
    description: 'Content preferences, interests'
  },
  discord: {
    label: 'Discord',
    icon: '💬',
    description: 'Community activity, communication style'
  },
  linkedin: {
    label: 'LinkedIn',
    icon: '💼',
    description: 'Career trajectory, professional skills'
  },
};

const ORDERED_PLATFORMS = ['spotify', 'google_calendar', 'youtube', 'discord', 'linkedin'];

// Demo insights shown when in demo mode
const DEMO_INSIGHTS: Insight[] = [
  {
    content: "Your music shifts dramatically between focused work hours and evenings — you seem to use sound as a deliberate tool for managing mental state.",
    category: "lifestyle"
  },
  {
    content: "You gravitate toward the same 3-4 artists repeatedly during high-stress weeks, suggesting music is a comfort mechanism for you.",
    category: "personality"
  },
  {
    content: "Your calendar shows a strong preference for morning work blocks — you protect these fiercely and rarely schedule calls before noon.",
    category: "behavior"
  },
  {
    content: "There's a recurring curiosity around creative and technical topics that suggests an unusual blend of left-brain and right-brain engagement.",
    category: "personality"
  },
];

const BrainPage: React.FC = () => {
  const { user, isSignedIn, isLoaded } = useAuth();
  const { isDemoMode } = useDemo();
  const navigate = useNavigate();

  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const { data: platformStatus, isLoading: platformLoading } = usePlatformStatus(
    isSignedIn ? user?.id : undefined
  );

  // Fetch insights for authenticated non-demo users
  useEffect(() => {
    if (!isSignedIn || isDemoMode || !user?.id) return;

    const fetchInsights = async () => {
      setInsightsLoading(true);
      setInsightsError(null);
      try {
        const res = await authFetch('/twin/insights');
        if (!res.ok) throw new Error('Failed to fetch insights');
        const json = await res.json();
        if (json.success && Array.isArray(json.insights)) {
          setInsights(json.insights);
        } else {
          setInsights([]);
        }
      } catch (err) {
        setInsightsError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setInsightsLoading(false);
      }
    };

    fetchInsights();
  }, [isSignedIn, isDemoMode, user?.id]);

  const textColor = '#000000';
  const textSecondary = '#8A857D';

  if (!isLoaded) {
    return (
      <PageLayout maxWidth="xl">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin opacity-40" />
        </div>
      </PageLayout>
    );
  }

  if (!isSignedIn) {
    return (
      <PageLayout maxWidth="md">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <GlassPanel className="text-center max-w-md mx-auto">
            <div className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(78, 205, 196, 0.2) 0%, rgba(69, 183, 209, 0.2) 100%)' }}
            >
              <Clay3DIcon name="brain" size={40} />
            </div>
            <h1 className="heading-serif text-2xl mb-3">Your Twin's Brain</h1>
            <p className="mb-6" style={{ color: textSecondary }}>
              Sign in to see what patterns your twin has discovered about you.
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="btn-cta-app flex items-center gap-2 mx-auto"
            >
              <Sparkles className="w-4 h-4" />
              Sign In to Explore
            </button>
          </GlassPanel>
        </div>
      </PageLayout>
    );
  }

  const displayInsights = isDemoMode ? DEMO_INSIGHTS : insights;

  return (
    <PageLayout maxWidth="xl">
      {/* Header */}
      <div className="mb-8">
        <motion.div
          className="flex items-center gap-3 mb-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Clay3DIcon name="brain" size={32} />
          <h1 className="heading-serif text-3xl" style={{ color: textColor }}>
            Twin's Brain
          </h1>
        </motion.div>
        <motion.p
          className="text-sm ml-[44px]"
          style={{ color: textSecondary }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          Patterns your twin has noticed, and the data that shapes it.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Discoveries — 2/3 width */}
        <div className="lg:col-span-2">
          <GlassPanel>
            <div className="flex items-center gap-2 mb-5">
              <Sparkles className="w-4 h-4" style={{ color: '#10b981' }} />
              <h2 className="heading-serif text-lg" style={{ color: textColor }}>
                Discoveries
              </h2>
            </div>

            {insightsLoading && (
              <div className="flex items-center justify-center py-12 gap-3" style={{ color: textSecondary }}>
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Twin is thinking…</span>
              </div>
            )}

            {insightsError && !insightsLoading && (
              <div className="flex items-center gap-3 py-8 px-4 rounded-xl"
                style={{ background: 'rgba(239, 68, 68, 0.06)' }}
              >
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-600">Couldn't load insights</p>
                  <p className="text-xs mt-0.5" style={{ color: textSecondary }}>{insightsError}</p>
                </div>
              </div>
            )}

            {!insightsLoading && !insightsError && displayInsights.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm mb-1" style={{ color: textSecondary }}>
                  No discoveries yet.
                </p>
                <p className="text-xs" style={{ color: textSecondary }}>
                  Connect platforms and let your twin observe your patterns for a few days.
                </p>
                <button
                  onClick={() => navigate('/get-started')}
                  className="btn-cta-app flex items-center gap-2 mx-auto mt-4"
                >
                  <Link2 className="w-4 h-4" />
                  Connect Platforms
                </button>
              </div>
            )}

            {!insightsLoading && displayInsights.length > 0 && (
              <div className="space-y-3">
                {displayInsights.map((insight, i) => (
                  <motion.div
                    key={insight.id || i}
                    className="p-4 rounded-xl"
                    style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)' }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.05 }}
                  >
                    {insight.title && (
                      <p className="text-xs font-semibold uppercase tracking-wide mb-1.5"
                        style={{ color: '#10b981' }}
                      >
                        {insight.title}
                      </p>
                    )}
                    <p className="text-sm leading-relaxed" style={{ color: textColor }}>
                      {insight.content}
                    </p>
                    {insight.category && (
                      <span
                        className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}
                      >
                        {insight.category}
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </GlassPanel>
        </div>

        {/* Your Data — 1/3 width */}
        <div className="lg:col-span-1">
          <GlassPanel>
            <div className="flex items-center gap-2 mb-5">
              <Link2 className="w-4 h-4" style={{ color: textSecondary }} />
              <h2 className="heading-serif text-lg" style={{ color: textColor }}>
                Your Data
              </h2>
            </div>

            <p className="text-xs mb-4" style={{ color: textSecondary }}>
              These platforms shape how your twin understands you.
            </p>

            {platformLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-16 rounded-xl animate-pulse"
                    style={{ background: 'rgba(0,0,0,0.04)' }}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {ORDERED_PLATFORMS.map((provider) => {
                  const meta = PLATFORM_META[provider];
                  const status = platformStatus?.[provider];
                  const isConnected = status?.connected && status?.isActive;
                  const isExpired = status?.tokenExpired;

                  return (
                    <div
                      key={provider}
                      className="flex items-start gap-3 p-3 rounded-xl"
                      style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)' }}
                    >
                      <span className="text-xl mt-0.5">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium" style={{ color: textColor }}>
                            {meta.label}
                          </p>
                          {isConnected && !isExpired ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          ) : isExpired ? (
                            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          ) : (
                            <div className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: 'rgba(0,0,0,0.2)' }}
                            />
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                          {meta.description}
                        </p>
                        {isConnected && status?.lastSync && (
                          <p className="text-xs mt-1 flex items-center gap-1"
                            style={{ color: textSecondary }}
                          >
                            <Clock className="w-3 h-3" />
                            {formatLastSync(status.lastSync)}
                          </p>
                        )}
                        {isExpired && (
                          <p className="text-xs mt-1 text-amber-500">Token expired — reconnect</p>
                        )}
                        {!isConnected && !isExpired && (
                          <p className="text-xs mt-1" style={{ color: textSecondary }}>Not connected</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => navigate('/get-started')}
              className={cn(
                "w-full mt-4 flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-sm font-medium transition-all",
                "border border-current opacity-70 hover:opacity-100"
              )}
              style={{ color: textColor }}
            >
              <RefreshCw className="w-4 h-4" />
              Manage Connections
            </button>
          </GlassPanel>
        </div>
      </div>
    </PageLayout>
  );
};

function formatLastSync(lastSync: string): string {
  try {
    const date = new Date(lastSync);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Synced recently';
    if (diffHours < 24) return `Synced ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `Synced ${diffDays}d ago`;
  } catch {
    return 'Synced';
  }
}

export default BrainPage;
