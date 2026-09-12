import React from 'react';
import { Section, List } from '@/components/register';
import { eventHue } from './calendarHues';

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
}

/* The axis runs 6am to 10pm (16 hours); the ticks sit on the same scale the
   events use, so they line up with the marks instead of being evenly spaced. */
const TICKS = [
  { label: '6am', hour: 6 },
  { label: '9am', hour: 9 },
  { label: '12pm', hour: 12 },
  { label: '3pm', hour: 15 },
  { label: '6pm', hour: 18 },
  { label: '9pm', hour: 21 },
];

export const TodayTimeline: React.FC<TodayTimelineProps> = ({ events }) => {
  return (
    <Section title="Today">
      <List>
        <li className="ri-block">
          <div className="ri-axis" aria-hidden="true">
            {TICKS.map(({ label, hour }) => {
              const pos = ((hour - 6) / 16) * 100;
              return (
                <span key={label} style={{ left: `${pos}%`, transform: hour === 6 ? 'none' : 'translateX(-50%)' }}>
                  {label}
                </span>
              );
            })}
          </div>
          <div className="ri-track">
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
                  className="ri-slot"
                  style={{ left: `${startPos}%`, width: `${width}%`, background: eventHue(event.type) }}
                  title={`${event.title} (${event.startTime} - ${event.endTime})`}
                >
                  {event.title}
                </div>
              );
            })}
          </div>
        </li>
      </List>
    </Section>
  );
};
