/**
 * actionsAPI — client for the M1 action inbox (/api/actions).
 *
 * The twin drafts replies in your voice; this is how the "Today" surface lists
 * them and records your decision. The twin never sends on its own — send / edit
 * / reject are the human approval gate.
 */
import { authFetch } from './apiBase';

export interface WhySignal {
  kind: 'voice' | 'register' | 'memory' | 'directive' | string;
  note: string;
}

export interface TwinAction {
  id: string;
  type: string;
  status: string;
  channel: string;
  thread_ref: string | null;
  recipient: string | null;
  draft_text: string;
  why_signals: WhySignal[];
  created_at: string;
}

// Unwrap the { success, data, error } envelope, throwing a useful message on failure.
async function unwrap<T>(res: Response): Promise<T> {
  let json: { success?: boolean; data?: unknown; error?: string } = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON body — fall through to the status-based error below */
  }
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return json.data as T;
}

export const actionsAPI = {
  /** The inbox: the user's pending twin actions, newest first. */
  async listPending(signal?: AbortSignal): Promise<TwinAction[]> {
    const res = await authFetch('/actions?status=pending', { signal });
    return unwrap<TwinAction[]>(res);
  },

  /** Approve and send the draft as-is. */
  async send(id: string): Promise<void> {
    await unwrap(await authFetch(`/actions/${id}/send`, { method: 'POST' }));
  },

  /** Send an edited version — teaches the twin the diff. */
  async edit(id: string, finalText: string): Promise<void> {
    await unwrap(await authFetch(`/actions/${id}/edit`, {
      method: 'POST',
      body: JSON.stringify({ finalText }),
    }));
  },

  /** Reject with a reason — teaches the twin what to avoid. */
  async reject(id: string, reason: string): Promise<void> {
    await unwrap(await authFetch(`/actions/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }));
  },
};
