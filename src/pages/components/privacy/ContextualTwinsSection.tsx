/**
 * Contextual Twins Section
 *
 * Displays a grid of twin buttons allowing the user to activate/deactivate
 * contextual twins (professional, social, dating, etc.).
 */

import React from 'react';
import {
  Briefcase,
  Users,
  Heart,
  Globe,
  Sparkles,
} from 'lucide-react';

// --- Design tokens (shared with parent) ---
const TEXT_PRIMARY = 'var(--foreground)';
const TEXT_SECONDARY = 'rgba(255,255,255,0.4)';
const BORDER_COLOR = 'var(--border-glass)';
const CARD_BG = 'rgba(255,255,255,0.02)';

const TWIN_ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  professional: Briefcase,
  social: Users,
  dating: Heart,
  public: Globe,
  custom: Sparkles,
};

const TWIN_COLORS: Record<string, string> = {
  professional: '#60a5fa',
  social: '#34d399',
  dating: '#f472b6',
  public: '#9ca3af',
  custom: '#a78bfa',
};

// --- Types ---
export interface ContextualTwin {
  id: string;
  name: string;
  twin_type: string;
  color?: string;
  isActive: boolean;
}

interface ContextualTwinsSectionProps {
  twins: ContextualTwin[];
  activeTwinId: string | undefined;
  activeTwinName: string | undefined;
  onActivateTwin: (twinId: string) => void;
}

const ContextualTwinsSection: React.FC<ContextualTwinsSectionProps> = ({
  twins,
  activeTwinId,
  activeTwinName,
  onActivateTwin,
}) => (
  <section
    style={{
      background: CARD_BG,
      borderRadius: 16,
      border: `1px solid ${BORDER_COLOR}`,
      padding: '20px 24px',
      marginBottom: 20,
    }}
  >
    <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY, margin: '0 0 4px' }}>
      Contextual Twins
    </h2>
    <p style={{ fontSize: 12, color: TEXT_SECONDARY, margin: '0 0 16px' }}>
      Choose which version of yourself to present
    </p>

    {twins.length === 0 ? (
      <p style={{ fontSize: 13, color: TEXT_SECONDARY, fontStyle: 'italic' }}>
        No contextual twins configured yet.
      </p>
    ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {twins.map(twin => {
          const IconComponent = TWIN_ICONS[twin.twin_type] ?? Sparkles;
          const twinColor = twin.color ?? TWIN_COLORS[twin.twin_type] ?? 'rgba(255,255,255,0.4)';
          const isActive = twin.isActive;

          return (
            <button
              key={twin.id}
              onClick={() => onActivateTwin(twin.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '14px 10px',
                borderRadius: 12,
                border: `1.5px solid ${isActive ? twinColor : BORDER_COLOR}`,
                background: isActive ? `${twinColor}12` : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative',
              }}
            >
              {isActive && (
                <span
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: twinColor,
                  }}
                />
              )}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `${twinColor}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: twinColor,
                }}
              >
                <IconComponent size={18} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? twinColor : TEXT_PRIMARY }}>
                {twin.name}
              </span>
            </button>
          );
        })}
      </div>
    )}

    {activeTwinId && (
      <p style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 12, fontStyle: 'italic' }}>
        Active: {activeTwinName} — click again to deactivate
      </p>
    )}
  </section>
);

export default ContextualTwinsSection;
