/**
 * ChatMessage Component
 * Enhanced message display with Grok-style features:
 * - Message actions (copy, share, regenerate)
 * - Contextual quick actions
 * - Smooth animations
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageActions } from './MessageActions';
import { ContextualQuickActions } from './ContextualQuickActions';
import { Bot, User } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  onRegenerate?: () => void;
  onQuickAction?: (actionId: string) => void;
  conversationTopic?: 'music' | 'netflix' | 'youtube' | 'github' | 'general';
  showActions?: boolean;
}

export function ChatMessage({
  role,
  content,
  timestamp,
  onRegenerate,
  onQuickAction,
  conversationTopic,
  showActions = true
}: ChatMessageProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isAssistant = role === 'assistant';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group flex gap-4 ${isAssistant ? 'bg-stone-50 dark:bg-stone-900' : ''} px-6 py-4 rounded-xl`}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isAssistant
          ? 'bg-gradient-to-br from-orange-400 to-orange-600'
          : 'bg-gradient-to-br from-blue-400 to-blue-600'
      }`}>
        {isAssistant ? (
          <Bot className="w-5 h-5 text-white" />
        ) : (
          <User className="w-5 h-5 text-white" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {isAssistant ? 'Your Soul Twin' : 'You'}
            </span>
            {timestamp && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {/* Message Actions - Show on hover for assistant messages */}
          <AnimatePresence>
            {isAssistant && showActions && isHovered && onRegenerate && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                <MessageActions
                  messageContent={content}
                  onRegenerate={onRegenerate}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Message Content */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {content}
          </p>
        </div>

        {/* Contextual Quick Actions - Only for assistant messages */}
        {isAssistant && showActions && onQuickAction && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className="mt-4"
          >
            <ContextualQuickActions
              messageContent={content}
              conversationTopic={conversationTopic}
              onAction={onQuickAction}
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
