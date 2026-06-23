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
        {/* Labels are absolutely positioned on the SAME 16h scale the events
            use (6am base, /16 denominator → 10PM at 100%), so axis ticks line
            up with event bars instead of being evenly spaced. */}
        <div className="relative h-4 mb-2 text-xs" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
          {[
            { label: '6AM', hour: 6 },
            { label: '9AM', hour: 9 },
            { label: '12PM', hour: 12 },
            { label: '3PM', hour: 15 },
            { label: '6PM', hour: 18 },
            { label: '9PM', hour: 21 },
            { label: '10PM', hour: 22 },
          ].map(({ label, hour }) => {
            const pos = ((hour - 6) / 16) * 100;
            return (
              <span
                key={label}
                className="absolute whitespace-nowrap"
                style={{
                  left: `${pos}%`,
                  transform: hour === 22 ? 'translateX(-100%)' : hour === 6 ? 'none' : 'translateX(-50%)',
                }}
              >
                {label}
              </span>
            );
          })}
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

            const rawStartPos = ((startHour - 6 + startMin / 60) / 16) * 100;
            const rawWidth = ((endHour - startHour + (endMin - startMin) / 60) / 16) * 100;

            // Clamp events that fall outside the 6am-10pm window into the edge
            // buckets so they stay visible instead of being silently dropped.
            const startPos = Math.max(0, Math.min(rawStartPos, 100));
            const width = Math.max(2, Math.min(rawWidth, 100 - startPos));

            return (
              <div
                key={event.id}
                className="absolute h-full rounded-md flex items-center justify-center px-1 overflow-hidden"
                style={{
                  left: `${startPos}%`,
                  width: `${width}%`,
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
          })}
        </div>
      </div>
    </div>
  );
};
