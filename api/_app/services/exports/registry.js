/**
 * Parser registry for GDPR data-export uploads.
 *
 * Each parser exports two functions:
 *   - detect(zip)  -> Promise<boolean>   true if this zip looks like the
 *                                        platform's export (cheap signal
 *                                        check, no full parse).
 *   - parse(zip)   -> Promise<{
 *                       aggregates,        platform-shaped JSON for the
 *                                          chat dispatcher to read
 *                       observations[],    natural-language strings to
 *                                          insert into user_memories as
 *                                          platform_data observations
 *                     }>
 *
 * The registry order matters for auto-detection: we try detectors in the
 * declared order and take the first match. Discord/LinkedIn/Instagram
 * exports have distinctive top-level files so collisions are unlikely.
 */

import { parseDiscordExport, detectDiscordExport } from './parsers/discord.js';
import { parseLinkedInExport, detectLinkedInExport } from './parsers/linkedin.js';
import { parseInstagramExport, detectInstagramExport } from './parsers/instagram.js';

export const EXPORT_PLATFORMS = ['discord_export', 'linkedin_export', 'instagram_export'];

const REGISTRY = {
  discord_export: { detect: detectDiscordExport, parse: parseDiscordExport },
  linkedin_export: { detect: detectLinkedInExport, parse: parseLinkedInExport },
  instagram_export: { detect: detectInstagramExport, parse: parseInstagramExport },
};

export function getParser(platform) {
  return REGISTRY[platform] ?? null;
}

/**
 * Try each detector in registry order, return the first matching platform.
 * Returns null if no parser claims the zip.
 *
 * @param {import('adm-zip')} zip
 * @returns {Promise<string|null>}
 */
export async function autoDetectPlatform(zip) {
  for (const platform of EXPORT_PLATFORMS) {
    const { detect } = REGISTRY[platform];
    try {
      const match = await detect(zip);
      if (match) return platform;
    } catch {
      // Detector failures are swallowed — we move on to the next one.
    }
  }
  return null;
}
