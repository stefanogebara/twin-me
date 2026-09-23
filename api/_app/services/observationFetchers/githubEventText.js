/**
 * GitHub event -> observation text. Pure, no network, no DB.
 *
 * Written 2026-08-13 after the memory stream turned up `Opened PR in
 * twin-me: ""`. The cause is that /users/{login}/events does not return the
 * PR object the code assumed. Across 38 live PullRequestEvents on the test
 * account, payload.pull_request had exactly five keys:
 *
 *     url, id, number, head, base
 *
 * No `title` — hence the empty quotes on every single PR observation. No
 * `merged` either, and the feed reports merging as its own action rather than
 * closed+merged: {merged: 16, opened: 21, closed: 1}. The old code filtered on
 * ['opened','closed'], so those 16 merges — nearly half the account's PR
 * activity — were silently dropped before anything was written.
 *
 * head.ref IS present and is descriptive ("claude/busy-chebyshev-3aa795"), so
 * that is the fallback rather than dropping the event or quoting nothing. The
 * title path is kept for feeds that do populate it (the webhook payload does,
 * and IssuesEvent carries titles on this same feed).
 */

import { sanitizeExternal } from '../observationUtils.js';

/** Actions worth a memory. Merging arrives as its own action here. */
const REPORTABLE = new Set(['opened', 'closed', 'merged']);

/**
 * @param {string} repo "owner/name"
 * @param {{action?: string, pull_request?: object}} payload event.payload
 * @returns {{key: string, content: string}|null} null when the event is not
 *   worth a memory or the payload is unusable.
 */
export function describePullRequestEvent(repo, payload) {
  if (!repo || typeof repo !== 'string') return null;
  const pr = payload?.pull_request;
  const action = payload?.action;
  if (!pr || typeof pr !== 'object' || !REPORTABLE.has(action)) return null;

  const merged = action === 'merged' || (action === 'closed' && pr.merged === true);
  const verb = merged ? 'Merged' : action === 'opened' ? 'Opened' : 'Closed';

  const number = Number.isFinite(pr.number) ? pr.number : null;
  // The number goes in the text, not just the key: without it every
  // title-less PR in a repo renders identically and the content-hash dedup
  // collapses them into a single memory.
  const ref = number === null ? '' : ` #${number}`;

  const title = sanitizeExternal(pr.title ?? '', 80);
  const branch = sanitizeExternal(pr.head?.ref ?? '', 60);

  const content = title
    ? `${verb} PR${ref} in ${repo}: "${title}"`
    : branch
      ? `${verb} PR${ref} in ${repo} from branch "${branch}"`
      : `${verb} PR${ref} in ${repo}`;

  // Keyed by repo AND number AND action: PR #1 exists in nearly every repo,
  // and opening then merging one PR is two events worth remembering.
  return { key: `${repo}#${number ?? pr.id ?? 'x'}:${action}`, content };
}

export { REPORTABLE as REPORTABLE_PR_ACTIONS };
