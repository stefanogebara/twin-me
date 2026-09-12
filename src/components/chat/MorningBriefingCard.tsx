/**
 * MorningBriefingCard — the daily briefing on /today.
 *
 * In the register (2026-09-12) it is no longer a card: the greeting is the
 * page title with the day's summary as its grey line, and the briefing is a
 * section of rows (schedule, recovery, listening, patterns, a suggestion)
 * under the list's ink rule. No gradient, no shadow, no italic.
 */

import React, { useEffect, useRef } from 'react';
import { Calendar, Moon, Music, Sparkles, Lightbulb, MessageCircle, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import { PageHead, Section, List, Row, SubRow } from '@/components/register';

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

  // Try to get timezone city name (as written, not uppercased: it is a grey line now)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const city = tz?.split('/').pop()?.replace(/_/g, ' ') || '';

  return { location: city, time: timeStr, label };
}

// The briefing's lines arrive from the model as sentence fragments, often
// lowercase ("yesterday was for recovery..."); a grey line starts with a capital.
const cap = (s: string | null | undefined): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// The part-of-day label becomes the section's title, in sentence case.
const PART_OF_DAY_TITLE: Record<string, string> = {
  'MORNING BRIEFING': 'This morning',
  'AFTERNOON BRIEFING': 'This afternoon',
  'EVENING BRIEFING': 'This evening',
};

// Skeleton block — visible structure during load so the user reads
// "briefing is coming, here's its shape" instead of spinner anxiety.
const SkeletonLine: React.FC<{ width: string; height?: number }> = ({ width, height = 12 }) => (
  <span
    className="block rounded-[4px] animate-pulse"
    style={{
      width,
      height,
      backgroundColor: 'var(--rg-field)',
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

  // The briefing's heading line: "Madrid, 05:10" under a part-of-day section
  // title. Was a tracked-caps eyebrow (MADRID — 05:10 — MORNING BRIEFING).
  const whereWhen = location ? `${location}, ${time}` : time;
  const sectionTitle = PART_OF_DAY_TITLE[label] ?? 'Your briefing';

  // Loading state — the briefing's shape (title, grey line, four rows) with
  // field-coloured bars, so the user reads "a briefing is coming". A fragment,
  // not a wrapper: the kit spaces sections as adjacent siblings, so a wrapping
  // div would glue the inbox section to this one.
  if (isLoading) {
    return (
      <>
        <PageHead title={<SkeletonLine width="55%" height={32} />} line={<SkeletonLine width="80%" />} />
        <Section title={sectionTitle} line={whereWhen}>
          <ul className="rg-list" aria-busy="true" aria-label="Loading your briefing">
            {[Calendar, Moon, Music, Sparkles].map((Icon, i) => (
              <Row
                key={i}
                icon={<Icon aria-hidden="true" />}
                title={<SkeletonLine width="22%" />}
                line={<span style={{ display: 'block', marginTop: 6 }}><SkeletonLine width={i === 3 ? '75%' : '60%'} /></span>}
              />
            ))}
          </ul>
        </Section>
      </>
    );
  }

  const fetchBriefing = () => { void refetch(); };

  // Tailor the copy: a timeout is a "try again in a moment" situation, a hard
  // error is a "something went wrong" one (audit-2026-07-03 error-ux).
  const isTimeout = error instanceof Error && error.message === 'TIMEOUT';
  const errorMessage = isTimeout
    ? 'Your briefing is taking longer than usual.'
    : "Couldn't load your briefing.";

  const refreshButton = (
    <button type="button" className="rg-iconbtn" onClick={fetchBriefing} aria-label="Refresh briefing">
      <RefreshCw aria-hidden="true" />
    </button>
  );

  // Error / empty state — a title and one row with a retry instead of
  // silently evaporating the page's dominant hero (audit-2026-06-10).
  if (isError || !briefing) {
    return (
      <>
        <PageHead title="Today" line={errorMessage} action={refreshButton} />
        <Section title={sectionTitle} line={whereWhen}>
          <List>
            <Row icon={<RefreshCw aria-hidden="true" />} title="Try again" onClick={fetchBriefing} />
          </List>
        </Section>
      </>
    );
  }

  const hasSchedule = briefing.schedule_summary && !briefing.schedule_summary.includes('wide open') && !briefing.schedule_summary.includes('No schedule');
  const hasRest = !!briefing.rest;
  const hasMusic = !!briefing.music;
  const hasInsights = (briefing.patterns?.length ?? 0) > 0 || (briefing.insights?.length ?? 0) > 0;
  const patternItems = ((briefing.patterns?.length ?? 0) > 0 ? briefing.patterns : briefing.insights ?? []).slice(0, 2);

  return (
    <>
      {/* The greeting is the page title: upright Cosmos, never italic. */}
      <PageHead title={`${briefing.greeting}.`} line={cap(briefing.schedule_summary)} action={refreshButton} />

      <Section title={sectionTitle} line={whereWhen}>
        <List>
          {hasSchedule && briefing.schedule.length > 0 && (
            <Row
              icon={<Calendar aria-hidden="true" />}
              title="Schedule"
              line={(briefing.schedule ?? []).slice(0, 3).join(' · ')}
              clip
            />
          )}
          {hasRest && <Row icon={<Moon aria-hidden="true" />} title="Recovery" line={cap(briefing.rest)} />}
          {hasMusic && <Row icon={<Music aria-hidden="true" />} title="Listening" line={cap(briefing.music)} />}
          {hasInsights && (
            <Row icon={<Sparkles aria-hidden="true" />} title="Patterns" line={cap(patternItems[0])} />
          )}
          {hasInsights && patternItems[1] && (
            <SubRow><span className="rg-row-line">{cap(patternItems[1])}</span></SubRow>
          )}
          {briefing.suggestion && (
            <Row icon={<Lightbulb aria-hidden="true" />} title="Something to try" line={cap(briefing.suggestion)} />
          )}
          {onAskTwin && (
            <Row
              icon={<MessageCircle aria-hidden="true" />}
              title="Dive deeper with your twin"
              onClick={() => onAskTwin('Tell me more about my day')}
            />
          )}
        </List>
      </Section>
    </>
  );
};

export default MorningBriefingCard;
