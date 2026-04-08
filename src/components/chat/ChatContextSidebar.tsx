import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Mail, Calendar as CalendarIcon, X } from 'lucide-react';
import { useWeather } from '../../hooks/useWeather';

const COLLAPSED_KEY = 'chat_sidebar_collapsed';

function getTimeGradient(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) {
    return 'linear-gradient(165deg, #4a6fa5 0%, #2d4a7a 30%, #1e3560 60%, #151825 100%)';
  } else if (hour >= 12 && hour < 18) {
    return 'linear-gradient(165deg, #2d3a5c 0%, #1e2747 30%, #1a1f3a 60%, #151825 100%)';
  } else if (hour >= 18 && hour < 21) {
    return 'linear-gradient(165deg, #3d2a5c 0%, #2a1e47 30%, #221a3a 60%, #151825 100%)';
  } else {
    return 'linear-gradient(165deg, #1e1533 0%, #16102a 30%, #120e22 60%, #0e0b1a 100%)';
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

function formatCurrentDate(): string {
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const month = now.toLocaleDateString('en-US', { month: 'long' });
  const day = now.getDate();

  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';

  return `${dayName}, ${month} ${day}${suffix}`;
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
                key={idx}
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
                key={idx}
                className="py-2"
                style={{
                  borderBottom:
                    idx < Math.min(recentEmails.length, 5) - 1
                      ? '1px solid rgba(255,255,255,0.04)'
                      : undefined,
                }}
              >
                <span
                  className="text-[12px] block truncate"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                >
                  {email.sender}
                </span>
                <span
                  className="text-[13px] block truncate"
                  style={{ color: 'rgba(255,255,255,0.6)' }}
                >
                  {email.subject}
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
                key={idx}
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
                {item.insight}
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
  const dateStr = formatCurrentDate();
  const weather = useWeather();
  const [gradient, setGradient] = useState(getTimeGradient);
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

  // Update gradient every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setGradient(getTimeGradient());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

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
        {/* Collapse/expand toggle */}
        <button
          onClick={toggleCollapsed}
          className="absolute -left-3 top-1/2 -translate-y-1/2 z-20 w-6 h-6 flex items-center justify-center rounded-full transition-all duration-200 hover:scale-110"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.4)',
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
            boxShadow: collapsed ? 'none' : 'inset 0 0 80px rgba(100, 130, 255, 0.04)',
            borderLeft: collapsed ? 'none' : '1px solid var(--glass-surface-border)',
          }}
        >
          {/* Top gradient overlay */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[160px] rounded-tl-[20px]"
            style={{
              background:
                'linear-gradient(180deg, rgba(45,55,72,0.3) 0%, rgba(17,17,17,0) 100%)',
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
              boxShadow: 'inset 0 0 80px rgba(100, 130, 255, 0.04)',
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
                  'linear-gradient(180deg, rgba(45,55,72,0.3) 0%, rgba(17,17,17,0) 100%)',
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
