/**
 * WikiDomainCard
 *
 * Renders a single wiki domain page as a glass card.
 * Shows title, compiled content (markdown), version, and last compiled timestamp.
 * Cross-references ([[domain:X]]) are rendered as clickable links.
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { WikiPage } from '@/services/api/wikiAPI';

// Domain metadata for display
const DOMAIN_META: Record<string, { label: string; color: string }> = {
  personality: { label: 'Personality', color: '#c9b99a' },
  lifestyle:   { label: 'Lifestyle',   color: '#34d399' },
  cultural:    { label: 'Cultural',    color: '#f59e0b' },
  social:      { label: 'Social',      color: '#60a5fa' },
  motivation:  { label: 'Motivation',  color: '#f97316' },
};

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

/**
 * Renders markdown content with cross-reference links.
 * Converts [[domain:X]] to clickable elements and basic markdown to HTML.
 */
function renderWikiMarkdown(
  content: string,
  onDomainClick: (domain: string) => void,
  domainLabel?: string,
): React.ReactNode[] {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ## Headers — prefix id + sr-only label with domain for uniqueness across cards
    if (line.startsWith('## ')) {
      const headingText = line.slice(3);
      const headingId = domainLabel
        ? `${domainLabel.toLowerCase()}-${headingText.toLowerCase().replace(/\s+/g, '-')}`
        : undefined;
      elements.push(
        <h3
          key={`h-${i}`}
          id={headingId}
          className="text-[15px] font-semibold tracking-tight mt-5 mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {domainLabel && (
            <span className="sr-only">{domainLabel}: </span>
          )}
          {headingText}
        </h3>,
      );
      continue;
    }

    // Empty lines
    if (line.trim() === '') {
      elements.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    // Process inline formatting: **bold**, [[domain:X]] cross-refs
    const parts = processInlineFormatting(line, onDomainClick, i);
    const isBullet = line.trimStart().startsWith('*') || line.trimStart().startsWith('-');

    elements.push(
      <p
        key={`p-${i}`}
        className={`text-[13px] leading-relaxed ${isBullet ? 'pl-4' : ''}`}
        style={{ color: 'var(--text-narrative-secondary)' }}
      >
        {parts}
      </p>,
    );
  }

  return elements;
}

function processInlineFormatting(
  text: string,
  onDomainClick: (domain: string) => void,
  lineKey: number,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold**, [[domain:X]] or [[domain:X|label]]
  const regex = /(\*\*\[Updated\]\*\*|\*\*[^*]+\*\*|\[\[domain:(\w+)(?:\|[^\]]+)?\]\])/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const fullMatch = match[0];

    if (fullMatch === '**[Updated]**') {
      // Contradiction marker
      parts.push(
        <span
          key={`upd-${lineKey}-${match.index}`}
          className="text-amber-400 font-medium text-[12px]"
        >
          [Updated]
        </span>,
      );
    } else if (fullMatch.startsWith('[[domain:')) {
      // Cross-reference link
      const domain = match[2];
      const meta = DOMAIN_META[domain];
      parts.push(
        <button
          key={`xref-${lineKey}-${match.index}`}
          onClick={() => onDomainClick(domain)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors hover:opacity-80"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: meta?.color ?? 'var(--text-secondary)',
          }}
        >
          {meta?.label ?? domain}
        </button>,
      );
    } else if (fullMatch.startsWith('**') && fullMatch.endsWith('**')) {
      // Bold text
      parts.push(
        <span
          key={`b-${lineKey}-${match.index}`}
          className="font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {fullMatch.slice(2, -2)}
        </span>,
      );
    }

    lastIndex = regex.lastIndex;
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

interface WikiDomainCardProps {
  page: WikiPage;
  onDomainClick: (domain: string) => void;
  index?: number;
}

const WikiDomainCard: React.FC<WikiDomainCardProps> = ({ page, onDomainClick, index = 0 }) => {
  const meta = DOMAIN_META[page.domain] ?? { label: page.domain, color: '#999' };
  const renderedContent = useMemo(
    () => renderWikiMarkdown(page.content_md, onDomainClick, meta.label),
    [page.content_md, onDomainClick, meta.label],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08 }}
      className="rounded-[20px] px-5 py-4 backdrop-blur-[42px]"
      style={{
        background: 'var(--glass-surface-bg)',
        border: '1px solid var(--glass-surface-border)',
        boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: meta.color }}
          />
          <h2
            className="text-[16px] font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {page.title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--text-muted)',
            }}
          >
            v{page.version}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {getTimeAgo(page.compiled_at)}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-0">{renderedContent}</div>
    </motion.div>
  );
};

export default WikiDomainCard;
