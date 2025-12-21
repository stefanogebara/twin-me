/**
 * Friendly Insight Card Component
 * Displays user-friendly insights with icons and actions
 * No technical jargon - just meaningful discoveries
 */

import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Moon,
  Sun,
  Network,
  Brain,
  Heart,
  Users,
  Globe,
  Rocket,
  BookOpen,
  Music,
  Sparkles,
  ChevronRight,
  Shield,
  Eye,
  EyeOff
} from 'lucide-react';
import { useState } from 'react';

interface FriendlyInsightCardProps {
  title: string;
  icon: string;
  description: string;
  confidence: number;
  source: 'spotify' | 'youtube' | 'github' | 'cross-platform';
  actions?: string[];
  isPrivate?: boolean;
  onPrivacyToggle?: () => void;
  delay?: number;
}

export function FriendlyInsightCard({
  title,
  icon,
  description,
  confidence,
  source,
  actions = [],
  isPrivate = false,
  onPrivacyToggle,
  delay = 0
}: FriendlyInsightCardProps) {
  const { theme } = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  // Map emoji icons to Lucide icons
  const getIconComponent = () => {
    switch (icon) {
      case '🌙': return <Moon className="w-6 h-6" />;
      case '🌅': return <Sun className="w-6 h-6" />;
      case '🌉': return <Network className="w-6 h-6" />;
      case '🤔': return <Brain className="w-6 h-6" />;
      case '🎭': return <Heart className="w-6 h-6" />;
      case '👥': return <Users className="w-6 h-6" />;
      case '🌍': return <Globe className="w-6 h-6" />;
      case '🚀': return <Rocket className="w-6 h-6" />;
      case '📚': return <BookOpen className="w-6 h-6" />;
      case '🎵': return <Music className="w-6 h-6" />;
      default: return <Sparkles className="w-6 h-6" />;
    }
  };

  // Get source color scheme
  const getSourceColors = () => {
    switch (source) {
      case 'spotify':
        return {
          bg: 'bg-green-50',
          text: 'text-green-700',
          border: 'border-green-200',
          iconBg: 'bg-green-100'
        };
      case 'youtube':
        return {
          bg: 'bg-red-50',
          text: 'text-red-700',
          border: 'border-red-200',
          iconBg: 'bg-red-100'
        };
      case 'github':
        return {
          bg: 'bg-purple-50',
          text: 'text-purple-700',
          border: 'border-purple-200',
          iconBg: 'bg-purple-100'
        };
      case 'cross-platform':
        return {
          bg: 'bg-gradient-to-br from-stone-50 to-amber-50',
          text: 'text-orange-700',
          border: 'border-orange-200',
          iconBg: 'bg-gradient-to-br from-stone-100 to-amber-100'
        };
      default:
        return {
          bg: 'bg-stone-50',
          text: 'text-stone-700',
          border: 'border-stone-200',
          iconBg: 'bg-stone-100'
        };
    }
  };

  const colors = getSourceColors();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="relative"
    >
      <div
        className={`backdrop-blur-[16px] rounded-xl p-6 transition-all duration-300 ${
          isHovered ? 'shadow-lg scale-[1.02]' : 'shadow-md'
        } ${isPrivate ? 'opacity-60' : ''}`}
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(45, 45, 41, 0.7)' : 'rgba(255, 255, 255, 0.5)',
          borderColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.2)' : 'rgba(0, 0, 0, 0.06)',
          borderWidth: '1px',
          borderStyle: 'solid'
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start space-x-3">
            {/* Icon */}
            <div className={`p-3 rounded-lg ${colors.iconBg} ${colors.text}`}>
              {getIconComponent()}
            </div>

            {/* Title and Description */}
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">
                {title}
              </h3>
              <p className="text-sm text-slate-600">
                {description}
              </p>
            </div>
          </div>

          {/* Privacy Toggle */}
          {onPrivacyToggle && (
            <button
              onClick={onPrivacyToggle}
              className="p-2 rounded-lg hover:bg-stone-100 transition-colors"
              title={isPrivate ? "Make public" : "Make private"}
            >
              {isPrivate ? (
                <EyeOff className="w-4 h-4 text-slate-500" />
              ) : (
                <Eye className="w-4 h-4 text-slate-500" />
              )}
            </button>
          )}
        </div>

        {/* Confidence Score */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
            <span>Confidence</span>
            <span>{confidence}%</span>
          </div>
          <div className="w-full bg-stone-200 rounded-full h-1.5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${confidence}%` }}
              transition={{ duration: 1, delay: delay + 0.3 }}
              className={`h-full rounded-full ${
                confidence > 80 ? 'bg-green-500' :
                confidence > 60 ? 'bg-stone-500' :
                'bg-stone-500'
              }`}
            />
          </div>
        </div>

        {/* Actions */}
        {actions.length > 0 && (
          <div className="space-y-2">
            {actions.map((action, index) => (
              <motion.button
                key={index}
                whileHover={{ x: 4 }}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-stone-50 transition-colors text-sm text-slate-700"
              >
                <span>{action}</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </motion.button>
            ))}
          </div>
        )}

        {/* Source Badge */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-stone-200">
          <span className={`text-xs px-2 py-1 rounded-full ${colors.bg} ${colors.text} font-medium`}>
            {source === 'cross-platform' ? 'Multi-Platform' : source.charAt(0).toUpperCase() + source.slice(1)}
          </span>

          {isPrivate && (
            <div className="flex items-center space-x-1 text-xs text-slate-500">
              <Shield className="w-3 h-3" />
              <span>Private</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}