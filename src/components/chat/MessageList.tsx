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

interface MessageListProps {
  messages: Message[];
  isTyping: boolean;
  formatTime: (date: Date) => string;
  onRetry?: (content: string, messageId: string) => void;
}

// User bubble: warm amber
const userBubbleStyle = {
  background: 'linear-gradient(135deg, #D97706, #B45309)',
  color: '#FFFFFF',
} as React.CSSProperties;

const userBubbleFailedStyle = {
  backgroundColor: 'rgba(239,68,68,0.15)',
  color: '#EF4444',
  border: '1px solid rgba(239,68,68,0.3)',
} as React.CSSProperties;

// Assistant bubble: glass effect with warm border
const assistantBubbleStyle = {
  background: 'var(--glass-surface-bg)',
  backdropFilter: 'blur(16px) saturate(160%)',
  WebkitBackdropFilter: 'blur(16px) saturate(160%)',
  border: '1px solid var(--glass-surface-border)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06), inset 0 1px 0 var(--glass-inset-highlight)',
  color: 'var(--foreground)',
} as React.CSSProperties;

export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
  ({ messages, isTyping, formatTime, onRetry }, ref) => {
    return (
      <div className="px-4 py-6 space-y-5">
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
                className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: 'var(--glass-surface-bg)' }}
              >
                <img src="/images/backgrounds/flower-hero.png" alt="" className="w-6 h-6 object-contain" />
              </div>
            )}

            <div className={cn("max-w-[80%]", message.role === 'user' && "order-first")}>
              <div
                className={cn(
                  "px-4 py-3 rounded-2xl",
                  message.role === 'user'
                    ? "rounded-br-md"
                    : "rounded-bl-md"
                )}
                style={
                  message.role === 'user'
                    ? (message.failed ? userBubbleFailedStyle : userBubbleStyle)
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
                      style={{ backgroundColor: 'var(--accent-vibrant-glow)', color: 'var(--accent-vibrant)' }}
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
                style={{ color: 'var(--text-muted)' }}
              >
                {formatTime(message.timestamp)}
              </div>
            </div>

            {message.role === 'user' && (
              <div
                className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-vibrant), var(--accent-vibrant-hover))',
                }}
              >
                <User className="w-3.5 h-3.5" style={{ color: '#1a1a17' }} />
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3">
            <div
              className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
              style={{ backgroundColor: 'var(--glass-surface-bg)' }}
            >
              <img src="/images/backgrounds/flower-hero.png" alt="" className="w-6 h-6 object-contain" />
            </div>
            <div
              className="px-4 py-3 rounded-2xl rounded-bl-md"
              style={assistantBubbleStyle}
            >
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ backgroundColor: 'var(--accent-vibrant)', animationDelay: '0ms' }}
                  />
                  <div
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ backgroundColor: 'var(--accent-vibrant)', animationDelay: '150ms' }}
                  />
                  <div
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ backgroundColor: 'var(--accent-vibrant)', animationDelay: '300ms' }}
                  />
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>thinking...</span>
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
