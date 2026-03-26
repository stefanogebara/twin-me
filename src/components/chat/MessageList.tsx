import { forwardRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const REMARK_PLUGINS = [remarkGfm];
import { RotateCcw, AlertCircle, ThumbsUp, ThumbsDown } from 'lucide-react';
import { WorkspaceActionCard } from './WorkspaceActionCard';

interface ActionEvent {
  tool: string;
  params?: Record<string, any>;
  status: 'executing' | 'complete' | 'failed';
  data?: any;
  elapsedMs?: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  failed?: boolean;
  actions?: ActionEvent[];
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
      <div className="px-4 py-6 max-w-3xl mx-auto w-full">
        {messages.map((message) => {
          const isUser = message.role === 'user';

          return (
            <div key={message.id} className="py-4">
              {isUser ? (
                /* ── User message: subtle right-aligned pill ── */
                <div className="flex flex-col items-end">
                  <div
                    className="max-w-[80%] rounded-[20px] px-4 py-3"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                    }}
                  >
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
                  </div>
                  <div
                    className="text-[11px] mt-1.5 text-right pr-1"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
                  >
                    {formatTime(message.timestamp)}
                  </div>
                </div>
              ) : (
                /* ── Assistant message: no background, text directly on page bg ── */
                <div className="flex flex-col items-start">
                  <div className="w-full">
                    {message.actions && message.actions.length > 0 && (
                      <div className="mb-3">
                        {message.actions.map((action, i) => (
                          <WorkspaceActionCard key={`${action.tool}-${i}`} action={action} />
                        ))}
                      </div>
                    )}

                    <div
                      className="prose prose-sm prose-invert max-w-none"
                      style={{
                        fontSize: '14px',
                        color: '#D1D5DB',
                        lineHeight: '24px',
                      }}
                    >
                      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
                        {message.content}
                      </ReactMarkdown>
                    </div>

                    {message.failed && (
                      <div className="flex items-center gap-2 mt-2">
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

                    {/* ── Metadata row: context badges + rating + timestamp ── */}
                    {(message.contextUsed || (!message.failed && onRate)) && (
                      <div
                        className="flex flex-wrap items-center gap-3 mt-3 pt-2"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                      >
                        {/* Context badges */}
                        {message.contextUsed?.memoryStream && message.contextUsed.memoryStream.total > 0 && (
                          <span
                            className="text-[11px] px-2 py-0.5 rounded-full"
                            style={{ color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            {message.contextUsed.memoryStream.total} memories
                          </span>
                        )}
                        {message.contextUsed?.proactiveInsights && message.contextUsed.proactiveInsights.length > 0 && (
                          <span
                            className="text-[11px] px-2 py-0.5 rounded-full"
                            style={{ color: '#10b77f', border: '1px solid rgba(16,183,127,0.15)' }}
                          >
                            {message.contextUsed.proactiveInsights.length} insight{message.contextUsed.proactiveInsights.length > 1 ? 's' : ''}
                          </span>
                        )}

                        {/* Thumbs up/down */}
                        {!message.failed && onRate && (
                          <div className="flex items-center gap-1 ml-auto">
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
                                  aria-label="Rate as helpful"
                                  title="Helpful"
                                >
                                  <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
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
                                  aria-label="Rate as not helpful"
                                  title="Not helpful"
                                >
                                  <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div
                      className="text-[11px] mt-1.5 text-left"
                      style={{ color: 'rgba(255,255,255,0.35)' }}
                    >
                      {formatTime(message.timestamp)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {isTyping && (
          <div className="flex flex-col items-start" role="status" aria-label="Twin is thinking">
            <div className="flex items-center gap-2">
              <div className="flex gap-1" aria-hidden="true">
                <div
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ backgroundColor: 'var(--accent-vibrant)', animationDelay: '0ms' }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ backgroundColor: 'var(--accent-vibrant)', animationDelay: '150ms' }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ backgroundColor: 'var(--accent-vibrant)', animationDelay: '300ms' }}
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
