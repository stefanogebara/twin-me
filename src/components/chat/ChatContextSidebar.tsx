import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Mail, Calendar as CalendarIcon, X } from 'lucide-react';
import { useWeather, getLocalHour, formatDateInTimezone } from '../../hooks/useWeather';
import { stripEmoji } from '../../utils/stripEmoji';

const COLLAPSED_KEY = 'chat_sidebar_collapsed';

/* audit-2026-06-10: these washes previously used navy/steel-blue hexes,
   which the design system explicitly forbids ("NEVER navy blue").
   Time-of-day tones are now drawn from the sanctioned amber/copper orb
   palette (see DARK_ANCHORS in src/utils/skyGradients.ts) layered over
   the #13121a charcoal base. */
function getTimeGradient(hour: number): string {
  if (hour >= 6 && hour < 12) {
    // Morning — warm amber sunrise
    return 'linear-gradient(165deg, rgba(210, 145, 55, 0.30) 0%, rgba(180, 110, 65, 0.18) 40%, rgba(160, 95, 55, 0.10) 70%, rgba(19, 18, 26, 0) 100%), #13121a';
  } else if (hour >= 12 && hour < 18) {
    // Afternoon — warm gold daylight
    return 'linear-gradient(165deg, rgba(230, 178, 75, 0.24) 0%, rgba(200, 140, 60, 0.15) 40%, rgba(170, 110, 50, 0.08) 70%, rgba(19, 18, 26, 0) 100%), #13121a';
  } else if (hour >= 18 && hour < 21) {
    // Evening — copper sunset with subtle purple accent
    return 'linear-gradient(165deg, rgba(220, 95, 45, 0.26) 0%, rgba(170, 85, 50, 0.16) 40%, rgba(55, 45, 140, 0.10) 75%, rgba(19, 18, 26, 0) 100%), #13121a';
  } else {
    // Night — faint warm amber glow on charcoal
    return 'linear-gradient(165deg, rgba(180, 120, 50, 0.14) 0%, rgba(150, 95, 45, 0.09) 40%, rgba(140, 85, 45, 0.05) 70%, rgba(19, 18, 26, 0) 100%), #13121a';
  }
}

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

interface CalendarEvent {
  title: string;
  time: string;
  location?: string;
}

interface RecentEmail {
  subject: string;
  sender: string;
  date?: string;
}

interface Insight {
  insight: string;
  category?: string;
  urgency?: string;
}

interface ChatContextSidebarProps {
  calendarEvents?: CalendarEvent[];
  recentEmails?: RecentEmail[];
  insights?: Insight[];
  platformCount?: number;
  messageCount?: number;
  isLoadingSidebar?: boolean;
  onMorningBriefing?: () => void;
  /** Mobile overlay mode */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

/** Shared sidebar content rendered inside both desktop and mobile wrappers */
function SidebarContent({
  weather,
  dateStr,
  calendarEvents,
  recentEmails,
  insights,
  isLoadingSidebar,
  onMorningBriefing,
  platformCount,
  messageCount,
}: {
  weather: { city: string; temperature: number; condition: string } | null;
  dateStr: string;
  calendarEvents: CalendarEvent[];
  recentEmails: RecentEmail[];
  insights: Insight[];
  isLoadingSidebar: boolean;
  onMorningBriefing?: () => void;
  platformCount: number;
  messageCount: number;
}) {
  return (
    <div className="relative z-10 flex flex-col flex-1 p-5 min-w-[280px]">
      {/* Location + Weather */}
      {weather && (
        <div className="mb-4">
          <span
            className="text-[12px] block"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            {weather.city}
          </span>
          <span
            className="text-[12px] block"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            {weather.temperature}&deg;C, {weather.condition}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-5">
        <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {dateStr}
        </span>
        <h2 className="text-[18px] font-medium mt-0.5" style={{ color: '#F5F5F4' }}>
          Today
        </h2>
      </div>

      {/* Calendar Section */}
      <div className="mb-5">
        <div className="flex items-center gap-1.5 mb-2">
          <CalendarIcon className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <span
            className="text-[10px] uppercase font-medium"
            style={{
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.15em',
            }}
          >
            Calendar
          </span>
        </div>

        <div>
          {isLoadingSidebar ? (
            <div className="space-y-2 mt-2">
              <div className="h-3 w-24 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-3 w-32 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          ) : calendarEvents.length > 0 ? (
            calendarEvents.slice(0, 5).map((event, idx) => (
              <div
                key={event.id ?? `cal-${idx}`}
                className="py-2"
                style={{
                  borderBottom:
                    idx < Math.min(calendarEvents.length, 5) - 1
                      ? '1px solid rgba(255,255,255,0.04)'
                      : undefined,
                }}
              >
                <span
                  className="text-[12px] block"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  {event.time}
                </span>
                <span
                  className="text-[13px] block"
                  style={{ color: '#F5F5F4' }}
                >
                  {event.title}
                </span>
                {event.location && (
                  <span
                    className="text-[11px] block"
                    style={{ color: 'rgba(255,255,255,0.3)' }}
                  >
                    {event.location}
                  </span>
                )}
              </div>
            ))
          ) : (
            <p
              className="text-[13px] py-2"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              No events today
            </p>
          )}
        </div>
      </div>

      {/* Email Section */}
      <div
        className="mb-5 pt-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Mail className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <span
            className="text-[10px] uppercase font-medium"
            style={{
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.15em',
            }}
          >
            Recent emails
          </span>
        </div>

        <div>
          {isLoadingSidebar ? (
            <div className="space-y-2 mt-2">
              <div className="h-3 w-32 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-3 w-28 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          ) : recentEmails.length > 0 ? (
            recentEmails.slice(0, 5).map((email, idx) => (
              <div
                key={email.id ?? `email-${idx}`}
                className="py-2"
                style={{
                  borderBottom:
                    idx < Math.min(recentEmails.length, 5) - 1
                      ? '1px solid rgba(255,255,255,0.04)'
                      : undefined,
                }}
              >
                {/* audit-2026-05-15 H7: strip emojis from external content.
                    The audit found "🤑" in an email subject leaking into
                    the sidebar — emails come from outside our system so
                    we can't control their content. stripEmoji is cheap
                    enough to run on every render (fast path returns
                    unchanged if no emoji present). */}
                <span
                  className="text-[12px] block truncate"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                >
                  {stripEmoji(email.sender)}
                </span>
                <span
                  className="text-[13px] block truncate"
                  style={{ color: 'rgba(255,255,255,0.6)' }}
                >
                  {stripEmoji(email.subject)}
                </span>
              </div>
            ))
          ) : (
            <p
              className="text-[13px] py-2"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              No recent emails
            </p>
          )}
        </div>
      </div>

      {/* Insights Section */}
      {insights.length > 0 && (
        <div
          className="mb-5 pt-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span
            className="text-[10px] uppercase font-medium"
            style={{
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.15em',
            }}
          >
            Insights
          </span>

          <div className="mt-2">
            {insights.slice(0, 3).map((item, idx) => (
              <p
                key={item.id ?? `insight-${idx}`}
                className="text-[12px] py-2"
                style={{
                  color: 'rgba(255,255,255,0.5)',
                  lineHeight: '18px',
                  borderBottom:
                    idx < Math.min(insights.length, 3) - 1
                      ? '1px solid rgba(255,255,255,0.04)'
                      : undefined,
                }}
              >
                {/* audit-2026-05-15 H7: defense in depth — also strip
                    emojis from LLM-generated insight text. Generation-side
                    fix is in proactiveInsights.js. */}
                {stripEmoji(item.insight)}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Morning Briefing CTA */}
      {onMorningBriefing && (
        <button
          onClick={onMorningBriefing}
          className="w-full text-left text-[13px] font-medium rounded-lg px-3 py-2.5 transition-colors hover:bg-[rgba(255,255,255,0.10)] mb-3"
          style={{
            color: '#F5F5F4',
            background: 'rgba(255,255,255,0.06)',
          }}
        >
          Morning Briefing &rarr;
        </button>
      )}

      {/* Stats Row */}
      <div
        className="flex items-center gap-4 pt-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {platformCount} Platform{platformCount !== 1 ? 's' : ''}
        </span>
        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {messageCount} Message{messageCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

export const ChatContextSidebar = ({
  calendarEvents = [],
  recentEmails = [],
  insights = [],
  platformCount = 0,
  messageCount = 0,
  isLoadingSidebar = false,
  onMorningBriefing,
  mobileOpen = false,
  onCloseMobile,
}: ChatContextSidebarProps) => {
  const weather = useWeather();
  const timezone = weather?.timezone;
  const dateStr = formatDateInTimezone(timezone);
  const [gradient, setGradient] = useState(() => getTimeGradient(getLocalHour(timezone)));
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, String(next));
      } catch {
        // Non-critical
      }
      return next;
    });
  }, []);

  // Update gradient every 60 seconds using location-aware hour
  useEffect(() => {
    setGradient(getTimeGradient(getLocalHour(timezone)));
    const interval = setInterval(() => {
      setGradient(getTimeGradient(getLocalHour(timezone)));
    }, 60_000);
    return () => clearInterval(interval);
  }, [timezone]);

  const contentProps = {
    weather,
    dateStr,
    calendarEvents,
    recentEmails,
    insights,
    isLoadingSidebar,
    onMorningBriefing,
    platformCount,
    messageCount,
  };

  return (
    <>
      {/* Desktop sidebar: always in DOM, collapsible */}
      <div className="relative hidden lg:flex flex-shrink-0">
        {/* Collapse/expand toggle.
            audit-2026-05-13 M2: data-testid + aria-expanded give automated
            probes a stable selector regardless of which way the button is
            currently pointing. aria-label still swaps with state so screen
            reader users hear the action that will happen on click. */}
        <button
          onClick={toggleCollapsed}
          className="absolute -left-3 top-1/2 -translate-y-1/2 z-20 w-6 h-6 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.4)',
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          data-testid="context-sidebar-collapse-toggle"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronLeft className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        <aside
          aria-label="Today's context"
          className="flex flex-col h-full overflow-y-auto overflow-x-hidden rounded-l-[20px]"
          style={{
            width: collapsed ? '0px' : '280px',
            opacity: collapsed ? 0 : 1,
            transition: 'width 200ms ease, opacity 150ms ease',
            background: gradient,
            boxShadow: collapsed ? 'none' : 'inset 0 0 80px rgba(193, 126, 44, 0.05)',
            borderLeft: collapsed ? 'none' : '1px solid var(--glass-surface-border)',
          }}
        >
          {/* Top gradient overlay */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[160px] rounded-tl-[20px]"
            style={{
              background:
                'linear-gradient(180deg, rgba(19,18,26,0.35) 0%, rgba(19,18,26,0) 100%)',
            }}
          />

          <SidebarContent {...contentProps} />
        </aside>
      </div>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={onCloseMobile}
          />

          {/* Slide-in panel from right */}
          <aside
            aria-label="Today's context"
            className="absolute right-0 top-0 bottom-0 w-[300px] max-w-[85vw] flex flex-col overflow-y-auto"
            style={{
              background: gradient,
              boxShadow: 'inset 0 0 80px rgba(193, 126, 44, 0.05)',
              borderLeft: '1px solid var(--glass-surface-border)',
              animation: 'slideInRight 200ms ease forwards',
            }}
          >
            {/* Close button */}
            <div className="flex justify-end p-3">
              <button
                onClick={onCloseMobile}
                className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
                style={{ color: 'rgba(255,255,255,0.4)' }}
                aria-label="Close sidebar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Top gradient overlay */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[160px]"
              style={{
                background:
                  'linear-gradient(180deg, rgba(19,18,26,0.35) 0%, rgba(19,18,26,0) 100%)',
              }}
            />

            <SidebarContent {...contentProps} />
          </aside>
        </div>
      )}

      {/* Mobile slide-in animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
};
