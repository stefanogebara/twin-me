/**
 * Ingestion pipeline for a parsed export:
 *   1. Upsert into platform_exports (aggregates JSON + observation_count).
 *   2. Insert each natural-language observation as a platform_data memory
 *      so reflection / wiki compilation pick it up automatically.
 *
 * Memory writes use memoryStreamService so embeddings + importance ratings
 * are generated consistently with the rest of the memory pipeline.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import { addPlatformObservation } from '../memoryStreamService.js';

const log = createLogger('IngestExport');

/**
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.platform                 e.g. 'discord_export'
 * @param {string|undefined} args.sourceFilename
 * @param {number|undefined} args.sourceSizeBytes
 * @param {{ aggregates: object, observations: string[] }} args.parsed
 */
export async function ingestParsedExport({ userId, platform, sourceFilename, sourceSizeBytes, parsed }) {
  const { aggregates, observations } = parsed;

  const { error: upsertError } = await supabaseAdmin
    .from('platform_exports')
    .upsert(
      {
        user_id: userId,
        platform,
        status: 'parsed',
        uploaded_at: new Date().toISOString(),
        parsed_at: new Date().toISOString(),
        source_filename: sourceFilename ?? null,
        source_size_bytes: sourceSizeBytes ?? null,
        aggregates,
        observation_count: observations.length,
        error_message: null,
      },
      { onConflict: 'user_id,platform' }
    );

  if (upsertError) {
    log.error('platform_exports upsert failed', { error: upsertError.message });
    throw new Error(`platform_exports upsert failed: ${upsertError.message}`);
  }

  // Memory writes are best-effort — a single failed embedding shouldn't
  // bring down the whole upload. We log and continue.
  let stored = 0;
  for (const obs of observations) {
    try {
      await addPlatformObservation(userId, obs, platform, {
        ingested_at: new Date().toISOString(),
      });
      stored += 1;
    } catch (err) {
      log.warn('addPlatformObservation failed for export observation', {
        platform,
        error: err?.message ?? String(err),
      });
    }
  }

  log.info('Ingested export', { platform, observationsStored: stored, observationsTotal: observations.length });
  return { ok: true, observationsStored: stored };
}

export async function markExportFailed({ userId, platform, sourceFilename, sourceSizeBytes, errorMessage }) {
  await supabaseAdmin.from('platform_exports').upsert(
    {
      user_id: userId,
      platform,
      status: 'failed',
      uploaded_at: new Date().toISOString(),
      source_filename: sourceFilename ?? null,
      source_size_bytes: sourceSizeBytes ?? null,
      aggregates: {},
      observation_count: 0,
      error_message: errorMessage ?? 'parser_failed',
    },
    { onConflict: 'user_id,platform' }
  );
}

export async function getExportAggregates(userId, platform) {
  const { data, error } = await supabaseAdmin
    .from('platform_exports')
    .select('aggregates, parsed_at, observation_count, status')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('status', 'parsed')
    .maybeSingle();
  if (error || !data) return null;
  return data;
}
