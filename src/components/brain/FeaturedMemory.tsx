import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toSecondPerson } from '@/lib/utils';
import { Section } from '@/components/register';
import {
  Memory,
  EXPERT_LABELS,
  TYPE_COLORS,
  TYPE_LABELS,
  relativeTime,
  getPlatformLabel,
} from './brainConstants';

const REMARK_PLUGINS = [remarkGfm];

// Custom renderers keep headings/lists in the register's 13px ink, and ensure
// bold/italics render instead of leaking `**`. Emphasis is weight, not a
// near-white italic (it was rgba(253,252,251,.85) on the white page).
const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0" style={{ color: 'var(--rg-ink)' }}>{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong style={{ color: 'var(--rg-ink)', fontWeight: 600 }}>{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em style={{ color: 'var(--rg-ink)', fontStyle: 'normal', fontWeight: 500 }}>{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 ml-4 list-disc" style={{ color: 'var(--rg-ink)' }}>{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 ml-4 list-decimal" style={{ color: 'var(--rg-ink)' }}>{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li className="mb-1">{children}</li>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="px-1 rounded-[4px]" style={{ background: 'var(--rg-field)', color: 'var(--rg-ink)', fontFamily: 'var(--rg-mono)' }}>{children}</code>
  ),
};

interface FeaturedMemoryProps {
  memory: Memory;
}

/**
 * The most important memory, in the register: a section whose one item holds
 * the full reading (rendered as markdown) over one grey line naming where it
 * came from. No glass card, no tracked caps, no expert hue as text.
 */
const FeaturedMemory: React.FC<FeaturedMemoryProps> = ({ memory }) => {
  const expert = (memory.metadata?.expert as string) || null;
  const expertLabel = expert ? (EXPERT_LABELS[expert] || expert) : null;
  const typeColor = TYPE_COLORS[memory.memory_type] || '#8c8889';
  const typeLabel = TYPE_LABELS[memory.memory_type] || memory.memory_type;
  const platformLabel = getPlatformLabel(memory.metadata);
  const meta = [
    expertLabel ?? typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1),
    `${memory.importance_score}/10`,
    platformLabel ? `from ${platformLabel}` : null,
    relativeTime(memory.created_at),
  ].filter(Boolean).join(', ');

  return (
    <Section title="Most important">
      <ul className="rg-list">
        <li style={{ padding: '20px 12px', borderBottom: '1px solid var(--rg-rule)' }}>
          {/* Full content — rendered through markdown so LLM-generated **bold** etc
              display as formatting rather than literal asterisks. */}
          <div style={{ maxWidth: '68ch' }}>
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
              {toSecondPerson(memory.content)}
            </ReactMarkdown>
          </div>
          <p className="rg-row-line inline-flex items-center gap-1.5" style={{ marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
            <span aria-hidden="true" className="rounded-full inline-block flex-shrink-0" style={{ width: '8px', height: '8px', backgroundColor: typeColor }} />
            {meta}
          </p>
        </li>
      </ul>
    </Section>
  );
};

export default FeaturedMemory;
