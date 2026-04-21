/**
 * BankConnectionsList — Phase 3.2
 * =================================
 * Inline list of Pluggy bank connections. Lives on MoneyPage so the user
 * sees connected banks right where they see their money.
 *
 * Status chips:
 *   UPDATED           — green (freshly synced)
 *   UPDATING          — amber (sync in progress)
 *   LOGIN_ERROR       — red (reconnect needed)
 *   WAITING_USER_INPUT — amber (MFA prompt; reconnect to continue)
 *   OUTDATED          — muted (stale but not broken)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Trash2, AlertCircle } from 'lucide-react';
import {
  listBankConnections,
  deleteBankConnection,
  syncBankConnection,
  type BankConnection,
} from '@/services/api/transactionsAPI';

function statusStyle(status: string): { bg: string; fg: string; label: string } {
  switch (status) {
    case 'UPDATED':
      return { bg: 'rgba(34, 197, 94, 0.12)', fg: 'rgba(134, 239, 172, 0.95)', label: 'sincronizado' };
    case 'UPDATING':
      return { bg: 'rgba(217, 119, 6, 0.12)', fg: 'rgba(232, 160, 80, 0.95)', label: 'sincronizando' };
    case 'LOGIN_ERROR':
      return { bg: 'rgba(239, 68, 68, 0.12)', fg: 'rgba(248, 113, 113, 0.95)', label: 'reconectar' };
    case 'WAITING_USER_INPUT':
      return { bg: 'rgba(217, 119, 6, 0.12)', fg: 'rgba(232, 160, 80, 0.95)', label: 'precisa de MFA' };
    case 'OUTDATED':
      return { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.55)', label: 'desatualizado' };
    default:
      return { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.55)', label: status.toLowerCase() };
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

interface Props {
  onChanged?: () => void;
}

export function BankConnectionsList({ onChanged }: Props) {
  const [connections, setConnections] = useState<BankConnection[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await listBankConnections();
    setConnections(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = async (id: string) => {
    setBusyId(id);
    try {
      await syncBankConnection(id);
      await load();
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Desconectar este banco? Suas transações anteriores serão mantidas.')) return;
    setBusyId(id);
    try {
      await deleteBankConnection(id);
      await load();
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  if (!connections || connections.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-2">
      {connections.map((c) => {
        const chip = statusStyle(c.status);
        const needsReconnect = c.status === 'LOGIN_ERROR' || c.status === 'WAITING_USER_INPUT';
        return (
          <div
            key={c.id}
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                {needsReconnect ? (
                  <AlertCircle className="w-4 h-4" style={{ color: 'rgba(248, 113, 113, 0.95)' }} />
                ) : (
                  <span
                    className="text-xs font-semibold"
                    style={{ color: 'rgba(255,255,255,0.75)', fontFamily: "'Geist', 'Inter', sans-serif" }}
                  >
                    {c.connector_name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div
                  className="text-sm font-medium truncate"
                  style={{ color: 'rgba(255,255,255,0.90)', fontFamily: "'Geist', 'Inter', sans-serif" }}
                >
                  {c.connector_name}
                </div>
                <div
                  className="text-xs"
                  style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Geist', 'Inter', sans-serif" }}
                >
                  última sync {relativeTime(c.last_synced_at)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  background: chip.bg,
                  color: chip.fg,
                  fontFamily: "'Geist', 'Inter', sans-serif",
                }}
              >
                {chip.label}
              </span>
              <button
                onClick={() => handleSync(c.id)}
                disabled={busyId === c.id}
                className="p-1.5 rounded-md transition-colors disabled:opacity-50"
                style={{ color: 'rgba(255,255,255,0.55)' }}
                title="Sincronizar agora"
                aria-label="Sincronizar"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busyId === c.id ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => handleDelete(c.id)}
                disabled={busyId === c.id}
                className="p-1.5 rounded-md transition-colors disabled:opacity-50"
                style={{ color: 'rgba(255,255,255,0.45)' }}
                title="Desconectar"
                aria-label="Desconectar"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
