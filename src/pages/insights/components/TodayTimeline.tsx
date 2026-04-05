import React from 'react';
import { Clock } from 'lucide-react';

interface TodayEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  type: string;
  attendees: number;
  isRecurring?: boolean;
}

interface TodayTimelineProps {
  events: TodayEvent[];
  colors: {
    textSecondary: string;
    calendarBlue: string;
  };
}

const eventColors: Record<string, string> = {
  meeting: '#4285F4',
  focus: '#34A853',
  presentation: '#FBBC05',
  workout: '#EA4335',
  personal: '#9334E9',
  learning: '#8B5CF6',
};

export const TodayTimeline: React.FC<TodayTimelineProps> = ({ events, colors }) => {
  return (
    <div
      className="p-4 rounded-[20px] mb-6"
      style={{ border: '1px solid var(--border-glass)', backgroundColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(42px)', WebkitBackdropFilter: 'blur(42px)' }}
    >
      <span
        className="text-[11px] font-medium tracking-widest uppercase block mb-4"
        style={{ color: '#10b77f' }}
      >
        <Clock className="w-4 h-4 inline-block mr-2" style={{ color: colors.calendarBlue }} />
        Today's Schedule
      </span>
      <div className="relative">
        <div className="flex justify-between text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {['6AM', '9AM', '12PM', '3PM', '6PM', '9PM'].map(time => (
            <span key={time}>{time}</span>
          ))}
        </div>
        <div
          className="h-12 rounded-lg relative overflow-hidden"
          style={{ backgroundColor: 'var(--glass-surface-bg)' }}
        >
          {events.map((event) => {
            const startHour = parseInt(event.startTime.split(':')[0]);
            const endHour = parseInt(event.endTime.split(':')[0]);
            const startMin = parseInt(event.startTime.split(':')[1]) || 0;
            const endMin = parseInt(event.endTime.split(':')[1]) || 0;

            const startPos = ((startHour - 6 + startMin / 60) / 16) * 100;
            const width = ((endHour - startHour + (endMin - startMin) / 60) / 16) * 100;

            if (startPos >= 0 && startPos <= 100) {
              return (
                <div
                  key={event.id}
                  className="absolute h-full rounded-md flex items-center justify-center px-1 overflow-hidden"
                  style={{
                    left: `${Math.max(0, startPos)}%`,
                    width: `${Math.min(width, 100 - startPos)}%`,
                    backgroundColor: eventColors[event.type] || '#666',
                    opacity: 0.9,
                  }}
                  title={`${event.title} (${event.startTime} - ${event.endTime})`}
                >
                  <span className="text-xs text-white truncate font-medium">
                    {event.title.length > 12 ? event.title.slice(0, 12) + '...' : event.title}
                  </span>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};
