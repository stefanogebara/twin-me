/**
 * ChatImportCard
 * ==============
 * Imports WhatsApp or Telegram chat history into the twin's memory stream.
 *
 * Unlike the existing WhatsAppImportCard (which only extracts behavioral stats),
 * this ingests actual conversation pairs — what was said TO you and what YOU replied —
 * so the twin learns your real conversational voice, not just your activity patterns.
 *
 * Supports:
 *   - WhatsApp: .txt or .zip export (Chat → ... → Export Chat → Without Media)
 *   - Telegram: result.json export (Telegram Desktop → Export chat history → JSON)
 */

import React, { useRef, useState } from 'react';
import { MessageCircle, Send, Upload, CheckCircle, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { importsAPI, type ChatImportResult } from '@/services/api/importsAPI';

type Platform = 'whatsapp_chat' | 'telegram_chat';
type Status = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

interface ChatImportCardProps {
  cardStyle?: string;
}

const PLATFORM_CONFIG = {
  whatsapp_chat: {
    label: 'WhatsApp',
    color: '#25D366',
    icon: MessageCircle,
    accept: '.txt,.zip',
    hint: 'WhatsApp → open any chat → ... → More → Export Chat → Without Media → share the .txt file.',
    idField: null as null,
  },
  telegram_chat: {
    label: 'Telegram',
    color: '#2AABEE',
    icon: Send,
    accept: '.json',
    hint: 'Telegram Desktop → chat menu → Export chat history → JSON format → upload result.json.',
    idField: 'myName' as const,
  },
};

export default function ChatImportCard({ cardStyle }: ChatImportCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [platform, setPlatform] = useState<Platform>('whatsapp_chat');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<ChatImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [myTelegramName, setMyTelegramName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const cfg = PLATFORM_CONFIG[platform];
  const isLoading = status === 'uploading' || status === 'processing';

  const handleFile = async (file: File) => {
    setStatus('uploading');
    setError(null);
    setResult(null);

    try {
      setStatus('processing');
      const res = await importsAPI.uploadChatHistory(
        platform,
        file,
        platform === 'whatsapp_chat'
          ? { ownerName: ownerName.trim() || undefined }
          : { myName: myTelegramName.trim() || undefined }
      );
      setResult(res);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStatus('error');
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const reset = () => {
    setStatus('idle');
    setResult(null);
    setError(null);
  };

  const sectionClass = cardStyle ? `p-5 ${cardStyle}` : 'p-5 rounded-[16px]';
  const sectionStyle = cardStyle ? {} : {
    background: 'var(--glass-surface-bg)',
    backdropFilter: 'blur(42px)',
    border: '1px solid var(--glass-surface-border)',
  };

  return (
    <section className={sectionClass} style={sectionStyle}>

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <cfg.icon className="w-4 h-4 flex-shrink-0" style={{ color: cfg.color }} />
        <h2 className="text-[11px] font-medium tracking-widest uppercase" style={{ color: cfg.color }}>
          Chat Voice Import
        </h2>
        {status === 'success' && (
          <span
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}
          >
            <CheckCircle className="w-3 h-3" /> Imported
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-[12px] mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Import your actual chat messages so the twin learns how you really talk — your phrases, rhythm, and tone — not just what platforms say about you.
      </p>

      {status !== 'success' && (
        <>
          {/* Platform toggle */}
          <div className="flex gap-2 mb-4">
            {(['whatsapp_chat', 'telegram_chat'] as Platform[]).map((p) => {
              const c = PLATFORM_CONFIG[p];
              const active = platform === p;
              return (
                <button
                  key={p}
                  onClick={() => { setPlatform(p); setError(null); }}
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

          {/* Identity field */}
          {platform === 'telegram_chat' && (
            <div className="mb-3">
              <label className="text-[11px] block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Your display name in the export <span style={{ color: 'rgba(255,255,255,0.3)' }}>(required)</span>
              </label>
              <input
                type="text"
                value={myTelegramName}
                onChange={e => setMyTelegramName(e.target.value)}
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

          {/* Advanced: WhatsApp owner name override */}
          {platform === 'whatsapp_chat' && (
            <div className="mb-3">
              <button
                onClick={() => setShowAdvanced(v => !v)}
                className="flex items-center gap-1 text-[11px] mb-2"
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
                  className="w-full px-3 py-2 text-[12px] rounded-lg"
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

          {/* Drop zone */}
          <div
            className="border-2 border-dashed rounded-[12px] p-6 text-center cursor-pointer transition-colors"
            style={{ borderColor: isLoading ? cfg.color : 'var(--glass-surface-border)' }}
            onClick={() => !isLoading && fileRef.current?.click()}
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
          >
            <input
              ref={fileRef}
              type="file"
              accept={cfg.accept}
              onChange={onFileChange}
              className="hidden"
            />

            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-7 h-7 animate-spin" style={{ color: cfg.color }} />
                <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  {status === 'uploading' ? 'Uploading...' : 'Analysing your voice...'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
                <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  Drop your {platform === 'whatsapp_chat' ? '.txt or .zip' : 'result.json'} export here
                </p>
                <span className="text-[11px] px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                  or click to browse
                </span>
              </div>
            )}
          </div>

          {status === 'error' && error && (
            <div className="flex items-start gap-2 mt-3 p-3 rounded-[10px]" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.12)' }}>
              <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-400">{error}</p>
            </div>
          )}

          <p className="text-[11px] mt-3 leading-relaxed" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {cfg.hint}
          </p>
        </>
      )}

      {/* Success state */}
      {status === 'success' && result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: result.memoriesStored, label: 'conversations' },
              { value: result.factsStored, label: 'style facts' },
              { value: result.parseStats?.owner_sent ?? result.processStats?.my_messages ?? 0, label: 'your messages' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center p-3 rounded-[10px]" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="text-[18px] font-semibold" style={{ color: 'var(--foreground)' }}>{value}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>

          {result.stylometricFeatures && (
            <div className="p-3 rounded-[10px] space-y-1" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                Style fingerprint detected
              </p>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Avg {result.stylometricFeatures.avgWordsPerMessage} words/message &middot; {result.stylometricFeatures.capitalizationStyle} &middot; {result.stylometricFeatures.emojiRatio}% emoji
                {result.stylometricFeatures.topEmojis.length > 0 && (
                  <> &middot; {result.stylometricFeatures.topEmojis.join(' ')}</>
                )}
              </p>
            </div>
          )}

          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Your conversational voice is now in the twin's memory stream. It will synthesize style insights over the next few minutes.
          </p>

          <button
            onClick={reset}
            className="text-[11px] underline"
            style={{ color: 'var(--text-muted)' }}
          >
            Import another chat
          </button>
        </div>
      )}
    </section>
  );
}
