/**
 * IdentityNarrativeCard — user-editable persona override.
 *
 * audit-2026-05-27 task #11: askjo's SOUL.md analog. The system writes a
 * narrative for the user based on extracted memories; this card lets the
 * user replace it with their own words. When user_narrative is set, the
 * twin's system prompt swaps it in transparently (twinContextBuilder.js).
 *
 * Three states:
 *   - viewing  : read-only render of active_narrative + source badge
 *   - editing  : textarea pre-filled with current text, Save + Cancel + Clear
 *   - saving   : disabled controls + spinner
 *
 * Source badge:
 *   - 'user'   → "Your words" + last edited timestamp
 *   - 'system' → "Auto-generated" + hint that user can override
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Save, X, Trash2, Sparkles } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

interface NarrativeData {
  archetype_name: string | null;
  archetype_subtitle: string | null;
  narrative: string | null;            // System-generated
  user_narrative: string | null;       // User override
  user_narrative_updated_at: string | null;
  active_source: 'user' | 'system' | 'none';
  active_narrative: string | null;
}

const MAX_CHARS = 4000;
const QUERY_KEY = ['soul-signature-narrative'];

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const IdentityNarrativeCard: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<{ data: NarrativeData }>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await authFetch('/soul-signature/narrative');
      if (!res.ok) throw new Error('Failed to load narrative');
      return res.json();
    },
    staleTime: 60_000,
  });

  const narrative = data?.data;
  const [mode, setMode] = useState<'view' | 'edit' | 'saving'>('view');
  const [draft, setDraft] = useState<string>('');

  // Seed the draft when entering edit mode or when the underlying data refreshes
  useEffect(() => {
    if (mode === 'view' && narrative) {
      setDraft(narrative.active_narrative || '');
    }
  }, [mode, narrative]);

  // ── Save handler ────────────────────────────────────────────────
  const handleSave = async () => {
    const trimmed = draft.trim();
    if (trimmed.length > MAX_CHARS) {
      toast.error(`Too long — limit is ${MAX_CHARS} characters (you have ${trimmed.length}).`);
      return;
    }
    setMode('saving');
    try {
      const res = await authFetch('/soul-signature/narrative', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_narrative: trimmed.length === 0 ? null : trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Save failed');
      }
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(trimmed.length === 0 ? 'Reverted to auto-generated' : 'Your words saved');
      setMode('view');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Could not save: ${msg}`);
      setMode('edit');
    }
  };

  // ── Clear handler — explicit "revert to system" verb ───────────
  const handleClear = async () => {
    setMode('saving');
    try {
      const res = await authFetch('/soul-signature/narrative', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_narrative: null }),
      });
      if (!res.ok) throw new Error('Clear failed');
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Reverted to auto-generated');
      setMode('view');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Could not revert: ${msg}`);
      setMode('edit');
    }
  };

  // ── Loading / empty / error states ─────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] backdrop-blur-[42px] px-5 py-4 animate-pulse">
        <div className="h-4 w-32 bg-[rgba(255,255,255,0.08)] rounded mb-3" />
        <div className="h-3 w-full bg-[rgba(255,255,255,0.05)] rounded mb-2" />
        <div className="h-3 w-3/4 bg-[rgba(255,255,255,0.05)] rounded" />
      </div>
    );
  }

  if (isError || !narrative) return null;

  if (narrative.active_source === 'none' || !narrative.active_narrative) {
    // No soul signature yet — nothing to override. Don't show the card.
    return null;
  }

  const isUserAuthored = narrative.active_source === 'user';
  const remaining = MAX_CHARS - draft.length;

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="rounded-[20px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] backdrop-blur-[42px] px-5 py-4 shadow-[0_4px_4px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]">
      {/* Header: badge + edit button */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-vibrant)' }} />
          <h3
            className="text-[18px]"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, letterSpacing: '-0.36px' }}
          >
            Your soul, in your own words
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {isUserAuthored ? (
            <span
              className="text-[11px] px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'var(--accent-vibrant-glow)',
                color: 'var(--accent-vibrant)',
              }}
              title={`Edited ${relativeTime(narrative.user_narrative_updated_at)}`}
            >
              Your words · {relativeTime(narrative.user_narrative_updated_at)}
            </span>
          ) : (
            <span
              className="text-[11px] px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                color: 'var(--text-muted)',
              }}
            >
              Auto-generated
            </span>
          )}
        </div>
      </div>

      {/* Body: read-only OR editable */}
      {mode === 'view' && (
        <>
          <p
            className="text-[14.5px] leading-relaxed whitespace-pre-wrap"
            style={{ color: 'var(--text-narrative)' }}
          >
            {narrative.active_narrative}
          </p>
          <div className="flex items-center justify-end gap-2 mt-3">
            {isUserAuthored && (
              <button
                onClick={handleClear}
                className="text-[12px] flex items-center gap-1 px-2 py-1 rounded-[6px] hover:bg-[rgba(255,255,255,0.04)] transition"
                style={{ color: 'var(--text-muted)' }}
              >
                <Trash2 className="w-3 h-3" />
                Revert to auto
              </button>
            )}
            <button
              onClick={() => setMode('edit')}
              className="text-[12px] flex items-center gap-1 px-2 py-1 rounded-[6px] hover:bg-[rgba(255,255,255,0.04)] transition"
              style={{ color: 'var(--foreground)' }}
            >
              <Pencil className="w-3 h-3" />
              {isUserAuthored ? 'Edit' : 'Write your own'}
            </button>
          </div>
        </>
      )}

      {(mode === 'edit' || mode === 'saving') && (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={mode === 'saving'}
            rows={10}
            maxLength={MAX_CHARS}
            className="w-full rounded-[6px] px-3 py-2.5 text-[14.5px] leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-[rgba(255,255,255,0.25)]"
            style={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--text-narrative)',
              fontFamily: 'Geist, Inter, system-ui, sans-serif',
            }}
            placeholder="Write the version of you that the twin should believe — the one that overrides what the system inferred from your data."
          />
          <div className="flex items-center justify-between mt-3">
            <span
              className="text-[11px]"
              style={{
                color: remaining < 100 ? 'var(--destructive)' : 'var(--text-muted)',
              }}
            >
              {remaining} chars left
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setMode('view'); setDraft(narrative.active_narrative || ''); }}
                disabled={mode === 'saving'}
                className="text-[12px] flex items-center gap-1 px-2 py-1 rounded-[6px] hover:bg-[rgba(255,255,255,0.04)] disabled:opacity-50 transition"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={mode === 'saving' || draft.length > MAX_CHARS}
                className="text-[12px] flex items-center gap-1 px-3 py-1.5 rounded-[100px] disabled:opacity-50 transition"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  fontWeight: 500,
                }}
              >
                <Save className="w-3 h-3" />
                {mode === 'saving' ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default IdentityNarrativeCard;
