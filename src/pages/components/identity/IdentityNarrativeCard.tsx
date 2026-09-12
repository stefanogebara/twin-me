/**
 * IdentityNarrativeCard — user-editable persona override.
 *
 * audit-2026-05-27 task #11: askjo's SOUL.md analog. The system writes a
 * narrative for the user based on extracted memories; this section lets the
 * user replace it with their own words. When user_narrative is set, the
 * twin's system prompt swaps it in transparently (twinContextBuilder.js).
 *
 * Three states:
 *   - viewing  : the narrative's first sentence, the rest behind "Read all"
 *   - editing  : textarea pre-filled with current text, Save + Cancel
 *   - saving   : disabled controls + spinner
 *
 * Source line:
 *   - 'user'   → "Your words, edited 3d ago"
 *   - 'system' → "Written by your twin. You can write your own."
 *
 * In the register it is a section (a heading, one grey line, the section's
 * one action) over the narrative: no card, no badge pill, no shadow.
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';
import { Section, Empty } from '@/components/register';

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

/** The first sentence shows; the rest waits behind "Read all". */
function splitLead(text: string): { lead: string; rest: string } {
  const idx = text.search(/[.!?]\s/);
  if (idx === -1) return { lead: text, rest: '' };
  return { lead: text.slice(0, idx + 1), rest: text.slice(idx + 2).trim() };
}

/** An inline text action: ink, underlined, no box. */
const textLink: React.CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  font: 'inherit',
  color: 'var(--rg-ink)',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  cursor: 'pointer',
};

const IdentityNarrativeCard: React.FC = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<{ data: NarrativeData }>({
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
  const [readAll, setReadAll] = useState(false);
  // Two-tap confirm before the destructive "Revert to auto" wipes the user's
  // hand-written narrative (audit-2026-06-10: was a zero-confirmation delete).
  const [confirmingClear, setConfirmingClear] = useState(false);

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
    setConfirmingClear(false);
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
      <Section title="In your own words">
        <div aria-busy="true" className="space-y-2">
          <span className="block rounded-[4px] animate-pulse" style={{ height: 12, width: '100%', background: 'var(--rg-field)' }} />
          <span className="block rounded-[4px] animate-pulse" style={{ height: 12, width: '75%', background: 'var(--rg-field)' }} />
        </div>
      </Section>
    );
  }

  // Fetch failure: show a quiet retry instead of vanishing — a silent
  // null made "my narrative disappeared" undebuggable (audit-2026-07-03).
  if (isError) {
    return (
      <Section title="In your own words">
        <Empty>
          Could not load your narrative.{' '}
          <button type="button" style={textLink} onClick={() => refetch()}>Try again</button>
        </Empty>
      </Section>
    );
  }

  if (!narrative) return null;

  if (narrative.active_source === 'none' || !narrative.active_narrative) {
    // No soul signature yet — nothing to override. Don't show the section.
    return null;
  }

  const isUserAuthored = narrative.active_source === 'user';
  const remaining = MAX_CHARS - draft.length;
  const { lead, rest } = splitLead(narrative.active_narrative);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <Section
      title="In your own words"
      line={isUserAuthored
        ? `Your words, edited ${relativeTime(narrative.user_narrative_updated_at)}.`
        : 'Written by your twin. You can write your own.'}
      action={mode === 'view' ? (
        <button
          type="button"
          className="n-btn n-btn--ghost"
          onClick={() => { setConfirmingClear(false); setMode('edit'); }}
        >
          <Pencil className="w-4 h-4" aria-hidden="true" />
          {isUserAuthored ? 'Edit' : 'Write your own'}
        </button>
      ) : undefined}
    >
      {/* Body: read-only OR editable, under the list's ink rule */}
      <div style={{ borderTop: '1px solid var(--rg-ink)', padding: '20px 12px 0' }}>
        {mode === 'view' && (
          <>
            <p className="whitespace-pre-wrap" style={{ margin: 0, color: 'var(--rg-ink)', maxWidth: '68ch' }}>
              {readAll || !rest ? narrative.active_narrative : lead}
            </p>
            <div className="flex flex-wrap items-center gap-4" style={{ marginTop: 12 }}>
              {rest && (
                <button type="button" style={textLink} aria-expanded={readAll} onClick={() => setReadAll(r => !r)}>
                  {readAll ? 'Show less' : 'Read all'}
                </button>
              )}
              {isUserAuthored && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirmingClear) {
                      handleClear();
                    } else {
                      setConfirmingClear(true);
                    }
                  }}
                  onBlur={() => setConfirmingClear(false)}
                  className="inline-flex items-center gap-1"
                  style={{ ...textLink, color: confirmingClear ? 'var(--rg-danger)' : 'var(--rg-ink-2)' }}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  {confirmingClear ? 'Press again to confirm' : 'Revert to your twin\'s version'}
                </button>
              )}
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
              aria-label="Your soul, in your own words"
              className="n-input w-full resize-y focus-visible:outline-2 focus-visible:outline-[var(--rg-ink)]"
              style={{ height: 'auto' }}
              placeholder="Write the version of you that the twin should believe."
            />
            <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginTop: 12 }}>
              <span style={{ color: remaining < 100 ? 'var(--rg-danger)' : 'var(--rg-ink-3)', fontVariantNumeric: 'tabular-nums' }}>
                {remaining} characters left
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setMode('view'); setDraft(narrative.active_narrative || ''); }}
                  disabled={mode === 'saving'}
                  className="n-btn n-btn--ghost"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={mode === 'saving' || draft.length > MAX_CHARS}
                  className="n-btn n-btn--ghost"
                  style={{ fontWeight: 500 }}
                >
                  {mode === 'saving' ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Section>
  );
};

export default IdentityNarrativeCard;
