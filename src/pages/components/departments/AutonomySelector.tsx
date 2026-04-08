/**
 * AutonomySelector
 *
 * 5-level segmented "trust dial" for department autonomy.
 * Levels: 0=Observe, 1=Suggest, 2=Draft, 3=Act, 4=Auto
 * Active segment gets the department color as background.
 */

import React, { useState } from 'react';

interface AutonomySelectorProps {
  level: number;
  color: string;
  onChange: (level: number) => void;
  disabled?: boolean;
}

const LEVEL_LABELS: Record<number, string> = {
  0: 'Observe',
  1: 'Suggest',
  2: 'Draft',
  3: 'Act',
  4: 'Auto',
};

const AutonomySelector: React.FC<AutonomySelectorProps> = ({
  level,
  color,
  onChange,
  disabled = false,
}) => {
  const [hoveredLevel, setHoveredLevel] = useState<number | null>(null);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-[3px]">
        {[0, 1, 2, 3, 4].map((lvl) => {
          const isActive = lvl === level;
          return (
            <button
              key={lvl}
              onClick={() => !disabled && onChange(lvl)}
              onMouseEnter={() => setHoveredLevel(lvl)}
              onMouseLeave={() => setHoveredLevel(null)}
              disabled={disabled}
              className="relative w-7 h-6 text-[10px] font-medium transition-all duration-150 ease-out"
              style={{
                borderRadius: lvl === 0 ? '6px 2px 2px 6px' : lvl === 4 ? '2px 6px 6px 2px' : '2px',
                backgroundColor: isActive ? color : 'rgba(255,255,255,0.06)',
                color: isActive ? '#110f0f' : 'rgba(255,255,255,0.4)',
                border: isActive
                  ? `1px solid ${color}`
                  : '1px solid rgba(255,255,255,0.08)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.4 : 1,
              }}
              aria-label={`Set autonomy to ${LEVEL_LABELS[lvl]}`}
            >
              {lvl}
            </button>
          );
        })}
      </div>
      <span
        className="text-[10px] block"
        style={{
          color: 'rgba(255,255,255,0.35)',
          fontFamily: "'Inter', sans-serif",
          minHeight: '14px',
        }}
      >
        {LEVEL_LABELS[hoveredLevel ?? level]}
      </span>
    </div>
  );
};

export default AutonomySelector;
