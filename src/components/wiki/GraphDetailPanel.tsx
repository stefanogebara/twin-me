/**
 * GraphDetailPanel -- Right side panel showing selected node content.
 * Three states: overview (no selection), domain content, platform info.
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SelectedNode, DomainNode, PlatformNode, EntityNode, GraphStats } from './graphTypes';
import { DOMAIN_CONFIG, PLATFORM_CONFIG, ENTITY_CATEGORY_CONFIG } from './graphConstants';
import { renderWikiMarkdown } from './wikiMarkdownRenderer';

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

interface GraphDetailPanelProps {
  selectedNode: SelectedNode;
  stats: GraphStats;
  onDomainClick: (domain: string) => void;
}

const GraphDetailPanel: React.FC<GraphDetailPanelProps> = ({
  selectedNode,
  stats,
  onDomainClick,
}) => {
  return (
    <div
      className="h-full overflow-y-auto"
      style={{
        background: 'var(--glass-surface-bg)',
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        borderLeft: '1px solid var(--glass-surface-border)',
      }}
    >
      <AnimatePresence mode="wait">
        {!selectedNode ? (
          <OverviewState key="overview" stats={stats} />
        ) : selectedNode.type === 'domain' ? (
          <DomainState key={`domain-${selectedNode.id}`} node={selectedNode as DomainNode} onDomainClick={onDomainClick} />
        ) : selectedNode.type === 'entity' ? (
          <EntityState key={`entity-${selectedNode.id}`} node={selectedNode as EntityNode} onDomainClick={onDomainClick} />
        ) : (
          <PlatformState key={`platform-${selectedNode.id}`} node={selectedNode as PlatformNode} />
        )}
      </AnimatePresence>
    </div>
  );
};

const OverviewState: React.FC<{ stats: GraphStats }> = ({ stats }) => (
  <motion.div
    initial={{ opacity: 0, x: 12 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -12 }}
    transition={{ duration: 0.2 }}
    className="p-6"
  >
    <h1
      className="text-[28px] font-normal tracking-tight mb-2"
      style={{ color: 'var(--text-primary)', fontFamily: "'Instrument Serif', serif" }}
    >
      Knowledge Graph
    </h1>
    <p className="text-[13px] mb-8" style={{ color: 'var(--text-muted)' }}>
      Your identity as a network of connected patterns.
      Click any node to explore.
    </p>

    <div className="grid grid-cols-2 gap-3">
      <StatCard label="Domains" value={stats.domainCount} />
      <StatCard label="Platforms" value={stats.platformCount} />
      <StatCard label="Entities" value={stats.entityCount ?? 0} />
      <StatCard label="Connections" value={stats.crossrefCount} />
    </div>

    <div className="mt-8">
      <h3 className="text-[12px] font-medium mb-3 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        How it works
      </h3>
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-narrative-secondary)' }}>
        Your twin compiles knowledge from platform observations and reflections into
        structured domain pages. Cross-references link patterns across your life --
        how your music taste connects to your stress response, how your work patterns
        affect your recovery.
      </p>
    </div>
  </motion.div>
);

const StatCard: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div
    className="rounded-[12px] px-3 py-2.5"
    style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}
  >
    <div className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
      {value}
    </div>
    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
      {label}
    </div>
  </div>
);

const DomainState: React.FC<{ node: DomainNode; onDomainClick: (domain: string) => void }> = ({ node, onDomainClick }) => {
  const meta = DOMAIN_CONFIG[node.domain];
  const content = useMemo(
    () => renderWikiMarkdown(node.contentMd, onDomainClick),
    [node.contentMd, onDomainClick],
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
      className="p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full" style={{ background: meta?.color }} />
          <h2
            className="text-[18px] font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {node.label}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}
          >
            v{node.version}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {getTimeAgo(node.compiledAt)}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-0">{content}</div>
    </motion.div>
  );
};

const PlatformState: React.FC<{ node: PlatformNode }> = ({ node }) => {
  const config = PLATFORM_CONFIG[node.platformId];

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
      className="p-6"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-3 h-3 rounded-full" style={{ background: config?.color ?? '#888' }} />
        <h2
          className="text-[18px] font-semibold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {config?.label ?? node.platformId}
        </h2>
      </div>

      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-narrative-secondary)' }}>
        This platform contributes data that shapes your knowledge graph.
        Observations from {config?.label ?? node.platformId} are analyzed by the
        reflection engine and compiled into your domain pages.
      </p>
    </motion.div>
  );
};

const EntityState: React.FC<{ node: EntityNode; onDomainClick: (domain: string) => void }> = ({ node, onDomainClick }) => {
  const catConfig = ENTITY_CATEGORY_CONFIG[node.category];

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
      className="p-6"
    >
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-3 h-3 rounded-full" style={{ background: catConfig?.color ?? '#888' }} />
        <h2 className="text-[18px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {node.label}
        </h2>
      </div>

      <span
        className="inline-block text-[10px] px-2 py-0.5 rounded-full mb-4"
        style={{ background: 'rgba(255,255,255,0.06)', color: catConfig?.color ?? 'var(--text-muted)' }}
      >
        {node.category}
      </span>

      <p className="text-[13px] leading-relaxed mb-5" style={{ color: 'var(--text-narrative-secondary)' }}>
        This entity appears across {node.domains?.length ?? 0} domain{(node.domains?.length ?? 0) !== 1 ? 's' : ''} in your knowledge graph,
        connecting patterns from different areas of your life.
      </p>

      {node.domains && node.domains.length > 0 && (
        <div>
          <h3 className="text-[12px] font-medium mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Referenced in
          </h3>
          <div className="flex flex-wrap gap-2">
            {node.domains.map(domain => {
              const dConfig = DOMAIN_CONFIG[domain];
              return (
                <button
                  key={domain}
                  onClick={() => onDomainClick(domain)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors hover:opacity-80"
                  style={{
                    background: `${dConfig?.color ?? '#888'}15`,
                    border: `1px solid ${dConfig?.color ?? '#888'}30`,
                    color: dConfig?.color ?? 'var(--text-secondary)',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: dConfig?.color }} />
                  {dConfig?.label ?? domain}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default GraphDetailPanel;
