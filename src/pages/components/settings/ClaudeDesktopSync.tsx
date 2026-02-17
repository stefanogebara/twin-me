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
  theme: string;
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
  theme,
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
    <section className="rounded-2xl p-5" style={cardStyle}>
      <div className="flex items-center gap-3 mb-2">
        <MessageSquare className="w-5 h-5" style={{ color: '#A78BFA' }} />
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
          Claude Desktop Sync
        </h2>
      </div>
      <p className="text-sm mb-4" style={{ fontFamily: 'var(--font-body)', color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>
        Import your Claude Desktop conversations so your twin can learn your writing style and topics you care about.
      </p>

      {loadingSyncStats ? (
        <div className="flex items-center gap-2 mb-4">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }} />
          <span className="text-sm" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}>Loading...</span>
        </div>
      ) : syncStats && syncStats.claudeDesktopConversations > 0 ? (
        <div
          className="flex items-center gap-4 p-3 rounded-xl mb-4"
          style={{ backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.05)' }}
        >
          <CheckCircle className="w-5 h-5" style={{ color: '#10B981' }} />
          <div className="flex-1">
            <span className="text-sm font-medium" style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}>
              {syncStats.claudeDesktopConversations} conversations imported
            </span>
            {syncStats.lastSyncAt && (
              <span className="text-xs ml-2" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c' }}>
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
            backgroundColor: theme === 'dark' ? 'rgba(167, 139, 250, 0.15)' : 'rgba(124, 58, 237, 0.1)',
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
            backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.03)' : 'rgba(0, 0, 0, 0.02)',
            border: theme === 'dark' ? '1px solid rgba(193, 192, 182, 0.08)' : '1px solid rgba(0, 0, 0, 0.04)'
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c' }}>
              Your User ID (for manual setup)
            </span>
            <button
              onClick={handleCopyUserId}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
              style={{
                backgroundColor: userIdCopied ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                color: userIdCopied ? '#10B981' : (theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#78716c')
              }}
            >
              {userIdCopied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {userIdCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <code className="text-xs break-all" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e' }}>
            {user?.id || 'Loading...'}
          </code>
        </div>

        <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e' }}>
          <strong>Note:</strong> Close Claude Desktop before syncing. Your conversations are analyzed locally to learn your writing patterns.
        </p>
      </div>
    </section>
  );
};

export default ClaudeDesktopSync;
