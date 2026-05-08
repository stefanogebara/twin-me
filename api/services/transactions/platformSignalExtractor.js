/**
 * Platform Signal Extractor — writes per-event timestamped rows to user_platform_data
 * so the transaction emotion tagger can join them against purchase timestamps.
 *
 * GitHub  → each event row: { type, created_at, repo, commit_count }
 * Gmail   → each message row: { timestamp (ISO), label, thread_id }
 *
 * Called after statement upload (so re-tagging has the signals) and on-demand
 * via POST /api/transactions/sync-signals.
 */

import axios from 'axios';
import { supabaseAdmin } from '../database.js';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';

const log = createLogger('platform-signal-extractor');

/* ─────────────────────────────────────────────── helpers ── */

async function upsertSignalRows(rows) {
  if (!rows.length) return;
  const { error } = await supabaseAdmin
    .from('user_platform_data')
    .upsert(rows, { onConflict: 'user_id,platform,data_type,source_url', ignoreDuplicates: true });
  if (error) log.warn(`upsert signal rows failed: ${error.message}`);
}

/* ─────────────────────────────────────────────── GitHub ── */

export async function syncGithubSignals(userId) {
  const tokenResult = await getValidAccessToken(userId, 'github');
  if (!tokenResult.success || !tokenResult.accessToken) {
    log.info(`GitHub: no valid token for user ${userId}`);
    return 0;
  }

  const headers = {
    Authorization: `token ${tokenResult.accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'TwinMe/1.0',
  };

  // Resolve username from platform_connections
  let username = null;
  const { data: conn } = await supabaseAdmin
    .from('platform_connections')
    .select('platform_user_id, metadata')
    .eq('user_id', userId)
    .eq('platform', 'github')
    .single();
  username = conn?.platform_user_id || conn?.metadata?.login || conn?.metadata?.username || null;

  if (!username) {
    try {
      const r = await axios.get('https://api.github.com/user', { headers, timeout: 10000 });
      username = r.data?.login || null;
    } catch { /* non-fatal */ }
  }

  if (!username) {
    log.info(`GitHub: could not resolve username for user ${userId}`);
    return 0;
  }

  let events = [];
  try {
    const r = await axios.get(
      `https://api.github.com/users/${username}/events?per_page=100`,
      { headers, timeout: 10000 }
    );
    events = r.data || [];
  } catch (err) {
    log.warn(`GitHub events fetch failed: ${err.message}`);
    return 0;
  }

  const now = new Date().toISOString();
  const rows = events
    .filter(e => e.id && e.created_at)
    .map(e => ({
      user_id: userId,
      platform: 'github',
      data_type: 'event',
      source_url: `https://api.github.com/events/${e.id}`,
      raw_data: {
        event_id: e.id,
        type: e.type,
        created_at: e.created_at,
        repo: e.repo?.name?.replace(/^[^/]+\//, '') || null,
        commit_count: e.type === 'PushEvent' ? (e.payload?.commits?.length || 0) : null,
      },
      extracted_at: now,
      processed: false,
    }));

  await upsertSignalRows(rows);
  log.info(`GitHub signals: stored ${rows.length} event rows for user ${userId}`);
  return rows.length;
}

/* ─────────────────────────────────────────────── Gmail ── */

export async function syncGmailSignals(userId) {
  const tokenResult = await getValidAccessToken(userId, 'google_gmail');
  if (!tokenResult.success || !tokenResult.accessToken) {
    log.info(`Gmail: no valid token for user ${userId}`);
    return 0;
  }

  const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };
  const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

  // Fetch last 100 inbox messages (IDs only)
  let messageIds = [];
  try {
    const r = await axios.get(
      `${BASE}/messages?labelIds=INBOX&maxResults=100&q=newer_than:45d`,
      { headers, timeout: 10000 }
    );
    messageIds = (r.data?.messages || []).map(m => m.id);
  } catch (err) {
    log.warn(`Gmail message list failed: ${err.message}`);
    return 0;
  }

  if (!messageIds.length) return 0;

  // Fetch internalDate for each message in parallel batches of 20
  const rows = [];
  const now = new Date().toISOString();

  for (let i = 0; i < messageIds.length; i += 20) {
    const batch = messageIds.slice(i, i + 20);
    const results = await Promise.allSettled(
      batch.map(id =>
        axios.get(`${BASE}/messages/${id}?format=metadata&metadataHeaders=Date&metadataHeaders=From`, {
          headers,
          timeout: 8000,
        })
      )
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const msg = result.value.data;
      if (!msg?.id || !msg?.internalDate) continue;

      // internalDate is Unix ms timestamp
      const timestamp = new Date(parseInt(msg.internalDate, 10)).toISOString();
      const labelIds = msg.labelIds || [];
      const label = labelIds.includes('SENT') ? 'SENT' : labelIds.includes('INBOX') ? 'INBOX' : 'OTHER';

      rows.push({
        user_id: userId,
        platform: 'google_gmail',
        data_type: 'message',
        source_url: `https://gmail.googleapis.com/message/${msg.id}`,
        raw_data: {
          message_id: msg.id,
          thread_id: msg.threadId,
          timestamp,   // picked up by getEffectiveEventTime via d.timestamp
          label,
        },
        extracted_at: now,
        processed: false,
      });
    }
  }

  await upsertSignalRows(rows);
  log.info(`Gmail signals: stored ${rows.length} message rows for user ${userId}`);
  return rows.length;
}

/* ─────────────────────────────────────────────── orchestrator ── */

export async function syncAllSignals(userId) {
  const [github, gmail] = await Promise.allSettled([
    syncGithubSignals(userId),
    syncGmailSignals(userId),
  ]);

  return {
    github: github.status === 'fulfilled' ? github.value : 0,
    gmail:  gmail.status  === 'fulfilled' ? gmail.value  : 0,
  };
}
