/**
 * TodayAgendaSidebar -- Calendar events sidebar (OpenAI vision)
 * Shows next events from the user's connected calendar.
 */

import React from 'react';
import { Calendar } from 'lucide-react';

interface CalendarEvent {
  title: string;
  startTime: string;
  endTime?: string;
}

interface TodayAgendaSidebarProps {
  events: CalendarEvent[];
}

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

const TodayAgendaSidebar: React.FC<TodayAgendaSidebarProps> = ({ events }) => {
  return (
    <div
      className="rounded-[16px] p-4"
      style={{
        background: 'var(--glass-surface-bg)',
        backdropFilter: 'blur(42px)',
        border: '1px solid var(--glass-surface-border)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
        <h3
          className="text-[11px] font-medium uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          Today
        </h3>
      </div>

      {events.length === 0 ? (
        <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          No events today
        </p>
      ) : (
        <div className="space-y-2.5">
          {events.slice(0, 5).map((event, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span
                className="text-[11px] font-mono w-[40px] flex-shrink-0 pt-0.5"
                style={{ color: 'var(--text-muted)' }}
              >
                {formatTime(event.startTime)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
                  {event.title}
                </p>
                {event.endTime && (
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    until {formatTime(event.endTime)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TodayAgendaSidebar;
