/**
 * GDPR data-export upload endpoint.
 *
 * Single endpoint: POST /api/exports/upload
 *   - Accepts a zip via multipart/form-data ('file' field).
 *   - Optional ?platform=discord_export|linkedin_export|instagram_export. If
 *     omitted, autoDetect runs through registered parsers in declared order.
 *   - 100 MB upload cap. Reads into memory (multer memoryStorage) —
 *     Discord/LinkedIn comfortably fit; very large Instagram exports with
 *     media may not, but media gets filtered out by the parser anyway.
 *   - Parses inline, upserts platform_exports, writes natural-language
 *     observations to user_memories. Total wall time should stay well under
 *     Vercel's 60s function cap for typical exports.
 *
 * Privacy contract: the raw zip is parsed in memory and DISCARDED on
 * response. Only the aggregates JSON + observation strings cross the
 * database boundary.
 *
 * Also exposes:
 *   GET    /api/exports                 -> list the user's parsed exports
 *   DELETE /api/exports/:platform       -> drop an export + its observations
 */

import express from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { authenticateUser } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';
import { supabaseAdmin } from '../services/database.js';
import {
  getParser,
  autoDetectPlatform,
  EXPORT_PLATFORMS,
} from '../services/exports/registry.js';
import {
  ingestParsedExport,
  markExportFailed,
} from '../services/exports/ingestExport.js';

const log = createLogger('ExportsUpload');
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    // Browsers report a few different mime types for .zip — accept the
    // common ones plus the universal octet-stream fallback.
    const ok = [
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
      'multipart/x-zip',
    ];
    if (ok.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are accepted'));
    }
  },
});

router.post('/upload', authenticateUser, upload.single('file'), async (req, res) => {
  const userId = req.user.id;
  const sourceFilename = req.file?.originalname ?? null;
  const sourceSizeBytes = req.file?.size ?? null;
  let requestedPlatform = (req.query.platform ?? req.body.platform ?? null) || null;

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded (field name: file)' });
  }

  if (requestedPlatform && !EXPORT_PLATFORMS.includes(requestedPlatform)) {
    return res.status(400).json({
      success: false,
      error: `Unknown platform. Allowed: ${EXPORT_PLATFORMS.join(', ')}`,
    });
  }

  let zip;
  try {
    zip = new AdmZip(req.file.buffer);
    // Touch the entries to surface malformed-zip errors early.
    zip.getEntries();
  } catch (err) {
    log.warn('Zip parse failed', { error: err?.message ?? String(err), userId });
    return res.status(400).json({ success: false, error: 'File is not a valid zip archive' });
  }

  let platform = requestedPlatform;
  if (!platform) {
    platform = await autoDetectPlatform(zip);
    if (!platform) {
      return res.status(400).json({
        success: false,
        error:
          'Could not detect platform from zip contents. Pass ?platform=discord_export|linkedin_export|instagram_export to override.',
      });
    }
    log.info('Auto-detected platform', { platform, userId });
  }

  const parser = getParser(platform);
  if (!parser) {
    return res.status(400).json({ success: false, error: `No parser registered for ${platform}` });
  }

  try {
    const parsed = await parser.parse(zip);
    const result = await ingestParsedExport({
      userId,
      platform,
      sourceFilename,
      sourceSizeBytes,
      parsed,
    });
    return res.json({
      success: true,
      platform,
      observations_stored: result.observationsStored,
      aggregates: parsed.aggregates,
    });
  } catch (err) {
    log.error('Parse/ingest failed', { platform, userId, error: err?.message ?? String(err) });
    try {
      await markExportFailed({
        userId,
        platform,
        sourceFilename,
        sourceSizeBytes,
        errorMessage: err?.message ?? String(err),
      });
    } catch (recordErr) {
      log.warn('markExportFailed also failed', { error: recordErr?.message });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to parse export',
      ...(process.env.NODE_ENV !== 'production' && { details: err?.message }),
    });
  }
});

router.get('/', authenticateUser, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('platform_exports')
    .select('platform, status, uploaded_at, parsed_at, observation_count, source_filename, error_message')
    .eq('user_id', req.user.id)
    .order('uploaded_at', { ascending: false });
  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.json({ success: true, exports: data ?? [] });
});

router.delete('/:platform', authenticateUser, async (req, res) => {
  const { platform } = req.params;
  if (!EXPORT_PLATFORMS.includes(platform)) {
    return res.status(400).json({ success: false, error: 'Unknown platform' });
  }
  const userId = req.user.id;
  const { error: delError } = await supabaseAdmin
    .from('platform_exports')
    .delete()
    .eq('user_id', userId)
    .eq('platform', platform);
  if (delError) {
    return res.status(500).json({ success: false, error: delError.message });
  }
  // Also remove the derived observations.
  const { error: memError } = await supabaseAdmin
    .from('user_memories')
    .delete()
    .eq('user_id', userId)
    .eq('memory_type', 'platform_data')
    .eq('metadata->>source', platform);
  if (memError) {
    log.warn('memory cleanup failed (export row removed regardless)', { error: memError.message });
  }
  return res.json({ success: true });
});

export default router;
