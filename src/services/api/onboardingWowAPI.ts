/**
 * onboardingWowAPI — client for the onboarding "wow" moment (/api/onboarding/wow).
 *
 * Called once, right after the user connects Gmail. The backend reads how they
 * write and drafts their first replies in their own voice, persisting each as a
 * pending twin action. This is the payload the wow screen renders before dropping
 * the user into Today, where those drafts wait for Send / Edit / Reject.
 */
import { authFetch } from './apiBase';
import type { WhySignal } from './actionsAPI';

/** A freshly-drafted reply — the subset of a pending twin_actions row the endpoint returns. */
export interface WowDraft {
  id: string;
  status: string;
  draft_text: string;
  why_signals: WhySignal[];
  created_at: string;
}

export interface WowPayload {
  /** false only on a hard input error; the endpoint degrades gracefully otherwise. */
  ok: boolean;
  /** One-sentence read of the user's writing voice. Always present (falls back to a generic line). */
  voiceRead: string;
  /** The drafts created, newest thread first. Empty when nothing was replyable. */
  drafts: WowDraft[];
  draftsCreated: number;
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

export const onboardingWowAPI = {
  /**
   * Generate the wow payload. POST because it creates pending drafts as a side
   * effect — call it exactly once per onboarding (the screen dedupes via its
   * react-query key so a remount doesn't re-draft).
   */
  async generate(signal?: AbortSignal): Promise<WowPayload> {
    const res = await authFetch('/onboarding/wow', { method: 'POST', signal });
    return unwrap<WowPayload>(res);
  },
};
