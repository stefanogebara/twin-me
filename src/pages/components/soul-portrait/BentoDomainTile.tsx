import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Heart, Palette, Users, Flame, ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import type { TwinDomains } from './types';

type DomainKey = keyof TwinDomains;

const DOMAIN_CONFIG: Record<DomainKey, {
  label: string;
  icon: React.ElementType;
  color: string;
}> = {
  personality: { label: 'Personality', icon: Brain, color: '#9B59B6' },
  lifestyle: { label: 'Lifestyle', icon: Heart, color: '#E74C3C' },
  culturalIdentity: { label: 'Cultural Identity', icon: Palette, color: '#3498DB' },
  socialDynamics: { label: 'Social Dynamics', icon: Users, color: '#2ECC71' },
  motivation: { label: 'Motivation', icon: Flame, color: '#F39C12' },
};

function extractFirstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?:\s|$)/);
  return match ? match[0].trim() : text.slice(0, 120).trim();
}

interface Props {
  domainKey: DomainKey;
  domains: TwinDomains;
  animationDelay?: number;
}

export const BentoDomainTile: React.FC<Props> = ({ domainKey, domains, animationDelay = 0 }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [expanded, setExpanded] = useState(false);

  const content = domains[domainKey];
  if (!content) return null;

  const config = DOMAIN_CONFIG[domainKey];
  const Icon = config.icon;
  const preview = extractFirstSentence(content);
  const hasMore = content !== preview;

  return (
    <motion.div
      className="rounded-2xl overflow-hidden cursor-pointer"
      style={{
        backgroundColor: isDark ? 'rgba(30, 30, 26, 0.7)' : 'rgba(255, 255, 255, 0.8)',
        border: isDark ? '1px solid rgba(193, 192, 182, 0.07)' : '1px solid rgba(0, 0, 0, 0.05)',
        borderTop: `2px solid ${config.color}`,
        boxShadow: isDark ? '0 4px 16px rgba(0, 0, 0, 0.25)' : '0 4px 16px rgba(0, 0, 0, 0.04)',
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: animationDelay, ease: 'easeOut' }}
      onClick={() => hasMore && setExpanded(prev => !prev)}
      whileHover={hasMore ? { scale: 1.01 } : {}}
      whileTap={hasMore ? { scale: 0.99 } : {}}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ backgroundColor: `${config.color}18` }}
            >
              <Icon className="w-3 h-3" style={{ color: config.color }} />
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
              ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isDark ? 'rgba(193, 192, 182, 0.3)' : '#c4bfba' }} />
              : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isDark ? 'rgba(193, 192, 182, 0.3)' : '#c4bfba' }} />
          )}
        </div>

        {/* Content */}
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.p
              key="expanded"
              className="text-sm leading-relaxed"
              style={{ color: isDark ? 'rgba(193, 192, 182, 0.75)' : '#4a4540' }}
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
              className="text-sm leading-relaxed line-clamp-3"
              style={{ color: isDark ? 'rgba(193, 192, 182, 0.65)' : '#4a4540' }}
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
