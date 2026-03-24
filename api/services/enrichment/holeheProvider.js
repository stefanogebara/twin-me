/**
 * Holehe platform presence discovery
 * Email -> which platforms is this person registered on?
 * Free, runs locally via Python subprocess.
 *
 * Requires: python3 -m holehe (installed via pip)
 * Gracefully returns [] if Python or holehe is unavailable.
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../logger.js';

const execAsync = promisify(exec);
const log = createLogger('HoleheProvider');
const TIMEOUT_MS = 30000;

/**
 * Discover which platforms an email is registered on.
 *
 * @param {string} email
 * @returns {Promise<string[]>} Array of platform names (lowercase)
 */
export async function discoverPlatforms(email) {
  if (!email) return [];

  try {
    // Run holehe: --only-used shows only platforms where email exists
    // --no-color strips ANSI codes for clean parsing
    // Try holehe CLI first (pip install puts it on PATH), fallback to python -m
    const safeEmail = email.replace(/[^a-zA-Z0-9@._+-]/g, '');
    let stdout;
    try {
      ({ stdout } = await execAsync(`holehe ${safeEmail} --only-used --no-color`, { timeout: TIMEOUT_MS }));
    } catch {
      ({ stdout } = await execAsync(`python -m holehe ${safeEmail} --only-used --no-color`, { timeout: TIMEOUT_MS }));
    }

    // Parse text output — holehe marks found platforms with "[+]"
    // Format: "[+] platform: exists" or "[+] platform.com"
    const platforms = [];
    for (const line of stdout.split('\n')) {
      const match = line.match(/\[\+\]\s+([\w.]+)/);
      if (match) {
        // Normalize: "amazon.com" → "amazon", "en.gravatar.com" → "gravatar"
        const raw = match[1].toLowerCase().replace(/\.com$/, '').replace(/^en\./, '');
        if (raw && raw !== 'email') platforms.push(raw);
      }
    }

    log.info('Holehe discovered platforms', {
      email: email.substring(0, 3) + '***',
      count: platforms.length,
      platforms,
    });

    return platforms;
  } catch (err) {
    // Graceful degradation: python3 not installed, holehe not installed, or timeout
    log.warn('Holehe discovery failed', { error: err.message });
    return [];
  }
}
