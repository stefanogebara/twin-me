/**
 * ContextualQuickActions Component
 * Smart, context-aware quick action buttons based on conversation topic
 * Analyzes message content to show relevant actions
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  Music,
  TrendingUp,
  Zap,
  Download,
  BarChart3,
  Calendar,
  Users,
  Search,
  Sparkles,
  Eye,
  FileText,
  PlayCircle
} from 'lucide-react';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  action: () => void;
  color?: string;
}

interface ContextualQuickActionsProps {
  messageContent: string;
  conversationTopic?: 'music' | 'netflix' | 'youtube' | 'github' | 'general';
  onAction: (actionId: string) => void;
  className?: string;
}

export function ContextualQuickActions({
  messageContent,
  conversationTopic,
  onAction,
  className = ''
}: ContextualQuickActionsProps) {
  // Analyze message content to determine context
  const detectTopic = (): 'music' | 'netflix' | 'youtube' | 'github' | 'general' => {
    if (conversationTopic) return conversationTopic;

    const content = messageContent.toLowerCase();
    if (content.includes('spotify') || content.includes('music') || content.includes('song') || content.includes('artist')) {
      return 'music';
    }
    if (content.includes('netflix') || content.includes('show') || content.includes('movie') || content.includes('series')) {
      return 'netflix';
    }
    if (content.includes('youtube') || content.includes('video') || content.includes('channel')) {
      return 'youtube';
    }
    if (content.includes('github') || content.includes('code') || content.includes('repository')) {
      return 'github';
    }
    return 'general';
  };

  const topic = detectTopic();

  // Define context-specific quick actions
  const getQuickActions = (): QuickAction[] => {
    const baseActions: QuickAction[] = [
      {
        id: 'deep-dive',
        label: 'Deep dive',
        icon: Sparkles,
        action: () => onAction('deep-dive')
      },
      {
        id: 'show-sources',
        label: 'Show data sources',
        icon: Eye,
        action: () => onAction('show-sources')
      },
      {
        id: 'export',
        label: 'Export insights',
        icon: Download,
        action: () => onAction('export')
      }
    ];

    switch (topic) {
      case 'music':
        return [
          {
            id: 'show-playlists',
            label: 'Show me playlists',
            icon: Music,
            action: () => onAction('show-playlists'),
            color: 'text-green-600'
          },
          {
            id: 'compare-artists',
            label: 'Compare artists',
            icon: BarChart3,
            action: () => onAction('compare-artists'),
            color: 'text-blue-600'
          },
          {
            id: 'mood-trends',
            label: 'Analyze mood trends',
            icon: TrendingUp,
            action: () => onAction('mood-trends'),
            color: 'text-purple-600'
          },
          ...baseActions
        ];

      case 'netflix':
        return [
          {
            id: 'viewing-patterns',
            label: 'View patterns',
            icon: Calendar,
            action: () => onAction('viewing-patterns'),
            color: 'text-red-600'
          },
          {
            id: 'genre-breakdown',
            label: 'Genre breakdown',
            icon: BarChart3,
            action: () => onAction('genre-breakdown'),
            color: 'text-orange-600'
          },
          {
            id: 'recommendations',
            label: 'Get recommendations',
            icon: Sparkles,
            action: () => onAction('recommendations'),
            color: 'text-purple-600'
          },
          ...baseActions
        ];

      case 'youtube':
        return [
          {
            id: 'top-channels',
            label: 'View top channels',
            icon: PlayCircle,
            action: () => onAction('top-channels'),
            color: 'text-red-600'
          },
          {
            id: 'learning-paths',
            label: 'Learning paths',
            icon: TrendingUp,
            action: () => onAction('learning-paths'),
            color: 'text-blue-600'
          },
          {
            id: 'watch-time',
            label: 'Watch time analysis',
            icon: Calendar,
            action: () => onAction('watch-time'),
            color: 'text-green-600'
          },
          ...baseActions
        ];

      case 'github':
        return [
          {
            id: 'coding-patterns',
            label: 'Coding patterns',
            icon: Zap,
            action: () => onAction('coding-patterns'),
            color: 'text-purple-600'
          },
          {
            id: 'language-breakdown',
            label: 'Language breakdown',
            icon: BarChart3,
            action: () => onAction('language-breakdown'),
            color: 'text-blue-600'
          },
          {
            id: 'contribution-graph',
            label: 'Contribution graph',
            icon: Calendar,
            action: () => onAction('contribution-graph'),
            color: 'text-green-600'
          },
          ...baseActions
        ];

      default:
        return [
          {
            id: 'visualize',
            label: 'Visualize this',
            icon: BarChart3,
            action: () => onAction('visualize')
          },
          ...baseActions,
          {
            id: 'compare',
            label: 'Compare time periods',
            icon: Calendar,
            action: () => onAction('compare')
          }
        ];
    }
  };

  const actions = getQuickActions();

  return (
    <div className={`flex items-center gap-2 overflow-x-auto py-2 scrollbar-hide ${className}`}>
      {actions.map((action, index) => {
        const Icon = action.icon;
        return (
          <motion.button
            key={action.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={action.action}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 transition-all whitespace-nowrap text-sm font-medium group"
          >
            <Icon className={`w-4 h-4 ${action.color || 'text-slate-600 dark:text-slate-300'}`} />
            <span className="text-slate-700 dark:text-slate-200">{action.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
