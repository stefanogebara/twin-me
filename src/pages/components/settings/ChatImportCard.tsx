/**
 * ChatImportCard
 * ==============
 * Guided multi-context voice import flow, in the page kit (no card): a choice
 * of app, then one row per relationship, so the twin learns how the user
 * writes in different registers:
 *   - Close friend  (casual, unfiltered)
 *   - Family        (intimate, personal)
 *   - Work          (formal, professional)
 *   - Romantic partner (optional, most personal)
 *
 * Each context produces memories labelled with the relationship, e.g.:
 *   "In a chat with a close friend, someone said: ... — you replied: ..."
 */

import React, { useRef, useCallback } from 'react';
import { useState } from 'react';
import {
  MessageCircle, Send, CheckCircle, Loader2,
  AlertCircle, ChevronDown, ChevronUp,
  UserRound, Home, Briefcase, Heart,
} from 'lucide-react';
import { importsAPI, type ChatImportResult, type ChatContext } from '@/services/api/importsAPI';
import { List, Row } from '@/components/register';

type Platform = 'whatsapp_chat' | 'telegram_chat';
type ContextStatus = 'pending' | 'uploading' | 'done' | 'skipped' | 'error';

// Reject obviously-oversized exports client-side; the presigned-URL flow has
// no Vercel body limit to save us, and the processor downloads the whole file
// into serverless memory (audit-2026-07-03).
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

interface ContextState {
  status: ContextStatus;
  result?: ChatImportResult;
  error?: string;
  importCount: number;
}

interface ContextDef {
  id: ChatContext;
  label: string;
  description: string;
  icon: React.ElementType;
}

const CONTEXT_DEFS: ContextDef[] = [
  { id: 'close_friend', label: 'Close friend', description: 'Casual and unfiltered', icon: UserRound },
  { id: 'family', label: 'Family', description: 'People who know you well', icon: Home },
  { id: 'professional', label: 'Work', description: 'A manager or a client', icon: Briefcase },
  { id: 'romantic_partner', label: 'Partner', description: 'Your most personal voice', icon: Heart },
];

const INITIAL_CONTEXTS: Record<ChatContext, ContextState> = {
  close_friend:     { status: 'pending', importCount: 0 },
  family:           { status: 'pending', importCount: 0 },
  professional:     { status: 'pending', importCount: 0 },
  romantic_partner: { status: 'pending', importCount: 0 },
};

const PLATFORM_CONFIG = {
  whatsapp_chat: {
    label: 'WhatsApp',
    icon: MessageCircle,
    accept: '.txt,.zip',
    guideTitle: 'How to export from WhatsApp',
    guideSteps: [
      'Open the chat on your phone.',
      'Tap the three dots, then More, then Export chat.',
      'Choose Without media, and save the .txt file.',
    ],
    guideNote: 'Upload chats one at a time. Each one adds to what your twin knows.',
  },
  telegram_chat: {
    label: 'Telegram',
    icon: Send,
    accept: '.json',
    guideTitle: 'How to export from Telegram',
    guideSteps: [
      'Open the chat in Telegram Desktop (the phone app cannot export).',
      'Click the three dots, then Export chat history.',
      'Choose JSON, untick photos, videos and files, and export.',
      'Upload the result.json file from the folder it saves.',
    ],
    guideNote: 'Only Telegram Desktop can export to JSON.',
  },
};

interface ChatImportCardProps {
  /** Kept for callers that still pass it; the register has no card to style. */
  cardStyle?: string;
}

export default function ChatImportCard(_props: ChatImportCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  // Use a ref for the in-flight context to avoid stale closures when file dialog cancels
  const activeContextRef = useRef<ChatContext | null>(null);

  const [platform, setPlatform] = useState<Platform>('whatsapp_chat');
  const [contexts, setContexts] = useState<Record<ChatContext, ContextState>>(INITIAL_CONTEXTS);
  const [telegramName, setTelegramName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  // Which context is waiting for telegramName before opening file dialog
  const [pendingTelegramContext, setPendingTelegramContext] = useState<ChatContext | null>(null);

  const cfg = PLATFORM_CONFIG[platform];
  const completedCount = CONTEXT_DEFS.filter(d => contexts[d.id].status === 'done').length;
  const settledCount = CONTEXT_DEFS.filter(d => contexts[d.id].status === 'done' || contexts[d.id].status === 'skipped').length;
  const allSettled = settledCount === CONTEXT_DEFS.length;
  const totalCount = CONTEXT_DEFS.length;

  const updateContext = useCallback((id: ChatContext, patch: Partial<ContextState>) => {
    setContexts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const handleFile = async (file: File, contextId: ChatContext) => {
    // Text-only chat exports are a few MB; anything huge is a media-laden
    // export that would stall the upload and blow the serverless processor
    // (audit-2026-07-03).
    if (file.size > MAX_UPLOAD_BYTES) {
      updateContext(contextId, {
        status: 'error',
        error: `File is too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB). Export again without media.`,
      });
      activeContextRef.current = null;
      return;
    }

    updateContext(contextId, { status: 'uploading', error: undefined });

    try {
      const opts = {
        chatContext: contextId,
        ...(platform === 'whatsapp_chat'
          ? { ownerName: ownerName.trim() || undefined }
          : { myName: telegramName.trim() }),
      };
      const res = await importsAPI.uploadChatHistory(platform, file, opts);
      // Use functional update to avoid stale closure on importCount
      setContexts(prev => ({
        ...prev,
        [contextId]: {
          ...prev[contextId],
          status: 'done',
          result: res,
          error: undefined,
          importCount: prev[contextId].importCount + 1,
        },
      }));
    } catch (err) {
      updateContext(contextId, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Import failed',
      });
    } finally {
      activeContextRef.current = null;
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const contextId = activeContextRef.current;
    e.target.value = '';
    if (file && contextId) handleFile(file, contextId);
    else activeContextRef.current = null;
  };

  const openFilePicker = (contextId: ChatContext) => {
    // If Telegram and no name yet, ask for it first
    if (platform === 'telegram_chat' && !telegramName.trim()) {
      setPendingTelegramContext(contextId);
      return;
    }
    activeContextRef.current = contextId;
    fileRef.current?.click();
  };

  const confirmTelegramName = () => {
    if (!telegramName.trim() || !pendingTelegramContext) return;
    const contextId = pendingTelegramContext;
    setPendingTelegramContext(null);
    activeContextRef.current = contextId;
    fileRef.current?.click();
  };

  const skipContext = (id: ChatContext) => {
    updateContext(id, { status: 'skipped' });
  };

  const retryContext = (id: ChatContext) => {
    updateContext(id, { status: 'pending', error: undefined });
  };

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* Hidden file input — shared across all contexts */}
      <input
        ref={fileRef}
        type="file"
        accept={cfg.accept}
        onChange={onFileChange}
        className="hidden"
      />

      {/* Which app the chats come from: 32/4 choices, and the progress */}
      <div className="rs-inline" style={{ justifyContent: 'space-between' }}>
        <div className="rg-choices" role="group" aria-label="Chat app">
          {(['whatsapp_chat', 'telegram_chat'] as Platform[]).map((p) => {
            const c = PLATFORM_CONFIG[p];
            return (
              <button
                key={p}
                type="button"
                aria-pressed={platform === p}
                onClick={() => { setPlatform(p); setPendingTelegramContext(null); }}
                className="n-btn n-btn--ghost rg-choice"
              >
                <c.icon className="w-4 h-4" aria-hidden="true" />
                {c.label}
              </button>
            );
          })}
        </div>
        <p className="rs-quiet">{completedCount} of {totalCount} voices</p>
      </div>

      {/* Telegram name — shown once as a persistent field when Telegram is selected */}
      {platform === 'telegram_chat' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <label htmlFor="tg-name">Your name in the Telegram export</label>
          <input
            id="tg-name"
            type="text"
            value={telegramName}
            onChange={e => setTelegramName(e.target.value)}
            placeholder="Exactly as it appears in the chat"
            className="n-input"
          />
        </div>
      )}

      {/* One row per relationship */}
      <List label="Voices" className="pb-stack">
        {CONTEXT_DEFS.map((def) => {
          const ctx = contexts[def.id];
          const Icon = def.icon;
          const isUploading = ctx.status === 'uploading';
          const isDone = ctx.status === 'done';
          const isError = ctx.status === 'error';
          const isSkipped = ctx.status === 'skipped';

          const line = isDone && ctx.result
            ? <><span className="rs-ok">Imported</span> · {ctx.result.memoriesStored} conversations, {ctx.result.parseStats?.owner_sent ?? ctx.result.processStats?.my_messages ?? 0} of your messages</>
            : isError
              ? <span className="rs-bad">{ctx.error}</span>
              : isSkipped
                ? 'Skipped'
                : isUploading
                  ? 'Reading your messages'
                  : <>{def.description}{' '}<button type="button" className="rs-link" onClick={() => skipContext(def.id)}>Skip</button></>;

          const action = ctx.status === 'pending' ? (
            <button type="button" onClick={() => openFilePicker(def.id)} className="n-btn n-btn--ghost">Import</button>
          ) : isDone ? (
            <button type="button" onClick={() => openFilePicker(def.id)} className="n-btn n-btn--ghost" title="Import another chat for this voice">
              {ctx.importCount > 1 ? `Import more (${ctx.importCount})` : 'Import more'}
            </button>
          ) : isError ? (
            <button type="button" onClick={() => retryContext(def.id)} className="n-btn n-btn--ghost">Retry</button>
          ) : isSkipped ? (
            <button type="button" onClick={() => retryContext(def.id)} className="n-btn n-btn--ghost">Import</button>
          ) : (
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--rg-ink-2)' }} aria-label="Importing" />
          );

          return (
            <Row
              key={def.id}
              icon={isDone
                ? <CheckCircle style={{ color: 'var(--rg-ok)' }} />
                : isError
                  ? <AlertCircle style={{ color: 'var(--rg-danger)' }} />
                  : <Icon />}
              title={def.label}
              line={line}
              action={action}
            />
          );
        })}

        {/* Completion: one quiet line, no banner */}
        {allSettled && completedCount > 0 && (
          <li className="rs-note">
            Your twin now has {completedCount} {completedCount === 1 ? 'voice' : 'voices'}. Add more chats any time.
          </li>
        )}

        {/* Telegram name prompt — inline before file dialog when name missing */}
        {pendingTelegramContext && (
          <li className="rs-body rs-body--plain" style={{ paddingTop: 16 }}>
            <label htmlFor="tg-name-prompt">Your name as it appears in the Telegram export</label>
            <div className="rs-inline">
              <input
                id="tg-name-prompt"
                type="text"
                value={telegramName}
                onChange={e => setTelegramName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmTelegramName()}
                placeholder="For example, Alex"
                autoFocus
                className="n-input"
              />
              <button type="button" onClick={confirmTelegramName} disabled={!telegramName.trim()} className="n-btn n-btn--ghost">
                Continue
              </button>
              <button type="button" onClick={() => setPendingTelegramContext(null)} className="rs-link">
                Cancel
              </button>
            </div>
          </li>
        )}
      </List>

      <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
        {/* WhatsApp advanced: owner name override */}
        {platform === 'whatsapp_chat' && (
          <>
            <button type="button" onClick={() => setShowAdvanced(v => !v)} className="rs-link" aria-expanded={showAdvanced}>
              Your name in the chat
              {showAdvanced ? <ChevronUp className="inline w-4 h-4 ml-1" aria-hidden="true" /> : <ChevronDown className="inline w-4 h-4 ml-1" aria-hidden="true" />}
            </button>
            {showAdvanced && (
              <input
                type="text"
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                placeholder="Leave blank to find it automatically"
                aria-label="Your name in the chat"
                className="n-input"
              />
            )}
          </>
        )}

        {/* Export guide */}
        <button type="button" onClick={() => setShowGuide(v => !v)} className="rs-link" aria-expanded={showGuide}>
          {showGuide ? 'Hide the steps' : cfg.guideTitle}
          {showGuide ? <ChevronUp className="inline w-4 h-4 ml-1" aria-hidden="true" /> : <ChevronDown className="inline w-4 h-4 ml-1" aria-hidden="true" />}
        </button>
        {showGuide && (
          <div style={{ display: 'grid', gap: 8 }}>
            <ol className="rs-steps">
              {cfg.guideSteps.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
            <p className="rs-quiet">{cfg.guideNote}</p>
          </div>
        )}
      </div>
    </div>
  );
}
