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

const cardClassName = 'glass-card';

export default function GitHubConnectCard() {
  const qc = useQueryClient();
  const [pat, setPat] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      <section className={`p-5 ${cardClassName}`}>
        <div className="flex items-center gap-3 mb-2">
          <Github className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">GitHub Activity</h2>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      </section>
    );
  }

  return (
    <section className={`p-5 ${cardClassName}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Github className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">GitHub Activity</h2>
          {status?.connected && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
              <CheckCircle className="w-3 h-3" /> Connected
            </span>
          )}
        </div>
        {status?.connected && (
          <button
            onClick={() => disconnectMut.mutate()}
            disabled={disconnectMut.isPending}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-500 transition-colors px-2 py-1 rounded-lg"
          >
            {disconnectMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
            Disconnect
          </button>
        )}
      </div>

      {status?.connected ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Connected as <span className="font-semibold">@{status.github_username}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Commits, PRs, and issues are ingested every 10 minutes into your memory stream.
            {status.last_synced_at && (
              <> Last sync: {new Date(status.last_synced_at).toLocaleString()}</>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect your GitHub to capture commit history, PRs, and coding patterns in your twin's memory.
          </p>

          <div className="relative">
            <input
              type={showPat ? 'text' : 'password'}
              value={pat}
              onChange={e => setPat(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 pr-10 text-sm border border-white/10 rounded-lg bg-white/8 focus:outline-none focus:ring-2 focus:ring-stone-600 font-mono text-foreground"
            />
            <button
              type="button"
              onClick={() => setShowPat(v => !v)}
              className="absolute right-2 top-2 text-muted-foreground hover:text-muted-foreground"
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
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 disabled:opacity-40 transition-colors"
            >
              {connectMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
              Connect GitHub
            </button>

            <a
              href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=TwinMe"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
            >
              Create token <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <p className="text-xs text-muted-foreground">
            Token needs <code className="bg-white/8 px-1 rounded">read:user</code> and <code className="bg-white/8 px-1 rounded">repo</code> scopes (read-only). Stored securely, never shared.
          </p>
        </div>
      )}
    </section>
  );
}
