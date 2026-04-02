import { forwardRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';

const REMARK_PLUGINS = [remarkGfm];
import { RotateCcw, AlertCircle, WifiOff, Clock, ThumbsUp, ThumbsDown, Copy, Check } from 'lucide-react';
import { WorkspaceActionCard } from './WorkspaceActionCard';

type ChatErrorType = 'timeout' | 'rate_limit' | 'network' | 'generic';

function getErrorMessage(errorType?: ChatErrorType): string {
  switch (errorType) {
    case 'timeout':
      return "Your twin is taking longer than usual. Try again \u2014 the first message after a while can be slow.";
    case 'rate_limit':
      return "You've sent too many messages. Take a breath and try again in a minute.";
    case 'network':
      return "You're offline. Connect to the internet to chat with your twin.";
    default:
      return "Couldn't reach your twin. This usually means the server is warming up.";
  }
}

function getErrorIcon(errorType?: ChatErrorType) {
  switch (errorType) {
    case 'timeout':
      return <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(239,68,68,0.8)' }} />;
    case 'network':
      return <WifiOff className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(239,68,68,0.8)' }} />;
    default:
      return <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(239,68,68,0.8)' }} />;
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

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
  errorType?: ChatErrorType;
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

/** Track which messages were recently copied (for icon feedback). */
function useCopiedMessages() {
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const markCopied = (messageId: string) => {
    setCopied(prev => ({ ...prev, [messageId]: true }));
    setTimeout(() => {
      setCopied(prev => ({ ...prev, [messageId]: false }));
    }, 2000);
  };
  return { copied, markCopied };
}

export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
  ({ messages, isTyping, formatTime, onRetry, onRate }, ref) => {
    const { rated, markRated } = useRatedMessages();
    const { copied, markCopied } = useCopiedMessages();
    return (
      <div className="px-3 sm:px-4 py-6 max-w-full md:max-w-3xl md:mx-auto w-full">
        {messages.map((message, index) => {
          const isUser = message.role === 'user';
          const isLast = index === messages.length - 1;

          const Wrapper = isLast ? motion.div : 'div';
          const wrapperProps = isLast
            ? {
                initial: { opacity: 0, y: 12, scale: 0.98 },
                animate: { opacity: 1, y: 0, scale: 1 },
                transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
              }
            : {};

          return (
            <Wrapper key={message.id} className="py-4" {...wrapperProps}>
              {isUser ? (
                /* ── User message: right-aligned, no background ── */
                <div className="flex flex-col items-end">
                  <div className="max-w-[90%] sm:max-w-[80%] px-1 py-2">
                    <p
                      className="whitespace-pre-wrap text-right"
                      style={{
                        fontSize: '13px',
                        color: message.failed ? '#EF4444' : '#EDEDED',
                        opacity: message.failed ? 0.8 : 1,
                        lineHeight: 1.7,
                      }}
                    >
                      {message.content}
                    </p>

                    {message.failed && (
                      <div
                        className="mt-3 rounded-xl px-4 py-3"
                        style={{
                          backgroundColor: 'rgba(239,68,68,0.08)',
                          border: '1px solid rgba(239,68,68,0.15)',
                        }}
                      >
                        <div className="flex items-start gap-2.5">
                          {getErrorIcon(message.errorType)}
                          <p
                            className="text-[13px] leading-relaxed"
                            style={{ color: 'rgba(239,68,68,0.8)' }}
                          >
                            {getErrorMessage(message.errorType)}
                          </p>
                        </div>
                        {onRetry && message.errorType !== 'rate_limit' && (
                          <div className="mt-2.5 flex justify-end">
                            <button
                              onClick={() => onRetry(message.content, message.id)}
                              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors"
                              style={{
                                backgroundColor: 'rgba(239,68,68,0.1)',
                                color: 'rgba(239,68,68,0.9)',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'; }}
                            >
                              <RotateCcw className="w-3 h-3" />
                              Try again
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div
                    className="text-[11px] mt-1.5 text-right pr-1"
                    style={{ color: 'rgba(255,255,255,0.3)' }}
                  >
                    {formatRelativeTime(message.timestamp)}
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
                      className="prose prose-invert max-w-none [&>p]:mb-5 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>h3]:mt-6 [&>h3]:mb-2 [&>hr]:my-5 [&>ul]:mb-5 [&>ol]:mb-5"
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
                      <div
                        className="mt-3 rounded-xl px-4 py-3"
                        style={{
                          backgroundColor: 'rgba(239,68,68,0.08)',
                          border: '1px solid rgba(239,68,68,0.15)',
                        }}
                      >
                        <div className="flex items-start gap-2.5">
                          {getErrorIcon(message.errorType)}
                          <p
                            className="text-[13px] leading-relaxed"
                            style={{ color: 'rgba(239,68,68,0.8)' }}
                          >
                            {getErrorMessage(message.errorType)}
                          </p>
                        </div>
                        {onRetry && message.errorType !== 'rate_limit' && (
                          <div className="mt-2.5 flex justify-start">
                            <button
                              onClick={() => onRetry(message.content, message.id)}
                              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors"
                              style={{
                                backgroundColor: 'rgba(239,68,68,0.1)',
                                color: 'rgba(239,68,68,0.9)',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'; }}
                            >
                              <RotateCcw className="w-3 h-3" />
                              Try again
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Metadata row: context badges (muted) + rating ── */}
                    {(message.contextUsed || !message.failed) && (
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

                        {/* Copy + Thumbs — primary visible elements */}
                        {!message.failed && (
                          <div className="flex items-center gap-1 ml-auto">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(message.content);
                                markCopied(message.id);
                              }}
                              className="p-1 rounded-md transition-all hover:scale-110"
                              style={{ color: copied[message.id] ? 'rgba(134,239,172,0.7)' : 'rgba(255,255,255,0.35)' }}
                              aria-label="Copy message"
                              title={copied[message.id] ? 'Copied!' : 'Copy'}
                            >
                              {copied[message.id]
                                ? <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                            </button>
                            {onRate && (rated[message.id] != null ? (
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
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div
                      className="text-[11px] mt-1.5 text-left"
                      style={{ color: 'rgba(255,255,255,0.3)' }}
                    >
                      {formatRelativeTime(message.timestamp)}
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
