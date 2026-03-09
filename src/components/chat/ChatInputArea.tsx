import { forwardRef } from 'react';
import { ArrowUp, Loader2, Paperclip, Sparkles, MessageCircle } from 'lucide-react';

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
    const canSend = hasText && !isDisabled && !isTyping && !limitReached;

    return (
      <div className="px-4 pb-4 pt-2">
        {/* Figma AI Chatbox — backdrop-blur(42px), rounded-[20px], warm glass */}
        <div
          style={{
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            background: 'var(--glass-surface-bg)',
            border: '1px solid var(--glass-surface-border)',
            borderRadius: '20px',
            padding: '16px 20px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            overflow: 'hidden',
          }}
        >
          {/* Textarea */}
          <textarea
            ref={ref}
            placeholder={hasConnectedPlatforms
              ? "Ask your twin anything…"
              : "Connect platforms to start chatting…"
            }
            value={inputMessage}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isDisabled || limitReached}
            rows={1}
            className="w-full resize-none focus:outline-none disabled:opacity-50"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--foreground)',
              fontSize: '14px',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 400,
              lineHeight: '1.5',
              minHeight: '52px',
              maxHeight: '140px',
              caretColor: 'var(--accent-vibrant)',
              // Figma placeholder color: #86807b
            }}
          />

          {/* Bottom toolbar — Figma: h-[28px] flex items-center justify-between */}
          <div className="flex items-center justify-between mt-2" style={{ height: '28px' }}>

            {/* Left: action buttons */}
            <div className="flex items-center gap-2">
              {/* Attach — Figma: ghost pill rounded-[200px] px-[8px] py-[2px] */}
              <button
                disabled
                className="flex items-center gap-1 transition-opacity opacity-40 cursor-not-allowed"
                style={{
                  padding: '2px 8px',
                  borderRadius: '200px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--foreground)',
                  fontFamily: 'Inter, sans-serif',
                  lineHeight: '24px',
                }}
                title="Attach — coming soon"
              >
                <Paperclip style={{ width: '16px', height: '16px' }} />
                <span>Attach</span>
              </button>

              {/* Twin AI badge — Figma: ghost bg-[rgba(17,15,15,0.05)] rounded-[6px] px-[8px] py-[2px] */}
              <div
                className="flex items-center gap-1"
                style={{
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(17,15,15,0.05)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--foreground)',
                  fontFamily: 'Inter, sans-serif',
                  lineHeight: '24px',
                }}
              >
                <Sparkles style={{ width: '14px', height: '14px', color: 'var(--accent-vibrant)' }} />
                <span>Twin AI</span>
              </div>

              {/* Usage counter */}
              {chatUsage && chatUsage.tier === 'free' && (
                <div
                  className="flex items-center gap-1"
                  style={{
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: chatUsage.remaining <= 2 ? 'rgba(239,68,68,0.1)' : 'rgba(17,15,15,0.05)',
                    fontSize: '11px',
                    color: chatUsage.remaining <= 2 ? '#ef4444' : 'var(--text-muted)',
                    fontFamily: 'Inter, sans-serif',
                    lineHeight: '24px',
                  }}
                >
                  <MessageCircle style={{ width: '12px', height: '12px' }} />
                  <span>{chatUsage.remaining} left</span>
                </div>
              )}
            </div>

            {/* Right: Send button — Figma: bg-[#252222] rounded-[100px] p-[4px] 28x28, opacity-50 when disabled */}
            <button
              onClick={onSend}
              disabled={!canSend}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '100px',
                background: canSend ? 'var(--foreground)' : 'var(--foreground)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: canSend ? 1 : 0.35,
                cursor: canSend ? 'pointer' : 'not-allowed',
                transition: 'opacity 0.15s, transform 0.1s',
                flexShrink: 0,
              }}
              className="hover:opacity-80 active:scale-95"
            >
              {isTyping ? (
                <Loader2 style={{ width: '14px', height: '14px', color: 'var(--background)', animation: 'spin 1s linear infinite' }} />
              ) : (
                <ArrowUp style={{ width: '14px', height: '14px', color: 'var(--background)' }} />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }
);

ChatInputArea.displayName = 'ChatInputArea';
