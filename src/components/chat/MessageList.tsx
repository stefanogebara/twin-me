import { forwardRef } from 'react';
import {
  Sparkles, Database, User,
  Lightbulb, RotateCcw, AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  failed?: boolean;
  contextUsed?: {
    soulSignature?: boolean;
    twinSummary?: string | null;
    memoryStream?: { total: number; reflections: number; facts: number };
    proactiveInsights?: Array<{ insight: string; category: string; urgency: string }>;
    platformData?: string[];
    personalityProfile?: boolean;
  };
}

interface Colors {
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  userBubble: string;
  userBubbleBg: string;
  userBubbleText: string;
  bgTertiary: string;
}

interface MessageListProps {
  messages: Message[];
  isTyping: boolean;
  colors: Colors;
  formatTime: (date: Date) => string;
  onRetry?: (content: string, messageId: string) => void;
}

// Design-system glass style for assistant bubbles
const assistantBubbleStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.06)',
  backdropFilter: 'blur(10px) saturate(140%)',
  WebkitBackdropFilter: 'blur(10px) saturate(140%)',
  border: '1px solid rgba(255, 255, 255, 0.10)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
  color: 'var(--foreground)',
} as React.CSSProperties;

export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
  ({ messages, isTyping, colors, formatTime, onRetry }, ref) => {
    return (
      <div className="px-4 py-6 space-y-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3",
              message.role === 'user' ? "justify-end" : "justify-start"
            )}
          >
            {message.role === 'assistant' && (
              <div
                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: 'var(--glass-surface-bg)' }}
              >
                <img src="/images/backgrounds/flower-hero.png" alt="" className="w-7 h-7 object-contain" />
              </div>
            )}

            <div className={cn("max-w-[80%]", message.role === 'user' && "order-first")}>
              <div
                className={cn(
                  "px-5 py-4 rounded-2xl",
                  message.role === 'user'
                    ? "rounded-br-md"
                    : "rounded-bl-md"
                )}
                style={
                  message.role === 'user'
                    ? {
                        backgroundColor: message.failed ? 'rgba(239,68,68,0.15)' : '#000000',
                        color: message.failed ? '#EF4444' : 'var(--foreground)',
                        border: message.failed ? '1px solid rgba(239,68,68,0.3)' : undefined,
                      }
                    : assistantBubbleStyle
                }
              >
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
                {message.failed && (
                  <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#EF4444' }} />
                    <span className="text-xs" style={{ color: '#EF4444' }}>Failed to send</span>
                    {onRetry && (
                      <button
                        onClick={() => onRetry(message.content, message.id)}
                        className="ml-auto flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-70"
                        style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444' }}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Retry
                      </button>
                    )}
                  </div>
                )}
              </div>

              {message.role === 'assistant' && message.contextUsed && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {message.contextUsed.memoryStream && message.contextUsed.memoryStream.total > 0 && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                      style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)', color: '#8B5CF6' }}
                    >
                      <Database className="w-3 h-3" />
                      {message.contextUsed.memoryStream.total} memories
                    </span>
                  )}
                  {message.contextUsed.platformData?.map(p => {
                    const platformColors: Record<string, string> = {
                      spotify: '#1DB954', calendar: '#4285F4',
                      google_calendar: '#4285F4', youtube: '#FF0000',
                    };
                    const color = platformColors[p] || 'var(--text-muted)';
                    return (
                      <span
                        key={p}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs capitalize"
                        style={{ backgroundColor: `${color}15`, color }}
                      >
                        {p.replace('google_', '')}
                      </span>
                    );
                  })}
                  {message.contextUsed.soulSignature && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                      style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B' }}
                    >
                      <Sparkles className="w-3 h-3" />
                      Identity
                    </span>
                  )}
                  {message.contextUsed.proactiveInsights && message.contextUsed.proactiveInsights.length > 0 && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                      style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10B981' }}
                    >
                      <Lightbulb className="w-3 h-3" />
                      {message.contextUsed.proactiveInsights.length} insight{message.contextUsed.proactiveInsights.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}

              <div
                className={cn(
                  "text-xs mt-1",
                  message.role === 'user' ? "text-right" : "text-left"
                )}
                style={{ color: 'var(--text-secondary)' }}
              >
                {formatTime(message.timestamp)}
              </div>
            </div>

            {message.role === 'user' && (
              <div
                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.10)' }}
              >
                <User className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3">
            <div
              className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
              style={{ backgroundColor: 'var(--glass-surface-bg)' }}
            >
              <img src="/images/backgrounds/flower-hero.png" alt="" className="w-7 h-7 object-contain" />
            </div>
            <div
              className="px-5 py-4 rounded-2xl rounded-bl-md"
              style={assistantBubbleStyle}
            >
              <div className="flex gap-1.5">
                <div
                  className="w-2 h-2 rounded-full animate-bounce"
                  style={{ backgroundColor: 'var(--foreground)', animationDelay: '0ms' }}
                />
                <div
                  className="w-2 h-2 rounded-full animate-bounce"
                  style={{ backgroundColor: 'var(--foreground)', animationDelay: '150ms' }}
                />
                <div
                  className="w-2 h-2 rounded-full animate-bounce"
                  style={{ backgroundColor: 'var(--foreground)', animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={ref} />
      </div>
    );
  }
);

MessageList.displayName = 'MessageList';
