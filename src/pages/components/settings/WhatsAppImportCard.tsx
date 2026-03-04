/**
 * WhatsApp Import Card
 * ====================
 * Lets users upload a WhatsApp chat export (.txt) to extract
 * communication patterns into the twin memory stream.
 *
 * How to export: WhatsApp → Chat → ⋮ → More → Export Chat → Without Media
 */

import React, { useState, useRef } from 'react';
import { MessageCircle, Upload, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

const cardClassName = 'glass-card';

interface ImportResult {
  success: boolean;
  stored: number;
  parsed: number;
  contacts: number;
  spanDays: number;
}

export default function WhatsAppImportCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myName, setMyName] = useState('');

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.txt')) {
      setError('Please select a .txt file exported from WhatsApp');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      const url = myName.trim()
        ? `/whatsapp/import?my_name=${encodeURIComponent(myName.trim())}`
        : '/whatsapp/import';

      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || 'Failed to parse export');
      }

      const data = await res.json();
      setResult(data);
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

  return (
    <section className={`p-5 ${cardClassName}`}>
      <div className="flex items-center gap-3 mb-4">
        <MessageCircle className="w-5 h-5 text-emerald-600" />
        <h2 className="text-base font-semibold text-foreground">WhatsApp Patterns</h2>
        {status === 'success' && (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
            <CheckCircle className="w-3 h-3" /> Imported
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Import a WhatsApp chat export to capture your communication style and social patterns.
        No messages are stored — only aggregate patterns (active hours, emoji usage, contact frequency).
      </p>

      {status !== 'success' && (
        <>
          <div className="mb-3">
            <label className="text-xs text-muted-foreground mb-1 block">Your display name in the chat (optional)</label>
            <input
              type="text"
              value={myName}
              onChange={e => setMyName(e.target.value)}
              placeholder="e.g. Stefan"
              className="w-full px-3 py-2 text-sm border border-white/10 rounded-lg bg-white/8 focus:outline-none focus:ring-2 focus:ring-stone-600 text-foreground"
            />
          </div>

          <div
            className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center cursor-pointer hover:border-stone-400 hover:bg-[var(--glass-surface-bg-hover)] transition-colors"
            onClick={() => fileRef.current?.click()}
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
          >
            <input ref={fileRef} type="file" accept=".txt" onChange={onFileChange} className="hidden" />

            {status === 'loading' ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">Analysing your chat…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-stone-300" />
                <p className="text-sm text-muted-foreground">Drop your <code>.txt</code> export here or click to browse</p>
              </div>
            )}
          </div>

          {status === 'error' && error && (
            <div className="flex items-start gap-2 mt-3 p-3 bg-red-900/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-3">
            Export: WhatsApp → open a chat → ⋮ → More → Export Chat → Without Media → share the .txt file here.
          </p>
        </>
      )}

      {status === 'success' && result && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-[var(--glass-surface-bg)] rounded-xl">
              <div className="text-xl font-bold text-foreground">{result.stored}</div>
              <div className="text-xs text-muted-foreground mt-0.5">patterns stored</div>
            </div>
            <div className="text-center p-3 bg-[var(--glass-surface-bg)] rounded-xl">
              <div className="text-xl font-bold text-foreground">{result.contacts}</div>
              <div className="text-xs text-muted-foreground mt-0.5">contacts found</div>
            </div>
            <div className="text-center p-3 bg-[var(--glass-surface-bg)] rounded-xl">
              <div className="text-xl font-bold text-foreground">{result.spanDays}</div>
              <div className="text-xs text-muted-foreground mt-0.5">days of history</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Communication patterns added to your twin's memory stream. Import another chat or a more recent export anytime.
          </p>
          <button
            onClick={() => { setStatus('idle'); setResult(null); }}
            className="text-xs text-muted-foreground hover:text-muted-foreground underline"
          >
            Import another chat
          </button>
        </div>
      )}
    </section>
  );
}
