/**
 * Inbox API Module
 *
 * Client for the unified proposal stream that backs the /inbox page.
 * Endpoint: GET /api/inbox?cursor=<iso>&limit=<n>
 *
 * Phase 1 of the /departments → /inbox collapse. The page composes pending
 * + resolved proposals from all departments into a single chronological feed.
 */

import { authFetch } from './apiBase';

// --- Types ---

export type InboxStatus = 'pending' | 'done' | 'skipped' | 'expired' | 'undone' | 'failed' | 'snoozed';

export interface OutcomeRef {
  kind: 'gmail_draft' | 'calendar_event';
  id: string;
}

export interface OutcomeLink {
  label: string;
  url: string;
}

export interface InboxItem {
  id: string;
  status: InboxStatus;
  title: string;
  why: string | null;
  reasoning: string | null;
  department: string;
  departmentColor: string;
  toolName: string | null;
  outcomeLink: OutcomeLink | null;
  outcomeRef: OutcomeRef | null;
  failureReason: string | null;
  snoozedUntil: string | null;
  createdAt: string;
  resolvedAt: string | null;
  sortAt: string;
}

export interface InboxResponse {
  items: InboxItem[];
  nextCursor: string | null;
}

// --- API ---

export const inboxAPI = {
  /**
   * Fetch one page of the inbox stream.
   *
   * @param opts.cursor — pass nextCursor from the previous response
   * @param opts.limit  — page size 1..50 (server clamps), default 20
   */
  getStream: async (opts: { cursor?: string | null; limit?: number } = {}): Promise<InboxResponse> => {
    const params = new URLSearchParams();
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const response = await authFetch(`/inbox${qs ? `?${qs}` : ''}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch inbox: ${response.statusText}`);
    }
    const data = await response.json();
    return {
      items: data.items ?? [],
      nextCursor: data.nextCursor ?? null,
    };
  },

  /**
   * Cheap COUNT for the sidebar badge. Used by the Inbox nav item to show
   * a number when the user has unresolved proposals waiting. Server returns
   * 0 on any internal error so the badge silently disappears rather than
   * breaking the sidebar.
   */
  getPendingCount: async (): Promise<number> => {
    const response = await authFetch('/inbox/pending-count');
    if (!response.ok) return 0;
    const data = await response.json().catch(() => ({}));
    return typeof data?.count === 'number' ? data.count : 0;
  },
};
