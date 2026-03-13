import React from 'react';
import {
  Clock,
  Sparkles,
  Target,
  RefreshCw,
} from 'lucide-react';
import { CalendarEvent } from '@/services/apiService';

interface NextEventCardProps {
  nextEvent: CalendarEvent | null;
  isCalendarConnected: boolean;
  syncing: boolean;
  onSync: () => void;
  onNavigate: (path: string) => void;
  formatTimeUntil: (startDate: Date, endDate?: Date) => string;
}

export const NextEventCard: React.FC<NextEventCardProps> = ({
  nextEvent,
  isCalendarConnected,
  syncing,
  onSync,
  onNavigate,
  formatTimeUntil,
}) => {
  if (nextEvent) {
    return (
      <div
        className="mb-14 relative overflow-hidden rounded-lg"
        style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)', padding: '1.25rem' }}
      >
        <div>
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-[11px] font-medium tracking-widest uppercase"
                  style={{ color: '#10b77f' }}
                >
                  Next Important Event
                </span>
                {isCalendarConnected && (
                  <button
                    onClick={onSync}
                    disabled={syncing}
                    className="p-1 rounded hover:bg-black/5 transition-colors"
                    title="Sync calendar"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`}
                      style={{ color: 'rgba(255,255,255,0.4)' }}
                    />
                  </button>
                )}
              </div>
              <h2
                className="text-2xl mb-2"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 500,
                  color: 'var(--foreground)'
                }}
              >
                {nextEvent.title}
              </h2>
              <div className="flex items-center gap-4">
                <span
                  className="flex items-center gap-1.5 text-sm"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  <Clock className="w-4 h-4" />
                  {(() => {
                    const t = formatTimeUntil(nextEvent.startTime, nextEvent.endTime);
                    if (t === 'now') return 'happening now';
                    if (t === 'starting') return 'starting soon';
                    if (t === 'ended') return 'just ended';
                    return `in ${t}`;
                  })()}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-xs"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    color: 'rgba(255,255,255,0.4)'
                  }}
                >
                  {nextEvent.type}
                </span>
              </div>
            </div>

            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.06)'
              }}
            >
              <Target className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.4)' }} />
            </div>
          </div>

          <button
            onClick={() => onNavigate('/insights/calendar')}
            className="w-full py-2 flex items-center justify-center gap-2 rounded-[100px]"
            style={{ backgroundColor: '#10b77f', color: '#0a0f0a', fontWeight: 600 }}
          >
            <Sparkles className="w-5 h-5" />
            <span
              className="text-base"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 600 }}
            >
              View Time Patterns
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mb-14 px-5 py-4 rounded-xl flex items-center gap-3"
      style={{
        backgroundColor: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)'
      }}
    >
      <Clock
        className="w-5 h-5 flex-shrink-0 opacity-40"
        style={{ color: 'var(--foreground)' }}
      />
      <span
        className="text-sm flex-1"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        {isCalendarConnected ? 'Looks like you have a free day' : 'Connect your calendar and I can help you plan your time'}
      </span>
      <button
        onClick={() => onNavigate(isCalendarConnected ? '/insights/calendar' : '/settings?tab=platforms')}
        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80 flex-shrink-0"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          color: 'var(--foreground)'
        }}
      >
        {isCalendarConnected ? 'View Calendar' : 'Connect Calendar'}
      </button>
    </div>
  );
};
