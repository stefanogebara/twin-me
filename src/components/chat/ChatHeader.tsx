import { Layers, Trash2, History } from 'lucide-react';

interface ChatHeaderProps {
  hasMessages: boolean;
  showContext: boolean;
  showConversationList?: boolean;
  onClearChat: () => void;
  onToggleContext: () => void;
  onToggleConversationList?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  hasMessages,
  showContext,
  showConversationList = false,
  onClearChat,
  onToggleContext,
  onToggleConversationList,
}) => (
  <header
    className="flex items-center justify-end px-6 py-2"
    style={{
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}
  >
    <div className="flex items-center gap-1">
      {onToggleConversationList && (
        <button
          onClick={onToggleConversationList}
          className="p-1.5 rounded-lg transition-all duration-150 ease-out hover:opacity-70 active:scale-90"
          style={{ color: showConversationList ? '#10b77f' : 'rgba(255,255,255,0.25)' }}
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
