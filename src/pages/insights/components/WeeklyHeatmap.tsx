import React from 'react';

interface WeeklyHeatmapDay {
  day: string;
  slots: Array<{ slot: string; intensity: number }>;
}

interface WeeklyHeatmapProps {
  heatmap: WeeklyHeatmapDay[];
}

const SLOTS = ['8-10', '10-12', '12-2', '2-4', '4-6'];
const LEVELS = ['Free', 'Light', 'Moderate', 'Busy'];

/* A busier slot fills more of its cell, in one hue: height carries the
   intensity, so every level's mark is the same periwinkle at 3.3:1 on the
   page instead of a pale tint no one can see. */
const fill = (intensity: number) => `${Math.max(0, Math.min(3, intensity)) * (100 / 3)}%`;

/** The week's busy hours, as a list item (goes inside a List). */
export const WeeklyHeatmap: React.FC<WeeklyHeatmapProps> = ({ heatmap }) => {
  return (
    <li className="ri-block">
      <div className="ri-heat">
        <span aria-hidden="true" />
        {SLOTS.map(slot => (
          <span key={slot} className="ri-heat-head">{slot}</span>
        ))}
        {heatmap.map((day, dayIndex) => (
          <React.Fragment key={dayIndex}>
            <span>{day.day}</span>
            {(day.slots || []).map((slot, slotIndex) => (
              <span
                key={slotIndex}
                className="ri-cell"
                role="img"
                aria-label={`${day.day} ${slot.slot}: ${LEVELS[slot.intensity] ?? LEVELS[0]}`}
                title={`${day.day} ${slot.slot}: ${LEVELS[slot.intensity] ?? LEVELS[0]}`}
              >
                <i style={{ height: fill(slot.intensity) }} />
              </span>
            ))}
          </React.Fragment>
        ))}
      </div>
      <div className="ri-heat-key" aria-hidden="true">
        <span>Free</span>
        {[0, 1, 2, 3].map(i => (
          <span key={i} className="ri-cell">
            <i style={{ height: fill(i) }} />
          </span>
        ))}
        <span>Busy</span>
      </div>
    </li>
  );
};
