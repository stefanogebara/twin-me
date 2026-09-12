import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useWeather, getLocalHour, formatDateInTimezone } from '@/hooks/useWeather';
import { usePlatformsSummary } from '@/hooks/usePlatformsSummary';
import {
  generateSuggestionChips,
  type CalendarEventLike,
  type ProactiveInsightLike,
  type RecentEmailLike,
} from './generateSuggestionChips';
// MorningBriefingCard removed — chat empty state should be clean and minimal

function getGreeting(firstName: string, hour: number): string {
  if (hour >= 5 && hour < 12) return `Good Morning, ${firstName}`;
  if (hour >= 12 && hour < 18) return `Good Afternoon, ${firstName}`;
  if (hour >= 18 && hour < 22) return `Good Evening, ${firstName}`;
  return `Good Night, ${firstName}`;
}

interface Platform {
  name: string;
  icon: React.ReactNode;
  key: string;
  color: string;
  connected: boolean | undefined;
}

interface ChatEmptyStateProps {
  connectedPlatforms: Platform[];
  platforms: Platform[];
  onQuickAction: (text: string) => void;
  onSendMessage?: () => void;
  showInterviewChip?: boolean;
  onStartInterview?: () => void;
  // audit-2026-05-13 L1: signal data for dynamic chips. All optional — when
  // omitted, generateSuggestionChips falls back to time-based defaults.
  pendingInsights?: ProactiveInsightLike[];
  calendarEvents?: CalendarEventLike[];
  recentEmails?: RecentEmailLike[];
}

export const ChatEmptyState = ({
  connectedPlatforms,
  onQuickAction,
  showInterviewChip = false,
  onStartInterview,
  pendingInsights,
  calendarEvents,
  recentEmails,
}: ChatEmptyStateProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const weather = useWeather();
  const firstName = user?.firstName || 'there';
  // The name given at the hatching moment (onboarding). Written locally on
  // commit and rehydrated from new-user-check on sign-in, so the ritual pays
  // off where the twin actually speaks. Nameless twins are supported.
  const twinName = (() => {
    try {
      const n = localStorage.getItem('twinme_twin_name');
      return n && n.trim() ? n.trim().slice(0, 40) : null;
    } catch {
      return null;
    }
  })();

  // Use location-derived timezone for greeting and date (falls back to browser local)
  const timezone = weather?.timezone;
  const localHour = getLocalHour(timezone);
  const greeting = getGreeting(firstName, localHour);
  const dateStr = formatDateInTimezone(timezone);

  // Canonical platform state (audit-2026-05-12 H1). The count is no longer
  // rendered (replan-2026-06-10 chat declutter) — it only branches the
  // greeting vs the get-to-know-you zero state. `.active` excludes
  // expired/stale (audit-2026-05-15 H1).
  const { data: platformsSummary } = usePlatformsSummary();
  const platformCount = platformsSummary?.active ?? platformsSummary?.total ?? connectedPlatforms.length;
  const expiredCount = platformsSummary?.expired ?? 0;
  const staleCount = platformsSummary?.stale ?? 0;
  const needsReconnect = expiredCount + staleCount;

  // audit-2026-05-13 L1: chips now react to today's signals (high-urgency
  // proactive insights, meeting-heavy day, email triage opportunity) and
  // fall back to the time-of-day defaults when no signals dominate.
  const chips = useMemo(
    () => generateSuggestionChips({
      hour: localHour,
      pendingInsights,
      calendarEvents,
      recentEmails,
      max: 3,
    }),
    [localHour, pendingInsights, calendarEvents, recentEmails],
  );

  return (
    <div className="h-full flex flex-col items-center justify-center px-4 sm:px-6 min-h-[40vh] sm:min-h-[60vh] text-center">
      {/* Date line: the grey line, above the greeting */}
      <span style={{ color: 'var(--rg-ink-2)', fontWeight: 350, marginBottom: 8 }}>
        {dateStr}
      </span>

      {/* Time-aware greeting: the Cosmos page title, upright (Geist has no italic) */}
      <h2 className="rg-apphead-title" style={{ marginBottom: 8 }}>
        {platformCount > 0
          ? greeting
          : "Let me get to know you first"
        }
      </h2>

      {/* replan-2026-06-10 chat declutter: subtitle carries no counts —
          platform/insight tallies changed nothing about what the user types
          (the reconnect chip below is the one count that does). */}
      {platformCount > 0 && (
        <p className="max-w-sm" style={{ margin: '0 0 32px', color: 'var(--rg-ink-2)', fontWeight: 350 }}>
          {twinName
            ? `${twinName} here. Ask me anything. I know more than you think.`
            : 'Ask me anything. I know more than you think.'}
        </p>
      )}

      {/* audit-2026-05-15 H1: surface expired/stale platforms instead of
          silently counting them as connected. Without this, users see
          "11 platforms connected" while 4 have been silent for 16+ days.
          The register: an ink text link (the amber #d97706 is 3.2:1 on the page). */}
      {needsReconnect > 0 && (
        <button
          type="button"
          onClick={() => navigate('/connect')}
          className="transition-opacity hover:opacity-70"
          style={{
            marginBottom: 24,
            background: 'none',
            border: 0,
            padding: '4px 0',
            font: 'inherit',
            color: 'var(--rg-ink)',
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
            cursor: 'pointer',
          }}
        >
          {needsReconnect} platform{needsReconnect > 1 ? 's need' : ' needs'} reconnecting
        </button>
      )}

      {/* Subtitle for no platforms */}
      {platformCount === 0 && (
        <p className="max-w-sm" style={{ margin: '0 0 32px', color: 'var(--rg-ink-2)', fontWeight: 350 }}>
          Connect a platform and I'll start picking up on the things that make you you.
        </p>
      )}

      {/* Story Chapters chip — shown when user has few memories. data-testid
          kept so Playwright audits find chips deterministically. */}
      {showInterviewChip && onStartInterview && (
        <div className="flex justify-center mb-4">
          <button type="button" onClick={onStartInterview} className="n-btn n-btn--ghost" data-testid="suggestion-chip">
            Tell me your story, a few minutes at a time
          </button>
        </div>
      )}

      {/* Suggestions: the register's 32px secondary buttons, not pills. */}
      {/* audit-2026-06-10: gate on canonical platformCount (platformsSummary.active)
          so chips and the connect CTA agree with the greeting above, rather than
          the stale local connectedPlatforms.length. */}
      {platformCount > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {chips.slice(0, 3).map((chip, idx) => (
            <button
              type="button"
              key={`chip-${chip.slice(0, 20)}-${idx}`}
              onClick={() => onQuickAction(chip)}
              className="n-btn n-btn--ghost"
              style={{ maxWidth: '100%', whiteSpace: 'normal', height: 'auto', minHeight: 'var(--rg-button)', padding: '6px 16px', lineHeight: 'var(--rg-line)' }}
              data-testid="suggestion-chip"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Connect CTA for no-platform users */}
      {platformCount === 0 && (
        <button type="button" onClick={() => navigate('/get-started')} className="n-btn n-btn--ghost" style={{ marginTop: 16 }}>
          Connect platforms
        </button>
      )}
    </div>
  );
};
