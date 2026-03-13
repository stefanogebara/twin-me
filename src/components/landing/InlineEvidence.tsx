/**
 * InlineEvidence — Sesame-inspired inline proof component
 * ========================================================
 * Embeds real-looking twin conversation snippets, insights, or memory
 * excerpts inline to build trust through showing, not telling.
 *
 * Variants:
 *   - "conversation": A mini twin chat exchange (user + twin)
 *   - "insight":      A proactive insight notification
 *   - "memory":       A memory stream excerpt
 */

import React from 'react';
import { Sparkles, Lightbulb, Database } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface ConversationLine {
  role: 'user' | 'twin';
  text: string;
}

interface ConversationEvidence {
  variant: 'conversation';
  lines: ConversationLine[];
}

interface InsightEvidence {
  variant: 'insight';
  category: string;
  text: string;
}

interface MemoryEvidence {
  variant: 'memory';
  type: string;
  text: string;
  source: string;
}

type EvidenceProps = ConversationEvidence | InsightEvidence | MemoryEvidence;

// ── Shared style ────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: '12px',
};

// ── Renderers ──────────────────────────────────────────────────────

const ConversationSnippet: React.FC<{ lines: ConversationLine[] }> = ({ lines }) => (
  <div className="flex flex-col gap-2.5">
    {lines.map((line, i) => (
      <div
        key={i}
        className={`flex ${line.role === 'user' ? 'justify-end' : 'justify-start'}`}
      >
        <div
          className={`px-3.5 py-2 text-[12px] max-w-[85%] ${line.role === 'twin' ? 'narrative-voice-upright' : 'leading-relaxed'}`}
          style={{
            borderRadius: line.role === 'user' ? '10px 10px 4px 10px' : '10px 10px 10px 4px',
            background: line.role === 'user'
              ? 'rgba(232, 160, 80, 0.15)'
              : 'rgba(255, 255, 255, 0.05)',
            color: line.role === 'user' ? '#E8A050' : 'rgba(245, 240, 235, 0.6)',
          }}
        >
          {line.text}
        </div>
      </div>
    ))}
  </div>
);

const InsightSnippet: React.FC<{ category: string; text: string }> = ({ category, text }) => (
  <div className="flex items-start gap-2.5">
    <div
      className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{ background: 'rgba(16, 185, 129, 0.12)' }}
    >
      <Lightbulb className="w-3 h-3" style={{ color: '#10B981' }} />
    </div>
    <div>
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#10B981' }}>
        {category}
      </p>
      <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(245, 240, 235, 0.6)' }}>
        {text}
      </p>
    </div>
  </div>
);

const MemorySnippet: React.FC<{ type: string; text: string; source: string }> = ({ type, text, source }) => (
  <div className="flex items-start gap-2.5">
    <div
      className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{ background: 'rgba(139, 92, 246, 0.12)' }}
    >
      <Database className="w-3 h-3" style={{ color: '#8B5CF6' }} />
    </div>
    <div>
      <div className="flex items-center gap-2 mb-1">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: '#8B5CF6' }}>
          {type}
        </p>
        <span className="text-[10px]" style={{ color: 'rgba(245, 240, 235, 0.25)' }}>·</span>
        <p className="text-[10px]" style={{ color: 'rgba(245, 240, 235, 0.3)' }}>
          {source}
        </p>
      </div>
      <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(245, 240, 235, 0.6)' }}>
        {text}
      </p>
    </div>
  </div>
);

// ── Main component ─────────────────────────────────────────────────

export const InlineEvidence: React.FC<EvidenceProps> = (props) => {
  return (
    <div
      className="mt-4 p-3.5"
      style={cardStyle}
    >
      {/* Subtle label */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <Sparkles className="w-2.5 h-2.5" style={{ color: 'rgba(232, 160, 80, 0.5)' }} />
        <span className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(245, 240, 235, 0.25)' }}>
          {props.variant === 'conversation' ? 'Real twin exchange' : props.variant === 'insight' ? 'Live insight' : 'Memory excerpt'}
        </span>
      </div>

      {props.variant === 'conversation' && <ConversationSnippet lines={props.lines} />}
      {props.variant === 'insight' && <InsightSnippet category={props.category} text={props.text} />}
      {props.variant === 'memory' && <MemorySnippet type={props.type} text={props.text} source={props.source} />}
    </div>
  );
};
