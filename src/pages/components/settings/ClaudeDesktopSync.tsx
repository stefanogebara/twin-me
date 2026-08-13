import React, { useState } from 'react';
import {
  CheckCircle,
  Loader2,
  AlertCircle,
  MessageSquare,
  Copy,
  Play,
  Info,
  ChevronDown,
  ChevronRight,
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
  cardStyle: string;
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
  const [showDevInfo, setShowDevInfo] = useState(false);
  return (
    <section className={`p-5 ${cardStyle}`}>
      <div className="flex items-center gap-3 mb-2">
        <MessageSquare className="w-5 h-5" style={{ color: '#A78BFA' }} />
        <h2
          className="text-[11px] font-medium tracking-widest uppercase"
          style={{ color: 'var(--success)' }}
        >
          Claude Desktop Sync
        </h2>
      </div>
      <p className="text-sm mb-4" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)' }}>
        Import your Claude Desktop conversations so your twin can learn your writing style and topics you care about.
      </p>

      {loadingSyncStats ? (
        <div className="flex items-center gap-2 mb-4">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--foreground)' }} />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading...</span>
        </div>
      ) : syncStats && syncStats.claudeDesktopConversations > 0 ? (
        <div
          className="flex items-center gap-4 p-3 rounded-xl mb-4"
          style={{ backgroundColor: 'color-mix(in srgb, var(--success) 5%, transparent)' }}
        >
          <CheckCircle className="w-5 h-5" style={{ color: 'var(--success)' }} />
          <div className="flex-1">
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              {syncStats.claudeDesktopConversations} conversations imported
            </span>
            {syncStats.lastSyncAt && (
              <span className="text-xs ml-2" style={{ color: 'var(--text-secondary)' }}>
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
            backgroundColor: syncMessage.type === 'success' ? 'color-mix(in srgb, var(--success) 10%, transparent)' :
                             syncMessage.type === 'error' ? 'color-mix(in srgb, var(--destructive) 10%, transparent)' : 'rgba(167, 139, 250, 0.1)',
            color: syncMessage.type === 'success' ? 'var(--success)' :
                   syncMessage.type === 'error' ? 'var(--claura-danger-ink)' : '#A78BFA'
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
            backgroundColor: 'var(--surface-solid)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 500,
            opacity: syncing ? 0.7 : 1
          }}
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>

        <div
          className="rounded-xl"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--sidebar)'
          }}
        >
          <button
            onClick={() => setShowDevInfo((prev) => !prev)}
            className="w-full flex items-center gap-2 p-3 text-xs transition-colors"
            style={{ color: 'var(--text-secondary)', background: 'none', border: 'none' }}
          >
            {showDevInfo
              ? <ChevronDown className="w-3 h-3 flex-shrink-0" />
              : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
            Developer Info
          </button>
          {showDevInfo && (
            <div className="px-3 pb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Your User ID (for support)
                </span>
                <button
                  onClick={handleCopyUserId}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{
                    backgroundColor: userIdCopied ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'transparent',
                    color: userIdCopied ? 'var(--success)' : 'var(--text-muted)'
                  }}
                >
                  {userIdCopied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {userIdCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <code className="text-xs break-all" style={{ color: 'var(--text-secondary)' }}>
                {user?.id || 'Loading...'}
              </code>
            </div>
          )}
        </div>

        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          <strong>Note:</strong> Close Claude Desktop before syncing. Your conversations are analyzed locally to learn your writing patterns.
        </p>
      </div>
    </section>
  );
};

export default ClaudeDesktopSync;
