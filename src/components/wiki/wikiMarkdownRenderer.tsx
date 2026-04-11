/**
 * Shared Wiki Markdown Renderer
 * Extracted from WikiDomainCard for reuse in GraphDetailPanel.
 * Converts wiki markdown with [[domain:X]] cross-refs to React elements.
 */

import React from 'react';
import { DOMAIN_CONFIG } from './graphConstants';

/**
 * Renders wiki markdown content with cross-reference links.
 */
export function renderWikiMarkdown(
  content: string,
  onDomainClick: (domain: string) => void,
): React.ReactNode[] {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      elements.push(
        <h3
          key={`h-${i}`}
          className="text-[15px] font-semibold tracking-tight mt-5 mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {line.slice(3)}
        </h3>,
      );
      continue;
    }

    if (line.trim() === '') {
      elements.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

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
  const regex = /(\*\*\[Updated\]\*\*|\*\*[^*]+\*\*|\[\[domain:(\w+)(?:\|[^\]]+)?\]\])/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const fullMatch = match[0];

    if (fullMatch === '**[Updated]**') {
      parts.push(
        <span key={`upd-${lineKey}-${match.index}`} className="text-amber-400 font-medium text-[12px]">
          [Updated]
        </span>,
      );
    } else if (fullMatch.startsWith('[[domain:')) {
      const domain = match[2];
      const meta = DOMAIN_CONFIG[domain];
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
      parts.push(
        <span key={`b-${lineKey}-${match.index}`} className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {fullMatch.slice(2, -2)}
        </span>,
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
