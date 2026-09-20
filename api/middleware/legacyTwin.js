/**
 * The legacy twin's crons behind one switch (audit M2-5, decision D1; prepared 2026-09-20).
 *
 * Measured on 19 September: 34 twin-chat memories by two people in thirty days against
 * 3,214 reflections and 160 insights the crons generated in the same window. The machinery
 * runs for nobody. Parking it is the owner's call; this makes the call one line:
 *
 *   LEGACY_TWIN_ENABLED=false     every scheduled run below answers 200 { skipped } and does
 *                                 no work, and the pages stay reachable at their addresses.
 *   unset, or anything else       nothing changes.
 */
import { createLogger } from '../services/logger.js';

const log = createLogger('legacy-twin');

/** The scheduled runs that exist only for the twin. Money, presence and housekeeping are not here. */
export const LEGACY_TWIN_CRONS = [
  '/api/cron/ingest-observations', '/api/cron/memory-archive', '/api/cron/soul-signature-regen', '/api/cron/memory-forgetting',
  '/api/cron/email-digest', '/api/cron/prospective-check', '/api/cron/deliver-insights', '/api/cron/morning-briefing',
  '/api/cron/twin-summary-refresh', '/api/cron/nudge-inactive',
];

export function legacyTwinParked(value = process.env.LEGACY_TWIN_ENABLED) {
  return String(value || '').toLowerCase() === 'false';
}

/** Answers a parked cron at once, before its handler's own work. */
export function legacyTwinGate(req, res, next) {
  if (!legacyTwinParked()) return next();
  log.info('legacy twin parked: cron skipped', { path: req.baseUrl || req.path });
  return res.status(200).json({ success: true, skipped: 'legacy twin parked (LEGACY_TWIN_ENABLED=false)' });
}
