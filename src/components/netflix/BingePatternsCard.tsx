import React from 'react';
import { motion } from 'framer-motion';
import { Zap, Clock, TrendingUp, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { BingePatterns } from '@/hooks/useNetflixInsights';

interface BingePatternsCardProps {
  patterns: BingePatterns;
  className?: string;
}

export const BingePatternsCard: React.FC<BingePatternsCardProps> = ({
  patterns,
  className = ''
}) => {
  // Calculate weekday vs weekend percentage
  const total = patterns.weekdayVsWeekend.weekday + patterns.weekdayVsWeekend.weekend;
  const weekdayPercent = total > 0 ? (patterns.weekdayVsWeekend.weekday / total) * 100 : 50;
  const weekendPercent = total > 0 ? (patterns.weekdayVsWeekend.weekend / total) * 100 : 50;

  return (
    <Card className={`bg-white border border-stone-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#E50914]/10 flex items-center justify-center">
          <Zap className="w-5 h-5 text-[#E50914]" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-stone-900">Binge Patterns</h3>
          <p className="text-xs text-stone-600">Your viewing behavior insights</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="space-y-5">
        {/* Peak Binge Hours */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="group"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#E50914]/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4 text-[#E50914]" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-stone-600 mb-1">Peak Binge Hours</p>
              <p className="font-ui text-base font-medium text-stone-900">
                {patterns.peakHours.label}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                {patterns.peakHours.start}:00 - {patterns.peakHours.end}:00
              </p>
            </div>
          </div>
        </motion.div>

        {/* Average Episodes Per Session */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="group"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#E50914]/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-4 h-4 text-[#E50914]" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-stone-600 mb-1">Average Session</p>
              <p className="font-ui text-base font-medium text-stone-900">
                {patterns.avgEpisodesPerSession.toFixed(1)} episodes
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                Per viewing session
              </p>
            </div>
          </div>
        </motion.div>

        {/* Longest Binge Session */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="group"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#E50914]/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <Zap className="w-4 h-4 text-[#E50914]" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-stone-600 mb-1">Longest Binge</p>
              <p className="font-ui text-base font-medium text-stone-900">
                {patterns.longestBinge.hours}h watching
              </p>
              <p className="text-xs text-stone-500 mt-0.5 truncate">
                {patterns.longestBinge.title}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Weekday vs Weekend Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="group"
        >
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-[#E50914]/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <Calendar className="w-4 h-4 text-[#E50914]" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-stone-600 mb-1">Weekly Distribution</p>
              <div className="flex items-center justify-between text-xs text-stone-700 mb-2">
                <span>Weekday</span>
                <span>Weekend</span>
              </div>
              {/* Stacked Progress Bar */}
              <div className="h-2 bg-stone-100 rounded-full overflow-hidden flex">
                <motion.div
                  className="h-full bg-[#831010]"
                  initial={{ width: 0 }}
                  animate={{ width: `${weekdayPercent}%` }}
                  transition={{ delay: 0.5, duration: 0.8, ease: 'easeOut' }}
                />
                <motion.div
                  className="h-full bg-[#E50914]"
                  initial={{ width: 0 }}
                  animate={{ width: `${weekendPercent}%` }}
                  transition={{ delay: 0.5, duration: 0.8, ease: 'easeOut' }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-stone-500 mt-1">
                <span>{weekdayPercent.toFixed(0)}%</span>
                <span>{weekendPercent.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </Card>
  );
};
