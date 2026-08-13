/**
 * GitHub Connect Card
 * ===================
 * Lets users paste a GitHub Personal Access Token to connect their
 * commit history to the twin memory stream.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Github, CheckCircle, Loader2, Unlink, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

interface GitHubStatus {
  connected: boolean;
  github_username?: string;
  connected_at?: string;
  last_synced_at?: string;
}

interface GitHubConnectCardProps {
  cardStyle?: string;
}

export default function GitHubConnectCard({ cardStyle }: GitHubConnectCardProps) {
  const qc = useQueryClient();
  const [pat, setPat] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sectionClass = cardStyle ? `p-5 ${cardStyle}` : 'p-5 rounded-lg';
  const sectionStyle = cardStyle ? {} : { border: '1px solid var(--border-glass)', backgroundColor: 'var(--surface)' };

  const { data: status, isLoading } = useQuery<GitHubStatus>({
    queryKey: ['github-status'],
    queryFn: async () => {
      const res = await authFetch('/github/status');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const connectMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/github/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: pat.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to connect');
      }
      return res.json();
    },
    onSuccess: () => {
      setPat('');
      setErrorMsg(null);
      qc.invalidateQueries({ queryKey: ['github-status'] });
    },
    onError: (err: Error) => {
      setErrorMsg(err.message);
    },
  });

  const disconnectMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/github/connect', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to disconnect');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['github-status'] }),
  });

  if (isLoading) {
    return (
      <section className={sectionClass} style={sectionStyle}>
        <div className="flex items-center gap-3 mb-2">
          <Github className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          <h2
            className="text-[11px] font-medium tracking-widest uppercase"
            style={{ color: 'var(--success)' }}
          >
            GitHub Activity
          </h2>
        </div>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading...
        </div>
      </section>
    );
  }

  return (
    <section className={sectionClass} style={sectionStyle}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Github className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          <h2
            className="text-[11px] font-medium tracking-widest uppercase"
            style={{ color: 'var(--success)' }}
          >
            GitHub Activity
          </h2>
          {status?.connected && (
            <span
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'color-mix(in srgb, var(--success) 10%, transparent)', color: 'var(--success)', border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)' }}
            >
              <CheckCircle className="w-3 h-3" /> Connected
            </span>
          )}
        </div>
        {status?.connected && (
          <button
            onClick={() => disconnectMut.mutate()}
            disabled={disconnectMut.isPending}
            className="flex items-center gap-1.5 text-xs transition-colors px-2 py-1 rounded-lg"
            style={{ color: 'var(--text-secondary)' }}
          >
            {disconnectMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
            Disconnect
          </button>
        )}
      </div>

      {status?.connected ? (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Connected as <span className="font-semibold">@{status.github_username}</span>
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Commits, PRs, and issues are ingested every 10 minutes into your memory stream.
            {status.last_synced_at && (
              <> Last sync: {new Date(status.last_synced_at).toLocaleString('en-US')}</>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Connect your GitHub to capture commit history, PRs, and coding patterns in your twin's memory.
          </p>

          <div className="relative">
            <input
              type={showPat ? 'text' : 'password'}
              value={pat}
              onChange={e => setPat(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 pr-10 text-sm rounded-lg font-mono"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPat(v => !v)}
              className="absolute right-2 top-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              {showPat ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {errorMsg && (
            <p className="text-xs text-red-500">{errorMsg}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => connectMut.mutate()}
              disabled={!pat.trim() || connectMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
              style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}
            >
              {connectMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
              Connect GitHub
            </button>

            <a
              href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=TwinMe"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              Create token <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Token needs <code className="px-1 rounded" style={{ backgroundColor: 'var(--surface)' }}>read:user</code> and <code className="px-1 rounded" style={{ backgroundColor: 'var(--surface)' }}>repo</code> scopes (read-only). Stored securely, never shared.
          </p>
        </div>
      )}
    </section>
  );
}
