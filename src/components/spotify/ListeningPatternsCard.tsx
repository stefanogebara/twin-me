import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Calendar, Headphones, SkipForward } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { SpotifyListeningPatterns } from '@/hooks/useSpotifyInsights';

interface ListeningPatternsCardProps {
  patterns: SpotifyListeningPatterns;
  className?: string;
}

export const ListeningPatternsCard: React.FC<ListeningPatternsCardProps> = ({
  patterns,
  className = ''
}) => {
  // Format hours to AM/PM
  const formatHour = (hour: number): string => {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
  };

  // Calculate total listening time in hours
  const totalHours = Math.floor(patterns.totalMinutesListened / 60);
  const remainingMinutes = patterns.totalMinutesListened % 60;

  // Format session length
  const sessionMinutes = Math.floor(patterns.averageSessionLength);
  const sessionSeconds = Math.round((patterns.averageSessionLength - sessionMinutes) * 60);

  // Calculate percentages for weekday vs weekend
  const totalListening = patterns.weekdayVsWeekend.weekday + patterns.weekdayVsWeekend.weekend;
  const weekdayPercentage = totalListening > 0
    ? (patterns.weekdayVsWeekend.weekday / totalListening) * 100
    : 50;
  const weekendPercentage = 100 - weekdayPercentage;

  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#1DB954]/10 flex items-center justify-center">
          <Clock className="w-5 h-5 text-[#1DB954]" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-foreground">
            Listening Patterns
          </h3>
          <p className="text-xs text-muted-foreground">
            Your music habits
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Peak Hours */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-[#1DB954]" />
            <span className="text-sm font-ui font-medium text-muted-foreground">
              Peak Listening Hours
            </span>
          </div>
          <div className="bg-gradient-to-r from-[#1DB954]/5 to-[#1DB954]/10 rounded-lg p-3 border border-[#1DB954]/20">
            <p className="text-lg font-heading font-medium text-foreground">
              {formatHour(patterns.peakHours.start)} - {formatHour(patterns.peakHours.end)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {patterns.peakHours.label}
            </p>
          </div>
        </motion.div>

        {/* Weekday vs Weekend */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-[#1DB954]" />
            <span className="text-sm font-ui font-medium text-muted-foreground">
              Weekday vs Weekend
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-8 bg-white/8 rounded-lg overflow-hidden relative">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${weekdayPercentage}%` }}
                  transition={{ delay: 0.3, duration: 0.8, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-[#1DB954] to-[#1ed760] flex items-center justify-center"
                >
                  {weekdayPercentage > 20 && (
                    <span className="text-xs font-mono text-white font-medium">
                      {weekdayPercentage.toFixed(0)}%
                    </span>
                  )}
                </motion.div>
              </div>
              <span className="text-xs font-ui text-muted-foreground w-16 text-right">
                Weekday
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-8 bg-white/8 rounded-lg overflow-hidden relative">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${weekendPercentage}%` }}
                  transition={{ delay: 0.4, duration: 0.8, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-[#D97706] to-[#F59E0B] flex items-center justify-center"
                >
                  {weekendPercentage > 20 && (
                    <span className="text-xs font-mono text-white font-medium">
                      {weekendPercentage.toFixed(0)}%
                    </span>
                  )}
                </motion.div>
              </div>
              <span className="text-xs font-ui text-muted-foreground w-16 text-right">
                Weekend
              </span>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-2 gap-3 pt-2"
        >
          <div className="bg-[var(--glass-surface-bg)] rounded-lg p-3 border border-[var(--glass-surface-border)]">
            <div className="flex items-center gap-2 mb-1">
              <Headphones className="w-3.5 h-3.5 text-[#1DB954]" />
              <span className="text-xs font-ui text-muted-foreground">
                Total Listened
              </span>
            </div>
            <p className="text-lg font-heading font-medium text-foreground">
              {totalHours}h {remainingMinutes}m
            </p>
          </div>

          <div className="bg-[var(--glass-surface-bg)] rounded-lg p-3 border border-[var(--glass-surface-border)]">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-3.5 h-3.5 text-[#1DB954]" />
              <span className="text-xs font-ui text-muted-foreground">
                Avg Session
              </span>
            </div>
            <p className="text-lg font-heading font-medium text-foreground">
              {sessionMinutes}m {sessionSeconds}s
            </p>
          </div>
        </motion.div>

        {/* Skip Rate */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <SkipForward className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-ui font-medium text-muted-foreground">
              Skip Rate
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${patterns.skipRate}%` }}
                transition={{ delay: 0.7, duration: 0.8, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-stone-400 to-stone-600 rounded-full"
              />
            </div>
            <span className="text-sm font-mono text-foreground font-medium">
              {patterns.skipRate.toFixed(1)}%
            </span>
          </div>
        </motion.div>
      </div>
    </Card>
  );
};
