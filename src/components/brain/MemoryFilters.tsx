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

/* The register's choices: 32 tall, a 4 corner, 13px ink on white with a
   hairline. A pressed choice is the field with an ink line (state, not a second
   primary). Was rounded-full pills in #86807b at 11-12px (3.74:1). */
const choice = (pressed: boolean): React.CSSProperties =>
  pressed ? { background: 'var(--rg-field)', borderColor: 'var(--rg-ink)', fontWeight: 500 } : {};

const MemoryFilters: React.FC<MemoryFiltersProps> = ({
  activeExpert,
  activeType,
  sort,
  onExpertChange,
  onTypeChange,
  onSortChange,
}) => {
  return (
    <div className="space-y-2" style={{ marginBottom: 'var(--rg-section)' }}>
      {/* Row 1: Expert domains */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Part of your life">
        {EXPERT_FILTERS.map(({ key, label }) => {
          const isActive = activeExpert === key;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onExpertChange(key)}
              className="n-btn n-btn--ghost"
              style={choice(isActive)}
              aria-pressed={isActive}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Row 2: Memory types, each with its colour as a dot */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Kind of memory">
        {TYPE_FILTERS.map(({ key, label, color }) => {
          const isActive = activeType === key;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onTypeChange(key)}
              className="n-btn n-btn--ghost"
              style={choice(isActive)}
              aria-pressed={isActive}
            >
              {key && (
                <span
                  aria-hidden="true"
                  className="inline-block flex-shrink-0 rounded-full"
                  style={{ width: '8px', height: '8px', backgroundColor: color }}
                />
              )}
              {label}
            </button>
          );
        })}
      </div>

      {/* Row 3: Sort */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sort">
        {SORT_OPTIONS.map(({ key, label }) => {
          const isActive = sort === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSortChange(key as 'newest' | 'importance' | 'accessed')}
              className="n-btn n-btn--ghost"
              style={choice(isActive)}
              aria-pressed={isActive}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MemoryFilters;
