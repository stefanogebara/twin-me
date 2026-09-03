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
    <div className="h-full flex flex-col items-center justify-center px-4 sm:px-6 min-h-[40vh] sm:min-h-[60vh]">
      {/* Date line */}
      <span
        className="text-center mb-2"
        style={{
          fontSize: '13px',
          color: 'var(--text-secondary)',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {dateStr}
      </span>

      {/* Time-aware greeting */}
      <h2
        className="text-center mb-2 text-[24px] sm:text-[32px]"
        style={{
          fontStyle: 'italic',
          fontWeight: 300,
          color: 'var(--foreground)',
          letterSpacing: '-0.02em',
        }}
      >
        {platformCount > 0
          ? greeting
          : "Let me get to know you first"
        }
      </h2>

      {/* replan-2026-06-10 chat declutter: subtitle carries no counts —
          platform/insight tallies changed nothing about what the user types
          (the reconnect chip below is the one count that does). */}
      {platformCount > 0 && (
        <p
          className="text-center mb-8 max-w-sm"
          style={{
            fontSize: '15px',
            color: 'var(--text-secondary)',
            fontWeight: 300,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {twinName
            ? `${twinName} here. Ask me anything — I know more than you think.`
            : 'Ask me anything — I know more than you think.'}
        </p>
      )}

      {/* audit-2026-05-15 H1: surface expired/stale platforms instead of
          silently counting them as connected. Without this, users see
          "11 platforms connected" while 4 have been silent for 16+ days. */}
      {needsReconnect > 0 && (
        <button
          onClick={() => navigate('/connect')}
          className="text-center mb-6 text-[12px] transition-opacity hover:opacity-80"
          // audit-2026-07-03 H5: was rgba(217,119,6,0.7) = 3.43:1, the primary
          // recovery action for a degraded twin. Solid #d97706 = 5.84:1 on the
          // #13121a base, clearing AA for this actionable amber link.
          style={{ color: '#d97706' }}
        >
          {needsReconnect} platform{needsReconnect > 1 ? 's need' : ' needs'} reconnection →
        </button>
      )}

      {/* Subtitle for no platforms */}
      {platformCount === 0 && (
        <p
          className="text-center text-sm mb-8 max-w-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          Connect a platform and I'll start picking up on the things that make you you.
        </p>
      )}

      {/* Story Chapters chip — shown when user has few memories */}
      {showInterviewChip && onStartInterview && (
        <div className="flex justify-center mb-4">
          <button
            onClick={onStartInterview}
            // audit-2026-05-15 H9: suggestion chips use rounded-[46px] per
            // CLAUDE.md Rule 5 — not rounded-full. data-testid added so
            // Playwright audits can find chips deterministically (Agent 2's
            // heuristic scan caught "Sign Out" as a chip otherwise).
            className="px-4 py-2.5 rounded-[46px] text-[13px] font-medium transition-all duration-150 active:scale-[0.97]"
            data-testid="suggestion-chip"
            style={{
              color: 'var(--foreground)',
              background: 'var(--surface)',
              border: '1px solid var(--glass-surface-border)',
              fontFamily: 'var(--font-ui)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface-solid)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--surface)';
            }}
          >
            Tell me your story — a few minutes at a time
          </button>
        </div>
      )}

      {/* Suggestion pills — only shown when no briefing card (avoid double CTA) */}
      {/* audit-2026-06-10: gate on canonical platformCount (platformsSummary.active)
          so chips and the connect CTA agree with the greeting above, rather than
          the stale local connectedPlatforms.length. */}
      {platformCount > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
          {chips.slice(0, 3).map((chip, idx) => (
            <button
              key={`chip-${chip.slice(0, 20)}-${idx}`}
              onClick={() => onQuickAction(chip)}
              // audit-2026-05-15 H9: rounded-[46px] per CLAUDE.md Rule 5.
              // data-testid for deterministic test selection.
              className="px-3 sm:px-4 py-2 rounded-[46px] text-[12px] sm:text-[13px] transition-colors duration-150 active:scale-[0.97]"
              data-testid="suggestion-chip"
              style={{
                // audit-2026-07-03 H1: chip label was 3.83:1; token = 7.37:1.
                color: 'var(--text-secondary)',
                background: 'transparent',
                border: '1px solid var(--border-glass)',
                fontFamily: 'var(--font-ui)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Connect CTA for no-platform users */}
      {platformCount === 0 && (
        <button
          onClick={() => navigate('/get-started')}
          className="mt-4 px-5 py-2 rounded-[100px] text-sm font-medium hover:bg-[rgba(193,126,44,0.08)] transition-all duration-150 ease-out active:scale-[0.97]"
          style={{
            border: '1px solid var(--accent-amber)',
            color: 'var(--accent-amber)',
            background: 'transparent',
          }}
        >
          Connect platforms
        </button>
      )}
    </div>
  );
};
