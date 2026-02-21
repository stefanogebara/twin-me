import { forwardRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import {
  Sparkles, Database, User,
  Lightbulb
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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
}

export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
  ({ messages, isTyping, colors, formatTime }, ref) => {
    const mdComponents = useMemo<Components>(() => ({
      p: ({ children }) => (
        <p className="text-[15px] leading-relaxed mb-2 last:mb-0">{children}</p>
      ),
      strong: ({ children }) => (
        <strong className="font-semibold">{children}</strong>
      ),
      em: ({ children }) => (
        <em className="italic" style={{ color: colors.textSecondary }}>{children}</em>
      ),
      ul: ({ children }) => (
        <ul className="text-[15px] leading-relaxed list-disc pl-5 mb-2 space-y-1">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="text-[15px] leading-relaxed list-decimal pl-5 mb-2 space-y-1">{children}</ol>
      ),
      li: ({ children }) => (
        <li className="text-[15px] leading-relaxed">{children}</li>
      ),
      code: ({ children, className }) => {
        const isBlock = className?.includes('language-');
        if (isBlock) {
          return (
            <code
              className="block text-[13px] leading-relaxed rounded-lg p-3 my-2 overflow-x-auto"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
            >
              {children}
            </code>
          );
        }
        return (
          <code
            className="text-[13px] px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
          >
            {children}
          </code>
        );
      },
      pre: ({ children }) => <pre className="my-2">{children}</pre>,
      blockquote: ({ children }) => (
        <blockquote
          className="border-l-2 pl-3 my-2 italic"
          style={{ borderColor: colors.accent, color: colors.textSecondary }}
        >
          {children}
        </blockquote>
      ),
      a: ({ href, children }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:opacity-80 transition-opacity"
          style={{ color: colors.accent }}
        >
          {children}
        </a>
      ),
      h1: ({ children }) => <h3 className="text-base font-semibold mb-1 mt-3 first:mt-0">{children}</h3>,
      h2: ({ children }) => <h4 className="text-[15px] font-semibold mb-1 mt-3 first:mt-0">{children}</h4>,
      h3: ({ children }) => <h5 className="text-[15px] font-medium mb-1 mt-2 first:mt-0">{children}</h5>,
      hr: () => <hr className="my-3 border-t" style={{ borderColor: colors.bgTertiary }} />,
    }), [colors]);

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
                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: colors.accent }}
              >
                <Sparkles className="w-4 h-4 text-white" />
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
                style={{
                  backgroundColor: message.role === 'user'
                    ? colors.userBubbleBg
                    : colors.userBubble,
                  color: message.role === 'user' ? colors.userBubbleText : colors.text
                }}
              >
                {message.role === 'assistant' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {message.content}
                  </ReactMarkdown>
                ) : (
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
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
                      spotify: '#1DB954', whoop: '#00A5E0', calendar: '#4285F4',
                      google_calendar: '#4285F4', youtube: '#FF0000', twitch: '#9146FF',
                    };
                    const color = platformColors[p] || colors.textMuted;
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
                style={{ color: colors.textMuted }}
              >
                {formatTime(message.timestamp)}
              </div>
            </div>

            {message.role === 'user' && (
              <div
                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: colors.bgTertiary }}
              >
                <User className="w-4 h-4" style={{ color: colors.textSecondary }} />
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3">
            <div
              className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: colors.accent }}
            >
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div
              className="px-4 py-3 rounded-2xl rounded-bl-md"
              style={{ backgroundColor: colors.userBubble }}
            >
              <div className="flex gap-1.5">
                <div
                  className="w-2 h-2 rounded-full animate-bounce"
                  style={{ backgroundColor: colors.accent, animationDelay: '0ms' }}
                />
                <div
                  className="w-2 h-2 rounded-full animate-bounce"
                  style={{ backgroundColor: colors.accent, animationDelay: '150ms' }}
                />
                <div
                  className="w-2 h-2 rounded-full animate-bounce"
                  style={{ backgroundColor: colors.accent, animationDelay: '300ms' }}
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
