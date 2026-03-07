import { forwardRef } from 'react';
import {
  MessageCircle, Send, Loader2,
  Sparkles, Mic, Paperclip
} from 'lucide-react';

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
      <div className="p-4">
        <div
          className="rounded-2xl overflow-hidden transition-all"
          style={{
            background: 'var(--glass-surface-bg)',
            backdropFilter: 'blur(16px) saturate(160%)',
            WebkitBackdropFilter: 'blur(16px) saturate(160%)',
            border: '1px solid var(--glass-surface-border)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06), inset 0 1px 0 var(--glass-inset-highlight)',
          }}
        >
          <textarea
            ref={ref}
            placeholder={hasConnectedPlatforms
              ? "Ask your twin anything..."
              : "Connect platforms to start chatting..."
            }
            value={inputMessage}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isDisabled || limitReached}
            rows={1}
            className="w-full px-4 py-3 resize-none focus:outline-none disabled:opacity-50 text-[15px]"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--foreground)',
              minHeight: '48px',
              maxHeight: '120px',
              caretColor: 'var(--accent-vibrant)',
            }}
          />

          <div
            className="flex items-center justify-between px-3 py-2 border-t"
            style={{ borderColor: 'var(--glass-surface-border)' }}
          >
            <div className="flex items-center gap-1">
              <button
                disabled
                className="p-2 rounded-lg transition-colors opacity-20 cursor-not-allowed"
                style={{ color: 'var(--text-muted)' }}
                title="File attachments -- coming soon"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                disabled
                className="p-2 rounded-lg transition-colors opacity-20 cursor-not-allowed"
                style={{ color: 'var(--text-muted)' }}
                title="Voice input -- coming soon"
              >
                <Mic className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {chatUsage && chatUsage.tier === 'free' && (
                <div
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                  style={{
                    backgroundColor: chatUsage.remaining <= 2
                      ? 'rgba(239, 68, 68, 0.1)'
                      : 'var(--glass-surface-bg-subtle)',
                    color: chatUsage.remaining <= 2
                      ? '#ef4444'
                      : 'var(--text-muted)'
                  }}
                >
                  <MessageCircle className="w-3 h-3" />
                  <span title={`${chatUsage.used} of ${chatUsage.limit} free messages used this month`}>{chatUsage.used} / {chatUsage.limit}</span>
                </div>
              )}

              <div
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                style={{
                  backgroundColor: 'var(--glass-surface-bg-subtle)',
                  color: 'var(--text-muted)'
                }}
              >
                <Sparkles className="w-3 h-3" />
                <span>Twin AI</span>
              </div>

              {/* Send button: amber gradient when active, muted when empty */}
              <button
                onClick={onSend}
                disabled={!hasText || isDisabled || isTyping || limitReached}
                className="p-2.5 rounded-xl transition-all hover:scale-[1.05] active:scale-95 disabled:hover:scale-100"
                style={{
                  background: hasText
                    ? 'linear-gradient(135deg, var(--accent-vibrant), var(--accent-vibrant-hover))'
                    : 'var(--glass-surface-bg-subtle)',
                  color: hasText ? '#1a1a17' : 'var(--text-muted)',
                  boxShadow: hasText ? '0 2px 8px var(--accent-vibrant-glow)' : 'none',
                  opacity: (!hasText || isDisabled || limitReached) ? 0.5 : 1,
                  cursor: (!hasText || isDisabled || limitReached) ? 'not-allowed' : 'pointer',
                }}
              >
                {isTyping ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ChatInputArea.displayName = 'ChatInputArea';
