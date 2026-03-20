import { forwardRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const REMARK_PLUGINS = [remarkGfm];
import { RotateCcw, AlertCircle } from 'lucide-react';
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

export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
  ({ messages, isTyping, formatTime, onRetry }, ref) => {
    return (
      <div className="px-6 py-8 space-y-6 max-w-3xl mx-auto w-full">
        {messages.map((message, idx) => {
          const isUser = message.role === 'user';
          const showDivider = idx > 0 && messages[idx - 1].role !== message.role;

          return (
            <div key={message.id}>
              {showDivider && (
                <div
                  className="my-6"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                />
              )}

              <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
                {/* Glass bubbles per Design Rule #1 */}
                <div
                  className={cn("max-w-[85%]", isUser ? "text-right" : "text-left")}
                  style={isUser ? {
                    background: 'var(--accent-vibrant-glow, rgba(255,132,0,0.12))',
                    border: '1px solid rgba(255,132,0,0.2)',
                    borderRadius: '20px',
                    padding: '12px 16px',
                  } : {
                    background: 'var(--glass-surface-bg, rgba(72,65,65,0.6))',
                    backdropFilter: 'blur(42px)',
                    WebkitBackdropFilter: 'blur(42px)',
                    border: '1px solid var(--glass-surface-border, rgba(94,86,86,0.6))',
                    borderRadius: '20px',
                    padding: '12px 16px',
                    boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
                  }}
                >
                  {message.role === 'assistant' ? (
                    <div
                      className="prose prose-sm prose-invert max-w-none leading-relaxed"
                      style={{
                        fontSize: '15px',
                        color: 'var(--foreground)',
                        opacity: 0.85,
                        lineHeight: 1.7,
                      }}
                    >
                      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p
                      className="whitespace-pre-wrap leading-relaxed"
                      style={{
                        fontSize: '15px',
                        color: message.failed ? '#EF4444' : 'var(--foreground)',
                        opacity: message.failed ? 0.8 : 0.95,
                        lineHeight: 1.7,
                      }}
                    >
                      {message.content}
                    </p>
                  )}

                  {message.failed && (
                    <div className="flex items-center gap-2 mt-2 justify-end">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#EF4444' }} />
                      <span className="text-xs" style={{ color: '#EF4444' }}>Failed to send</span>
                      {onRetry && (
                        <button
                          onClick={() => onRetry(message.content, message.id)}
                          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-70"
                          style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444' }}
                        >
                          <RotateCcw className="w-3 h-3" />
                          Retry
                        </button>
                      )}
                    </div>
                  )}

                  {/* Context badges — minimal, below twin messages */}
                  {message.role === 'assistant' && message.contextUsed && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {message.contextUsed.memoryStream && message.contextUsed.memoryStream.total > 0 && (
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full"
                          style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          {message.contextUsed.memoryStream.total} memories
                        </span>
                      )}
                      {message.contextUsed.proactiveInsights && message.contextUsed.proactiveInsights.length > 0 && (
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full"
                          style={{ color: '#10b77f', border: '1px solid rgba(16,183,127,0.15)' }}
                        >
                          {message.contextUsed.proactiveInsights.length} insight{message.contextUsed.proactiveInsights.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}

                  <div
                    className={cn("text-[11px] mt-1.5", isUser ? "text-right" : "text-left")}
                    style={{ color: 'rgba(255,255,255,0.2)' }}
                  >
                    {formatTime(message.timestamp)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ backgroundColor: '#10b77f', animationDelay: '0ms' }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ backgroundColor: '#10b77f', animationDelay: '150ms' }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ backgroundColor: '#10b77f', animationDelay: '300ms' }}
                />
              </div>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>thinking...</span>
            </div>
          </div>
        )}

        <div ref={ref} />
      </div>
    );
  }
);

MessageList.displayName = 'MessageList';
