/**
 * Contextual Twins Section
 *
 * One row per contextual twin (professional, social, dating, etc.), each with a
 * 32/4 choice that activates it; choosing the active one again deactivates it.
 */

import React from 'react';
import {
  Briefcase,
  Users,
  Heart,
  Globe,
  Sparkles,
} from 'lucide-react';
import { Section, List, Row, Empty } from '@/components/register';

const TWIN_ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  professional: Briefcase,
  social: Users,
  dating: Heart,
  public: Globe,
  custom: Sparkles,
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
  <Section
    title="Contextual twins"
    line={activeTwinId
      ? `Your twin is showing your ${activeTwinName} side. Choose it again to stop.`
      : 'Which side of you your twin shows.'}
  >
    <List label="Contextual twins" className="rg-compact">
      {twins.length === 0 ? (
        <li><Empty>No contextual twins yet.</Empty></li>
      ) : (
        twins.map(twin => {
          const IconComponent = TWIN_ICONS[twin.twin_type] ?? Sparkles;
          return (
            <Row
              key={twin.id}
              icon={<IconComponent />}
              title={twin.name}
              line={twin.isActive ? <span className="rs-ok">In use</span> : undefined}
              action={
                <button
                  type="button"
                  onClick={() => onActivateTwin(twin.id)}
                  aria-pressed={twin.isActive}
                  aria-label={`Use the ${twin.name} twin`}
                  className="n-btn n-btn--ghost rg-choice"
                >
                  Use
                </button>
              }
            />
          );
        })
      )}
    </List>
  </Section>
);

export default ContextualTwinsSection;
