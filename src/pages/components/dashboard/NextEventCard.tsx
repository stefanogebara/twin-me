import React from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Sparkles,
  Target,
  RefreshCw,
} from 'lucide-react';
import { GlassPanel } from '@/components/layout/PageLayout';
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
      <GlassPanel className="mb-14 relative overflow-hidden" variant="card">
        <div>
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
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
                      style={{ color: 'var(--text-secondary)' }}
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
                  style={{ color: 'var(--text-secondary)' }}
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
                    color: 'var(--text-secondary)'
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
              <Target className="w-6 h-6" style={{ color: 'var(--text-secondary)' }} />
            </div>
          </div>

          <motion.button
            onClick={() => onNavigate('/insights/calendar')}
            className="btn-cta-app w-full py-2 flex items-center justify-center gap-2"
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            transition={{ duration: 0.2 }}
          >
            <Sparkles className="w-5 h-5" />
            <span
              className="text-base"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 600 }}
            >
              View Time Patterns
            </span>
          </motion.button>
        </div>
      </GlassPanel>
    );
  }

  return (
    <div
      className="mb-14 px-5 py-4 rounded-xl flex items-center gap-3"
      style={{
        backgroundColor: 'var(--glass-surface-bg)',
        border: '1px solid var(--glass-surface-border)'
      }}
    >
      <Clock
        className="w-5 h-5 flex-shrink-0 opacity-40"
        style={{ color: 'var(--foreground)' }}
      />
      <span
        className="text-sm flex-1"
        style={{ color: 'var(--text-secondary)' }}
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
