/**
 * ChatImportCard
 * ==============
 * Guided multi-context voice import flow.
 * Walks the user through importing chats for 4 relationship contexts so the
 * twin learns how they write in different registers:
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
  MessageCircle, Send, Upload, CheckCircle, Loader2,
  AlertCircle, ChevronDown, ChevronUp, HelpCircle,
  UserRound, Home, Briefcase, Heart, RotateCcw,
} from 'lucide-react';
import { importsAPI, type ChatImportResult, type ChatContext } from '@/services/api/importsAPI';

type Platform = 'whatsapp_chat' | 'telegram_chat';
type ContextStatus = 'pending' | 'uploading' | 'done' | 'skipped' | 'error';

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
  optional?: boolean;
}

const CONTEXT_DEFS: ContextDef[] = [
  {
    id: 'close_friend',
    label: 'Close friend',
    description: 'Casual, unfiltered — how you really talk when you\'re comfortable.',
    icon: UserRound,
  },
  {
    id: 'family',
    label: 'Family',
    description: 'Intimate and personal — how you write to people who know you deeply.',
    icon: Home,
  },
  {
    id: 'professional',
    label: 'Work or professional',
    description: 'Your formal register — how you write to a manager or business partner.',
    icon: Briefcase,
  },
  {
    id: 'romantic_partner',
    label: 'Romantic partner',
    description: 'Your most personal voice. Optional — skip if you prefer to keep this private.',
    icon: Heart,
    optional: true,
  },
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
    color: '#25D366',
    icon: MessageCircle,
    accept: '.txt,.zip',
    guideTitle: 'How to export from WhatsApp',
    guideSteps: [
      'Open WhatsApp on your phone.',
      'Open the chat you want to import.',
      'Tap the three dots (...) at the top right.',
      'Tap "More" then "Export chat".',
      'Choose "Without Media".',
      'Share or save the .txt file, then upload it here.',
    ],
    guideNote: 'You can export multiple chats and upload them one by one. Each import adds to the twin\'s memory.',
  },
  telegram_chat: {
    label: 'Telegram',
    color: '#2AABEE',
    icon: Send,
    accept: '.json',
    guideTitle: 'How to export from Telegram',
    guideSteps: [
      'Open Telegram Desktop (the desktop app, not web or mobile).',
      'Open the chat you want to export.',
      'Click the three dots (...) at the top right of the chat.',
      'Click "Export chat history".',
      'Under Format, select JSON.',
      'Uncheck photos, videos, and files to keep the file small.',
      'Click Export — this saves a folder with result.json inside.',
      'Upload the result.json file here.',
    ],
    guideNote: 'You must use Telegram Desktop — the phone app cannot export to JSON.',
  },
};

interface ChatImportCardProps {
  cardStyle?: string;
}

export default function ChatImportCard({ cardStyle }: ChatImportCardProps) {
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
  const totalCount = CONTEXT_DEFS.length;

  const updateContext = useCallback((id: ChatContext, patch: Partial<ContextState>) => {
    setContexts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const handleFile = async (file: File, contextId: ChatContext) => {
    updateContext(contextId, { status: 'uploading', error: undefined });

    try {
      const opts = {
        chatContext: contextId,
        ...(platform === 'whatsapp_chat'
          ? { ownerName: ownerName.trim() || undefined }
          : { myName: telegramName.trim() }),
      };
      const res = await importsAPI.uploadChatHistory(platform, file, opts);
      updateContext(contextId, {
        status: 'done',
        result: res,
        importCount: contexts[contextId].importCount + 1,
      });
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

  const sectionClass = cardStyle ? `p-5 ${cardStyle}` : 'p-5 rounded-[16px]';
  const sectionStyle = cardStyle ? {} : {
    background: 'var(--glass-surface-bg)',
    backdropFilter: 'blur(42px)',
    border: '1px solid var(--glass-surface-border)',
  };

  return (
    <section className={sectionClass} style={sectionStyle}>
      {/* Hidden file input — shared across all contexts */}
      <input
        ref={fileRef}
        type="file"
        accept={cfg.accept}
        onChange={onFileChange}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <cfg.icon className="w-4 h-4 flex-shrink-0" style={{ color: cfg.color }} />
          <h2 className="text-[11px] font-medium tracking-widest uppercase" style={{ color: cfg.color }}>
            Chat Voice Import
          </h2>
        </div>
        {/* Progress badge */}
        <span
          className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
          style={{
            background: completedCount > 0 ? `${cfg.color}15` : 'rgba(255,255,255,0.05)',
            color: completedCount > 0 ? cfg.color : 'var(--text-muted)',
            border: `1px solid ${completedCount > 0 ? `${cfg.color}30` : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          {completedCount} of {totalCount} voice contexts captured
        </span>
      </div>

      <p className="text-[12px] mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Import chats from different relationships so the twin learns how your voice shifts — casual with friends, warm with family, professional at work.
      </p>

      {/* Platform toggle */}
      <div className="flex gap-2 mb-4">
        {(['whatsapp_chat', 'telegram_chat'] as Platform[]).map((p) => {
          const c = PLATFORM_CONFIG[p];
          const active = platform === p;
          return (
            <button
              key={p}
              onClick={() => { setPlatform(p); setPendingTelegramContext(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all"
              style={{
                background: active ? `${c.color}18` : 'transparent',
                border: `1px solid ${active ? c.color : 'var(--glass-surface-border)'}`,
                color: active ? c.color : 'var(--text-muted)',
              }}
            >
              <c.icon className="w-3 h-3" />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Telegram name — shown once as a persistent field when Telegram is selected */}
      {platform === 'telegram_chat' && (
        <div className="mb-4">
          <label className="text-[11px] block mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Your display name in the Telegram export{' '}
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>(required once)</span>
          </label>
          <input
            type="text"
            value={telegramName}
            onChange={e => setTelegramName(e.target.value)}
            placeholder="Exactly as it appears in the chat, e.g. Stefano"
            className="w-full px-3 py-2 text-[12px] rounded-lg"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--glass-surface-border)',
              color: 'var(--foreground)',
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* Context rows */}
      <div className="space-y-2 mb-4">
        {CONTEXT_DEFS.map((def) => {
          const ctx = contexts[def.id];
          const Icon = def.icon;
          const isUploading = ctx.status === 'uploading';
          const isDone = ctx.status === 'done';
          const isError = ctx.status === 'error';
          const isSkipped = ctx.status === 'skipped';

          return (
            <div
              key={def.id}
              className="flex items-center gap-3 p-3 rounded-[12px] transition-all"
              style={{
                background: isDone ? `${cfg.color}08` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isDone ? `${cfg.color}20` : isError ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)'}`,
                opacity: isSkipped ? 0.4 : 1,
              }}
            >
              {/* Icon */}
              <div
                className="flex-shrink-0 w-8 h-8 rounded-[8px] flex items-center justify-center"
                style={{
                  background: isDone ? `${cfg.color}15` : 'rgba(255,255,255,0.05)',
                }}
              >
                {isDone
                  ? <CheckCircle className="w-4 h-4" style={{ color: cfg.color }} />
                  : isUploading
                  ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: cfg.color }} />
                  : isError
                  ? <AlertCircle className="w-4 h-4 text-red-400" />
                  : <Icon className="w-4 h-4" style={{ color: isDone ? cfg.color : 'var(--text-muted)' }} />
                }
              </div>

              {/* Label + description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium" style={{ color: 'var(--foreground)' }}>
                    {def.label}
                  </span>
                  {def.optional && ctx.status === 'pending' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>
                      optional
                    </span>
                  )}
                </div>
                <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                  {isDone && ctx.result
                    ? `${ctx.result.memoriesStored} conversations · ${ctx.result.parseStats?.owner_sent ?? ctx.result.processStats?.my_messages ?? 0} of your messages`
                    : isError
                    ? ctx.error
                    : isSkipped
                    ? 'Skipped'
                    : isUploading
                    ? 'Analysing your voice...'
                    : def.description
                  }
                </p>
              </div>

              {/* Action */}
              <div className="flex-shrink-0 flex items-center gap-2">
                {ctx.status === 'pending' && (
                  <>
                    <button
                      onClick={() => openFilePicker(def.id)}
                      className="text-[11px] px-3 py-1.5 rounded-full transition-opacity hover:opacity-80"
                      style={{
                        background: `${cfg.color}18`,
                        border: `1px solid ${cfg.color}30`,
                        color: cfg.color,
                      }}
                    >
                      Import
                    </button>
                    {def.optional && (
                      <button
                        onClick={() => skipContext(def.id)}
                        className="text-[11px] transition-opacity hover:opacity-60"
                        style={{ color: 'rgba(255,255,255,0.25)' }}
                      >
                        Skip
                      </button>
                    )}
                  </>
                )}
                {isDone && (
                  <button
                    onClick={() => openFilePicker(def.id)}
                    className="flex items-center gap-1 text-[10px] transition-opacity hover:opacity-60"
                    style={{ color: 'rgba(255,255,255,0.3)' }}
                    title="Import another chat for this context"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {ctx.importCount > 1 ? `${ctx.importCount}x` : 'Re-import'}
                  </button>
                )}
                {isError && (
                  <button
                    onClick={() => retryContext(def.id)}
                    className="text-[11px] px-2 py-1 rounded transition-opacity hover:opacity-80"
                    style={{ color: 'rgba(255,100,100,0.8)', background: 'rgba(239,68,68,0.08)' }}
                  >
                    Retry
                  </button>
                )}
                {isSkipped && (
                  <button
                    onClick={() => retryContext(def.id)}
                    className="text-[11px] transition-opacity hover:opacity-80"
                    style={{ color: 'rgba(255,255,255,0.3)' }}
                  >
                    Import
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Telegram name prompt — inline before file dialog when name missing */}
      {pendingTelegramContext && (
        <div
          className="mb-4 p-3 rounded-[12px] space-y-2"
          style={{ background: 'rgba(42,171,238,0.06)', border: '1px solid rgba(42,171,238,0.15)' }}
        >
          <p className="text-[12px]" style={{ color: 'rgba(42,171,238,0.9)' }}>
            Enter your display name as it appears in the Telegram export before importing:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={telegramName}
              onChange={e => setTelegramName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmTelegramName()}
              placeholder="e.g. Stefano"
              autoFocus
              className="flex-1 px-3 py-1.5 text-[12px] rounded-lg"
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(42,171,238,0.3)',
                color: 'var(--foreground)',
                outline: 'none',
              }}
            />
            <button
              onClick={confirmTelegramName}
              disabled={!telegramName.trim()}
              className="px-3 py-1.5 text-[12px] rounded-lg font-medium disabled:opacity-40 transition-opacity hover:opacity-80"
              style={{ background: 'rgba(42,171,238,0.2)', color: 'rgba(42,171,238,0.9)' }}
            >
              Continue
            </button>
            <button
              onClick={() => setPendingTelegramContext(null)}
              className="text-[11px] px-2 transition-opacity hover:opacity-60"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* WhatsApp advanced: owner name override */}
      {platform === 'whatsapp_chat' && (
        <div className="mb-3">
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1 text-[11px]"
            style={{ color: 'var(--text-muted)' }}
          >
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Your name in the chat (optional — auto-detected)
          </button>
          {showAdvanced && (
            <input
              type="text"
              value={ownerName}
              onChange={e => setOwnerName(e.target.value)}
              placeholder="e.g. Stefano — leave blank to auto-detect"
              className="mt-2 w-full px-3 py-2 text-[12px] rounded-lg"
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--glass-surface-border)',
                color: 'var(--foreground)',
                outline: 'none',
              }}
            />
          )}
        </div>
      )}

      {/* Export guide */}
      <div>
        <button
          onClick={() => setShowGuide(v => !v)}
          className="flex items-center gap-1.5 text-[11px] transition-opacity hover:opacity-80"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          <HelpCircle className="w-3 h-3" />
          {showGuide ? 'Hide guide' : `How to export from ${cfg.label}`}
          {showGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showGuide && (
          <div
            className="mt-3 p-4 rounded-[12px] space-y-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {cfg.guideTitle}
            </p>
            <ol className="space-y-2">
              {cfg.guideSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-semibold mt-0.5"
                    style={{ background: `${cfg.color}20`, color: cfg.color }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-[11px] leading-relaxed pt-1" style={{ color: 'rgba(255,255,255,0.25)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {cfg.guideNote}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
