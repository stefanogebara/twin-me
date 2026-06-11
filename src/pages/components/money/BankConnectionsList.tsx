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
import { toast } from 'sonner';
import {
  listBankConnections,
  deleteBankConnection,
  syncBankConnection,
  type BankConnection,
} from '@/services/api/transactionsAPI';

function statusStyle(status: string): { bg: string; fg: string; label: string } {
  switch (status) {
    case 'UPDATED':
    case 'CONNECTED':                                    // Plaid: successful link
      return { bg: 'rgba(34, 197, 94, 0.12)', fg: 'rgba(134, 239, 172, 0.95)', label: 'synced' };
    case 'UPDATING':
      return { bg: 'rgba(217, 119, 6, 0.12)', fg: 'rgba(232, 160, 80, 0.95)', label: 'syncing' };
    case 'LOGIN_ERROR':
    case 'LOGIN_REQUIRED':                               // Plaid ITEM_LOGIN_REQUIRED equivalent
    case 'ERROR':                                        // Plaid generic error state
      return { bg: 'rgba(239, 68, 68, 0.12)', fg: 'rgba(248, 113, 113, 0.95)', label: 'reconnect' };
    case 'WAITING_USER_INPUT':
      return { bg: 'rgba(217, 119, 6, 0.12)', fg: 'rgba(232, 160, 80, 0.95)', label: 'needs MFA' };
    case 'PENDING_EXPIRATION':                           // Plaid consent about to expire
      return { bg: 'rgba(217, 119, 6, 0.12)', fg: 'rgba(232, 160, 80, 0.95)', label: 'expires soon' };
    case 'REVOKED':                                      // Plaid USER_PERMISSION_REVOKED
      return { bg: 'rgba(239, 68, 68, 0.12)', fg: 'rgba(248, 113, 113, 0.95)', label: 'revoked' };
    case 'OUTDATED':
      return { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.55)', label: 'out of date' };
    default:
      return { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.55)', label: status.toLowerCase() };
  }
}

// audit-2026-06-10: chip must distinguish providers — Plaid (US) rows were
// previously labeled 'BR via Pluggy Open Finance'. (TrueLayer removed
// entirely in replan-2026-06-10 Track D.)
function providerChip(provider: string): { label: string; title: string } {
  switch (provider) {
    case 'plaid':
      return { label: 'US', title: 'US via Plaid' };
    case 'pluggy':
      return { label: 'BR', title: 'BR via Pluggy Open Finance' };
    default:
      return { label: provider.toUpperCase(), title: provider };
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
      // audit-2026-06-10: provider routes the request to the right backend sync
      // endpoint — without it Plaid rows get a 500 on the default Pluggy route.
      const provider = connections?.find(c => c.id === id)?.provider;
      const ok = await syncBankConnection(id, provider);
      if (!ok) {
        toast.error('Sync failed. Please try again.');
        return;
      }
      await load();
      onChanged?.();
    } catch {
      toast.error('Sync failed. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Disconnect this bank? Your previous transactions will be kept.')) return;
    setBusyId(id);
    try {
      const provider = connections.find(c => c.id === id)?.provider;
      await deleteBankConnection(id, provider);
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
        const provChip = c.provider ? providerChip(c.provider) : null;
        const needsReconnect =
          c.status === 'LOGIN_ERROR' ||
          c.status === 'WAITING_USER_INPUT' ||
          c.status === 'LOGIN_REQUIRED' ||
          c.status === 'ERROR';
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
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: 'rgba(255,255,255,0.90)', fontFamily: "'Geist', 'Inter', sans-serif" }}
                  >
                    {c.connector_name}
                  </div>
                  {provChip && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        color: 'rgba(255,255,255,0.50)',
                        fontFamily: "'Geist', 'Inter', sans-serif",
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                      title={provChip.title}
                    >
                      {provChip.label}
                    </span>
                  )}
                </div>
                <div
                  className="text-xs"
                  style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Geist', 'Inter', sans-serif" }}
                >
                  last sync {relativeTime(c.last_synced_at)}
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
                title="Sync now"
                aria-label="Sync"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busyId === c.id ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => handleDelete(c.id)}
                disabled={busyId === c.id}
                className="p-1.5 rounded-md transition-colors disabled:opacity-50"
                style={{ color: 'rgba(255,255,255,0.45)' }}
                title="Disconnect"
                aria-label="Disconnect"
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
