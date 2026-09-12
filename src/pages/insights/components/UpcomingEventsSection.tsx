import React from 'react';
import { Calendar, Users, Target, Presentation, Dumbbell, BookOpen } from 'lucide-react';
import { Section, List, Row } from '@/components/register';

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
}

const eventIcons: Record<string, React.ReactNode> = {
  meeting: <Users />,
  focus: <Target />,
  presentation: <Presentation />,
  workout: <Dumbbell />,
  interview: <Users />,
  learning: <BookOpen />,
};

const typeLabel = (type?: string) => {
  const t = type || 'meeting';
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Coming up: one row per event, grouped by day in the order the days arrive. */
export const UpcomingEventsSection: React.FC<UpcomingEventsSectionProps> = ({ events }) => {
  const eventsByDay: Record<string, UpcomingEvent[]> = {};
  events.forEach(event => {
    const dayKey = event.dayLabel || 'Upcoming';
    if (!eventsByDay[dayKey]) {
      eventsByDay[dayKey] = [];
    }
    eventsByDay[dayKey].push(event);
  });

  return (
    <Section title="Coming up">
      <List>
        {Object.entries(eventsByDay).flatMap(([dayLabel, dayEvents]) =>
          dayEvents.map((event, index) => (
            <Row
              key={`${dayLabel}-${index}`}
              icon={eventIcons[event.type || 'meeting'] || <Calendar />}
              title={event.title}
              line={[
                dayLabel,
                event.time,
                event.attendees !== undefined && event.attendees > 0
                  ? `${event.attendees} ${event.attendees === 1 ? 'person' : 'people'}`
                  : null,
              ].filter(Boolean).join(' · ')}
              action={<span className="ri-end">{typeLabel(event.type)}</span>}
            />
          )),
        )}
      </List>
    </Section>
  );
};
