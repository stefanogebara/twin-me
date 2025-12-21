import React from 'react';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, CheckCircle, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { WatchPatterns } from '@/hooks/useYouTubeInsights';

interface WatchPatternsCardProps {
  patterns: WatchPatterns;
  className?: string;
}

export const WatchPatternsCard: React.FC<WatchPatternsCardProps> = ({
  patterns,
  className = ''
}) => {
  // Format peak hours
  const formatPeakHours = (start: number, end: number): string => {
    const formatHour = (hour: number) => {
      if (hour === 0) return '12 AM';
      if (hour === 12) return '12 PM';
      if (hour < 12) return `${hour} AM`;
      return `${hour - 12} PM`;
    };
    return `${formatHour(start)} - ${formatHour(end)}`;
  };

  // Format duration
  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  // Calculate total for weekday/weekend split
  const totalViews = patterns.weekdayVsWeekend.weekday + patterns.weekdayVsWeekend.weekend;
  const weekdayPercent = totalViews > 0 ? (patterns.weekdayVsWeekend.weekday / totalViews) * 100 : 50;
  const weekendPercent = 100 - weekdayPercent;

  return (
    <Card className={`bg-white border border-stone-200 p-6 shadow-md hover:shadow-lg transition-shadow duration-200 ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#FF0000]/10 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-[#FF0000]" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-stone-900">
            Watch Patterns
          </h3>
          <p className="text-xs text-stone-500">
            Your viewing behavior insights
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Peak Hours */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg hover:bg-stone-100 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-[#FF0000]/10 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-[#FF0000]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-ui text-stone-500 uppercase tracking-wide mb-0.5">
              Peak Hours
            </p>
            <p className="font-ui text-sm font-medium text-stone-900">
              {formatPeakHours(patterns.peakHours.start, patterns.peakHours.end)}
            </p>
            <p className="text-xs text-stone-600 mt-0.5">
              {patterns.peakHours.label}
            </p>
          </div>
        </motion.div>

        {/* Avg Videos Per Session */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg hover:bg-stone-100 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-[#FF0000]/10 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-5 h-5 text-[#FF0000]" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-ui text-stone-500 uppercase tracking-wide mb-0.5">
              Avg Videos Per Session
            </p>
            <p className="font-ui text-xl font-medium text-stone-900">
              {patterns.avgVideosPerSession.toFixed(1)}
            </p>
          </div>
        </motion.div>

        {/* Avg Watch Duration */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg hover:bg-stone-100 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-[#FF0000]/10 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-[#FF0000]" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-ui text-stone-500 uppercase tracking-wide mb-0.5">
              Avg Watch Duration
            </p>
            <p className="font-ui text-xl font-medium text-stone-900">
              {formatDuration(patterns.avgWatchDuration)}
            </p>
          </div>
        </motion.div>

        {/* Completion Rate */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg hover:bg-stone-100 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-[#FF0000]/10 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-[#FF0000]" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-ui text-stone-500 uppercase tracking-wide mb-0.5">
              Completion Rate
            </p>
            <p className="font-ui text-xl font-medium text-stone-900">
              {patterns.completionRate.toFixed(0)}%
            </p>
          </div>
        </motion.div>

        {/* Weekday vs Weekend */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="p-3 bg-stone-50 rounded-lg"
        >
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-[#FF0000]" />
            <p className="text-xs font-ui text-stone-500 uppercase tracking-wide">
              Weekday vs Weekend
            </p>
          </div>

          {/* Horizontal bar chart */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-ui text-stone-600 w-16">Weekday</span>
              <div className="flex-1 h-6 bg-stone-200 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${weekdayPercent}%` }}
                  transition={{ delay: 0.6, duration: 0.6, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-[#FF0000] to-[#FF4444] rounded-full flex items-center justify-end pr-2"
                >
                  <span className="text-xs font-mono text-white font-medium">
                    {weekdayPercent.toFixed(0)}%
                  </span>
                </motion.div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-ui text-stone-600 w-16">Weekend</span>
              <div className="flex-1 h-6 bg-stone-200 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${weekendPercent}%` }}
                  transition={{ delay: 0.7, duration: 0.6, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-[#CC0000] to-[#FF0000] rounded-full flex items-center justify-end pr-2"
                >
                  <span className="text-xs font-mono text-white font-medium">
                    {weekendPercent.toFixed(0)}%
                  </span>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </Card>
  );
};
