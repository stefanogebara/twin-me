/**
 * GmailCourierToggle — bank-integration strategy Phase 2 opt-in.
 * ===============================================================
 * Toggles the gmail_statement_courier feature flag: when on, TwinMe scans the
 * user's Gmail (hourly, with their existing Gmail connection) for OFX
 * statement attachments — e.g. Nubank's "Exportar Extrato" email — and
 * imports them automatically. Off by default because it reads attachment
 * bytes, a deliberate departure from the metadata-only Gmail posture.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { API_URL, getAuthHeaders } from '@/services/api/apiBase';

export function GmailCourierToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/feature-flags`, { headers: getAuthHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setEnabled(data?.flags?.gmail_statement_courier === true);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => { cancelled = true; };
  }, []);

  const toggle = useCallback(async () => {
    if (enabled === null || saving) return;
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/feature-flags`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ flag: 'gmail_statement_courier', value: next }),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
    } catch {
      setEnabled(!next); // revert on failure
    } finally {
      setSaving(false);
    }
  }, [enabled, saving]);

  return (
    <button
      onClick={toggle}
      disabled={enabled === null || saving}
      className="inline-flex items-center gap-2 px-3 py-2 transition-colors disabled:opacity-60"
      style={{
        background: enabled ? 'rgba(134,239,172,0.10)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${enabled ? 'rgba(134,239,172,0.28)' : 'rgba(255,255,255,0.10)'}`,
        borderRadius: 46,
        backdropFilter: 'blur(42px)',
        WebkitBackdropFilter: 'blur(42px)',
        fontFamily: "'Geist', 'Inter', sans-serif",
        fontWeight: 500,
        fontSize: 12,
        color: enabled ? 'rgba(134,239,172,0.95)' : 'rgba(255,255,255,0.70)',
      }}
      title="When on, TwinMe checks your Gmail for OFX statement attachments (like Nubank's Exportar Extrato email) and imports them automatically. Only statement files are read, never your email text."
    >
      {saving || enabled === null ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Mail className="w-3.5 h-3.5" />
      )}
      {enabled === null
        ? 'Gmail auto-import'
        : enabled
          ? 'Gmail auto-import: On'
          : 'Gmail auto-import: Off'}
    </button>
  );
}
