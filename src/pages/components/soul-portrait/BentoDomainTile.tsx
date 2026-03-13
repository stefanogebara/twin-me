import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Clay3DIcon } from '@/components/Clay3DIcon';
import type { TwinDomains } from './types';

type DomainKey = keyof TwinDomains;

const DOMAIN_CONFIG: Record<DomainKey, {
  label: string;
  clayIcon: string;
  color: string;
}> = {
  personality:     { label: 'Personality',       clayIcon: 'brain',      color: '#9B59B6' },
  lifestyle:       { label: 'Lifestyle',          clayIcon: 'lightning',  color: '#E74C3C' },
  culturalIdentity:{ label: 'Cultural Identity',  clayIcon: 'headphones', color: '#3498DB' },
  socialDynamics:  { label: 'Social Dynamics',    clayIcon: 'chat-bubble',color: '#2ECC71' },
  motivation:      { label: 'Motivation',         clayIcon: 'trophy',     color: '#F39C12' },
};

const PREVIEW_LIMIT = 140;

function extractPreview(text: string): string {
  if (text.length <= PREVIEW_LIMIT) return text;
  const cut = text.lastIndexOf(' ', PREVIEW_LIMIT);
  return text.slice(0, cut > 0 ? cut : PREVIEW_LIMIT).trimEnd() + '…';
}

interface Props {
  domainKey: DomainKey;
  domains: TwinDomains;
  animationDelay?: number;
}

export const BentoDomainTile: React.FC<Props> = ({ domainKey, domains }) => {
  const [expanded, setExpanded] = useState(false);

  const content = domains[domainKey];
  if (!content) return null;

  const config = DOMAIN_CONFIG[domainKey];
  const preview = extractPreview(content);
  const hasMore = content.length > PREVIEW_LIMIT;

  return (
    <div
      className="rounded-lg overflow-hidden cursor-pointer"
      style={{
        backgroundColor: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderTop: `2px solid ${config.color}`,
      }}
      onClick={() => hasMore && setExpanded(prev => !prev)}
    >
      <div className="p-4">
        {/* Header with clay 3D icon */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${config.color}15` }}
            >
              <Clay3DIcon name={config.clayIcon} size={20} />
            </div>
            <span
              className="text-[11px] font-medium tracking-widest uppercase"
              style={{ color: config.color }}
            >
              {config.label}
            </span>
          </div>
          {hasMore && (
            expanded
              ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
              : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
          )}
        </div>

        {/* Content */}
        {expanded ? (
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            {content}
          </p>
        ) : (
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            {preview}
          </p>
        )}

        {hasMore && !expanded && (
          <p
            className="text-xs mt-2 font-medium"
            style={{ color: `${config.color}90` }}
          >
            Read more
          </p>
        )}
      </div>
    </div>
  );
};
