import React from 'react';
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
    'rgba(255,255,255,0.04)',
    'rgba(66, 133, 244, 0.3)',
    'rgba(66, 133, 244, 0.6)',
    'rgba(66, 133, 244, 0.9)',
  ];

  return (
    <div
      className="p-4 rounded-lg mb-6"
      style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
    >
      <span
        className="text-[11px] font-medium tracking-widest uppercase block mb-4"
        style={{ color: '#10b77f' }}
      >
        <Clock className="w-4 h-4 inline-block mr-2" />
        Weekly Busy Hours
      </span>
      <div className="overflow-x-auto">
        <div className="min-w-[280px]">
          <div className="flex mb-2">
            <div className="w-10" />
            {['8-10', '10-12', '12-2', '2-4', '4-6'].map(slot => (
              <div
                key={slot}
                className="flex-1 text-center text-xs"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                {slot}
              </div>
            ))}
          </div>
          {heatmap.map((day, dayIndex) => (
            <div key={dayIndex} className="flex items-center mb-1">
              <div
                className="w-10 text-xs"
                style={{ color: 'rgba(255,255,255,0.4)' }}
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
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Free</span>
            <div className="flex gap-1">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className="w-4 h-3 rounded"
                  style={{ backgroundColor: intensityColors[i] }}
                />
              ))}
            </div>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Busy</span>
          </div>
        </div>
      </div>
    </div>
  );
};
