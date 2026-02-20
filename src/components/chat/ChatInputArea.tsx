import { forwardRef } from 'react';
import {
  MessageCircle, Send, Loader2,
  Sparkles, Mic, Paperclip
} from 'lucide-react';

interface Colors {
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  accent: string;
  bgSecondary: string;
  bgTertiary: string;
  inputBg: string;
  inputBorder: string;
}

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
  isDemoMode: boolean;
  hasConnectedPlatforms: boolean;
  chatUsage: ChatUsage | null;
  colors: Colors;
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
    isDemoMode,
    hasConnectedPlatforms,
    chatUsage,
    colors,
  }, ref) => {
    return (
      <div className="p-4">
        <div
          className="rounded-2xl border shadow-sm overflow-hidden"
          style={{
            backgroundColor: colors.inputBg,
            borderColor: colors.inputBorder
          }}
        >
          <textarea
            ref={ref}
            placeholder={hasConnectedPlatforms || isDemoMode
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
              color: colors.text,
              minHeight: '48px',
              maxHeight: '120px'
            }}
          />

          <div
            className="flex items-center justify-between px-3 py-2 border-t"
            style={{ borderColor: colors.border }}
          >
            <div className="flex items-center gap-1">
              <button
                disabled
                className="p-2 rounded-lg transition-colors opacity-30 cursor-not-allowed"
                style={{ color: colors.textMuted }}
                title="File attachments coming soon"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <button
                disabled
                className="p-2 rounded-lg transition-colors opacity-30 cursor-not-allowed"
                style={{ color: colors.textMuted }}
                title="Voice input coming soon"
              >
                <Mic className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {chatUsage && chatUsage.tier === 'free' && !isDemoMode && (
                <div
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                  style={{
                    backgroundColor: chatUsage.remaining <= 2
                      ? 'rgba(239, 68, 68, 0.1)'
                      : colors.bgSecondary,
                    color: chatUsage.remaining <= 2
                      ? '#ef4444'
                      : colors.textSecondary
                  }}
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>{chatUsage.used} of {chatUsage.limit}</span>
                </div>
              )}

              <div
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                style={{
                  backgroundColor: colors.bgSecondary,
                  color: colors.textSecondary
                }}
              >
                <Sparkles className="w-3 h-3" />
                <span>Twin AI</span>
              </div>

              <button
                onClick={onSend}
                disabled={!inputMessage.trim() || isDisabled || isTyping || limitReached}
                className="p-2.5 rounded-xl transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                style={{
                  backgroundColor: inputMessage.trim() ? colors.accent : colors.bgTertiary,
                  color: inputMessage.trim() ? 'white' : colors.textMuted
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
