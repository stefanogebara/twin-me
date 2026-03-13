import { forwardRef } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface ChatUsage {
  used: number;
  limit: number;
  remaining: number;
  tier: string;
}

interface ChatInputAreaProps {
  inputMessage: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  isTyping: boolean;
  isDisabled: boolean;
  limitReached: boolean;
  hasConnectedPlatforms: boolean;
  chatUsage: ChatUsage | null;
}

export const ChatInputArea = forwardRef<HTMLTextAreaElement, ChatInputAreaProps>(
  ({
    inputMessage,
    onInputChange,
    onKeyDown,
    onSend,
    isTyping,
    isDisabled,
    limitReached,
    hasConnectedPlatforms,
    chatUsage,
  }, ref) => {
    const hasText = inputMessage.trim().length > 0;

    return (
      <div className="px-6 pb-6 pt-2 max-w-3xl mx-auto w-full">
        <div
          className="flex items-end gap-3 rounded-2xl px-4 py-3"
          style={{
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <label htmlFor="twin-chat-input" className="sr-only">
            Message your twin
          </label>
          <textarea
            id="twin-chat-input"
            ref={ref}
            placeholder={hasConnectedPlatforms
              ? "Say something..."
              : "Connect platforms to start chatting..."
            }
            value={inputMessage}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isDisabled || limitReached}
            rows={1}
            aria-label="Message your twin"
            className="flex-1 resize-none focus:outline-none disabled:opacity-50 text-[15px] bg-transparent"
            style={{
              color: 'var(--foreground)',
              minHeight: '24px',
              maxHeight: '120px',
              caretColor: '#10b77f',
              fontFamily: 'Inter, sans-serif',
            }}
          />

          <div className="flex items-center gap-2 flex-shrink-0">
            {chatUsage && chatUsage.tier === 'free' && (
              <span
                className="text-[11px] whitespace-nowrap"
                style={{
                  color: chatUsage.remaining <= 2
                    ? 'rgba(239,68,68,0.6)'
                    : 'rgba(255,255,255,0.2)',
                }}
                title={`${chatUsage.remaining} of ${chatUsage.limit} free messages remaining`}
              >
                {chatUsage.remaining} left
              </span>
            )}

            {/* Circular emerald send button */}
            <button
              onClick={onSend}
              disabled={!hasText || isDisabled || isTyping || limitReached}
              aria-label={isTyping ? 'Twin is responding...' : 'Send message'}
              className="flex items-center justify-center transition-all"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: hasText && !isDisabled && !limitReached
                  ? '#10b77f'
                  : 'rgba(255,255,255,0.06)',
                color: hasText && !isDisabled && !limitReached
                  ? '#0a0f0a'
                  : 'rgba(255,255,255,0.2)',
                cursor: (!hasText || isDisabled || limitReached) ? 'not-allowed' : 'pointer',
                flexShrink: 0,
              }}
            >
              {isTyping ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }
);

ChatInputArea.displayName = 'ChatInputArea';
