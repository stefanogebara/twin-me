import React from 'react';
import { Calendar, CalendarDays, Users, Target, Presentation, Dumbbell, BookOpen } from 'lucide-react';

interface UpcomingEvent {
  title: string;
  time: string;
  type?: 'meeting' | 'focus' | 'personal' | 'presentation' | 'workout' | 'interview' | 'learning' | 'other';
  attendees?: number;
  date?: string;
  dayLabel?: string;
}

interface UpcomingEventsSectionProps {
  events: UpcomingEvent[];
  colors: {
    text: string;
    textSecondary: string;
    calendarBlue: string;
  };
}

const eventIcons: Record<string, React.ReactNode> = {
  meeting: <Users className="w-4 h-4" />,
  focus: <Target className="w-4 h-4" />,
  presentation: <Presentation className="w-4 h-4" />,
  workout: <Dumbbell className="w-4 h-4" />,
  interview: <Users className="w-4 h-4" />,
  learning: <BookOpen className="w-4 h-4" />,
};

const eventColors: Record<string, string> = {
  meeting: '#4285F4',
  focus: '#34A853',
  presentation: '#FBBC05',
  workout: '#EA4335',
  interview: '#9334E9',
  learning: '#8B5CF6',
};

export const UpcomingEventsSection: React.FC<UpcomingEventsSectionProps> = ({ events, colors }) => {
  const eventsByDay: Record<string, UpcomingEvent[]> = {};
  events.forEach(event => {
    const dayKey = event.dayLabel || 'Upcoming';
    if (!eventsByDay[dayKey]) {
      eventsByDay[dayKey] = [];
    }
    eventsByDay[dayKey].push(event);
  });

  return (
    <div className="mb-6">
      <span
        className="text-[11px] font-medium tracking-widest uppercase block mb-4"
        style={{ color: '#10b77f' }}
      >
        <CalendarDays className="w-4 h-4 inline-block mr-2" style={{ color: colors.calendarBlue }} />
        Coming Up
      </span>
      <div className="space-y-4">
        {Object.entries(eventsByDay).map(([dayLabel, dayEvents]) => (
          <div key={dayLabel}>
            <div
              className="text-sm font-medium mb-2 flex items-center gap-2"
              style={{
                color: dayLabel === 'Today' ? colors.calendarBlue : colors.text,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: dayLabel === 'Today'
                    ? colors.calendarBlue
                    : dayLabel === 'Tomorrow'
                    ? '#34A853'
                    : 'rgba(255,255,255,0.4)',
                }}
              />
              {dayLabel}
            </div>
            <div className="space-y-2">
              {dayEvents.map((event, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg"
                  style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.02)' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${eventColors[event.type || 'meeting']}20` }}
                    >
                      <span style={{ color: eventColors[event.type || 'meeting'] }}>
                        {eventIcons[event.type || 'meeting'] || <Calendar className="w-4 h-4" />}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate" style={{ color: colors.text }}>
                        {event.title}
                      </div>
                      <div className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        <span>{event.time}</span>
                        {event.attendees !== undefined && event.attendees > 0 && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {event.attendees}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <span
                      className="text-xs px-2 py-1 rounded-full capitalize"
                      style={{
                        backgroundColor: `${eventColors[event.type || 'meeting']}20`,
                        color: eventColors[event.type || 'meeting'],
                      }}
                    >
                      {event.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
