import { useState, useEffect } from 'react';
import { CheckSquare, Mail, Calendar as CalendarIcon } from 'lucide-react';
import { useWeather } from '../../hooks/useWeather';

function getTimeGradient(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) {
    // Morning — light blue sky
    return 'linear-gradient(165deg, #4a6fa5 0%, #2d4a7a 30%, #1e3560 60%, #151825 100%)';
  } else if (hour >= 12 && hour < 18) {
    // Afternoon — warm blue
    return 'linear-gradient(165deg, #2d3a5c 0%, #1e2747 30%, #1a1f3a 60%, #151825 100%)';
  } else if (hour >= 18 && hour < 21) {
    // Evening — purple sunset
    return 'linear-gradient(165deg, #3d2a5c 0%, #2a1e47 30%, #221a3a 60%, #151825 100%)';
  } else {
    // Night — deep dark purple
    return 'linear-gradient(165deg, #1e1533 0%, #16102a 30%, #120e22 60%, #0e0b1a 100%)';
  }
}

interface CalendarEvent {
  title: string;
  time: string;
  location?: string;
}

interface Insight {
  insight: string;
  category?: string;
  urgency?: string;
}

interface ChatContextSidebarProps {
  calendarEvents?: CalendarEvent[];
  insights?: Insight[];
  platformCount?: number;
  messageCount?: number;
  onMorningBriefing?: () => void;
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

export const ChatContextSidebar = ({
  calendarEvents = [],
  insights = [],
  platformCount = 0,
  messageCount = 0,
  onMorningBriefing,
}: ChatContextSidebarProps) => {
  const dateStr = formatCurrentDate();
  const weather = useWeather();
  const [gradient, setGradient] = useState(getTimeGradient);
  const [activeTab, setActiveTab] = useState<'overview' | 'email' | 'calendar'>('overview');

  const tabs = [
    { id: 'overview' as const, icon: CheckSquare },
    { id: 'email' as const, icon: Mail },
    { id: 'calendar' as const, icon: CalendarIcon },
  ];

  // Update gradient every 60 seconds to reflect time-of-day changes
  useEffect(() => {
    const interval = setInterval(() => {
      setGradient(getTimeGradient());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside
      aria-label="Today's context"
      className="relative w-[280px] flex-shrink-0 hidden lg:flex flex-col h-full overflow-y-auto rounded-l-[20px]"
      style={{
        background: gradient,
        boxShadow: 'inset 0 0 80px rgba(100, 130, 255, 0.04)',
        borderLeft: '1px solid var(--glass-surface-border)',
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

      <div className="relative z-10 flex flex-col flex-1 p-5">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {dateStr}
            </span>
            {weather && (
              <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {weather.city} {weather.temperature}&deg;
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mt-1">
            <h2 className="text-[18px] font-medium" style={{ color: '#F5F5F4' }}>
              Today
            </h2>
            <div className="flex items-center gap-1">
              {tabs.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                  style={{
                    background: activeTab === id ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: activeTab === id ? '#F5F5F4' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === 'overview' ? (
          <>
            {/* Calendar Section */}
            <div className="mb-5">
              <span
                className="text-[10px] uppercase font-medium"
                style={{
                  color: 'rgba(255,255,255,0.35)',
                  letterSpacing: '0.15em',
                }}
              >
                Calendar
              </span>

              <div className="mt-2">
                {calendarEvents.length > 0 ? (
                  calendarEvents.map((event, idx) => (
                    <div
                      key={idx}
                      className="py-2"
                      style={{
                        borderBottom:
                          idx < calendarEvents.length - 1
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

            {/* Insights Section */}
            <div
              className="mb-5 pt-4 mt-4"
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
                {insights.length > 0 ? (
                  insights.slice(0, 3).map((item, idx) => (
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
                  ))
                ) : (
                  <p
                    className="text-[13px] py-2"
                    style={{ color: 'rgba(255,255,255,0.25)' }}
                  >
                    Insights appear after chatting
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          <p
            className="text-[13px] py-4"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            Coming soon
          </p>
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
    </aside>
  );
};
