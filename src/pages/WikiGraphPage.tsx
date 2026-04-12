/**
 * WikiGraphPage -- Knowledge Graph visualization
 *
 * Interactive force-directed graph showing the user's identity as a network
 * of connected patterns: domain nodes, platform sources, and extracted entities.
 *
 * Layout: Graph canvas (60%) | Detail panel (40%) with floating domain nav pills.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/contexts/AuthContext';
import { useGraphData } from '@/components/wiki/useGraphData';
import KnowledgeGraph from '@/components/wiki/KnowledgeGraph';
import GraphDetailPanel from '@/components/wiki/GraphDetailPanel';
import { DOMAIN_CONFIG, DOMAIN_ORDER } from '@/components/wiki/graphConstants';
import type { GraphNode, SelectedNode, DomainNode } from '@/components/wiki/graphTypes';

const WikiGraphPage: React.FC = () => {
  useDocumentTitle('Knowledge Graph');
  const { user } = useAuth();

  const { graphData, stats, isLoading, error } = useGraphData(user?.id);

  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);

  // NOTE: hoveredNode is managed entirely inside KnowledgeGraph via refs.
  // Keeping it as parent useState caused full re-renders on every mouse move.

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node as SelectedNode);
  }, []);

  const handleDomainClick = useCallback((domain: string) => {
    const domainNode = graphData.nodes.find(n => n.id === domain);
    if (domainNode) {
      setSelectedNode(domainNode as DomainNode);
    }
  }, [graphData.nodes]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Loading knowledge graph...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="text-center">
          <BookOpen className="mx-auto mb-4 opacity-30" size={40} style={{ color: 'var(--text-muted)' }} />
          <h2 className="text-[18px] font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>Something went wrong</h2>
          <p className="text-[13px] mb-4" style={{ color: 'var(--text-muted)' }}>Could not load your knowledge graph.</p>
          <button onClick={() => window.location.reload()} className="text-[13px] px-3 py-1.5 rounded-[100px]" style={{ background: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)', color: 'var(--text-primary)' }}>Retry</button>
        </div>
      </div>
    );
  }

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="text-center max-w-sm">
          <BookOpen className="mx-auto mb-4 opacity-30" size={40} style={{ color: 'var(--text-muted)' }} />
          <h2 className="text-[18px] font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>Knowledge Graph</h2>
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Your knowledge graph is still being compiled. Connect platforms and chat with your twin to build up enough data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] overflow-hidden relative">
      {/* Graph Canvas -- Left 60% on desktop, full width on mobile */}
      <div className="flex-[3] relative min-w-0 w-full overflow-hidden">
        <KnowledgeGraph
          data={graphData}
          selectedNode={selectedNode}
          onNodeClick={handleNodeClick}
        />

        {/* Domain Nav Pills -- Floating bottom center */}
        <div
          className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-1.5 py-1 z-10"
          style={{
            background: 'rgba(19,18,26,0.85)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            border: '1px solid var(--glass-surface-border)',
            borderRadius: '100px',
          }}
        >
          {DOMAIN_ORDER.map(domain => {
            const config = DOMAIN_CONFIG[domain];
            const isActive = selectedNode?.id === domain;
            return (
              <button
                key={domain}
                onClick={() => handleDomainClick(domain)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-150"
                style={{
                  background: isActive ? `${config.color}22` : 'transparent',
                  border: isActive ? `1px solid ${config.color}44` : '1px solid transparent',
                  color: isActive ? config.color : 'var(--text-secondary)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: config.color }} />
                {config.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail Panel -- Right 40% (desktop) */}
      <div className="hidden lg:block flex-[2] min-w-[320px] max-w-[440px]">
        <GraphDetailPanel
          selectedNode={selectedNode}
          stats={stats}
          onDomainClick={handleDomainClick}
        />
      </div>

      {/* Mobile Bottom Sheet -- slides up when a node is selected */}
      <AnimatePresence>
      {selectedNode && (
        <motion.div
          key="mobile-sheet"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 max-h-[70vh] overflow-y-auto rounded-t-[20px]"
          style={{
            background: 'rgba(19,18,26,0.95)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            border: '1px solid var(--glass-surface-border)',
            borderBottom: 'none',
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>
          {/* Close button */}
          <button
            onClick={() => setSelectedNode(null)}
            className="absolute top-3 right-4 text-[13px] px-2 py-1 rounded"
            style={{ color: 'var(--text-muted)' }}
          >
            Close
          </button>
          <GraphDetailPanel
            selectedNode={selectedNode}
            stats={stats}
            onDomainClick={handleDomainClick}
          />
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};

export default WikiGraphPage;
