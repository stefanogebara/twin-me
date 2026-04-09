import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useWeather, getLocalHour, formatDateInTimezone } from '@/hooks/useWeather';
// MorningBriefingCard removed — chat empty state should be clean and minimal

function getGreeting(firstName: string, hour: number): string {
  if (hour >= 5 && hour < 12) return `Good Morning, ${firstName}`;
  if (hour >= 12 && hour < 18) return `Good Afternoon, ${firstName}`;
  if (hour >= 18 && hour < 22) return `Good Evening, ${firstName}`;
  return `Good Night, ${firstName}`;
}

// NO EMOJIS per CLAUDE.md — chips use plain text only
const TIME_BASED_CHIPS: Record<string, string[]> = {
  morning: [
    'Check my emails',
    "What's on my calendar?",
    'Morning briefing',
    'What patterns do you see?',
  ],
  afternoon: [
    'What does my music say about me?',
    "How's my recovery?",
    'Check my emails',
    'Draft an email for me',
  ],
  evening: [
    "How's my sleep been?",
    'What does my music say about me?',
    'What patterns do you see?',
    "What's tomorrow look like?",
  ],
  night: [
    "How's my sleep been?",
    'What patterns do you see?',
    'What does my music say about me?',
    'Tell me something surprising about myself',
  ],
};

function getTimeSlot(hour: number): string {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 24) return 'evening';
  return 'night';
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
  insightsCount?: number;
  showInterviewChip?: boolean;
  onStartInterview?: () => void;
}

export const ChatEmptyState = ({
  connectedPlatforms,
  onQuickAction,
  insightsCount = 0,
  showInterviewChip = false,
  onStartInterview,
}: ChatEmptyStateProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const weather = useWeather();
  const firstName = user?.firstName || 'there';

  // Use location-derived timezone for greeting and date (falls back to browser local)
  const timezone = weather?.timezone;
  const localHour = getLocalHour(timezone);
  const greeting = getGreeting(firstName, localHour);
  const dateStr = formatDateInTimezone(timezone);

  const platformCount = connectedPlatforms.length;

  const chips = useMemo(() => {
    const slot = getTimeSlot(localHour);
    return TIME_BASED_CHIPS[slot];
  }, [localHour]);

  return (
    <div className="h-full flex flex-col items-center justify-center px-4 sm:px-6 min-h-[40vh] sm:min-h-[60vh]">
      {/* Date line */}
      <span
        className="text-center mb-2"
        style={{
          fontSize: '13px',
          color: 'rgba(255,255,255,0.4)',
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
          color: '#F5F5F4',
          letterSpacing: '-0.02em',
        }}
      >
        {platformCount > 0
          ? greeting
          : "Let me get to know you first"
        }
      </h2>

      {/* Context subtitle — dynamic briefing line */}
      {platformCount > 0 && (
        <p
          className="text-center mb-8 max-w-sm"
          style={{
            fontSize: '15px',
            color: 'rgba(255,255,255,0.4)',
            fontWeight: 300,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {insightsCount > 0
            ? (
              <>
                Your twin noticed <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>{insightsCount} thing{insightsCount > 1 ? 's' : ''}</span> about you today.{' '}
                <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>{platformCount} platform{platformCount > 1 ? 's' : ''}</span> fueling your soul signature.
              </>
            )
            : (
              <>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>{platformCount} platform{platformCount > 1 ? 's' : ''}</span> connected. Ask me anything — I know more than you think.
              </>
            )
          }
        </p>
      )}

      {/* Subtitle for no platforms */}
      {platformCount === 0 && (
        <p
          className="text-center text-sm mb-8 max-w-sm"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          Connect a platform and I'll start picking up on the things that make you you.
        </p>
      )}

      {/* Soul Interview chip — shown when user has few memories */}
      {showInterviewChip && onStartInterview && (
        <div className="flex justify-center mb-4">
          <button
            onClick={onStartInterview}
            className="px-4 py-2.5 rounded-full text-[13px] font-medium transition-all duration-150 active:scale-[0.97]"
            style={{
              color: 'rgba(245,245,244,0.7)',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.10)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            }}
          >
            Start your Soul Interview
          </button>
        </div>
      )}

      {/* Suggestion pills — only shown when no briefing card (avoid double CTA) */}
      {connectedPlatforms.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
          {chips.slice(0, 3).map((chip, idx) => (
            <button
              key={idx}
              onClick={() => onQuickAction(chip)}
              className="px-3 sm:px-4 py-2 rounded-full text-[12px] sm:text-[13px] transition-colors duration-150 active:scale-[0.97]"
              style={{
                color: 'rgba(255,255,255,0.40)',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
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
      {connectedPlatforms.length === 0 && (
        <button
          onClick={() => navigate('/get-started')}
          className="mt-4 px-5 py-2 rounded-[100px] text-sm font-medium hover:bg-[rgba(16,183,127,0.08)] transition-all duration-150 ease-out active:scale-[0.97]"
          style={{
            border: '1px solid #10b77f',
            color: '#10b77f',
            background: 'transparent',
          }}
        >
          Connect platforms
        </button>
      )}
    </div>
  );
};
