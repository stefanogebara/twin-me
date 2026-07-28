import { ChevronLeft, Layers, Trash2, History } from 'lucide-react';

interface ChatHeaderProps {
  hasMessages: boolean;
  showContext: boolean;
  showConversationList?: boolean;
  onClearChat: () => void;
  onToggleContext: () => void;
  onToggleConversationList?: () => void;
  onBack?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  hasMessages,
  showContext,
  showConversationList = false,
  onClearChat,
  onToggleContext,
  onToggleConversationList,
  onBack,
}) => (
  <header
    className="flex items-center justify-between px-3 py-2"
    style={{
      borderBottom: '1px solid var(--border-glass)',
    }}
  >
    {/* Back button — mobile only */}
    <div className="lg:hidden flex items-center">
      {onBack && (
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg transition-all duration-150 ease-out hover:opacity-70 active:scale-90"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
      )}
    </div>
    <div className="flex items-center gap-1 ml-auto">
      {onToggleConversationList && (
        <button
          onClick={onToggleConversationList}
          className="p-1.5 rounded-lg transition-all duration-150 ease-out hover:opacity-70 active:scale-90"
          style={{ color: showConversationList ? 'var(--accent-vibrant)' : 'var(--text-muted)' }}
          aria-label={showConversationList ? "Hide chat history" : "Show chat history"}
          aria-expanded={showConversationList}
          title="Chat history"
        >
          <History className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
      {hasMessages && (
        <button
          onClick={onClearChat}
          className="p-1.5 rounded-lg transition-all duration-150 ease-out hover:opacity-70 active:scale-90"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Clear conversation"
          title="Clear conversation"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
      <button
        onClick={onToggleContext}
        className="p-1.5 rounded-lg transition-all duration-150 ease-out hover:opacity-70 active:scale-90"
        style={{ color: showContext ? 'var(--accent-vibrant)' : 'var(--text-muted)' }}
        aria-label={showContext ? "Hide context panel" : "Show context panel"}
        aria-expanded={showContext}
        title="Toggle context"
      >
        <Layers className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  </header>
);
