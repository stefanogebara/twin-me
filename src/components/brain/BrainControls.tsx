/**
 * Brain Controls Component
 *
 * Search, filter, zoom, context selector, legend, and stats UI elements
 * for the Brain Explorer visualization.
 */

import React from 'react';
import {
  Brain,
  Sparkles,
  RefreshCw,
  Zap,
  Network,
  Eye,
  Maximize2,
  Minimize2,
  TrendingUp,
  Activity,
  Layers,
  Info,
  ExternalLink,
  GitBranch,
  Users
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { GlassPanel } from '@/components/layout/PageLayout';
import {
  type BrainHealth,
  type VisualizationData,
  type KnowledgeGapsData,
  type LearningSuggestion,
  CATEGORY_CONFIG,
  CONTEXT_CONFIG,
} from '@/components/brain/BrainNodeRenderer';

// ─── Theme Colors Hook ─────────────────────────────────────────

export function useBrainThemeColors() {
  const { theme } = useTheme();

  const textColor = theme === 'dark' ? '#C1C0B6' : '#0c0a09';
  const textSecondary = theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e';
  const textMuted = theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c';
  const textFaint = theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e';
  const subtleBg = theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)';
  const bgColor = theme === 'dark' ? '#1a1a1a' : '#f8f8f8';

  return { theme, textColor, textSecondary, textMuted, textFaint, subtleBg, bgColor };
}

// ─── Section Header ────────────────────────────────────────────

export const SectionHeader: React.FC<{ title: string; icon?: React.ElementType }> = ({ title, icon: Icon }) => {
  const { theme, textMuted } = useBrainThemeColors();
  return (
    <div className="flex items-center gap-2 mb-4">
      <div
        className="w-1 h-5 rounded-full"
        style={{
          background: theme === 'dark'
            ? 'linear-gradient(to bottom, rgba(193, 192, 182, 0.6), rgba(193, 192, 182, 0.2))'
            : 'linear-gradient(to bottom, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.1))'
        }}
      />
      {Icon && <Icon className="w-4 h-4" style={{ color: textMuted }} />}
      <h3
        className="text-sm uppercase tracking-wider"
        style={{ color: textMuted }}
      >
        {title}
      </h3>
    </div>
  );
};

// ─── Stats Row ─────────────────────────────────────────────────

export const BrainStatsRow: React.FC<{
  health: BrainHealth | null;
  visualization: VisualizationData | null;
}> = ({ health, visualization }) => {
  const { textColor, textMuted } = useBrainThemeColors();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <GlassPanel className="!p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(78, 205, 196, 0.1)'
          }}>
            <Network className="w-5 h-5" style={{ color: '#4ECDC4' }} />
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: textColor }}>
              {health?.total_nodes || 0}
            </div>
            <div className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>
              Knowledge Nodes
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="!p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(69, 183, 209, 0.1)'
          }}>
            <Zap className="w-5 h-5" style={{ color: '#45B7D1' }} />
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: textColor }}>
              {health?.total_edges || 0}
            </div>
            <div className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>
              Connections
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="!p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(150, 206, 180, 0.1)'
          }}>
            <TrendingUp className="w-5 h-5" style={{ color: '#96CEB4' }} />
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: textColor }}>
              {Math.round((health?.avg_confidence || 0) * 100)}%
            </div>
            <div className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>
              Avg Confidence
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="!p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(221, 160, 221, 0.1)'
          }}>
            <Layers className="w-5 h-5" style={{ color: '#DDA0DD' }} />
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: textColor }}>
              {visualization?.clusters.length || 0}
            </div>
            <div className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>
              Categories
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
};

// ─── Causal Stats Panel ────────────────────────────────────────

export const CausalStatsPanel: React.FC<{
  visualization: VisualizationData | null;
}> = ({ visualization }) => {
  const { textColor, textMuted } = useBrainThemeColors();

  if (!visualization?.stats?.causal ||
      (visualization.stats.causal.causalEdges === 0 && visualization.stats.causal.correlationalEdges === 0)) {
    return null;
  }

  return (
    <GlassPanel className="!p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4" style={{ color: '#E74C3C' }} />
          <span className="text-sm font-medium" style={{ color: textColor }}>Relationship Types</span>
        </div>
        <span className="text-xs px-2 py-1 rounded-lg" style={{
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          color: '#E74C3C'
        }}>
          {Math.round(visualization.stats.causal.causalRatio * 100)}% causal
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(231, 76, 60, 0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#E74C3C' }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Causal</span>
          </div>
          <div className="text-xl font-bold" style={{ color: '#E74C3C' }}>
            {visualization.stats.causal.causalEdges}
          </div>
          <div className="text-xs mt-1" style={{ color: textMuted }}>
            cause &rarr; effect
          </div>
        </div>
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(108, 92, 231, 0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6C5CE7' }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Correlational</span>
          </div>
          <div className="text-xl font-bold" style={{ color: '#6C5CE7' }}>
            {visualization.stats.causal.correlationalEdges}
          </div>
          <div className="text-xs mt-1" style={{ color: textMuted }}>
            co-occurrence
          </div>
        </div>
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(150, 206, 180, 0.08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#96CEB4' }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: textMuted }}>Other</span>
          </div>
          <div className="text-xl font-bold" style={{ color: '#96CEB4' }}>
            {visualization.stats.causal.otherEdges}
          </div>
          <div className="text-xs mt-1" style={{ color: textMuted }}>
            structural
          </div>
        </div>
      </div>
    </GlassPanel>
  );
};

// ─── Learning Suggestions ──────────────────────────────────────

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

// ─── Category Filters ──────────────────────────────────────────

export const CategoryFilters: React.FC<{
  visualization: VisualizationData | null;
  filterCategory: string | null;
  setFilterCategory: (cat: string | null) => void;
}> = ({ visualization, filterCategory, setFilterCategory }) => {
  const { textColor, textMuted, subtleBg } = useBrainThemeColors();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setFilterCategory(null)}
        className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] flex items-center gap-2"
        style={{
          backgroundColor: !filterCategory ? 'rgba(193, 192, 182, 0.2)' : subtleBg,
          color: !filterCategory ? textColor : textMuted,
          border: !filterCategory ? '1px solid rgba(193, 192, 182, 0.3)' : '1px solid transparent'
        }}
      >
        <Eye className="w-4 h-4" />
        All Categories
      </button>
      {visualization?.clusters.map(cluster => {
        const config = CATEGORY_CONFIG[cluster.id] || CATEGORY_CONFIG.personal;
        const Icon = config.icon;
        const isActive = filterCategory === cluster.id;

        return (
          <button
            key={cluster.id}
            onClick={() => setFilterCategory(isActive ? null : cluster.id)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] flex items-center gap-2"
            style={{
              backgroundColor: isActive ? `${config.color}20` : subtleBg,
              color: isActive ? config.color : textMuted,
              border: isActive ? `1px solid ${config.color}40` : '1px solid transparent'
            }}
          >
            <Icon className="w-4 h-4" />
            {cluster.label}
            <span className="text-xs opacity-70">({cluster.nodeCount})</span>
          </button>
        );
      })}
    </div>
  );
};

// ─── Context Selector ──────────────────────────────────────────

export const ContextSelector: React.FC<{
  selectedContext: string;
  setSelectedContext: (ctx: string) => void;
}> = ({ selectedContext, setSelectedContext }) => {
  const { textColor, textMuted } = useBrainThemeColors();

  return (
    <GlassPanel className="!p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4" style={{ color: CONTEXT_CONFIG[selectedContext]?.color || '#6C5CE7' }} />
          <span className="text-sm font-medium" style={{ color: textColor }}>Personality Context</span>
        </div>
        <span className="text-xs px-2 py-1 rounded-lg" style={{
          backgroundColor: `${CONTEXT_CONFIG[selectedContext]?.color || '#6C5CE7'}20`,
          color: CONTEXT_CONFIG[selectedContext]?.color || '#6C5CE7'
        }}>
          {CONTEXT_CONFIG[selectedContext]?.label || 'Global'} View
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: textMuted }}>
        Your personality may express differently in various contexts. Select a context to see how your traits vary.
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(CONTEXT_CONFIG).map(([contextId, config]) => {
          const Icon = config.icon;
          const isActive = selectedContext === contextId;
          return (
            <button
              key={contextId}
              onClick={() => setSelectedContext(contextId)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.02] flex items-center gap-1.5"
              style={{
                backgroundColor: isActive ? `${config.color}20` : 'rgba(193, 192, 182, 0.05)',
                color: isActive ? config.color : textMuted,
                border: isActive ? `1px solid ${config.color}40` : '1px solid transparent'
              }}
            >
              <Icon className="w-3 h-3" />
              {config.label}
            </button>
          );
        })}
      </div>
    </GlassPanel>
  );
};

// ─── Health Score Header ───────────────────────────────────────

export const BrainHeader: React.FC<{
  health: BrainHealth | null;
  selectedContext: string;
  onRefresh: () => void;
}> = ({ health, selectedContext, onRefresh }) => {
  const { textColor, textSecondary, textMuted, subtleBg } = useBrainThemeColors();
  const healthPercentage = Math.round((health?.health_score || 0) * 100);

  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div>
        <h2
          className="text-3xl md:text-4xl mb-2"
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 400,
            color: textColor
          }}
        >
          Your Twin's Brain
        </h2>
        <p style={{ color: textSecondary }}>
          An immersive 3D map of your interests, patterns, and connections
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <svg className="w-20 h-20 transform -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="36"
              stroke={subtleBg}
              strokeWidth="6"
              fill="none"
            />
            <circle
              cx="40"
              cy="40"
              r="36"
              stroke={healthPercentage > 70 ? '#4ECDC4' : healthPercentage > 40 ? '#FFEAA7' : '#FF6B6B'}
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${healthPercentage * 2.26} 226`}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold" style={{ color: textColor }}>{healthPercentage}%</span>
            <span className="text-[10px] uppercase tracking-wider" style={{ color: textMuted }}>Health</span>
          </div>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-[1.02]"
          style={{ backgroundColor: subtleBg, color: textColor }}
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>
    </div>
  );
};

// ─── Fullscreen Toggle ─────────────────────────────────────────

export const FullscreenToggle: React.FC<{
  isFullscreen: boolean;
  onToggle: () => void;
}> = ({ isFullscreen, onToggle }) => {
  const { textColor, subtleBg } = useBrainThemeColors();

  return (
    <button
      onClick={onToggle}
      className="absolute top-4 right-4 z-10 p-2 rounded-lg transition-all hover:scale-110"
      style={{ backgroundColor: subtleBg, color: textColor }}
      title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
    </button>
  );
};

// ─── Graph Instructions ────────────────────────────────────────

export const GraphInstructions: React.FC = () => {
  const { textMuted, subtleBg } = useBrainThemeColors();

  return (
    <div
      className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
      style={{ backgroundColor: subtleBg, color: textMuted }}
    >
      <Info className="w-3 h-3" />
      <span>Drag to rotate &bull; Scroll to zoom &bull; Click nodes for details</span>
    </div>
  );
};

// ─── Category Distribution ─────────────────────────────────────

export const CategoryDistribution: React.FC<{
  health: BrainHealth | null;
  filterCategory: string | null;
  setFilterCategory: (cat: string | null) => void;
}> = ({ health, filterCategory, setFilterCategory }) => {
  const { textColor, textMuted, textFaint } = useBrainThemeColors();

  if (!health?.category_distribution || Object.keys(health.category_distribution).length === 0) {
    return null;
  }

  return (
    <GlassPanel className="!p-5">
      <SectionHeader title="Knowledge Distribution" icon={Activity} />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Object.entries(health.category_distribution).map(([category, count]) => {
          const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.personal;
          const Icon = config.icon;
          const percentage = Math.round((count / (health?.total_nodes || 1)) * 100);

          return (
            <div
              key={category}
              className="p-4 rounded-xl text-center transition-all hover:scale-[1.02] cursor-pointer"
              style={{
                backgroundColor: `${config.color}10`,
                border: `1px solid ${config.color}20`
              }}
              onClick={() => setFilterCategory(filterCategory === category ? null : category)}
            >
              <div
                className="w-10 h-10 rounded-lg mx-auto mb-2 flex items-center justify-center"
                style={{ backgroundColor: `${config.color}20` }}
              >
                <Icon className="w-5 h-5" style={{ color: config.color }} />
              </div>
              <div className="text-xl font-bold" style={{ color: config.color }}>
                {count}
              </div>
              <div className="text-xs capitalize" style={{ color: textMuted }}>
                {category}
              </div>
              <div className="text-xs mt-1" style={{ color: textFaint }}>
                {percentage}%
              </div>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
};

// ─── Understanding Your Brain ──────────────────────────────────

export const UnderstandingSection: React.FC = () => {
  const { textColor, textSecondary } = useBrainThemeColors();

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <GlassPanel className="!p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(78, 205, 196, 0.1)'
          }}>
            <Brain className="w-5 h-5" style={{ color: '#4ECDC4' }} />
          </div>
          <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
            Intrinsic vs Extrinsic
          </h4>
        </div>
        <p className="text-sm" style={{ color: textSecondary }}>
          <span style={{ color: '#4ECDC4' }}>Intrinsic data</span> is directly from your activity (songs played, events attended).{' '}
          <span style={{ color: '#FF6B6B' }}>Extrinsic data</span> is what these patterns reveal about your personality.
        </p>
      </GlassPanel>

      <GlassPanel className="!p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(150, 206, 180, 0.1)'
          }}>
            <TrendingUp className="w-5 h-5" style={{ color: '#96CEB4' }} />
          </div>
          <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
            Confidence Levels
          </h4>
        </div>
        <p className="text-sm" style={{ color: textSecondary }}>
          Confidence is calculated from data frequency, consistency across time, and correlation with other verified traits. Higher confidence = more data points supporting this insight.
        </p>
      </GlassPanel>

      <GlassPanel className="!p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
            backgroundColor: 'rgba(221, 160, 221, 0.1)'
          }}>
            <Sparkles className="w-5 h-5" style={{ color: '#DDA0DD' }} />
          </div>
          <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
            3D Exploration
          </h4>
        </div>
        <p className="text-sm" style={{ color: textSecondary }}>
          Nodes closer together share stronger connections. Particle streams show active relationships. Click any node to dive deeper into what your AI twin has learned about you.
        </p>
      </GlassPanel>
    </div>
  );
};
