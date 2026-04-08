/**
 * AutonomySelector
 *
 * Compact dropdown-style selector for department autonomy level.
 * Levels: 0=Observe, 1=Suggest, 2=Draft, 3=Act, 4=Auto
 */

import React, { useState, useRef, useEffect } from 'react';

interface AutonomySelectorProps {
  level: number;
  color: string;
  onChange: (level: number) => void;
  disabled?: boolean;
  /** Compact inline mode: just shows the label text, click to open dropdown */
  compact?: boolean;
}

const LEVEL_LABELS: Record<number, string> = {
  0: 'Observe',
  1: 'Suggest',
  2: 'Draft',
  3: 'Act',
  4: 'Auto',
};

const LEVEL_DESCRIPTIONS: Record<number, string> = {
  0: 'Watches and learns, never acts',
  1: 'Suggests actions in chat for you to decide',
  2: 'Prepares drafts, waits for your approval',
  3: 'Acts on your behalf, then notifies you',
  4: 'Acts silently, surfaces outcomes only',
};

const AutonomySelector: React.FC<AutonomySelectorProps> = ({
  level,
  color,
  onChange,
  disabled = false,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (compact) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          disabled={disabled}
          className="flex items-center gap-1 text-[11px] transition-colors duration-150"
          style={{
            color: 'rgba(255,255,255,0.4)',
            fontFamily: "'Inter', sans-serif",
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.4 : 1,
            background: 'none',
            border: 'none',
            padding: 0,
          }}
        >
          {LEVEL_LABELS[level]}
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ opacity: 0.5 }}>
            <path d="M2 3L4 5L6 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {isOpen && (
          <div
            className="absolute top-full right-0 mt-1 z-50 py-1"
            style={{
              background: 'rgba(30,28,35,0.95)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: '10px',
              minWidth: '220px',
            }}
          >
            {[0, 1, 2, 3, 4].map((lvl) => {
              const isActive = lvl === level;
              return (
                <button
                  key={lvl}
                  onClick={() => {
                    onChange(lvl);
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-[11px] transition-colors duration-100 flex items-center gap-2"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    color: isActive ? color : 'rgba(255,255,255,0.5)',
                    background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span
                    className="w-1 h-1 rounded-full flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: isActive ? color : 'transparent' }}
                  />
                  <span>
                    <span className="block">{LEVEL_LABELS[lvl]}</span>
                    <span className="block text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {LEVEL_DESCRIPTIONS[lvl]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Expanded mode: subtle segmented text buttons (shown when card is expanded)
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2, 3, 4].map((lvl) => {
        const isActive = lvl === level;
        return (
          <button
            key={lvl}
            onClick={() => !disabled && onChange(lvl)}
            disabled={disabled}
            className="px-2 py-1 text-[10px] font-medium transition-all duration-150 rounded-md"
            style={{
              backgroundColor: isActive ? `${color}18` : 'transparent',
              color: isActive ? color : 'rgba(255,255,255,0.3)',
              border: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.4 : 1,
              fontFamily: "'Inter', sans-serif",
            }}
            aria-label={`Set autonomy to ${LEVEL_LABELS[lvl]}`}
          >
            {LEVEL_LABELS[lvl]}
          </button>
        );
      })}
    </div>
  );
};

export default AutonomySelector;
