/**
 * Inngest Function: New-User Profile Enrichment
 * =============================================
 * Enrichment used to be fired detached from the auth routes:
 *
 *   profileEnrichmentService.enrichFromEmail(...).then(save).catch(log)
 *   res.redirect(appUrl)
 *
 * On Vercel that is a never-runs — the invocation freezes the moment the
 * response flushes (same root cause as the 2026-08-24 magic-link outage), so
 * no new user has been getting an enriched profile, which is precisely what
 * the onboarding "instant wow" screen reads.
 *
 * It cannot simply be awaited either: enrichFromEmail fans out to Gravatar,
 * GitHub, Brave/Gemini, PDL and an LLM narrative pass — tens of seconds, in
 * the middle of an OAuth redirect. So the routes enqueue this event (one
 * awaited HTTP POST) and the work happens durably here, where it survives
 * cold starts and gets a retry.
 *
 * Cost: one enrichment per account, once. External API spend is bounded by
 * the per-user concurrency key plus retries: 1.
 */

import { inngest, EVENTS } from '../../services/inngestClient.js';
import { profileEnrichmentService } from '../../services/profileEnrichmentService.js';
import { createLogger } from '../../services/logger.js';

const log = createLogger('ProfileEnrichmentFn');

/**
 * Enrich a profile and persist it. Exported separately from the Inngest
 * wrapper so the unwrapping contract is directly testable.
 *
 * enrichFromEmail resolves the ENVELOPE `{ success, data }`. The old detached
 * call sites passed that envelope straight into saveEnrichment, which reads
 * `discovered_*` fields off its argument — so un-freezing the call without
 * unwrapping would have upserted an all-null enriched_profiles row with
 * source 'unknown', and onboarding would have rendered it as a real result.
 *
 * @param {{ userId: string, email: string, fullName?: string|null }} params
 * @returns {Promise<{ userId: string, enriched: boolean, reason?: string, source?: string }>}
 */
export async function enrichAndSaveProfile({ userId, email, fullName = null }) {
  if (!userId || !email) {
    return { userId, enriched: false, reason: 'missing_user' };
  }

  const result = await profileEnrichmentService.enrichFromEmail(email, fullName);
  const data = result?.data;
  if (!data) {
    log.warn('Enrichment returned no data', { userId });
    return { userId, enriched: false, reason: 'no_data' };
  }

  await profileEnrichmentService.saveEnrichment(userId, email, data);
  return { userId, enriched: true, source: data.source || 'unknown' };
}

export const profileEnrichmentFunction = inngest.createFunction(
  {
    id: 'profile-enrichment',
    name: 'New-User Profile Enrichment',
    // One retry: enrichment spends real money at PDL/Brave, and a permanently
    // missing profile is recoverable by hand from /api/enrichment/search.
    retries: 1,
    // Global limit 5 is the Inngest PLAN CAP — exceeding it on ANY function
    // rejects the whole app sync and silently unregisters everything (live
    // 2026-06-20 -> 2026-07-13). 3 leaves headroom for the other functions'
    // share of the same plan. 1-per-user prevents a double-enqueue from
    // paying the external APIs twice concurrently.
    concurrency: [{ limit: 3 }, { limit: 1, key: 'event.data.userId' }],
  },
  { event: EVENTS.ENRICH_PROFILE },
  async ({ event, step }) => {
    const { userId, email, fullName } = event.data || {};
    if (!userId || !email) return { skipped: true, reason: 'missing_user' };

    return step.run('enrich-and-save', () =>
      enrichAndSaveProfile({ userId, email, fullName })
    );
  }
);
