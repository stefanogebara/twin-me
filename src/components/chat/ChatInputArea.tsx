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
          className="flex items-center gap-3 rounded-[20px] px-5 py-3 transition-opacity"
          style={{
            background: 'var(--glass-surface-bg)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            border: '1px solid var(--glass-surface-border)',
            boxShadow: '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 var(--border-glass)',
            opacity: limitReached ? 0.4 : 1,
            pointerEvents: limitReached ? 'none' : 'auto',
          }}
        >
          <label htmlFor="twin-chat-input" className="sr-only">
            Message your twin
          </label>
          <textarea
            id="twin-chat-input"
            ref={ref}
            placeholder="Message your twin..."
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
              caretColor: 'var(--accent-vibrant)',
              fontFamily: 'Inter, sans-serif',
            }}
          />

          <div className="flex items-center gap-2 flex-shrink-0">
            {chatUsage && chatUsage.limit != null && chatUsage.limit !== Infinity && (
              <span
                className="text-xs whitespace-nowrap"
                style={{
                  color: chatUsage.remaining <= 5
                    ? '#ef4444'
                    : 'rgba(255,255,255,0.3)',
                }}
                title={`${chatUsage.remaining} of ${chatUsage.limit} messages remaining this month`}
              >
                {chatUsage.remaining} left
              </span>
            )}

            {/* Circular send button — Rule 2.10: 150ms hover/press */}
            <button
              onClick={onSend}
              disabled={!hasText || isDisabled || isTyping || limitReached}
              aria-label={isTyping ? 'Twin is responding...' : 'Send message'}
              className="flex items-center justify-center transition-all duration-150 ease-out hover:brightness-110 active:scale-95"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '100px',
                padding: '8px',
                background: hasText && !isDisabled && !limitReached
                  ? '#252222'
                  : 'var(--border-glass)',
                color: hasText && !isDisabled && !limitReached
                  ? 'var(--foreground)'
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
