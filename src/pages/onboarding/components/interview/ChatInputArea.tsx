import React from 'react';
import { Send, Mic, Keyboard } from 'lucide-react';

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface ChatInputAreaProps {
  input: string;
  loading: boolean;
  isDone: boolean;
  voiceEnabled: boolean;
  voiceAvailable: boolean;
  voiceIsActive: boolean;
  voiceHasSession: boolean;
  voiceOrbState: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  messages: Message[];
  enrichmentContext: {
    name?: string;
    company?: string;
    title?: string;
    location?: string;
    bio?: string;
  };
  onInputChange: (value: string) => void;
  onSend: () => void;
  onToggleVoice: () => void;
  onEndVoice: () => Promise<void>;
  onSendText: (text: string) => void;
  onSkip: () => void;
  onDoneEarly: () => void;
}

const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  input,
  loading,
  isDone,
  voiceEnabled,
  voiceAvailable,
  voiceIsActive,
  voiceOrbState,
  inputRef,
  onInputChange,
  onSend,
  onToggleVoice,
  onDoneEarly,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <>
      <div
        className="flex items-end gap-3 rounded-[20px] px-5 py-4 transition-all duration-300"
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: voiceIsActive
            ? '1px solid rgba(240, 200, 128, 0.25)'
            : '1px solid var(--glass-surface-border)',
          boxShadow: voiceIsActive
            ? '0 4px 4px rgba(0,0,0,0.12), 0 0 20px rgba(240, 200, 128, 0.06)'
            : '0 4px 4px rgba(0,0,0,0.12), inset 0 1px 0 var(--border-glass)',
        }}
      >
        {/* Mode toggle: Mic (start voice) / Keyboard (switch to text) */}
        {voiceEnabled && voiceAvailable && (
          <button
            onClick={() => {
              onToggleVoice();
              if (voiceIsActive) {
                setTimeout(() => inputRef.current?.focus(), 100);
              }
            }}
            className="flex-shrink-0 flex items-center justify-center transition-all duration-200"
            title={voiceIsActive ? 'Switch to typing' : 'Start voice conversation'}
            aria-label={voiceIsActive ? 'Switch to typing' : 'Start voice conversation'}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '100px',
              color: voiceIsActive
                ? 'rgba(240, 200, 128, 0.8)'
                : 'var(--text-muted)',
              cursor: 'pointer',
              backgroundColor: voiceIsActive ? 'rgba(240, 200, 128, 0.08)' : 'transparent',
            }}
          >
            {voiceIsActive ? <Keyboard className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
        )}

        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            onInputChange(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            voiceIsActive
              ? voiceOrbState === 'listening'
                ? 'Listening... or type here'
                : voiceOrbState === 'speaking'
                  ? 'Twin is speaking...'
                  : 'Or type here...'
              : 'Type your answer...'
          }
          disabled={loading}
          rows={1}
          className="flex-1 bg-transparent resize-none"
          style={{
            color: 'var(--foreground)',
            fontFamily: 'Inter, sans-serif',
            fontSize: '15px',
            minHeight: '24px',
            maxHeight: '120px',
            overflowY: 'auto',
            caretColor: 'rgba(232, 213, 183, 0.6)',
            outline: 'none',
          }}
        />
        <button
          onClick={onSend}
          disabled={!input.trim() || loading}
          aria-label="Send message"
          className="flex-shrink-0 flex items-center justify-center transition-all duration-200"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '100px',
            backgroundColor: input.trim() ? '#252222' : 'transparent',
            color: input.trim() ? 'var(--background)' : 'var(--text-muted)',
            cursor: input.trim() ? 'pointer' : 'default',
            opacity: input.trim() ? 1 : 0.5,
          }}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* Done for now */}
      {!isDone && (
        <button
          onClick={onDoneEarly}
          disabled={loading}
          className="mt-1 py-2.5 text-[13px] transition-opacity hover:opacity-70 w-full"
          style={{
            color: 'rgba(255,255,255,0.6)',
            fontFamily: "'Inter', sans-serif",
            background: 'none',
            border: 'none',
            cursor: loading ? 'wait' : 'pointer',
            textAlign: 'center',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {loading ? 'Generating your profile...' : 'Done for now'}
        </button>
      )}
    </>
  );
};

export default ChatInputArea;
