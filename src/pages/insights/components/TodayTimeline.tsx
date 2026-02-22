import React from 'react';
import { GlassPanel } from '@/components/layout/PageLayout';
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
    <GlassPanel className="!p-4 mb-6">
      <h3
        className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
        style={{ color: colors.textSecondary }}
      >
        <Clock className="w-4 h-4" style={{ color: colors.calendarBlue }} />
        Today's Schedule
      </h3>
      <div className="relative">
        <div className="flex justify-between text-xs mb-2" style={{ color: colors.textSecondary }}>
          {['6AM', '9AM', '12PM', '3PM', '6PM', '9PM'].map(time => (
            <span key={time}>{time}</span>
          ))}
        </div>
        <div
          className="h-12 rounded-lg relative overflow-hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}
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
    </GlassPanel>
  );
};
