import React, { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Copy, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { getAccessToken } from '@/services/api/apiBase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

const getAuthHeaders = () => {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

interface ApiKey {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

interface ApiKeyManagerProps {
  cardStyle: string;
}

const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ cardStyle }) => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('Claude Desktop MCP');
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    try {
      const res = await fetch(`${API_URL}/api-keys`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function createKey() {
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api-keys`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: newKeyName.trim() || 'Claude Desktop MCP' }),
      });
      const data = await res.json();
      if (res.ok && data.key) {
        setNewKeyValue(data.key);
        setShowSetup(true);
        await fetchKeys();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create key' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    setRevoking(id);
    try {
      const res = await fetch(`${API_URL}/api-keys/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setKeys(prev => prev.filter(k => k.id !== id));
        if (newKeyValue) setNewKeyValue(null);
      } else {
        setMessage({ type: 'error', text: 'Failed to revoke key' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setRevoking(null);
    }
  }

  function copyKey() {
    if (!newKeyValue) return;
    navigator.clipboard.writeText(newKeyValue);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  const mcp_server_path = `C:/path/to/twin-ai-learn/api/mcp-server/dist/index.js`;

  const claudeConfig = newKeyValue
    ? JSON.stringify({
        mcpServers: {
          twinme: {
            command: 'node',
            args: [mcp_server_path],
            env: {
              TWINME_API_KEY: newKeyValue,
              SUPABASE_URL: supabaseUrl,
              SUPABASE_SERVICE_ROLE_KEY: '<your-service-role-key>',
              ANTHROPIC_API_KEY: '<your-anthropic-key>',
            },
          },
        },
      }, null, 2)
    : '';

  function copyConfig() {
    if (!claudeConfig) return;
    navigator.clipboard.writeText(claudeConfig);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  }

  function formatDate(iso: string | null) {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const activeKeys = keys.filter(k => k.is_active);

  return (
    <section className={`p-5 ${cardStyle}`}>
      <div className="flex items-center gap-3 mb-2">
        <Key className="w-5 h-5" style={{ color: '#C9B99A' }} />
        <h2
          className="text-[11px] font-medium tracking-widest uppercase"
          style={{ color: '#10b77f' }}
        >
          Claude Desktop MCP
        </h2>
      </div>
      <p className="text-sm mb-4" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.4)' }}>
        Connect Claude Desktop to your twin. Generate an API key, then paste the config into Claude Desktop.
      </p>

      {message && (
        <div
          className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm"
          style={{
            backgroundColor: message.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
            color: message.type === 'error' ? '#ef4444' : '#10B981',
          }}
        >
          {message.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* New key revealed */}
      {newKeyValue && (
        <div
          className="p-4 rounded-xl mb-4"
          style={{ background: 'rgba(201,185,154,0.08)', border: '1px solid rgba(201,185,154,0.25)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: '#C9B99A' }}>
              Your API Key — copy now, won't be shown again
            </span>
            <button
              onClick={copyKey}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
              style={{ color: copiedKey ? '#10B981' : '#C9B99A' }}
            >
              {copiedKey ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copiedKey ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <code className="text-xs break-all block" style={{ color: 'var(--foreground)', fontFamily: 'monospace' }}>
            {newKeyValue}
          </code>
        </div>
      )}

      {/* Setup instructions */}
      {newKeyValue && (
        <div className="mb-4">
          <button
            onClick={() => setShowSetup(v => !v)}
            className="flex items-center gap-2 text-sm w-full text-left py-2"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            {showSetup ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Setup instructions for Claude Desktop
          </button>
          {showSetup && (
            <div
              className="p-4 rounded-xl mt-2 space-y-3"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)' }}
            >
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <strong>1.</strong> Open Claude Desktop → Settings → Developer → Edit Config
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <strong>2.</strong> Paste this JSON (replace paths with your actual paths):
              </p>
              <div className="relative">
                <pre
                  className="text-xs p-3 rounded-lg overflow-x-auto"
                  style={{ background: 'rgba(0,0,0,0.3)', color: '#d4d4d4', fontFamily: 'monospace' }}
                >
                  {claudeConfig}
                </pre>
                <button
                  onClick={copyConfig}
                  className="absolute top-2 right-2 flex items-center gap-1 text-xs px-2 py-1 rounded"
                  style={{ background: 'var(--glass-surface-border)', color: copiedConfig ? '#10B981' : 'rgba(255,255,255,0.3)' }}
                >
                  {copiedConfig ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedConfig ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <strong>3.</strong> Save and restart Claude Desktop. You'll see the <code>chat_with_twin</code> tool available.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Existing keys */}
      {loading ? (
        <div className="flex items-center gap-2 py-3">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading keys...</span>
        </div>
      ) : activeKeys.length > 0 ? (
        <div className="space-y-2 mb-4">
          {activeKeys.map(k => (
            <div
              key={k.id}
              className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)' }}
            >
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{k.name}</div>
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Created {formatDate(k.created_at)}
                  {k.last_used_at && ` · Last used ${formatDate(k.last_used_at)}`}
                </div>
              </div>
              <button
                onClick={() => revokeKey(k.id)}
                disabled={revoking === k.id}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.2)',
                  opacity: revoking === k.id ? 0.5 : 1,
                }}
              >
                {revoking === k.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Revoke
              </button>
            </div>
          ))}
        </div>
      ) : !newKeyValue ? (
        <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>No active API keys yet.</p>
      ) : null}

      {/* Generate key */}
      {activeKeys.length < 5 && (
        <div className="space-y-2">
          <input
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. Claude Desktop MCP)"
            className="w-full px-3 py-2 text-sm rounded-xl"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
              outline: 'none',
            }}
          />
          <button
            onClick={createKey}
            disabled={creating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all"
            style={{
              background: 'rgba(201,185,154,0.1)',
              border: '1px solid rgba(201,185,154,0.3)',
              color: '#C9B99A',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {creating ? 'Generating...' : 'Generate API Key'}
          </button>
        </div>
      )}
    </section>
  );
};

export default ApiKeyManager;
