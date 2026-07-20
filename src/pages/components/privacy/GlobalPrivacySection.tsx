/**
 * Global Privacy Section
 *
 * Master privacy slider with preset buttons for quick level changes.
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

// --- Design tokens (shared with parent) ---
const TEXT_PRIMARY = 'var(--foreground)';
// audit-2026-07-03 H1: was rgba(255,255,255,0.4) (3.83:1 on base, worse on the
// glass card) — used for the description, inactive preset labels and the saving
// hint. Token = 7.37:1 on #13121a / 6.38:1 on the 0.06 glass panel.
const TEXT_SECONDARY = 'var(--text-secondary)';
const BORDER_COLOR = 'var(--border-glass)';
const CARD_BG = 'rgba(255,255,255,0.06)';

// Built-in presets used when the DB table is empty
const BUILT_IN_PRESETS = [
  { key: 'hidden', label: 'Hidden', level: 0, color: '#9ca3af' },
  { key: 'minimal', label: 'Minimal', level: 20, color: '#a78bfa' },
  // audit-2026-07-03 H5: #c17e2c dipped to ~4.3:1 as the active chip label on
  // the glass card; #e0871a = 5.86:1 on the 0.06 panel, same copper family.
  { key: 'balanced', label: 'Balanced', level: 50, color: '#e0871a' },
  { key: 'open', label: 'Open', level: 80, color: '#34d399' },
  { key: 'full', label: 'Full', level: 100, color: '#fbbf24' },
];

// --- Types ---
export interface AudiencePreset {
  preset_key?: string;
  key?: string;
  name?: string;
  label?: string;
  global_privacy?: number;
  level?: number;
  color?: string;
}

interface GlobalPrivacySectionProps {
  currentGlobal: number;
  presets: AudiencePreset[];
  isUpdating: boolean;
  onSliderChange: (values: number[]) => void;
  onSliderCommit: (values: number[]) => void;
  onPresetApply: (level: number) => void;
}

const GlobalPrivacySection: React.FC<GlobalPrivacySectionProps> = ({
  currentGlobal,
  presets,
  isUpdating,
  onSliderChange,
  onSliderCommit,
  onPresetApply,
}) => (
  <section
    style={{
      background: CARD_BG,
      borderRadius: 20,
      border: '1px solid var(--glass-surface-border)',
      padding: '20px 24px',
      marginBottom: 20,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY, margin: 0 }}>
        Global Privacy
      </h2>
      <span
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: TEXT_PRIMARY,
          fontFamily: "'Instrument Serif', Georgia, serif",
        }}
      >
        {currentGlobal}%
      </span>
    </div>
    <p style={{ fontSize: 12, color: TEXT_SECONDARY, margin: '0 0 16px' }}>
      Master control for all data sharing
    </p>

    <Slider
      value={[currentGlobal]}
      min={0}
      max={100}
      step={5}
      onValueChange={onSliderChange}
      onValueCommit={onSliderCommit}
      style={{ marginBottom: 16 }}
      aria-label="Global privacy level"
    />

    {/* Preset buttons */}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {(presets.length > 0 ? presets : BUILT_IN_PRESETS).map(preset => {
        const key = preset.preset_key
          ?? preset.key
          ?? String(preset.name ?? '');
        const level = preset.global_privacy
          ?? preset.level
          ?? 50;
        const label = preset.name
          ?? preset.label
          ?? key;
        const color = preset.color ?? 'rgba(255,255,255,0.4)';

        return (
          <button
            key={key}
            onClick={() => onPresetApply(level)}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              border: `1.5px solid ${currentGlobal === level ? color : BORDER_COLOR}`,
              background: currentGlobal === level ? `${color}15` : 'transparent',
              fontSize: 12,
              fontWeight: 600,
              color: currentGlobal === level ? color : TEXT_SECONDARY,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>

    {isUpdating && (
      <p style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
        Saving...
      </p>
    )}
  </section>
);

export default GlobalPrivacySection;
