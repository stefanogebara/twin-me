/**
 * WhatsApp Import Card
 * ====================
 * Lets users upload a WhatsApp chat export (.txt) to extract
 * communication patterns into the twin memory stream.
 *
 * How to export: WhatsApp -> Chat -> ... -> More -> Export Chat -> Without Media
 */

import React, { useState, useRef } from 'react';
import { MessageCircle, Upload, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { authFetch } from '@/services/api/apiBase';

interface ImportResult {
  success: boolean;
  stored: number;
  parsed: number;
  contacts: number;
  spanDays: number;
}

interface WhatsAppImportCardProps {
  cardStyle?: string;
}

export default function WhatsAppImportCard({ cardStyle }: WhatsAppImportCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myName, setMyName] = useState('');

  const sectionClass = cardStyle ? `p-5 ${cardStyle}` : 'p-5 rounded-lg';
  const sectionStyle = cardStyle ? {} : { border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' };

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
    <section className={sectionClass} style={sectionStyle}>
      <div className="flex items-center gap-3 mb-4">
        <MessageCircle className="w-5 h-5" style={{ color: '#10b77f' }} />
        <h2
          className="text-[11px] font-medium tracking-widest uppercase"
          style={{ color: '#10b77f' }}
        >
          WhatsApp Patterns
        </h2>
        {status === 'success' && (
          <span
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <CheckCircle className="w-3 h-3" /> Imported
          </span>
        )}
      </div>

      <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
        Import a WhatsApp chat export to capture your communication style and social patterns.
        No messages are stored — only aggregate patterns (active hours, emoji usage, contact frequency).
      </p>

      {status !== 'success' && (
        <>
          <div className="mb-3">
            <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.3)' }}>Your display name in the chat (optional)</label>
            <input
              type="text"
              value={myName}
              onChange={e => setMyName(e.target.value)}
              placeholder="e.g. Stefan"
              className="w-full px-3 py-2 text-sm rounded-lg"
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--foreground)',
                outline: 'none',
              }}
            />
          </div>

          <div
            className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors"
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            onClick={() => fileRef.current?.click()}
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
          >
            <input ref={fileRef} type="file" accept=".txt" onChange={onFileChange} className="hidden" />

            {status === 'loading' ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Analysing your chat...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.2)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Drop your <code>.txt</code> export here or click to browse</p>
              </div>
            )}
          </div>

          {status === 'error' && error && (
            <div className="flex items-start gap-2 mt-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Export: WhatsApp -> open a chat -> ... -> More -> Export Chat -> Without Media -> share the .txt file here.
          </p>
        </>
      )}

      {status === 'success' && result && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
              <div className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{result.stored}</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>patterns stored</div>
            </div>
            <div className="text-center p-3 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
              <div className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{result.contacts}</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>contacts found</div>
            </div>
            <div className="text-center p-3 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
              <div className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{result.spanDays}</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>days of history</div>
            </div>
          </div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Communication patterns added to your twin's memory stream. Import another chat or a more recent export anytime.
          </p>
          <button
            onClick={() => { setStatus('idle'); setResult(null); }}
            className="text-xs underline"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            Import another chat
          </button>
        </div>
      )}
    </section>
  );
}
