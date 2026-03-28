import { forwardRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2 } from 'lucide-react';
import { PlatformLogo } from '@/components/PlatformLogos';

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
  ghostSuggestion?: string;
}

const TOOL_PLATFORMS = [
  'gmail',
  'calendar',
  'spotify',
  'youtube',
  'discord',
  'github',
  'linkedin',
  'reddit',
] as const;

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
    ghostSuggestion,
  }, ref) => {
    const navigate = useNavigate();
    const hasText = inputMessage.trim().length > 0;
    const [isFocused, setIsFocused] = useState(false);

    return (
      <div className="px-6 pb-6 pt-2 max-w-3xl mx-auto w-full">
        <div
          className="flex items-center gap-3 rounded-[20px] px-5 py-3 transition-colors duration-200"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${isFocused ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`,
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
              placeholder={ghostSuggestion && !inputMessage ? '' : 'Message your twin...'}
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
              className="w-full resize-none focus:outline-none disabled:opacity-50 text-[14px] bg-transparent placeholder:text-[rgba(255,255,255,0.3)]"
              style={{
                color: 'var(--foreground)',
                minHeight: '24px',
                maxHeight: '120px',
                caretColor: 'var(--accent-vibrant)',
                fontFamily: 'Inter, sans-serif',
              }}
            />
            {ghostSuggestion && !inputMessage && (
              <div className="absolute inset-0 flex items-center pointer-events-none overflow-hidden">
                <span className="text-[13px] truncate opacity-20" style={{ color: '#D1D5DB' }}>
                  {ghostSuggestion}
                </span>
                <span
                  className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                  style={{
                    color: 'rgba(255,255,255,0.2)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  Tab
                </span>
              </div>
            )}
          </div>

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

        {/* Connected Platforms Bar */}
        <div
          className="flex items-center gap-3 mt-2 px-3 cursor-pointer group"
          onClick={() => navigate('/get-started')}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/get-started');
            }
          }}
        >
          <span className="text-[11px] text-[rgba(255,255,255,0.25)] group-hover:text-[rgba(255,255,255,0.4)] transition-colors">
            Connect Your Tools
          </span>
          <div className="flex items-center gap-1.5">
            {TOOL_PLATFORMS.map((platform) => (
              <div key={platform} className="opacity-50 group-hover:opacity-70 transition-opacity">
                <PlatformLogo platform={platform} size={14} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

ChatInputArea.displayName = 'ChatInputArea';
