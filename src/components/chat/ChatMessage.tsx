/**
 * ChatMessage Component
 * Enhanced message display with:
 * - Message actions (copy, share, regenerate)
 * - Contextual quick actions
 */

import React, { useState } from 'react';
import { MessageActions } from './MessageActions';
import { ContextualQuickActions } from './ContextualQuickActions';
import { Bot, User } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  onRegenerate?: () => void;
  onQuickAction?: (actionId: string) => void;
  conversationTopic?: 'music' | 'youtube' | 'github' | 'general';
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
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group flex gap-4 px-6 py-4 rounded-xl"
      style={{
        backgroundColor: isAssistant ? 'rgba(255,255,255,0.02)' : 'transparent',
        border: isAssistant ? '1px solid var(--border-glass)' : undefined,
      }}
    >
      {/* Avatar */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
        style={{
          background: isAssistant
            ? 'linear-gradient(135deg, var(--foreground), rgba(255,255,255,0.4))'
            : 'linear-gradient(135deg, #6b7280, #4b5563)'
        }}
      >
        {isAssistant ? (
          <Bot className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
        ) : (
          <User className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
              {isAssistant ? 'Your Soul Twin' : 'You'}
            </span>
            {timestamp && (
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {/* Message Actions - Show on hover for assistant messages */}
          {isAssistant && showActions && isHovered && onRegenerate && (
            <div>
              <MessageActions
                messageContent={content}
                onRegenerate={onRegenerate}
              />
            </div>
          )}
        </div>

        {/* Message Content */}
        <div className="prose prose-sm max-w-none">
          <p className="whitespace-pre-wrap" style={{ color: 'var(--foreground)' }}>
            {content}
          </p>
        </div>

        {/* Contextual Quick Actions - Only for assistant messages */}
        {isAssistant && showActions && onQuickAction && (
          <div className="mt-4">
            <ContextualQuickActions
              messageContent={content}
              conversationTopic={conversationTopic}
              onAction={onQuickAction}
            />
          </div>
        )}
      </div>
    </div>
  );
}
