import React from 'react';
import { GlassPanel } from '@/components/layout/PageLayout';
import { Calendar, Clock, CalendarDays } from 'lucide-react';

const HEATMAP_OPACITIES = [
  0.04, 0.08, 0.06, 0.10, 0.05,
  0.09, 0.07, 0.11, 0.04, 0.08,
  0.06, 0.05, 0.10, 0.07, 0.09,
  0.04, 0.11, 0.06, 0.08, 0.05,
  0.10, 0.07, 0.04, 0.09, 0.06,
];

interface CalendarEmptyStateProps {
  colors: {
    text: string;
    textSecondary: string;
    calendarBlue: string;
  };
  onConnect: () => void;
}

export const CalendarEmptyState: React.FC<CalendarEmptyStateProps> = ({ colors, onConnect }) => {
  return (
    <div className="space-y-4">
      <GlassPanel className="text-center py-10">
        <Calendar className="w-12 h-12 mx-auto mb-4" style={{ color: colors.textSecondary }} />
        <h3 style={{ color: colors.text, fontFamily: 'var(--font-heading)' }}>
          Your twin is studying your schedule
        </h3>
        <p className="mt-2 mb-6 max-w-sm mx-auto" style={{ color: colors.textSecondary }}>
          As your calendar fills with events, your twin will notice patterns in how you structure your time.
        </p>
        <button
          onClick={onConnect}
          className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ backgroundColor: colors.calendarBlue, color: '#fff' }}
        >
          Connect Calendar
        </button>
        <div
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: 'rgba(66, 133, 244, 0.05)',
            color: colors.calendarBlue,
            border: '1px solid rgba(66, 133, 244, 0.2)',
          }}
        >
          <div aria-hidden="true" className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: colors.calendarBlue }} />
          Your twin is collecting data... check back soon
        </div>
      </GlassPanel>

      <div aria-hidden="true" className="opacity-50 pointer-events-none space-y-3">
        <p className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
          Preview of your insights
        </p>
        <GlassPanel className="!p-4" style={{ border: '1px dashed' }}>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4" style={{ color: colors.textSecondary }} />
            <span className="text-sm" style={{ color: colors.textSecondary }}>Today's Schedule</span>
          </div>
          <div className="flex justify-between text-[10px] mb-1" style={{ color: colors.textSecondary }}>
            {['9AM', '12PM', '3PM', '6PM'].map(t => <span key={t}>{t}</span>)}
          </div>
          <div className="h-8 rounded-lg flex gap-1 overflow-hidden animate-pulse" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}>
            <div className="h-full rounded" style={{ width: '20%', marginLeft: '10%', backgroundColor: `${colors.calendarBlue}30` }} />
            <div className="h-full rounded" style={{ width: '15%', marginLeft: '5%', backgroundColor: 'rgba(52,168,83,0.3)' }} />
            <div className="h-full rounded" style={{ width: '10%', marginLeft: '8%', backgroundColor: 'rgba(251,188,5,0.3)' }} />
          </div>
        </GlassPanel>
        <div className="grid grid-cols-2 gap-3">
          <GlassPanel className="!p-4" style={{ border: '1px dashed' }}>
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4" style={{ color: colors.textSecondary }} />
              <span className="text-sm" style={{ color: colors.textSecondary }}>Time Split</span>
            </div>
            <div className="space-y-2">
              {['Meetings', 'Focus', 'Personal'].map((type, i) => (
                <div key={type} className="flex items-center gap-2">
                  <span className="text-[10px] w-14" style={{ color: colors.textSecondary }}>{type}</span>
                  <div className="flex-1 h-3 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.03)' }}>
                    <div className="h-full rounded" style={{
                      width: `${[55, 30, 15][i]}%`,
                      backgroundColor: [`${colors.calendarBlue}30`, 'rgba(52,168,83,0.3)', 'rgba(147,52,233,0.3)'][i],
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>
          <GlassPanel className="!p-4" style={{ border: '1px dashed' }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4" style={{ color: colors.textSecondary }} />
              <span className="text-sm" style={{ color: colors.textSecondary }}>Busy Hours</span>
            </div>
            <div className="grid grid-cols-5 gap-0.5">
              {Array.from({ length: 25 }).map((_, i) => (
                <div key={i} className="h-3 rounded-sm" style={{
                  backgroundColor: `rgba(0,0,0,${HEATMAP_OPACITIES[i % HEATMAP_OPACITIES.length] * 0.75})`,
                }} />
              ))}
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
};
