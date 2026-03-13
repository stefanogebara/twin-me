import React from 'react';
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
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#FF0000]/10 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-[#FF0000]" />
        </div>
        <div>
          <h3 className="text-lg font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
            Watch Patterns
          </h3>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Your viewing behavior insights
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Peak Hours */}
        <div
          className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:brightness-110"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <div className="w-10 h-10 rounded-lg bg-[#FF0000]/10 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-[#FF0000]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium tracking-widest uppercase mb-0.5" style={{ color: '#10b77f' }}>
              Peak Hours
            </p>
            <p className="text-sm font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
              {formatPeakHours(patterns.peakHours.start, patterns.peakHours.end)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {patterns.peakHours.label}
            </p>
          </div>
        </div>

        {/* Avg Videos Per Session */}
        <div
          className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:brightness-110"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <div className="w-10 h-10 rounded-lg bg-[#FF0000]/10 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-5 h-5 text-[#FF0000]" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-medium tracking-widest uppercase mb-0.5" style={{ color: '#10b77f' }}>
              Avg Videos Per Session
            </p>
            <p className="text-xl font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
              {patterns.avgVideosPerSession.toFixed(1)}
            </p>
          </div>
        </div>

        {/* Avg Watch Duration */}
        <div
          className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:brightness-110"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <div className="w-10 h-10 rounded-lg bg-[#FF0000]/10 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-[#FF0000]" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-medium tracking-widest uppercase mb-0.5" style={{ color: '#10b77f' }}>
              Avg Watch Duration
            </p>
            <p className="text-xl font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
              {formatDuration(patterns.avgWatchDuration)}
            </p>
          </div>
        </div>

        {/* Completion Rate */}
        <div
          className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:brightness-110"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <div className="w-10 h-10 rounded-lg bg-[#FF0000]/10 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-[#FF0000]" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-medium tracking-widest uppercase mb-0.5" style={{ color: '#10b77f' }}>
              Completion Rate
            </p>
            <p className="text-xl font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
              {patterns.completionRate.toFixed(0)}%
            </p>
          </div>
        </div>

        {/* Weekday vs Weekend */}
        <div
          className="p-3 rounded-lg"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-[#FF0000]" />
            <p className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>
              Weekday vs Weekend
            </p>
          </div>

          {/* Horizontal bar chart */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs w-16" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.3)' }}>Weekday</span>
              <div className="flex-1 h-6 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#FF0000] to-[#FF4444] rounded-full flex items-center justify-end pr-2 transition-all duration-600"
                  style={{ width: `${weekdayPercent}%` }}
                >
                  <span className="text-xs font-mono text-white font-medium">
                    {weekdayPercent.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs w-16" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.3)' }}>Weekend</span>
              <div className="flex-1 h-6 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#CC0000] to-[#FF0000] rounded-full flex items-center justify-end pr-2 transition-all duration-600"
                  style={{ width: `${weekendPercent}%` }}
                >
                  <span className="text-xs font-mono text-white font-medium">
                    {weekendPercent.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
