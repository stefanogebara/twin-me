/**
 * Global Privacy Section
 *
 * Master privacy slider with 32/4 preset choices for quick level changes.
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Section, List } from '@/components/register';

// Built-in presets used when the DB table is empty
const BUILT_IN_PRESETS = [
  { key: 'hidden', label: 'Hidden', level: 0 },
  { key: 'minimal', label: 'Minimal', level: 20 },
  { key: 'balanced', label: 'Balanced', level: 50 },
  { key: 'open', label: 'Open', level: 80 },
  { key: 'full', label: 'Full', level: 100 },
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
  <Section title="Overall level" line="How much your twin shares by default.">
    <List label="Overall level">
      <li className="rs-level">
        <div className="rs-level-head">
          <span className="rs-strong">Shared</span>
          <span className="rs-figure">{currentGlobal}%</span>
        </div>

        <Slider
          value={[currentGlobal]}
          min={0}
          max={100}
          step={5}
          onValueChange={onSliderChange}
          onValueCommit={onSliderCommit}
          className="rs-slider"
          aria-label="Global privacy level"
        />

        {/* Preset choices: pressed is the field with an ink line */}
        <div className="rs-choices" role="group" aria-label="Presets">
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

            return (
              <button
                key={key}
                type="button"
                onClick={() => onPresetApply(level)}
                aria-pressed={currentGlobal === level}
                className="n-btn n-btn--ghost rs-choice"
              >
                {label}
              </button>
            );
          })}
        </div>

        {isUpdating && (
          <p className="rs-quiet" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Saving
          </p>
        )}
      </li>
    </List>
  </Section>
);

export default GlobalPrivacySection;
