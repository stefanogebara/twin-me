import React from 'react';
import {
  CheckCircle,
  Loader2,
  AlertCircle,
  MessageSquare,
  Copy,
  Play,
  Info,
} from 'lucide-react';

interface SyncStats {
  totalConversations: number;
  claudeDesktopConversations: number;
  lastSyncAt: string | null;
}

interface ClaudeDesktopSyncProps {
  user: { id: string } | null | undefined;
  syncStats: SyncStats | null;
  loadingSyncStats: boolean;
  syncing: boolean;
  syncMessage: { type: 'success' | 'error' | 'info'; text: string } | null;
  userIdCopied: boolean;
  handleManualSync: () => void;
  handleCopyUserId: () => void;
  cardStyle: React.CSSProperties;
}

const ClaudeDesktopSync: React.FC<ClaudeDesktopSyncProps> = ({
  user,
  syncStats,
  loadingSyncStats,
  syncing,
  syncMessage,
  userIdCopied,
  handleManualSync,
  handleCopyUserId,
  cardStyle,
}) => {
  return (
    <section className="p-5" style={cardStyle}>
      <div className="flex items-center gap-3 mb-2">
        <MessageSquare className="w-5 h-5" style={{ color: '#A78BFA' }} />
        <h2 className="heading-serif text-base">
          Claude Desktop Sync
        </h2>
      </div>
      <p className="text-sm mb-4" style={{ fontFamily: 'var(--font-body)', color: '#8A857D' }}>
        Import your Claude Desktop conversations so your twin can learn your writing style and topics you care about.
      </p>

      {loadingSyncStats ? (
        <div className="flex items-center gap-2 mb-4">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#1F1C18' }} />
          <span className="text-sm" style={{ color: '#8A857D' }}>Loading...</span>
        </div>
      ) : syncStats && syncStats.claudeDesktopConversations > 0 ? (
        <div
          className="flex items-center gap-4 p-3 rounded-xl mb-4"
          style={{ backgroundColor: 'rgba(16, 185, 129, 0.05)' }}
        >
          <CheckCircle className="w-5 h-5" style={{ color: '#10B981' }} />
          <div className="flex-1">
            <span className="text-sm font-medium" style={{ color: '#1F1C18' }}>
              {syncStats.claudeDesktopConversations} conversations imported
            </span>
            {syncStats.lastSyncAt && (
              <span className="text-xs ml-2" style={{ color: '#8A857D' }}>
                · Last sync: {new Date(syncStats.lastSyncAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {syncMessage && (
        <div
          className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm"
          style={{
            backgroundColor: syncMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' :
                             syncMessage.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(167, 139, 250, 0.1)',
            color: syncMessage.type === 'success' ? '#10B981' :
                   syncMessage.type === 'error' ? '#ef4444' : '#A78BFA'
          }}
        >
          {syncMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> :
           syncMessage.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
          {syncMessage.text}
        </div>
      )}

      <div className="space-y-3">
        <button
          onClick={handleManualSync}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all hover:scale-[1.01]"
          style={{
            backgroundColor: 'rgba(124, 58, 237, 0.1)',
            border: '1px solid rgba(167, 139, 250, 0.3)',
            color: '#A78BFA',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            opacity: syncing ? 0.7 : 1
          }}
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>

        <div
          className="p-3 rounded-xl"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.02)',
            border: '1px solid rgba(0, 0, 0, 0.04)'
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs" style={{ color: '#8A857D' }}>
              Your User ID (for manual setup)
            </span>
            <button
              onClick={handleCopyUserId}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
              style={{
                backgroundColor: userIdCopied ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                color: userIdCopied ? '#10B981' : '#8A857D'
              }}
            >
              {userIdCopied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {userIdCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <code className="text-xs break-all" style={{ color: '#57534e' }}>
            {user?.id || 'Loading...'}
          </code>
        </div>

        <p className="text-xs" style={{ color: '#8A857D' }}>
          <strong>Note:</strong> Close Claude Desktop before syncing. Your conversations are analyzed locally to learn your writing patterns.
        </p>
      </div>
    </section>
  );
};

export default ClaudeDesktopSync;
