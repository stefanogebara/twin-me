import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toSecondPerson } from '@/lib/utils';
import {
  Memory,
  EXPERT_COLORS,
  EXPERT_LABELS,
  TYPE_COLORS,
  TYPE_LABELS,
  relativeTime,
  getPlatformLabel,
} from './brainConstants';

const REMARK_PLUGINS = [remarkGfm];

// Custom renderers keep headings/lists within the card visual language rather than
// using browser defaults, and ensure bold/italics render instead of leaking `**`.
const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed mb-2 last:mb-0" style={{ color: '#fdfcfb' }}>{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong style={{ color: '#fdfcfb', fontWeight: 600 }}>{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em style={{ color: 'rgba(253,252,251,0.85)' }}>{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="text-sm leading-relaxed mb-2 ml-4 list-disc" style={{ color: '#fdfcfb' }}>{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="text-sm leading-relaxed mb-2 ml-4 list-decimal" style={{ color: '#fdfcfb' }}>{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li className="mb-1">{children}</li>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: '#fdfcfb' }}>{children}</code>
  ),
};

interface FeaturedMemoryProps {
  memory: Memory;
}

const FeaturedMemory: React.FC<FeaturedMemoryProps> = ({ memory }) => {
  const expert = (memory.metadata?.expert as string) || null;
  const expertColor = expert ? (EXPERT_COLORS[expert] || '#86807b') : null;
  const expertLabel = expert ? (EXPERT_LABELS[expert] || expert) : null;
  const typeColor = TYPE_COLORS[memory.memory_type] || '#6B7280';

  return (
    <div className="mb-8">
      <span
        className="block mb-3"
        style={{
          fontSize: '11px',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: '#86807b',
        }}
      >
        Most Important
      </span>
      <div
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          padding: '20px',
        }}
      >
        {/* Top row: type/expert + importance */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {expertLabel ? (
              <span
                className="text-[11px] font-medium uppercase"
                style={{ color: expertColor || '#86807b', letterSpacing: '0.1em' }}
              >
                {expertLabel}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="rounded-full inline-block"
                  style={{ width: '6px', height: '6px', backgroundColor: typeColor }}
                />
                <span
                  className="text-[11px] font-medium uppercase"
                  style={{ color: '#86807b', letterSpacing: '0.1em' }}
                >
                  {TYPE_LABELS[memory.memory_type] || memory.memory_type}
                </span>
              </span>
            )}
          </div>
          <span
            className="text-[11px] font-medium"
            style={{ color: 'var(--accent-vibrant)' }}
          >
            {memory.importance_score}/10
          </span>
        </div>

        {/* Full content — rendered through markdown so LLM-generated **bold** etc
            display as formatting rather than literal asterisks. */}
        <div className="mb-3">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
            {toSecondPerson(memory.content)}
          </ReactMarkdown>
        </div>

        {/* Bottom: source + time */}
        <div className="flex items-center gap-3">
          {getPlatformLabel(memory.metadata) && (
            <span className="text-[11px]" style={{ color: '#86807b' }}>
              from {getPlatformLabel(memory.metadata)}
            </span>
          )}
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {relativeTime(memory.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default FeaturedMemory;
