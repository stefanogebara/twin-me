import React from 'react';
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
          <h3 className="text-lg font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
            Listening Patterns
          </h3>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Your music habits
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Peak Hours */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-[#1DB954]" />
            <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>
              Peak Listening Hours
            </span>
          </div>
          <div className="bg-gradient-to-r from-[#1DB954]/5 to-[#1DB954]/10 rounded-lg p-3 border border-[#1DB954]/20">
            <p className="text-lg font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
              {formatHour(patterns.peakHours.start)} - {formatHour(patterns.peakHours.end)}
            </p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {patterns.peakHours.label}
            </p>
          </div>
        </div>

        {/* Weekday vs Weekend */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-[#1DB954]" />
            <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>
              Weekday vs Weekend
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-8 bg-white/8 rounded-lg overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-[#1DB954] to-[#1ed760] flex items-center justify-center transition-all duration-800"
                  style={{ width: `${weekdayPercentage}%` }}
                >
                  {weekdayPercentage > 20 && (
                    <span className="text-xs font-mono text-white font-medium">
                      {weekdayPercentage.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs w-16 text-right" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.3)' }}>
                Weekday
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-8 bg-white/8 rounded-lg overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-white/40 to-white/30 flex items-center justify-center transition-all duration-800"
                  style={{ width: `${weekendPercentage}%` }}
                >
                  {weekendPercentage > 20 && (
                    <span className="text-xs font-mono text-white font-medium">
                      {weekendPercentage.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs w-16 text-right" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.3)' }}>
                Weekend
              </span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div
            className="rounded-lg p-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Headphones className="w-3.5 h-3.5 text-[#1DB954]" />
              <span className="text-xs" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.3)' }}>
                Total Listened
              </span>
            </div>
            <p className="text-lg font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
              {totalHours}h {remainingMinutes}m
            </p>
          </div>

          <div
            className="rounded-lg p-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-3.5 h-3.5 text-[#1DB954]" />
              <span className="text-xs" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.3)' }}>
                Avg Session
              </span>
            </div>
            <p className="text-lg font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
              {sessionMinutes}m {sessionSeconds}s
            </p>
          </div>
        </div>

        {/* Skip Rate */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <SkipForward className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: '#10b77f' }}>
              Skip Rate
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-stone-400 to-stone-600 rounded-full transition-all duration-800"
                style={{ width: `${patterns.skipRate}%` }}
              />
            </div>
            <span className="text-sm font-mono font-medium" style={{ color: 'var(--foreground)' }}>
              {patterns.skipRate.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
