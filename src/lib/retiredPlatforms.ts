/**
 * Retired platforms (replan-2026-06-10 Track C portfolio cut).
 *
 * These OAuth / live-fetch stacks were removed: existing platform_connections
 * rows stay in the DB but are no longer polled or rendered as connect
 * affordances anywhere in the UI. Historical memories keep rendering via the
 * pure display-name/logo maps (platformNames.ts, PlatformLogos.tsx), which
 * intentionally retain entries for these platforms.
 *
 * GDPR-export upload paths (DataUploadPanel / DataExportsPage) are NOT
 * affected — only live OAuth connect/sync dies.
 */
export const RETIRED_PLATFORMS: ReadonlySet<string> = new Set([
  'strava',
  'oura',
  'fitbit',
  'garmin',
  'notion',
  'pinterest',
  'soundcloud',
  'slack',
  'steam',
  'tiktok',
  'apple_music',
  'google_drive',
  'reddit',
  'linkedin',
  'twitch',
]);

export function isRetiredPlatform(platform: string): boolean {
  return RETIRED_PLATFORMS.has(platform);
}
