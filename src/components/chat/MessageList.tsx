import { forwardRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const REMARK_PLUGINS = [remarkGfm];
import { RotateCcw, AlertCircle, ThumbsUp, ThumbsDown } from 'lucide-react';
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
  onRate?: (messageId: string, rating: number, messageContent: string, userMessage: string | null) => void;
}

/** Track which messages the user has already rated this session. */
function useRatedMessages() {
  const [rated, setRated] = useState<Record<string, number>>({});
  const markRated = (messageId: string, rating: number) =>
    setRated(prev => ({ ...prev, [messageId]: rating }));
  return { rated, markRated };
}

export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
  ({ messages, isTyping, formatTime, onRetry, onRate }, ref) => {
    const { rated, markRated } = useRatedMessages();
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
                  style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
                />
              )}

              <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
                <div className={cn(
                  "max-w-[90%] sm:max-w-[85%] lg:max-w-[75%] rounded-2xl px-4 py-3",
                  isUser ? "text-right" : "text-left"
                )} style={{
                  backgroundColor: isUser ? 'rgba(255,132,0,0.08)' : 'rgba(255,255,255,0.03)',
                  border: isUser ? '1px solid rgba(255,132,0,0.12)' : '1px solid rgba(255,255,255,0.06)',
                }}>
                  {message.role === 'assistant' ? (
                    <div
                      className="prose prose-sm prose-invert max-w-none"
                      style={{
                        fontSize: '15px',
                        color: 'var(--foreground)',
                        opacity: 0.9,
                        lineHeight: 1.7,
                      }}
                    >
                      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p
                      className="whitespace-pre-wrap"
                      style={{
                        fontSize: '15px',
                        color: message.failed ? '#EF4444' : 'var(--foreground)',
                        opacity: message.failed ? 0.8 : 1,
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
                          style={{ color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.1)' }}
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

                  {/* Thumbs up/down — assistant messages only */}
                  {message.role === 'assistant' && !message.failed && onRate && (
                    <div className="flex items-center gap-1 mt-2">
                      {rated[message.id] != null ? (
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full"
                          style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          {rated[message.id] === 1 ? 'Thanks!' : 'Noted'}
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              const prevUserMsg = messages
                                .slice(0, messages.findIndex(m => m.id === message.id))
                                .reverse()
                                .find(m => m.role === 'user');
                              markRated(message.id, 1);
                              onRate(message.id, 1, message.content, prevUserMsg?.content ?? null);
                            }}
                            className="p-1 rounded-md transition-all hover:scale-110"
                            style={{ color: 'rgba(255,255,255,0.35)' }}
                            title="Helpful"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              const prevUserMsg = messages
                                .slice(0, messages.findIndex(m => m.id === message.id))
                                .reverse()
                                .find(m => m.role === 'user');
                              markRated(message.id, -1);
                              onRate(message.id, -1, message.content, prevUserMsg?.content ?? null);
                            }}
                            className="p-1 rounded-md transition-all hover:scale-110"
                            style={{ color: 'rgba(255,255,255,0.35)' }}
                            title="Not helpful"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  <div
                    className={cn("text-[11px] mt-1.5", isUser ? "text-right" : "text-left")}
                    style={{ color: 'rgba(255,255,255,0.35)' }}
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
                  style={{ backgroundColor: '#ff8400', animationDelay: '0ms' }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ backgroundColor: '#ff8400', animationDelay: '150ms' }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ backgroundColor: '#ff8400', animationDelay: '300ms' }}
                />
              </div>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>thinking...</span>
            </div>
          </div>
        )}

        <div ref={ref} />
      </div>
    );
  }
);

MessageList.displayName = 'MessageList';
