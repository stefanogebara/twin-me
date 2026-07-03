/**
 * GDPR Import Service
 * ===================
 * Parses platform GDPR/data-export archives and ingests them into the memory stream.
 *
 * Supported platforms:
 *   - Spotify         : StreamingHistory*.json
 *   - YouTube         : watch-history.json  (Google Takeout)
 *   - Discord         : messages/ * /messages.json  (inside a ZIP)
 *   - Reddit          : reddit-data-*.json  (nested JSON export)
 *   - WhatsApp        : _chat.txt or ZIP export
 *   - Apple Health    : export.zip / export.xml
 *   - Android Usage   : JSON from UsageStatsModule background sync
 *   - Google Search   : MyActivity.json (Google Takeout)
 *   - Health Connect  : JSON from Android HealthConnectModule (REQUIRES MOBILE REBUILD)
 *   - SMS Patterns    : JSON from Android SmsStatsModule (REQUIRES MOBILE REBUILD)
 *
 * Pipeline:
 *   fileBuffer -> platformParser -> observations[] -> dedup -> addPlatformObservation
 *   -> update user_data_imports row -> optionally trigger reflection
 */

import { addPlatformObservation } from './memoryStreamService.js';
import { shouldTriggerReflection, generateReflections } from './reflectionEngine.js';
import { createLogger } from './logger.js';
// Audit A2-M2a god-file split: the 21 platform parsers live in
// ./gdpr/parsers/*, cross-parser helpers (csv/hash/timezone) in
// ./gdpr/shared.js, and dispatch goes through the registry below.
import { contentHash } from './gdpr/shared.js';
import { PLATFORM_PARSERS } from './gdpr/registry.js';

// Re-exports — every name previously exported from this module must remain
// importable from here (tests/unit/gdprTimezone.test.js and
// tests/unit/whatsappParse.test.js import these helpers directly).
export { getHourInTimeZone, getDayInTimeZone, monthYearInTimeZone } from './gdpr/shared.js';
export { parseWhatsAppLine } from './gdpr/parsers/whatsapp.js';
export { appleDayKey } from './gdpr/parsers/appleHealth.js';

const log = createLogger('GDPRImport');

// ZIP safety guards (safeAdmZip, isSafeZipEntryName) extracted to
// ./gdpr/zipSafety.js (audit M3 god-file split) — which also fixed a
// safeAdmZip() infinite-recursion bug that broke every ZIP-based import.

// Lazy-load supabaseAdmin to avoid circular deps
let _supabase = null;
async function getSupabase() {
  if (!_supabase) {
    const mod = await import('./database.js');
    _supabase = mod.supabaseAdmin;
  }
  return _supabase;
}

// ---------------------------------------------------------------------------
// De-duplication (same logic as observationIngestion.js)
// ---------------------------------------------------------------------------

/** Fetch a user's IANA timezone (public.users.timezone), or null. */
async function getUserTimezone(userId) {
  try {
    const supabase = await getSupabase();
    if (!supabase) return null;
    const { data } = await supabase.from('users').select('timezone').eq('id', userId).maybeSingle();
    return data?.timezone || null;
  } catch {
    return null;
  }
}

async function loadExistingHashes(userId, platform) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('user_memories')
    .select('content, metadata')
    .eq('user_id', userId)
    .eq('memory_type', 'platform_data')
    .filter('metadata->>source', 'eq', platform)
    .limit(5000);

  const hashes = new Set();
  for (const mem of data || []) {
    hashes.add(contentHash(platform, mem.content || ''));
    if (mem.metadata?.import_hash) hashes.add(mem.metadata.import_hash);
  }
  return hashes;
}

// ---------------------------------------------------------------------------
// Shared write helper
// ---------------------------------------------------------------------------

async function writeObservations(userId, platform, observations, importId, existingHashes) {
  let created = 0;
  let skipped = 0;

  for (const content of observations) {
    if (!content || typeof content !== 'string') continue;
    const hash = contentHash(platform, content);
    if (existingHashes.has(hash)) {
      skipped++;
      continue;
    }
    try {
      await addPlatformObservation(userId, content, platform, {
        ingestion_source: 'gdpr_import',
        import_id: importId,
        import_hash: hash,
      });
      existingHashes.add(hash);
      created++;
    } catch (err) {
      // Unique constraint violation = concurrent upload already wrote this hash — treat as skip
      if (err.message?.includes('duplicate key') || err.code === '23505') {
        skipped++;
      } else {
        log.error(`Failed to write observation: ${err.message}`);
      }
    }
  }
  return { created, skipped };
}

// ---------------------------------------------------------------------------
// Import record helpers
// ---------------------------------------------------------------------------

async function createImportRecord(userId, platform, fileName, fileSizeBytes) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('user_data_imports')
    .insert({
      user_id: userId,
      platform,
      status: 'processing',
      file_name: fileName,
      file_size_bytes: fileSizeBytes,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create import record: ${error.message}`);
  return data.id;
}

async function finalizeImportRecord(importId, status, observationsCreated, factsCreated, errorMessage = null) {
  const supabase = await getSupabase();
  await supabase
    .from('user_data_imports')
    .update({
      status,
      observations_created: observationsCreated,
      facts_created: factsCreated,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', importId);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Parse a GDPR data export and ingest into the memory stream.
 *
 * @param {string}  userId     - The user's UUID (public.users.id)
 * @param {string}  platform   - 'spotify' | 'youtube' | 'discord' | 'reddit' | 'android_usage' |
 *                               'google_search' | 'whatsapp' | 'apple_health' |
 *                               'health_connect' | 'sms_patterns' | 'letterboxd' | 'goodreads' |
 *                               'netflix' | 'tiktok' | 'x_archive'
 * @param {Buffer}  fileBuffer - Raw file bytes
 * @param {string}  fileName   - Original file name (for logging / import record)
 * @returns {{ importId, observationsCreated, factsCreated, error? }}
 */
export async function processGdprImport(userId, platform, fileBuffer, fileName) {
  if (!userId) throw new Error('userId required');
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) throw new Error('fileBuffer must be a Buffer');

  const importId = await createImportRecord(userId, platform, fileName, fileBuffer.length);
  let observations = [];
  let observationsCreated = 0;
  const factsCreated = 0;

  try {
    log.info(`Processing ${platform} export for user ${userId} (${fileBuffer.length} bytes)`);

    // User's IANA timezone (public.users.timezone) so time-of-day buckets reflect
    // the user's LOCAL hour, not the Vercel server's UTC hour (audit). Null falls
    // back to server-local inside getHourInTimeZone.
    const userTimezone = await getUserTimezone(userId);

    const entry = PLATFORM_PARSERS[platform];
    if (!entry) {
      // Thrown INSIDE the try so the import record finalizes as 'error' and
      // the caller receives { error } — exactly as the old switch default did.
      throw new Error(`Unsupported platform: ${platform}`);
    }
    observations = entry.needsTimezone
      ? entry.parse(fileBuffer, userTimezone)
      : entry.parse(fileBuffer);

    log.info(`Parsed ${observations.length} observations from ${platform}`);

    const existingHashes = await loadExistingHashes(userId, platform);
    const result = await writeObservations(userId, platform, observations, importId, existingHashes);
    observationsCreated = result.created;

    log.info(`Wrote ${observationsCreated} new observations (${result.skipped} duplicates skipped)`);

    await finalizeImportRecord(importId, 'completed', observationsCreated, factsCreated);

    // Trigger reflection if meaningful data was imported (same threshold as post-onboarding)
    if (observationsCreated > 20) {
      const shouldReflect = await shouldTriggerReflection(userId);
      if (shouldReflect) {
        log.info(`Triggering reflection for user ${userId}`);
        generateReflections(userId).catch((err) =>
          log.error('Reflection error:', err.message)
        );
      }
    }

    return { importId, observationsCreated, factsCreated };

  } catch (err) {
    log.error(`Error processing ${platform} for user ${userId}:`, err.message);
    await finalizeImportRecord(importId, 'error', observationsCreated, factsCreated, err.message);
    return { importId, observationsCreated, factsCreated, error: err.message };
  }
}

/**
 * List import history for a user.
 */
export async function listUserImports(userId) {
  if (!userId) throw new Error('userId required');
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('user_data_imports')
    .select('id, platform, status, observations_created, facts_created, file_name, file_size_bytes, created_at, completed_at, error_message')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
}
