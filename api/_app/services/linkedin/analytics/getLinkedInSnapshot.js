/**
 * Build a LinkedIn activity snapshot for the chat dispatcher.
 *
 * Two data sources, merged:
 *   - user_platform_data: cached OAuth profile (headline, name,
 *     industry, locale). LinkedIn's OpenID userinfo gives almost
 *     nothing past these basics — the live API was gutted years ago.
 *   - user_platform_data (platform='linkedin' data_type='extension_*'):
 *     extension-sourced events from the live collector — page_dwell,
 *     profile_view, search_query, reaction_click, connect_click.
 *
 * Returns null if there's nothing on either side.
 */

import { supabaseAdmin } from '../../database.js';
import { createLogger } from '../../logger.js';

const log = createLogger('LinkedInSnapshot');

const RECENT_DAYS = 14;
const MEMORY_LIMIT = 400;

export async function getLinkedInSnapshot(userId) {
  if (!userId) return null;

  const [profilePart, extensionPart] = await Promise.all([
    loadOAuthProfile(userId),
    loadExtensionDerivedData(userId),
  ]);

  const hasProfile = profilePart && (profilePart.headline || profilePart.name);
  const hasExtension = extensionPart && (
    extensionPart.totals.feed_dwell_seconds +
      extensionPart.totals.profile_views +
      extensionPart.totals.searches +
      extensionPart.totals.reactions +
      extensionPart.totals.connect_clicks
  ) > 0;
  if (!hasProfile && !hasExtension) return null;

  return {
    profile: profilePart,
    extension: extensionPart,
    window_days: RECENT_DAYS,
  };
}

async function loadOAuthProfile(userId) {
  try {
    const { data: row } = await supabaseAdmin
      .from('user_platform_data')
      .select('raw_data, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'linkedin')
      .eq('data_type', 'profile')
      .order('extracted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row?.raw_data) return null;
    const p = row.raw_data;
    return {
      name: p.name ?? null,
      headline: p.headline ?? null,
      industry: p.industry ?? null,
      locale: p.locale ?? null,
      connection_count: typeof p.connections === 'number' ? p.connections : null,
      last_synced_at: row.extracted_at ?? null,
    };
  } catch (err) {
    log.warn('loadOAuthProfile failed', { error: err?.message ?? String(err) });
    return null;
  }
}

async function loadExtensionDerivedData(userId) {
  try {
    const sinceIso = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from('user_platform_data')
      .select('data_type, raw_data, extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'linkedin')
      .gte('extracted_at', sinceIso)
      .order('extracted_at', { ascending: false })
      .limit(MEMORY_LIMIT);

    const empty = {
      totals: {
        feed_dwell_seconds: 0,
        profile_dwell_seconds: 0,
        profile_views: 0,
        searches: 0,
        reactions: 0,
        connect_clicks: 0,
        share_clicks: 0,
      },
      top_searches: [],
      reaction_breakdown: {},
    };
    if (!rows || rows.length === 0) return empty;

    let feedDwell = 0;
    let profileDwell = 0;
    let profileViews = 0;
    let reactions = 0;
    let connects = 0;
    let shares = 0;
    const searchCounts = {};
    const reactionCounts = {};

    for (const r of rows) {
      const inner = r.raw_data?.data ?? r.raw_data ?? {};
      const eventType = inner.type ?? r.raw_data?.eventType ?? null;

      if (eventType === 'page_dwell') {
        const sec = Number(inner.duration_seconds) || 0;
        if (inner.kind === 'feed') feedDwell += sec;
        else if (inner.kind === 'profile') profileDwell += sec;
      } else if (eventType === 'profile_view') {
        profileViews += 1;
      } else if (eventType === 'search_query') {
        reactions; // (no-op marker)
        const q = String(inner.query ?? '').trim().toLowerCase();
        if (q) searchCounts[q] = (searchCounts[q] ?? 0) + 1;
      } else if (eventType === 'reaction_click') {
        reactions += 1;
        const rxn = String(inner.reaction ?? 'like').toLowerCase();
        reactionCounts[rxn] = (reactionCounts[rxn] ?? 0) + 1;
      } else if (eventType === 'connect_click') {
        connects += 1;
      } else if (eventType === 'share_click') {
        shares += 1;
      }
    }

    const topSearches = Object.entries(searchCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([query, count]) => ({ query, count }));

    return {
      totals: {
        feed_dwell_seconds: feedDwell,
        profile_dwell_seconds: profileDwell,
        profile_views: profileViews,
        searches: Object.values(searchCounts).reduce((s, n) => s + n, 0),
        reactions,
        connect_clicks: connects,
        share_clicks: shares,
      },
      top_searches: topSearches,
      reaction_breakdown: reactionCounts,
    };
  } catch (err) {
    log.warn('loadExtensionDerivedData failed', { error: err?.message ?? String(err) });
    return null;
  }
}
