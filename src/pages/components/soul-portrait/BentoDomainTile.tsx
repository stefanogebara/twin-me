import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

export const BentoDomainTile: React.FC<Props> = ({ domainKey, domains, animationDelay = 0 }) => {
  const [expanded, setExpanded] = useState(false);

  const content = domains[domainKey];
  if (!content) return null;

  const config = DOMAIN_CONFIG[domainKey];
  const preview = extractPreview(content);
  const hasMore = content.length > PREVIEW_LIMIT;

  return (
    <motion.div
      className="rounded-2xl overflow-hidden cursor-pointer"
      style={{
        background: 'rgba(255, 255, 255, 0.18)',
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        border: '1px solid rgba(255, 255, 255, 0.45)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        borderTop: `2px solid ${config.color}`,
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: animationDelay, ease: 'easeOut' }}
      onClick={() => hasMore && setExpanded(prev => !prev)}
      whileHover={hasMore ? { scale: 1.01 } : {}}
      whileTap={hasMore ? { scale: 0.99 } : {}}
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
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: config.color }}
            >
              {config.label}
            </span>
          </div>
          {hasMore && (
            expanded
              ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#c4bfba' }} />
              : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#c4bfba' }} />
          )}
        </div>

        {/* Content */}
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.p
              key="expanded"
              className="text-xs leading-relaxed"
              style={{ color: '#4a4540' }}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              {content}
            </motion.p>
          ) : (
            <motion.p
              key="preview"
              className="text-xs leading-relaxed"
              style={{ color: '#4a4540' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {preview}
            </motion.p>
          )}
        </AnimatePresence>

        {hasMore && !expanded && (
          <p
            className="text-xs mt-2 font-medium"
            style={{ color: `${config.color}90` }}
          >
            Read more
          </p>
        )}
      </div>
    </motion.div>
  );
};
