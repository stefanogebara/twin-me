import React from 'react';
import { Brain, Sparkles, RefreshCw, ExternalLink, Info } from 'lucide-react';
import { GlassPanel } from '@/components/layout/PageLayout';
import { type KnowledgeGapsData, type LearningSuggestion } from '@/components/brain/BrainNodeRenderer';
import { useBrainThemeColors } from './BrainTheme';
import { SectionHeader } from './SectionHeader';

export const LearningSuggestionsPanel: React.FC<{
  suggestions: LearningSuggestion[];
  knowledgeGaps: KnowledgeGapsData | null;
  onSuggestionClick: (suggestion: LearningSuggestion) => void;
}> = ({ suggestions, knowledgeGaps, onSuggestionClick }) => {
  const { textColor, textSecondary, textMuted } = useBrainThemeColors();

  if (suggestions.length === 0) return null;

  return (
    <GlassPanel className="!p-5">
      <SectionHeader title="Learning Opportunities" icon={Sparkles} />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {suggestions.slice(0, 6).map((suggestion, index) => {
          const priorityColors = {
            high: { bg: 'rgba(214, 48, 49, 0.1)', border: 'rgba(214, 48, 49, 0.3)', text: '#D63031' },
            medium: { bg: 'rgba(253, 203, 110, 0.1)', border: 'rgba(253, 203, 110, 0.3)', text: '#FDCB6E' },
            low: { bg: 'rgba(0, 184, 148, 0.1)', border: 'rgba(0, 184, 148, 0.3)', text: '#00B894' }
          };
          const colors = priorityColors[suggestion.priority];

          const typeIcons = {
            connect_platform: ExternalLink,
            refresh_knowledge: RefreshCw,
            generate_abstraction: Brain,
            answer_questions: Info
          };
          const Icon = typeIcons[suggestion.type] || Sparkles;

          return (
            <div
              key={index}
              className="p-4 rounded-xl transition-all hover:scale-[1.02] cursor-pointer"
              style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}
              onClick={() => onSuggestionClick(suggestion)}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: colors.border }}
                >
                  <Icon className="w-4 h-4" style={{ color: colors.text }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1">
                    <h4 className="font-medium text-sm leading-tight" style={{ color: textColor }}>
                      {suggestion.title}
                    </h4>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0"
                      style={{ backgroundColor: colors.border, color: colors.text }}
                    >
                      {suggestion.priority}
                    </span>
                  </div>
                  <p className="text-xs line-clamp-2" style={{ color: textSecondary }}>
                    {suggestion.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {knowledgeGaps && (
        <div className="mt-4 flex items-center gap-4 text-xs" style={{ color: textMuted }}>
          <span>Knowledge Gap Score: <strong style={{ color: knowledgeGaps.gapLevel === 'high' ? '#D63031' : knowledgeGaps.gapLevel === 'medium' ? '#FDCB6E' : '#00B894' }}>
            {knowledgeGaps.gapScore}
          </strong></span>
          <span>&bull;</span>
          <span>Missing categories: {knowledgeGaps.summary.categoryGaps}</span>
          <span>&bull;</span>
          <span>Stale nodes: {knowledgeGaps.summary.staleKnowledge}</span>
        </div>
      )}
    </GlassPanel>
  );
};
