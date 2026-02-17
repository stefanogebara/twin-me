import React from 'react';
import { Layers } from 'lucide-react';
import { CONTEXT_CONFIG } from '@/components/brain/BrainNodeRenderer';

interface ContextExpressionPanelProps {
  selectedNodeId: string;
  showContextPanel: boolean;
  onToggleContextPanel: () => void;
  editingContext: string | null;
  setEditingContext: (ctx: string | null) => void;
  contextExpressionLevel: number;
  setContextExpressionLevel: (level: number) => void;
  contextNotes: string;
  setContextNotes: (notes: string) => void;
  nodeContextExpressions: Record<string, { level: number; notes?: string }>;
  setContextExpression: (nodeId: string, context: string, level: number, notes?: string) => void;
  contextExpressionLoading: boolean;
  textColor: string;
  textMuted: string;
  textFaint: string;
  subtleBg: string;
}

export const ContextExpressionPanel: React.FC<ContextExpressionPanelProps> = ({
  selectedNodeId,
  showContextPanel,
  onToggleContextPanel,
  editingContext,
  setEditingContext,
  contextExpressionLevel,
  setContextExpressionLevel,
  contextNotes,
  setContextNotes,
  nodeContextExpressions,
  setContextExpression,
  contextExpressionLoading,
  textColor,
  textMuted,
  textFaint,
  subtleBg,
}) => {
  return (
    <div className="mt-6">
      <button
        onClick={onToggleContextPanel}
        className="w-full flex items-center justify-between p-3 rounded-xl transition-all"
        style={{
          backgroundColor: 'rgba(155, 89, 182, 0.1)',
          border: '1px solid rgba(155, 89, 182, 0.2)'
        }}
      >
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4" style={{ color: '#9B59B6' }} />
          <span className="font-medium" style={{ color: '#9B59B6' }}>Context Expression</span>
        </div>
        <span className="text-sm" style={{ color: textMuted }}>
          {showContextPanel ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {showContextPanel && (
        <div className="mt-3 space-y-3">
          <p className="text-xs" style={{ color: textMuted }}>
            Set how this trait expresses in different life contexts
          </p>

          {Object.entries(CONTEXT_CONFIG).map(([ctx, config]) => {
            const Icon = config.icon;
            const expression = nodeContextExpressions[ctx];
            const levelLabels: Record<number, string> = {
              0.2: 'Suppressed',
              0.5: 'Reduced',
              1.0: 'Normal',
              1.5: 'Enhanced',
              2.0: 'Dominant'
            };

            return (
              <div
                key={ctx}
                className="p-3 rounded-lg"
                style={{
                  backgroundColor: expression ? `${config.color}10` : subtleBg,
                  border: `1px solid ${expression ? config.color + '30' : 'rgba(193, 192, 182, 0.1)'}`
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" style={{ color: config.color }} />
                    <span className="text-sm font-medium" style={{ color: textColor }}>
                      {config.label}
                    </span>
                    {expression && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{
                        backgroundColor: config.color + '20',
                        color: config.color
                      }}>
                        {levelLabels[expression.level] || `${expression.level}x`}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (editingContext === ctx) {
                        setEditingContext(null);
                      } else {
                        setEditingContext(ctx);
                        setContextExpressionLevel(expression?.level || 1.0);
                        setContextNotes(expression?.notes || '');
                      }
                    }}
                    className="text-xs px-2 py-1 rounded transition-all hover:opacity-80"
                    style={{
                      backgroundColor: editingContext === ctx ? config.color : 'transparent',
                      color: editingContext === ctx ? 'white' : config.color,
                      border: `1px solid ${config.color}`
                    }}
                  >
                    {editingContext === ctx ? 'Cancel' : expression ? 'Edit' : 'Set'}
                  </button>
                </div>

                {editingContext === ctx && (
                  <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: 'rgba(193, 192, 182, 0.1)' }}>
                    <div>
                      <label className="text-xs block mb-2" style={{ color: textMuted }}>
                        Expression Level
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {[
                          { value: 0.2, label: 'Suppressed', desc: '20%' },
                          { value: 0.5, label: 'Reduced', desc: '50%' },
                          { value: 1.0, label: 'Normal', desc: '100%' },
                          { value: 1.5, label: 'Enhanced', desc: '150%' },
                          { value: 2.0, label: 'Dominant', desc: '200%' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setContextExpressionLevel(opt.value)}
                            className="text-xs px-2 py-1 rounded transition-all"
                            style={{
                              backgroundColor: contextExpressionLevel === opt.value ? config.color : subtleBg,
                              color: contextExpressionLevel === opt.value ? 'white' : textMuted,
                              border: `1px solid ${contextExpressionLevel === opt.value ? config.color : 'rgba(193, 192, 182, 0.2)'}`
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs block mb-2" style={{ color: textMuted }}>
                        Notes (optional)
                      </label>
                      <input
                        type="text"
                        value={contextNotes}
                        onChange={(e) => setContextNotes(e.target.value)}
                        placeholder="Why does this trait express differently here?"
                        className="w-full p-2 rounded text-sm bg-transparent border"
                        style={{
                          color: textColor,
                          borderColor: 'rgba(193, 192, 182, 0.2)',
                          backgroundColor: subtleBg
                        }}
                      />
                    </div>

                    <button
                      onClick={() => setContextExpression(selectedNodeId, ctx, contextExpressionLevel, contextNotes)}
                      disabled={contextExpressionLoading}
                      className="w-full px-3 py-2 rounded text-sm font-medium transition-all"
                      style={{
                        backgroundColor: config.color,
                        color: 'white',
                        opacity: contextExpressionLoading ? 0.5 : 1
                      }}
                    >
                      {contextExpressionLoading ? 'Saving...' : 'Save Expression'}
                    </button>
                  </div>
                )}

                {expression?.notes && editingContext !== ctx && (
                  <p className="text-xs mt-2 italic" style={{ color: textFaint }}>
                    "{expression.notes}"
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
