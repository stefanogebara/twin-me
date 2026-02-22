/**
 * Platform Sub-Card Component
 *
 * Displays individual platform data when a category is expanded.
 * Shows connection status, metrics, and AI insights.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Music,
  Youtube,
  Activity,
  Calendar,
  Mail,
  MessageCircle,
  MessageSquare,
  Github,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { getPlatformLogo } from '@/components/PlatformLogos';
import { PLATFORM_INFO } from './categoryConfig';
import { AnimatedCounter } from './AnimatedCounter';
import type { PlatformData } from '../hooks/usePlatformCategoryData';
import { fadeInUp, safeAnimation, respectReducedMotion } from '@/lib/animations';

interface PlatformSubCardProps {
  platform: string;
  data: PlatformData;
  categoryColor: string;
  onNavigate?: () => void;
}

const lucideIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Music,
  Youtube,
  Activity,
  Calendar,
  Mail,
  MessageCircle,
  MessageSquare,
  Github
};

export const PlatformSubCard: React.FC<PlatformSubCardProps> = ({
  platform,
  data,
  categoryColor,
  onNavigate
}) => {
  const navigate = useNavigate();
  const platformInfo = PLATFORM_INFO[platform] || {
    name: platform,
    icon: 'Activity',
    color: categoryColor
  };

  const textColor = '#1F1C18';
  const textSecondary = '#57534e';
  const textMuted = '#8A857D';
  const cardBg = 'rgba(255, 255, 255, 0.6)';
  const hoverBg = 'rgba(0, 0, 0, 0.02)';

  // Prefer real SVG logo, fall back to Lucide icon
  const IconComponent = getPlatformLogo(platform) || lucideIconMap[platformInfo.icon] || Activity;

  const handleClick = () => {
    if (onNavigate) {
      onNavigate();
    } else if (data.connected) {
      navigate(`/insights/${platform}`);
    } else {
      navigate('/get-started');
    }
  };

  // Format last sync time
  const formatLastSync = (dateStr: string | null): string => {
    if (!dateStr) return 'Never synced';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <motion.div
      variants={safeAnimation(fadeInUp)}
      className="p-4 rounded-xl cursor-pointer transition-all duration-200 group"
      style={{
        backgroundColor: cardBg,
        border: data.connected
          ? `1px solid ${platformInfo.color}25`
          : '1px solid rgba(0, 0, 0, 0.04)'
      }}
      onClick={handleClick}
      whileHover={respectReducedMotion() ? {} : {
        scale: 1.01,
        backgroundColor: hoverBg
      }}
      whileTap={respectReducedMotion() ? {} : { scale: 0.99 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105"
            style={{
              backgroundColor: data.connected
                ? `${platformInfo.color}15`
                : 'rgba(0, 0, 0, 0.05)'
            }}
          >
            <IconComponent
              className="w-5 h-5"
              style={{
                color: data.connected ? platformInfo.color : textMuted
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className="font-medium"
                style={{ color: data.connected ? textColor : textMuted }}
              >
                {platformInfo.name}
              </span>
              {data.connected ? (
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
              ) : (
                <XCircle className="w-3.5 h-3.5" style={{ color: textMuted }} />
              )}
            </div>
            <p className="text-xs" style={{ color: textMuted }}>
              {data.connected
                ? formatLastSync(data.lastSync)
                : 'Not connected'}
            </p>
          </div>
        </div>
        <ExternalLink
          className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: textMuted }}
        />
      </div>

      {/* Metrics */}
      {data.connected && data.metrics.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-3">
          {data.metrics.slice(0, 3).map((metric, index) => (
            <div key={index} className="text-center">
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: textMuted }}>
                {metric.label}
              </p>
              <p className="text-sm font-semibold" style={{ color: platformInfo.color }}>
                {typeof metric.value === 'number' ? (
                  <AnimatedCounter value={metric.value} />
                ) : (
                  metric.value
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Insight */}
      {data.connected && data.insight && (
        <div
          className="pt-3 flex items-start gap-2"
          style={{
            borderTop: '1px solid rgba(0, 0, 0, 0.04)'
          }}
        >
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: categoryColor }} />
          <p className="text-xs leading-relaxed" style={{ color: textSecondary }}>
            {data.insight}
          </p>
        </div>
      )}

      {/* Error state */}
      {data.error && (
        <div
          className="mt-2 p-2 rounded-lg text-xs"
          style={{
            backgroundColor: 'rgba(220, 38, 38, 0.08)',
            color: '#991b1b'
          }}
        >
          {data.error}
        </div>
      )}

      {/* Disconnected state */}
      {!data.connected && (
        <div
          className="mt-2 p-3 rounded-lg text-center"
          style={{ backgroundColor: `${categoryColor}08` }}
        >
          <p className="text-xs mb-1" style={{ color: textSecondary }}>
            Connect to see your {platformInfo.name} insights
          </p>
          <span
            className="text-xs font-medium"
            style={{ color: categoryColor }}
          >
            Connect Now
          </span>
        </div>
      )}
    </motion.div>
  );
};

export default PlatformSubCard;
