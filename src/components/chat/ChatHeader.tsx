import { Layers, Trash2 } from 'lucide-react';

interface ChatHeaderProps {
  hasMessages: boolean;
  showContext: boolean;
  onClearChat: () => void;
  onToggleContext: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  hasMessages,
  showContext,
  onClearChat,
  onToggleContext,
}) => (
  <header
    className="flex items-center justify-end px-6 py-2"
    style={{
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}
  >
    <div className="flex items-center gap-1">
      {hasMessages && (
        <button
          onClick={onClearChat}
          className="p-1.5 rounded-lg transition-all duration-150 ease-out hover:opacity-70 active:scale-90"
          style={{ color: 'rgba(255,255,255,0.25)' }}
          aria-label="Clear conversation"
          title="Clear conversation"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
      <button
        onClick={onToggleContext}
        className="p-1.5 rounded-lg transition-all duration-150 ease-out hover:opacity-70 active:scale-90"
        style={{ color: showContext ? '#10b77f' : 'rgba(255,255,255,0.25)' }}
        aria-label={showContext ? "Hide context panel" : "Show context panel"}
        aria-expanded={showContext}
        title="Toggle context"
      >
        <Layers className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  </header>
);
