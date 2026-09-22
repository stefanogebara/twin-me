/**
 * The retired twin's pages, and whether they are parked (2026-09-22, audit M1-A, D19).
 *
 * The server parks the twin's routes when LEGACY_TWIN_ENABLED=false (api/middleware/legacyTwin.js).
 * The app parks the twin's pages unless VITE_LEGACY_TWIN_ENABLED=true: the decision is made
 * (D1), production has the server switch set, and a page whose every request would come back
 * 410 should not pretend to load. Someone working on a twin page locally sets the variable.
 *
 * A parked page renders src/pages/Parked.tsx: one line, the way to /money. The Route lines in
 * App.tsx stay until M2-B deletes the pages themselves. Pure, so it can be tested in node.
 */
import { matchPath } from 'react-router-dom';

/** Route patterns, as App.tsx writes them. Everything else is the product or the front door. */
export const LEGACY_TWIN_PAGES: readonly string[] = Object.freeze([
  '/chat', '/discover', '/briefing', '/today',
  '/insights/spotify', '/insights/calendar', '/insights/youtube', '/insights/web', '/insights/discord', '/insights/web-browsing',
  '/soul-signature', '/me', '/you', '/interview', '/story', '/fidelity', '/identity', '/brain', '/memories',
  '/data-exports', '/wiki', '/knowledge', '/goals', '/twin-soul', '/meetings', '/connect-data', '/connections',
  '/onboarding', '/onboarding/connect', '/onboarding/wow', '/memory-explorer', '/settings', '/settings/voice', '/settings/privacy',
  '/welcome', '/soul-reveal', '/s/:userId', '/p/:userId', '/journal', '/inbox', '/departments', '/privacy-spectrum',
  '/talk-to-twin', '/widget', '/memory-health', '/admin/memory-health', '/eval', '/portfolio',
  '/nocturne', '/nocturne/signature', '/nocturne/twin',
  /* The April money stack's insights page reads the retired /api/transactions (M1-E). */
  '/money/insights',
]);

export function legacyTwinEnabled(value: string | undefined = import.meta.env?.VITE_LEGACY_TWIN_ENABLED): boolean {
  return String(value || '').toLowerCase() === 'true';
}

/** Whether this pathname is one of the twin's pages. Pure. */
export function parkedPage(pathname: string, pages: readonly string[] = LEGACY_TWIN_PAGES): boolean {
  return pages.some((pattern) => matchPath({ path: pattern, end: true }, pathname) !== null);
}
