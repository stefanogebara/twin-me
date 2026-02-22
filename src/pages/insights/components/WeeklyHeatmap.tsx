import React from 'react';
import { GlassPanel } from '@/components/layout/PageLayout';
import { Clock } from 'lucide-react';

interface WeeklyHeatmapDay {
  day: string;
  slots: Array<{ slot: string; intensity: number }>;
}

interface WeeklyHeatmapProps {
  heatmap: WeeklyHeatmapDay[];
  theme?: string;
  colors: {
    textSecondary: string;
  };
}

export const WeeklyHeatmap: React.FC<WeeklyHeatmapProps> = ({ heatmap, colors }) => {
  const intensityColors = [
    'rgba(0,0,0,0.05)',
    'rgba(66, 133, 244, 0.3)',
    'rgba(66, 133, 244, 0.6)',
    'rgba(66, 133, 244, 0.9)',
  ];

  return (
    <GlassPanel className="!p-4 mb-6">
      <h3
        className="text-sm uppercase tracking-wider mb-4 flex items-center gap-2"
        style={{ color: colors.textSecondary }}
      >
        <Clock className="w-4 h-4" />
        Weekly Busy Hours
      </h3>
      <div className="overflow-x-auto">
        <div className="min-w-[280px]">
          <div className="flex mb-2">
            <div className="w-10" />
            {['8-10', '10-12', '12-2', '2-4', '4-6'].map(slot => (
              <div
                key={slot}
                className="flex-1 text-center text-xs"
                style={{ color: colors.textSecondary }}
              >
                {slot}
              </div>
            ))}
          </div>
          {heatmap.map((day, dayIndex) => (
            <div key={dayIndex} className="flex items-center mb-1">
              <div
                className="w-10 text-xs"
                style={{ color: colors.textSecondary }}
              >
                {day.day}
              </div>
              {(day.slots || []).map((slot, slotIndex) => (
                <div
                  key={slotIndex}
                  className="flex-1 h-6 rounded mx-0.5"
                  style={{ backgroundColor: intensityColors[slot.intensity] }}
                  title={`${day.day} ${slot.slot}: ${['Free', 'Light', 'Moderate', 'Busy'][slot.intensity]}`}
                />
              ))}
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 mt-3">
            <span className="text-xs" style={{ color: colors.textSecondary }}>Free</span>
            <div className="flex gap-1">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className="w-4 h-3 rounded"
                  style={{ backgroundColor: intensityColors[i] }}
                />
              ))}
            </div>
            <span className="text-xs" style={{ color: colors.textSecondary }}>Busy</span>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
};
