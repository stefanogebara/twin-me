/**
 * EvidenceSection Component
 *
 * "How I noticed this": one row under the reflection that opens into a
 * sub-row per piece of evidence and its data points. Closed by default.
 * Renders list items, so it goes inside TwinReflection's list.
 */

import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { SubRow } from '@/components/register';

interface EvidenceItem {
  id: string;
  observation: string;
  dataPoints: string[];
  confidence: 'high' | 'medium' | 'low';
}

interface CrossPlatformContext {
  lifeContext?: {
    isOnVacation?: boolean;
    vacationTitle?: string;
    daysRemaining?: number;
  };
  recovery?: number;
  calendarDensity?: string;
}

interface EvidenceSectionProps {
  evidence: EvidenceItem[];
  crossPlatformContext?: CrossPlatformContext | null;
  className?: string;
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'High confidence',
  medium: 'Medium',
  low: 'Emerging',
};

export const EvidenceSection: React.FC<EvidenceSectionProps> = ({
  evidence,
  crossPlatformContext,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Don't render if no evidence
  if (!evidence || evidence.length === 0) {
    return null;
  }

  const life = crossPlatformContext?.lifeContext;
  const context = [
    life?.isOnVacation
      ? `${life.vacationTitle || 'On vacation'}${life.daysRemaining ? ` (${life.daysRemaining}d left)` : ''}`
      : null,
    crossPlatformContext?.recovery ? `Recovery ${crossPlatformContext.recovery}%` : null,
    crossPlatformContext?.calendarDensity ? `${crossPlatformContext.calendarDensity} schedule` : null,
  ].filter(Boolean);

  const Chevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <>
      <li>
        <button
          type="button"
          className="rg-row rg-row--plain rg-row--link"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(open => !open)}
        >
          <span className="rg-row-text">
            <span className="rg-row-title">How I noticed this</span>
            <span className="rg-row-line">
              {evidence.length} {evidence.length === 1 ? 'signal' : 'signals'}
            </span>
          </span>
          <span className="rg-row-action">
            <Chevron className="rg-chevron" aria-hidden="true" />
          </span>
        </button>
      </li>
      {/* Cross-platform context: what else was going on, one line */}
      {isOpen && context.length > 0 && (
        <SubRow>
          <span className="rg-row-line">{context.join(' · ')}</span>
        </SubRow>
      )}
      {isOpen &&
        evidence.map((item, index) => (
          <SubRow key={item.id || index} action={<span className="ri-end">{CONFIDENCE_LABEL[item.confidence] ?? CONFIDENCE_LABEL.low}</span>}>
            <span className="rg-row-title">{item.observation}</span>
            {item.dataPoints && item.dataPoints.length > 0 ? (
              <span className="rg-row-line">{item.dataPoints.join(' · ')}</span>
            ) : null}
          </SubRow>
        ))}
    </>
  );
};

export default EvidenceSection;
