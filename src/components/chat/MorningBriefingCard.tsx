/**
 * MorningBriefingCard — Dimension.dev-inspired daily briefing
 *
 * Structured card: location/time header, greeting, schedule summary,
 * health/music sections, actionable suggestion. Dark glass aesthetic.
 */

import React, { useState, useEffect } from 'react';
import { Calendar, Moon, Music, Sparkles, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

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

const MorningBriefingCard: React.FC<MorningBriefingCardProps> = ({ onAskTwin }) => {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchBriefing = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await authFetch('/morning-briefing/generate');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      if (json.success && json.briefing) {
        setBriefing(json.briefing);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBriefing(); }, []);

  const { location, time, label } = getLocationTime();

  if (loading) {
    return (
      <div
        className="rounded-[20px] px-6 py-8 flex items-center justify-center"
        style={{
          backgroundColor: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          minHeight: 200,
        }}
      >
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <span className="text-[15px]" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
            Preparing your briefing...
          </span>
        </div>
      </div>
    );
  }

  if (error || !briefing) {
    return null;
  }

  const hasSchedule = briefing.schedule_summary && !briefing.schedule_summary.includes('wide open') && !briefing.schedule_summary.includes('No schedule');
  const hasRest = !!briefing.rest;
  const hasMusic = !!briefing.music;
  const hasInsights = (briefing.patterns?.length ?? 0) > 0 || (briefing.insights?.length ?? 0) > 0;

  return (
    <div
      className="rounded-[24px] overflow-hidden relative"
      style={{
        backgroundColor: 'rgba(255,255,255,0.06)',
        backgroundImage:
          'radial-gradient(ellipse 80% 60% at 0% 0%, rgba(210,145,55,0.10) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(93,92,174,0.08) 0%, transparent 60%)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      {/* Header — location + time */}
      <div className="px-7 pt-6 pb-3 flex items-center justify-between">
        <span
          className="text-[11px] tracking-[0.12em] uppercase"
          style={{ color: 'rgba(255,255,255,0.30)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
        >
          {location}{location ? ' \u2014 ' : ''}{time}{' \u2014 '}{label}
        </span>
        <button
          onClick={fetchBriefing}
          className="p-1 rounded-md transition-opacity hover:opacity-60"
          style={{ color: 'rgba(255,255,255,0.20)' }}
          aria-label="Refresh briefing"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Divider with dots */}
      <div className="px-7">
        <div className="flex items-center gap-2">
          <div className="flex-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
          <div className="flex gap-1">
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
          </div>
          <div className="flex-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
        </div>
      </div>

      {/* Greeting */}
      <div className="px-7 pt-5 pb-2">
        <h2
          className="text-[32px] sm:text-[36px] mb-2.5 leading-[1.1]"
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 400,
            color: '#F5F5F4',
            letterSpacing: '-0.03em',
          }}
        >
          {briefing.greeting}.
        </h2>
        <p
          className="text-[16px] sm:text-[17px] leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.70)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
        >
          {briefing.schedule_summary}
        </p>
      </div>

      {/* Sections */}
      <div className="px-7 pb-7 pt-4 space-y-4">
        {/* Schedule */}
        {hasSchedule && briefing.schedule.length > 0 && (
          <div className="flex items-start gap-3">
            <Calendar className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.30)' }} />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] tracking-[0.06em] uppercase block mb-1" style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                Schedule
              </span>
              <div className="space-y-1">
                {(briefing.schedule ?? []).slice(0, 3).map((event, i) => (
                  <p key={i} className="text-[15px] truncate" style={{ color: 'rgba(255,255,255,0.55)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
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
            <Moon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.30)' }} />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] tracking-[0.06em] uppercase block mb-1" style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                Recovery
              </span>
              <p className="text-[15px]" style={{ color: 'rgba(255,255,255,0.55)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                {briefing.rest}
              </p>
            </div>
          </div>
        )}

        {/* Music */}
        {hasMusic && (
          <div className="flex items-start gap-3">
            <Music className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.30)' }} />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] tracking-[0.06em] uppercase block mb-1" style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                Listening
              </span>
              <p className="text-[15px]" style={{ color: 'rgba(255,255,255,0.55)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                {briefing.music}
              </p>
            </div>
          </div>
        )}

        {/* Insights / Patterns */}
        {hasInsights && (
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.30)' }} />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] tracking-[0.06em] uppercase block mb-1" style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
                Patterns
              </span>
              <div className="space-y-1">
                {((briefing.patterns?.length ?? 0) > 0 ? briefing.patterns : briefing.insights ?? []).slice(0, 2).map((item, i) => (
                  <p key={i} className="text-[15px]" style={{ color: 'rgba(255,255,255,0.55)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>
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
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p
              className="text-[15px] leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.50)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif", fontStyle: 'italic' }}
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
            style={{ color: 'rgba(255,255,255,0.40)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
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
