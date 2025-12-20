/**
 * EvidenceSection Component
 *
 * Collapsible "How I noticed this" section that shows the evidence
 * and reasoning behind the twin's observations.
 *
 * Hidden by default - user can expand to see data points.
 */

import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { ChevronRight, ChevronDown, Eye, Plane, Activity, Calendar } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

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

export const EvidenceSection: React.FC<EvidenceSectionProps> = ({
  evidence,
  crossPlatformContext,
  className = ''
}) => {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  // Theme-aware colors
  const colors = {
    text: theme === 'dark' ? '#C1C0B6' : '#44403c',
    textMuted: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e',
    textSecondary: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e',
    border: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    bgSubtle: theme === 'dark' ? 'rgba(193, 192, 182, 0.03)' : 'rgba(0, 0, 0, 0.02)',
    confidenceHigh: theme === 'dark' ? '#4ade80' : '#22c55e',
    confidenceMedium: theme === 'dark' ? '#fbbf24' : '#f59e0b',
    confidenceLow: theme === 'dark' ? '#94a3b8' : '#64748b'
  };

  // Don't render if no evidence
  if (!evidence || evidence.length === 0) {
    return null;
  }

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return colors.confidenceHigh;
      case 'medium': return colors.confidenceMedium;
      default: return colors.confidenceLow;
    }
  };

  const hasLifeContext = crossPlatformContext?.lifeContext?.isOnVacation ||
    crossPlatformContext?.recovery ||
    crossPlatformContext?.calendarDensity;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger
        className="flex items-center gap-2 text-sm transition-colors hover:opacity-80 w-full justify-start py-2"
        style={{ color: colors.textMuted }}
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 transition-transform" />
        ) : (
          <ChevronRight className="h-4 w-4 transition-transform" />
        )}
        <Eye className="h-4 w-4" />
        <span>How I noticed this</span>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3">
        <div
          className="rounded-xl p-4 space-y-4"
          style={{
            backgroundColor: colors.bgSubtle,
            border: `1px solid ${colors.border}`
          }}
        >
          {/* Cross-Platform Context Badges */}
          {hasLifeContext && (
            <div className="flex flex-wrap gap-2 pb-3 border-b" style={{ borderColor: colors.border }}>
              {crossPlatformContext?.lifeContext?.isOnVacation && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.1)',
                    color: theme === 'dark' ? '#fbbf24' : '#d97706'
                  }}
                >
                  <Plane className="h-3 w-3" />
                  {crossPlatformContext.lifeContext.vacationTitle || 'On Vacation'}
                  {crossPlatformContext.lifeContext.daysRemaining && (
                    <span className="opacity-75">({crossPlatformContext.lifeContext.daysRemaining}d left)</span>
                  )}
                </span>
              )}

              {crossPlatformContext?.recovery && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(0, 180, 216, 0.15)' : 'rgba(0, 180, 216, 0.1)',
                    color: theme === 'dark' ? '#00B4D8' : '#0284c7'
                  }}
                >
                  <Activity className="h-3 w-3" />
                  Recovery {crossPlatformContext.recovery}%
                </span>
              )}

              {crossPlatformContext?.calendarDensity && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(66, 133, 244, 0.15)' : 'rgba(66, 133, 244, 0.1)',
                    color: theme === 'dark' ? '#4285F4' : '#2563eb'
                  }}
                >
                  <Calendar className="h-3 w-3" />
                  {crossPlatformContext.calendarDensity} schedule
                </span>
              )}
            </div>
          )}

          {/* Evidence Items */}
          <div className="space-y-4">
            {evidence.map((item, index) => (
              <div key={item.id || index}>
                {/* Observation */}
                <div className="flex items-start gap-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                    style={{ backgroundColor: getConfidenceColor(item.confidence) }}
                  />
                  <p
                    className="text-sm font-medium"
                    style={{ color: colors.text }}
                  >
                    {item.observation}
                  </p>
                </div>

                {/* Data Points */}
                {item.dataPoints && item.dataPoints.length > 0 && (
                  <ul className="mt-2 ml-3.5 space-y-1">
                    {item.dataPoints.map((dp, dpIndex) => (
                      <li
                        key={dpIndex}
                        className="text-xs flex items-start gap-2"
                        style={{ color: colors.textSecondary }}
                      >
                        <span className="opacity-50">-</span>
                        {dp}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* Confidence Legend */}
          <div
            className="flex items-center gap-4 pt-3 border-t text-xs"
            style={{ borderColor: colors.border, color: colors.textMuted }}
          >
            <span className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colors.confidenceHigh }}
              />
              High confidence
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colors.confidenceMedium }}
              />
              Medium
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colors.confidenceLow }}
              />
              Emerging pattern
            </span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default EvidenceSection;
