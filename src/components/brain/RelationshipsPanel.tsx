import React from 'react';
import { GitBranch, Zap } from 'lucide-react';
import { type BrainEdge } from '@/components/brain/BrainNodeRenderer';

interface RelationshipsPanelProps {
  selectedNodeId: string;
  showEdgesPanel: boolean;
  onToggleEdgesPanel: () => void;
  getNodeEdges: (nodeId: string) => { incoming: BrainEdge[]; outgoing: BrainEdge[] };
  getNodeLabel: (nodeId: string) => string;
  upgradingEdge: string | null;
  setUpgradingEdge: (edgeId: string | null) => void;
  selectedCausalType: string;
  setSelectedCausalType: (type: string) => void;
  upgradeEdgeToCausal: (edgeId: string, causalType: string) => void;
  edgeUpgradeLoading: boolean;
  textColor: string;
  textMuted: string;
  textFaint: string;
  subtleBg: string;
}

export const RelationshipsPanel: React.FC<RelationshipsPanelProps> = ({
  selectedNodeId,
  showEdgesPanel,
  onToggleEdgesPanel,
  getNodeEdges,
  getNodeLabel,
  upgradingEdge,
  setUpgradingEdge,
  selectedCausalType,
  setSelectedCausalType,
  upgradeEdgeToCausal,
  edgeUpgradeLoading,
  textColor,
  textMuted,
  textFaint,
  subtleBg,
}) => {
  return (
    <div className="mt-6">
      <button
        onClick={onToggleEdgesPanel}
        className="w-full flex items-center justify-between p-3 rounded-xl transition-all"
        style={{
          backgroundColor: 'rgba(108, 92, 231, 0.1)',
          border: '1px solid rgba(108, 92, 231, 0.2)'
        }}
      >
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4" style={{ color: '#6C5CE7' }} />
          <span className="font-medium" style={{ color: '#6C5CE7' }}>Relationships</span>
        </div>
        <span className="text-sm" style={{ color: textMuted }}>
          {showEdgesPanel ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {showEdgesPanel && (
        <div className="mt-3 space-y-4">
          {(() => {
            const { incoming, outgoing } = getNodeEdges(selectedNodeId);
            const allEdges = [...incoming.map(e => ({ ...e, direction: 'incoming' as const })),
                             ...outgoing.map(e => ({ ...e, direction: 'outgoing' as const }))];

            if (allEdges.length === 0) {
              return (
                <p className="text-sm text-center py-4" style={{ color: textMuted }}>
                  No relationships found for this node
                </p>
              );
            }

            return allEdges.map((edge) => {
              const isCausal = ['causes', 'enables', 'triggers', 'inhibits'].includes(edge.type);
              const isCorrelational = ['correlates_with', 'similar_to'].includes(edge.type);
              const connectedNodeId = edge.direction === 'incoming' ? edge.source : edge.target;
              const connectedLabel = getNodeLabel(connectedNodeId);

              return (
                <div
                  key={edge.id}
                  className="p-3 rounded-lg"
                  style={{
                    backgroundColor: isCausal ? 'rgba(231, 76, 60, 0.1)' :
                                    isCorrelational ? 'rgba(162, 155, 254, 0.1)' :
                                    'rgba(193, 192, 182, 0.05)',
                    border: `1px solid ${isCausal ? 'rgba(231, 76, 60, 0.2)' :
                                         isCorrelational ? 'rgba(162, 155, 254, 0.2)' :
                                         'rgba(193, 192, 182, 0.1)'}`
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        isCausal ? 'bg-red-500/20 text-red-400' :
                        isCorrelational ? 'bg-purple-500/20 text-purple-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {isCausal ? '\u26A1 Causal' : isCorrelational ? '\u2248 Correlational' : '\u25CB Other'}
                      </span>
                      <span className="text-xs" style={{ color: textMuted }}>
                        {edge.direction === 'incoming' ? '\u2190 from' : '\u2192 to'}
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: textFaint }}>
                      {Math.round(edge.strength * 100)}% strength
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-sm" style={{ color: textColor }}>
                      {connectedLabel}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                      backgroundColor: edge.color + '20',
                      color: edge.color
                    }}>
                      {edge.type.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {!isCausal && (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(193, 192, 182, 0.1)' }}>
                      {upgradingEdge === edge.id ? (
                        <div className="space-y-2">
                          <select
                            value={selectedCausalType}
                            onChange={(e) => setSelectedCausalType(e.target.value)}
                            className="w-full p-2 rounded text-sm bg-transparent border"
                            style={{
                              color: textColor,
                              borderColor: 'rgba(193, 192, 182, 0.2)',
                              backgroundColor: subtleBg
                            }}
                          >
                            <option value="causes">Causes (A directly causes B)</option>
                            <option value="enables">Enables (A makes B possible)</option>
                            <option value="triggers">Triggers (A initiates B)</option>
                            <option value="inhibits">Inhibits (A suppresses B)</option>
                          </select>
                          <div className="flex gap-2">
                            <button
                              onClick={() => upgradeEdgeToCausal(edge.id, selectedCausalType)}
                              disabled={edgeUpgradeLoading}
                              className="flex-1 px-3 py-1.5 rounded text-sm font-medium transition-all"
                              style={{
                                backgroundColor: '#E74C3C',
                                color: 'white',
                                opacity: edgeUpgradeLoading ? 0.5 : 1
                              }}
                            >
                              {edgeUpgradeLoading ? 'Upgrading...' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setUpgradingEdge(null)}
                              className="px-3 py-1.5 rounded text-sm font-medium transition-all"
                              style={{
                                backgroundColor: subtleBg,
                                color: textMuted
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setUpgradingEdge(edge.id)}
                          className="text-xs flex items-center gap-1 hover:underline"
                          style={{ color: '#E74C3C' }}
                        >
                          <Zap className="w-3 h-3" />
                          Mark as causal relationship
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
};
