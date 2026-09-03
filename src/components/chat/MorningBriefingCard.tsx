/**
 * MorningBriefingCard — Dimension.dev-inspired daily briefing
 *
 * Structured card: location/time header, greeting, schedule summary,
 * health/music sections, actionable suggestion. Dark glass aesthetic.
 */

import React, { useEffect, useRef } from 'react';
import { Calendar, Moon, Music, Sparkles, ArrowRight, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';
import { useAnalytics } from '@/contexts/AnalyticsContext';

interface BriefingData {
  greeting: string;
  schedule: string[];
  schedule_summary: string;
  insights: string[];
  patterns: string[];
  rest: string | null;
  music: string | null;
  suggestion: string;
  generatedAt: string;
}

interface MorningBriefingCardProps {
  onAskTwin?: (message: string) => void;
}

function getLocationTime(): { location: string; time: string; label: string } {
  const now = new Date();
  const hour = now.getHours();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const label = hour < 12 ? 'MORNING BRIEFING' : hour < 17 ? 'AFTERNOON BRIEFING' : 'EVENING BRIEFING';

  // Try to get timezone city name
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const city = tz?.split('/').pop()?.replace(/_/g, ' ')?.toUpperCase() || '';

  return { location: city, time: timeStr, label };
}

// Skeleton block — visible structure during load so the user reads
// "briefing is coming, here's its shape" instead of spinner anxiety.
const SkeletonLine: React.FC<{ width: string; height?: number }> = ({ width, height = 12 }) => (
  <div
    className="rounded-md animate-pulse"
    style={{
      width,
      height,
      backgroundColor: 'var(--surface)',
    }}
  />
);

const MorningBriefingCard: React.FC<MorningBriefingCardProps> = ({ onAskTwin }) => {
  // useQuery (audit-2026-05-13): shared cache across all surfaces that render
  // this card. 30-min staleTime — server already caches briefings in
  // proactive_insights, this just keeps the client from refetching on every
  // dashboard navigation. Refetch is still available via the refresh button.
  const { data: briefing, isLoading, isError, error, refetch } = useQuery<BriefingData | null>({
    queryKey: ['morning-briefing'],
    queryFn: async () => {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
      try {
        const res = await authFetch('/morning-briefing/generate', { signal: controller.signal });
        if (!res.ok) throw new Error(`Briefing request failed (${res.status})`);
        const json = await res.json();
        if (json.success && json.briefing) return json.briefing as BriefingData;
        throw new Error('No briefing in response');
      } catch (err) {
        // Distinguish our own 15s timeout from a genuine backend/network error
        // so the error card can show an accurate, actionable message.
        if (timedOut || (err instanceof Error && err.name === 'AbortError')) {
          throw new Error('TIMEOUT');
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });

  const { location, time, label } = getLocationTime();

  // Instrumentation (M1): the brief was actually SEEN (data loaded, not just
  // mounted). Fire once per mount — the AM heartbeat signal for the daily loop.
  const { trackFunnel } = useAnalytics();
  const briefingFiredRef = useRef(false);
  useEffect(() => {
    if (briefing && !briefingFiredRef.current) {
      briefingFiredRef.current = true;
      trackFunnel('briefing_opened', { part_of_day: label });
    }
  }, [briefing, label, trackFunnel]);

  // Loading state — render full structural skeleton (header, greeting,
  // schedule, recovery, music, suggestion) so the user sees the briefing's
  // shape immediately, not just a spinner.
  if (isLoading) {
    return (
      <div
        className="rounded-[24px] overflow-hidden relative"
        style={{
          backgroundColor: 'var(--surface)',
          backgroundImage:
            'radial-gradient(ellipse 80% 60% at 0% 0%, rgba(210,145,55,0.10) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(93,92,174,0.08) 0%, transparent 60%)',
          border: '1px solid var(--glass-surface-border)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
        }}
      >
        <div className="px-7 pt-6 pb-3 flex items-center justify-between">
          <span
            className="text-[11px] tracking-[0.12em] uppercase"
            style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            {location}{location ? ' — ' : ''}{time}{' — '}{label}
          </span>
        </div>
        <div className="px-7">
          <div className="flex items-center gap-2">
            <div className="flex-1" style={{ borderTop: '1px solid var(--border-glass)' }} />
            <div className="flex gap-1">
              <div className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--surface-solid)' }} />
              <div className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--surface-solid)' }} />
              <div className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--surface-solid)' }} />
            </div>
            <div className="flex-1" style={{ borderTop: '1px solid var(--border-glass)' }} />
          </div>
        </div>
        <div className="px-7 pt-5 pb-2">
          <SkeletonLine width="55%" height={32} />
          <div className="mt-3">
            <SkeletonLine width="90%" />
          </div>
        </div>
        <div className="px-7 pb-7 pt-4 space-y-5" aria-busy="true" aria-label="Loading your briefing">
          {[Calendar, Moon, Music, Sparkles].map((Icon, i) => (
            <div key={i} className="flex items-start gap-3">
              <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <div className="flex-1 space-y-2">
                <SkeletonLine width="22%" height={10} />
                <SkeletonLine width={i === 3 ? '75%' : '60%'} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const fetchBriefing = () => { void refetch(); };

  // Tailor the copy: a timeout is a "try again in a moment" situation, a hard
  // error is a "something went wrong" one (audit-2026-07-03 error-ux).
  const isTimeout = error instanceof Error && error.message === 'TIMEOUT';
  const errorMessage = isTimeout
    ? 'Your briefing is taking longer than usual.'
    : "Couldn't load your briefing.";

  // Error / empty state — render a degraded card with a retry instead of
  // silently evaporating the dashboard's dominant hero (audit-2026-06-10).
  if (isError || !briefing) {
    return (
      <div
        className="rounded-[24px] overflow-hidden relative"
        style={{
          backgroundColor: 'var(--surface)',
          backgroundImage:
            'radial-gradient(ellipse 80% 60% at 0% 0%, rgba(210,145,55,0.10) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(93,92,174,0.08) 0%, transparent 60%)',
          border: '1px solid var(--glass-surface-border)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
        }}
      >
        <div className="px-7 py-8 flex flex-col items-start gap-3">
          <span
            className="text-[11px] tracking-[0.12em] uppercase"
            style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            {location}{location ? ' — ' : ''}{time}{' — '}{label}
          </span>
          <p
            className="text-[16px] leading-relaxed"
            style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            {errorMessage}
          </p>
          <button
            onClick={fetchBriefing}
            className="flex items-center gap-1.5 text-[12px] font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            <RefreshCw className="w-3 h-3" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  const hasSchedule = briefing.schedule_summary && !briefing.schedule_summary.includes('wide open') && !briefing.schedule_summary.includes('No schedule');
  const hasRest = !!briefing.rest;
  const hasMusic = !!briefing.music;
  const hasInsights = (briefing.patterns?.length ?? 0) > 0 || (briefing.insights?.length ?? 0) > 0;

  return (
    <div
      className="rounded-[24px] overflow-hidden relative"
      style={{
        backgroundColor: 'var(--surface)',
        backgroundImage:
          'radial-gradient(ellipse 80% 60% at 0% 0%, rgba(210,145,55,0.10) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(93,92,174,0.08) 0%, transparent 60%)',
        border: '1px solid var(--glass-surface-border)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      {/* Header — location + time */}
      <div className="px-7 pt-6 pb-3 flex items-center justify-between">
        <span
          className="text-[11px] tracking-[0.12em] uppercase"
          style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
        >
          {location}{location ? ' \u2014 ' : ''}{time}{' \u2014 '}{label}
        </span>
        <button
          onClick={fetchBriefing}
          className="p-1 rounded-md transition-opacity hover:opacity-60"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Refresh briefing"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Divider with dots */}
      <div className="px-7">
        <div className="flex items-center gap-2">
          <div className="flex-1" style={{ borderTop: '1px solid var(--border-glass)' }} />
          <div className="flex gap-1">
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--surface-solid)' }} />
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--surface-solid)' }} />
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--surface-solid)' }} />
          </div>
          <div className="flex-1" style={{ borderTop: '1px solid var(--border-glass)' }} />
        </div>
      </div>

      {/* Greeting */}
      <div className="px-7 pt-5 pb-2">
        <h2
          className="text-[32px] sm:text-[36px] mb-2.5 leading-[1.1]"
          style={{
            fontFamily: "var(--font-heading)",
            fontStyle: 'italic',
            fontWeight: 400,
            color: 'var(--foreground)',
            letterSpacing: '-0.03em',
          }}
        >
          {briefing.greeting}.
        </h2>
        <p
          className="text-[16px] sm:text-[17px] leading-relaxed"
          style={{ color: 'var(--foreground)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
        >
          {briefing.schedule_summary}
        </p>
      </div>

      {/* Sections */}
      <div className="px-7 pb-7 pt-4 space-y-4">
        {/* Schedule */}
        {hasSchedule && briefing.schedule.length > 0 && (
          <div className="flex items-start gap-3">
            <Calendar className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] tracking-[0.06em] uppercase block mb-1" style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                Schedule
              </span>
              <div className="space-y-1">
                {(briefing.schedule ?? []).slice(0, 3).map((event, i) => (
                  <p key={i} className="text-[15px] truncate" style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                    {event}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Rest / Recovery */}
        {hasRest && (
          <div className="flex items-start gap-3">
            <Moon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] tracking-[0.06em] uppercase block mb-1" style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                Recovery
              </span>
              <p className="text-[15px]" style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                {briefing.rest}
              </p>
            </div>
          </div>
        )}

        {/* Music */}
        {hasMusic && (
          <div className="flex items-start gap-3">
            <Music className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] tracking-[0.06em] uppercase block mb-1" style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                Listening
              </span>
              <p className="text-[15px]" style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                {briefing.music}
              </p>
            </div>
          </div>
        )}

        {/* Insights / Patterns */}
        {hasInsights && (
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] tracking-[0.06em] uppercase block mb-1" style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                Patterns
              </span>
              <div className="space-y-1">
                {((briefing.patterns?.length ?? 0) > 0 ? briefing.patterns : briefing.insights ?? []).slice(0, 2).map((item, i) => (
                  <p key={i} className="text-[15px]" style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Suggestion / CTA */}
        {briefing.suggestion && (
          <div
            className="mt-3 pt-3"
            style={{ borderTop: '1px solid var(--border-glass)' }}
          >
            <p
              className="text-[15px] leading-relaxed"
              style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif", fontStyle: 'italic' }}
            >
              {briefing.suggestion}
            </p>
          </div>
        )}

        {/* Action button */}
        {onAskTwin && (
          <button
            onClick={() => onAskTwin('Tell me more about my day')}
            className="flex items-center gap-1.5 text-[12px] font-medium mt-2 transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-secondary)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
          >
            Dive deeper with your twin
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};

export default MorningBriefingCard;
