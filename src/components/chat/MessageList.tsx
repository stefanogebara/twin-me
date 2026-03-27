import { forwardRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';

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
        {messages.map((message, index) => {
          const isUser = message.role === 'user';
          const isLast = index === messages.length - 1;

          const Wrapper = isLast ? motion.div : 'div';
          const wrapperProps = isLast
            ? {
                initial: { opacity: 0, y: 8 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.3, ease: 'easeOut' as const },
              }
            : {};

          return (
            <Wrapper key={message.id} className="py-4" {...wrapperProps}>
              {isUser ? (
                /* ── User message: right-aligned, no background ── */
                <div className="flex flex-col items-end">
                  <div className="max-w-[80%] px-1 py-2">
                    <p
                      className="whitespace-pre-wrap text-right"
                      style={{
                        fontSize: '15px',
                        color: message.failed ? '#EF4444' : '#EDEDED',
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
                      className="prose prose-invert max-w-none [&>p]:mb-4 [&>p:last-child]:mb-0 [&>h3]:mt-6 [&>h3]:mb-2 [&>hr]:my-5 [&>ul]:mb-4 [&>ol]:mb-4"
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

                    {/* ── Metadata row: context badges (muted) + rating ── */}
                    {(message.contextUsed || (!message.failed && onRate)) && (
                      <div
                        className="flex flex-wrap items-center gap-2 mt-3 pt-2"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                      >
                        {/* Context badges — small and muted */}
                        {message.contextUsed?.memoryStream && message.contextUsed.memoryStream.total > 0 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ color: 'rgba(255,255,255,0.25)', opacity: 0.6 }}
                          >
                            {message.contextUsed.memoryStream.total} memories
                          </span>
                        )}
                        {message.contextUsed?.proactiveInsights && message.contextUsed.proactiveInsights.length > 0 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ color: 'rgba(255,255,255,0.25)', opacity: 0.6 }}
                          >
                            {message.contextUsed.proactiveInsights.length} insight{message.contextUsed.proactiveInsights.length > 1 ? 's' : ''}
                          </span>
                        )}

                        {/* Thumbs up/down — primary visible elements */}
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
            </Wrapper>
          );
        })}

        {isTyping && (
          <div className="flex flex-col items-start py-2" role="status" aria-label="Twin is thinking">
            <div className="flex items-center gap-2.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: 'var(--accent-vibrant)',
                  animation: 'thinking-pulse 1.5s ease-in-out infinite',
                }}
                aria-hidden="true"
              />
              <span
                className="text-[13px] font-medium"
                style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif' }}
              >
                Thinking...
              </span>
            </div>
            <style>{`
              @keyframes thinking-pulse {
                0%, 100% { opacity: 0.3; transform: scale(0.85); }
                50% { opacity: 1; transform: scale(1.15); }
              }
            `}</style>
          </div>
        )}

        <div ref={ref} />
      </div>
    );
  }
);

MessageList.displayName = 'MessageList';
