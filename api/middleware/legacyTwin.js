/**
 * The legacy twin behind one switch (audit M2-5, decision D1; prepared 2026-09-20).
 *
 * Measured on 19 September: 34 twin-chat memories by two people in thirty days against
 * 3,214 reflections and 160 insights the crons generated in the same window. The machinery
 * runs for nobody. Parking it is the owner's call; this makes the call one line:
 *
 *   LEGACY_TWIN_ENABLED=false     every scheduled run below answers 200 { skipped } and does
 *                                 no work, and every twin route answers 410 with a sentence
 *                                 and the address of the product.
 *   unset, or anything else       nothing changes.
 *
 * Routes since 2026-09-22 (the 22 September audit, M1-A; decided D19/D20). Parking the crons
 * left 342 write handlers reachable through the service-role client on a product nobody
 * uses. LEGACY_TWIN_ROUTES is every mount in api/server.js whose router none of the staying
 * entry points reach (scripts/ci/staying-roots.txt, walked by scripts/ci/reach.mjs), and
 * tests/goals/legacy-twin-unmounted.goal.test.js holds the two complete against each other:
 * a mount is reachable from what stays, or it is in this list. Thirty days of 410s that
 * nobody missed, and the files behind them are deleted (M2-B).
 */
import { createLogger } from '../services/logger.js';

const log = createLogger('legacy-twin');

/** The scheduled runs that exist only for the twin. Money, presence and housekeeping are not here. */
export const LEGACY_TWIN_CRONS = [
  '/api/cron/ingest-observations', '/api/cron/memory-archive', '/api/cron/soul-signature-regen', '/api/cron/memory-forgetting',
  '/api/cron/email-digest', '/api/cron/prospective-check', '/api/cron/deliver-insights', '/api/cron/morning-briefing',
  '/api/cron/twin-summary-refresh', '/api/cron/nudge-inactive',
];

/**
 * Every API mount that belongs to the retired product: a prefix, matched by path segment, so
 * /api/desktop parks /api/desktop/summary and leaves /api/desktop-download alone. Generated
 * from the reach walk; the goal test regenerates it and fails on any drift.
 */
export const LEGACY_TWIN_ROUTES = Object.freeze([
  '/api/actions', '/api/agent-actions', '/api/ai', '/api/analytics', '/api/api-keys',
  '/api/autonomy', '/api/big-five', '/api/chat', '/api/checkin', '/api/claude-sync',
  '/api/connect', '/api/connectors', '/api/conversations', '/api/correlations',
  '/api/cron/action-reflection', '/api/cron/calendar-optimization', '/api/cron/claude-sync',
  '/api/cron/deliver-insights', '/api/cron/department-execute', '/api/cron/email-digest',
  '/api/cron/evening-recap', '/api/cron/future-simulation', '/api/cron/inbox-intelligence',
  '/api/cron/ingest-observations', '/api/cron/intelligent-triggers', '/api/cron/meeting-debrief',
  '/api/cron/meeting-prep', '/api/cron/memory-archive', '/api/cron/memory-forgetting',
  '/api/cron/morning-briefing', '/api/cron/morning-briefing-email', '/api/cron/nudge-inactive',
  '/api/cron/nudge-retrospective', '/api/cron/outcome-learning', '/api/cron/pattern-learning',
  '/api/cron/prospective-check', '/api/cron/relationships', '/api/cron/soul-signature-regen',
  '/api/cron/twin-self-improvement', '/api/cron/wiki-compile', '/api/dashboard',
  '/api/dashboard/context', '/api/data-sources', '/api/data-verification', '/api/departments',
  '/api/desktop', '/api/device-tokens', '/api/discovery', '/api/documents', '/api/enrichment',
  '/api/entertainment', '/api/eval', '/api/exports', '/api/extraction', '/api/github',
  '/api/goals', '/api/identity', '/api/imports', '/api/inbox', '/api/insights', '/api/instagram',
  '/api/interview', '/api/journal', '/api/life-story', '/api/life-story/voice', '/api/location',
  '/api/mcp', '/api/meeting-briefings', '/api/mem0', '/api/mem0-sync', '/api/memories',
  '/api/memory', '/api/memory-health', '/api/morning-briefing', '/api/nango',
  '/api/nango-webhooks', '/api/notifications', '/api/oauth/spotify', '/api/observations',
  '/api/onboarding', '/api/onboarding/voice', '/api/personality-profile', '/api/platforms',
  '/api/portfolio', '/api/privacy-settings', '/api/queues', '/api/resume', '/api/revelations',
  '/api/sidebar', '/api/skills', '/api/soul', '/api/soul-insights', '/api/soul-signature',
  '/api/spotify', '/api/sse', '/api/task-brief', '/api/telegram', '/api/telegram/webhook',
  '/api/templates', '/api/transactions', '/api/tribe', '/api/twin', '/api/twin-directives',
  '/api/twin-fidelity', '/api/twins', '/api/twins-brain', '/api/user-rules', '/api/voice',
  '/api/voice-bridge', '/api/web-push', '/api/webhooks/vapi', '/api/whatsapp-evolution',
  '/api/whatsapp-zapi', '/api/wiki',
]);

export const PARKED_MESSAGE = 'This part of TwinMe is retired. The product is at /money.';

export function legacyTwinParked(value = process.env.LEGACY_TWIN_ENABLED) {
  return String(value || '').toLowerCase() === 'false';
}

/** Whether a request path falls under a parked mount. Pure; segment-aware. */
export function parkedPath(pathname, routes = LEGACY_TWIN_ROUTES) {
  const p = String(pathname || '').split('?')[0];
  return routes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** Answers a parked cron at once, before its handler's own work. */
export function legacyTwinGate(req, res, next) {
  if (!legacyTwinParked()) return next();
  log.info('legacy twin parked: cron skipped', { path: req.baseUrl || req.path });
  return res.status(200).json({ success: true, skipped: 'legacy twin parked (LEGACY_TWIN_ENABLED=false)' });
}

/**
 * Answers a parked route with 410 Gone before any router sees the request. Installed once,
 * ahead of every /api mount, so no handler has to know it is parked. A 410 is the honest
 * status: the address existed and will not again, and a client should stop asking.
 */
export function legacyTwinRouteGate(req, res, next) {
  /* originalUrl, not path: mounted under app.use('/api', ...) Express strips the mount point
     from req.path, and '/twin/chat' matches nothing in a list of '/api/...' prefixes. */
  const full = String(req.originalUrl || req.url || req.path || '');
  if (!legacyTwinParked() || !parkedPath(full)) return next();
  log.info('legacy twin parked: route refused', { path: full.split('?')[0], method: req.method });
  return res.status(410).json({ success: false, parked: true, error: PARKED_MESSAGE, product: '/money' });
}
