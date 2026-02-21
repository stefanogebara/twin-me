import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
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
  const { theme } = useTheme();

  if (nextEvent) {
    return (
      <GlassPanel className="mb-8 relative overflow-hidden" variant="card">
        <div
          className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-blue-500 to-green-500"
        />

        <div className="pt-4">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs uppercase tracking-wider"
                  style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}
                >
                  Next Important Event
                </span>
                {isCalendarConnected && (
                  <button
                    onClick={onSync}
                    disabled={syncing}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    title="Sync calendar"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`}
                      style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}
                    />
                  </button>
                )}
              </div>
              <h2
                className="text-2xl mb-2"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 500,
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}
              >
                {nextEvent.title}
              </h2>
              <div className="flex items-center gap-4">
                <span
                  className="flex items-center gap-1.5 text-sm"
                  style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
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
                    backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                    color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e'
                  }}
                >
                  {nextEvent.type}
                </span>
              </div>
            </div>

            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)'
              }}
            >
              <Target className="w-6 h-6" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }} />
            </div>
          </div>

          <motion.button
            onClick={() => onNavigate('/insights/calendar')}
            className="w-full py-4 flex items-center justify-center gap-3 rounded-xl glow-accent"
            style={{
              background: `linear-gradient(135deg, var(--accent-vibrant), var(--accent-vibrant-hover))`,
              color: '#1a1a17',
              fontWeight: 600,
              boxShadow: '0 2px 12px var(--accent-vibrant-glow)',
            }}
            whileHover={{ scale: 1.015, boxShadow: '0 4px 20px var(--accent-vibrant-glow)' }}
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
      className="mb-8 px-4 py-3 rounded-xl flex items-center gap-3"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.5)' : 'rgba(255, 255, 255, 0.7)',
        border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)'
      }}
    >
      <Clock
        className="w-5 h-5 flex-shrink-0 opacity-40"
        style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
      />
      <span
        className="text-sm flex-1"
        style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}
      >
        {isCalendarConnected ? 'No events today' : 'Connect your calendar to see events'}
      </span>
      <button
        onClick={() => onNavigate(isCalendarConnected ? '/insights/calendar' : '/get-started')}
        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80 flex-shrink-0"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.12)' : 'rgba(0, 0, 0, 0.06)',
          color: theme === 'dark' ? '#C1C0B6' : '#44403c'
        }}
      >
        {isCalendarConnected ? 'View Calendar' : 'Connect Calendar'}
      </button>
    </div>
  );
};
