import { forwardRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';

// Audit bug C2 (2026-05-12): unlimited tiers (max) return limit=null /
// remaining=null. All consumers must guard against null before rendering.
interface ChatUsage {
  used: number;
  limit: number | null;
  remaining: number | null;
  tier: string;
  unlimited?: boolean;
}

interface ChatInputAreaProps {
  inputMessage: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  isTyping: boolean;
  isDisabled: boolean;
  limitReached: boolean;
  chatUsage: ChatUsage | null;
  ghostSuggestion?: string;
}

// Short enough to stay on one line in a phone's composer (16px there, so iOS
// does not zoom on focus): the longer versions wrapped and were cut off.
const getSmartPlaceholder = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Ask about your day ahead";
  if (hour < 17) return "How's the day going?";
  if (hour < 21) return "What's on your mind tonight?";
  return "Late night thoughts? I'm here";
};

export const ChatInputArea = forwardRef<HTMLTextAreaElement, ChatInputAreaProps>(
  ({
    inputMessage,
    onInputChange,
    onKeyDown,
    onSend,
    isTyping,
    isDisabled,
    limitReached,
    chatUsage,
    ghostSuggestion,
  }, ref) => {
    const hasText = inputMessage.trim().length > 0;
    const [isFocused, setIsFocused] = useState(false);

    return (
      <div className="px-3 sm:px-6 pb-6 pt-2 max-w-3xl mx-auto w-full">
        {/* The register's composer: the warm field (no border, a 4 corner)
            holding one ink send button. Focus draws the ink outline. */}
        <div
          className="flex items-center gap-3"
          style={{
            background: 'var(--rg-field)',
            borderRadius: 'var(--rg-radius)',
            minHeight: 'var(--rg-field-height)',
            padding: '6px 6px 6px 14px',
            outline: isFocused ? '2px solid var(--rg-ink)' : 'none',
            outlineOffset: 0,
            opacity: limitReached ? 0.4 : 1,
            pointerEvents: limitReached ? 'none' : 'auto',
          }}
        >
          <label htmlFor="twin-chat-input" className="sr-only">
            Message your twin
          </label>
          <div className="flex-1 relative">
            <textarea
              id="twin-chat-input"
              ref={ref}
              placeholder={ghostSuggestion && !inputMessage ? '' : getSmartPlaceholder()}
              value={inputMessage}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && ghostSuggestion && !inputMessage.trim()) {
                  e.preventDefault();
                  onInputChange(ghostSuggestion);
                  return;
                }
                onKeyDown(e);
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={isDisabled || limitReached}
              rows={1}
              aria-label="Message your twin"
              className="w-full resize-none focus:outline-none disabled:opacity-50 bg-transparent placeholder:text-[var(--rg-ink-3)]"
              style={{
                color: 'var(--rg-ink)',
                fontFamily: 'var(--rg-sans)',
                fontSize: 'var(--rg-text)',
                lineHeight: 'var(--rg-line)',
                letterSpacing: 'var(--rg-track)',
                minHeight: '24px',
                maxHeight: '120px',
                caretColor: 'var(--rg-ink)',
              }}
            />
            {ghostSuggestion && !inputMessage && (
              <div className="absolute inset-0 flex items-center pointer-events-none overflow-hidden">
                {/* The suggestion stands in for the placeholder, in the placeholder's quiet ink. */}
                <span className="truncate" style={{ color: 'var(--rg-ink-3)', fontWeight: 350 }}>
                  {ghostSuggestion}
                </span>
                <span
                  className="ml-2 px-1.5 rounded flex-shrink-0 hidden sm:inline"
                  style={{ color: 'var(--rg-ink-2)', border: '1px solid var(--rg-rule)', background: 'var(--rg-white)' }}
                >
                  Tab
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {chatUsage && typeof chatUsage.limit === 'number' && typeof chatUsage.remaining === 'number' && (
              <span
                className="whitespace-nowrap"
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  color: chatUsage.remaining <= 5 ? 'var(--rg-danger)' : 'var(--rg-ink-3)',
                }}
                title={`${chatUsage.remaining} of ${chatUsage.limit} messages remaining this month`}
              >
                {chatUsage.remaining} left
              </span>
            )}

            {/* The screen's one ink primary: 32 square, a 4 corner. */}
            <button
              onClick={onSend}
              disabled={!hasText || isDisabled || isTyping || limitReached}
              aria-label={isTyping ? 'Twin is responding...' : 'Send message'}
              className="flex items-center justify-center transition-opacity duration-200 hover:opacity-[0.86] disabled:opacity-40"
              style={{
                width: 'var(--rg-button)',
                height: 'var(--rg-button)',
                borderRadius: 'var(--rg-radius)',
                border: 0,
                background: 'var(--rg-ink)',
                color: 'var(--rg-page)',
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
        {/* replan-2026-06-10 chat declutter: 'Connect Your Tools' row deleted —
            a permanent acquisition CTA under the composer served no job for
            connected users; the empty-state Connect CTA covers the rest. */}
      </div>
    );
  }
);

ChatInputArea.displayName = 'ChatInputArea';
