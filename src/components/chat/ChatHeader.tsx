import { ChevronLeft, Layers, Trash2, History, PanelRight } from 'lucide-react';

interface ChatHeaderProps {
  hasMessages: boolean;
  showContext: boolean;
  showConversationList?: boolean;
  showRightSidebar?: boolean;
  onClearChat: () => void;
  onToggleContext: () => void;
  onToggleConversationList?: () => void;
  onToggleRightSidebar?: () => void;
  onBack?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  hasMessages,
  showContext,
  showConversationList = false,
  showRightSidebar = false,
  onClearChat,
  onToggleContext,
  onToggleConversationList,
  onToggleRightSidebar,
  onBack,
}) => (
  <header
    className="flex items-center justify-between px-3 py-2"
    style={{
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}
  >
    {/* Back button — mobile only */}
    <div className="lg:hidden flex items-center">
      {onBack && (
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg transition-all duration-150 ease-out hover:opacity-70 active:scale-90"
          style={{ color: 'rgba(255,255,255,0.35)' }}
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
      {/* Right sidebar toggle -- visible only on mobile/tablet (hidden on lg where sidebar is always accessible) */}
      {onToggleRightSidebar && (
        <button
          onClick={onToggleRightSidebar}
          className="p-1.5 rounded-lg transition-all duration-150 ease-out hover:opacity-70 active:scale-90 lg:hidden"
          style={{ color: showRightSidebar ? '#10b77f' : 'rgba(255,255,255,0.25)' }}
          aria-label={showRightSidebar ? "Hide today's context" : "Show today's context"}
          aria-expanded={showRightSidebar}
          title="Today's context"
        >
          <PanelRight className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  </header>
);
