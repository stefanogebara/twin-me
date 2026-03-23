import React from 'react';
import {
  EXPERT_FILTERS,
  TYPE_FILTERS,
  SORT_OPTIONS,
} from './brainConstants';

interface MemoryFiltersProps {
  activeExpert: string | null;
  activeType: string | null;
  sort: 'newest' | 'importance' | 'accessed';
  onExpertChange: (key: string | null) => void;
  onTypeChange: (key: string | null) => void;
  onSortChange: (key: 'newest' | 'importance' | 'accessed') => void;
}

const MemoryFilters: React.FC<MemoryFiltersProps> = ({
  activeExpert,
  activeType,
  sort,
  onExpertChange,
  onTypeChange,
  onSortChange,
}) => {
  return (
    <div className="mb-8 space-y-3">
      {/* Row 1: Expert domains */}
      <div className="flex flex-wrap gap-1.5">
        {EXPERT_FILTERS.map(({ key, label }) => {
          const isActive = activeExpert === key;
          return (
            <button
              key={label}
              onClick={() => onExpertChange(key)}
              className="rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer transition-all"
              style={{
                background: isActive ? 'rgba(232,224,212,0.12)' : 'transparent',
                color: isActive ? 'var(--accent-vibrant)' : '#86807b',
                border: 'none',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Row 2: Memory types + Sort (right-aligned) */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map(({ key, label, color }) => {
            const isActive = activeType === key;
            return (
              <button
                key={label}
                onClick={() => onTypeChange(key)}
                className="rounded-full px-3 py-1.5 text-[11px] font-medium cursor-pointer transition-all inline-flex items-center gap-1.5"
                style={{
                  background: isActive ? 'rgba(232,224,212,0.12)' : 'transparent',
                  color: isActive ? 'var(--accent-vibrant)' : '#86807b',
                  border: 'none',
                }}
              >
                {key && (
                  <span
                    className="inline-block flex-shrink-0 rounded-full"
                    style={{ width: '6px', height: '6px', backgroundColor: color }}
                  />
                )}
                {label}
              </button>
            );
          })}
        </div>

        {/* Sort buttons */}
        <div className="flex gap-1">
          {SORT_OPTIONS.map(({ key, label }) => {
            const isActive = sort === key;
            return (
              <button
                key={key}
                onClick={() => onSortChange(key as 'newest' | 'importance' | 'accessed')}
                className="px-2 py-1 text-[11px] font-medium transition-colors"
                style={{
                  color: isActive ? 'var(--accent-vibrant)' : '#86807b',
                  background: 'transparent',
                  border: 'none',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MemoryFilters;
