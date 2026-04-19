/**
 * GDPR / Data Export Import Routes
 *
 * POST /api/imports/upload-url — get a presigned URL for direct-to-Supabase upload
 * POST /api/imports/process    — process a file already uploaded to Supabase Storage
 * GET  /api/imports            — list past imports for the authenticated user
 *
 * Why presigned upload instead of multer:
 *   Vercel serverless functions cap request bodies at 4.5 MB. GDPR exports can be
 *   50-100 MB. The frontend uploads directly to Supabase Storage via a signed URL
 *   (bypassing Vercel entirely), then calls /process to ingest the data.
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';
import { processGdprImport, listUserImports } from '../services/gdprImportService.js';
import { ingestChatHistory } from '../services/chatHistory/chatHistoryIngestion.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('Imports');

const router = Router();

// Platforms handled by the existing GDPR import pipeline
const SUPPORTED_PLATFORMS = new Set([
  'spotify', 'youtube', 'discord', 'reddit', 'android_usage',
  'whoop', 'apple_health', 'google_search', 'whatsapp', 'android_health',
  // CSV/export-only platforms with no live API (April 2026)
  'letterboxd', 'goodreads',
  // GDPR-export-only platforms (no live API in April 2026 or too restricted)
  'netflix', 'tiktok', 'x_archive',
]);

// Chat history platforms — handled by the new chatHistoryIngestion pipeline
const CHAT_PLATFORMS = new Set(['whatsapp_chat', 'telegram_chat']);

// Relationship contexts that label how memories are stored
const VALID_CHAT_CONTEXTS = new Set(['close_friend', 'family', 'professional', 'romantic_partner']);

// ---------------------------------------------------------------------------
// POST /api/imports/upload-url
// Returns a short-lived signed upload URL so the frontend can PUT the file
// directly to Supabase Storage without routing through Vercel.
// ---------------------------------------------------------------------------

router.post('/upload-url', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, fileName } = req.body;

    const allPlatforms = new Set([...SUPPORTED_PLATFORMS, ...CHAT_PLATFORMS]);
    if (!platform || !allPlatforms.has(platform)) {
      return res.status(400).json({
        success: false,
        error: `platform must be one of: ${[...allPlatforms].join(', ')}`,
      });
    }
    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ success: false, error: 'fileName is required' });
    }

    // Sanitise filename — strip path traversal characters
    const safeName = fileName.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 200);
    const storagePath = `${userId}/${Date.now()}-${safeName}`;

    const { data, error } = await supabaseAdmin.storage
      .from('gdpr-imports')
      .createSignedUploadUrl(storagePath);

    if (error) {
      log.error('Failed to create signed URL:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to generate upload URL' });
    }

    return res.json({
      success: true,
      uploadUrl: data.signedUrl,
      storagePath,
    });

  } catch (err) {
    log.error('upload-url error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to generate upload URL' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/imports/process
// Downloads a file from Supabase Storage, runs the parser, deletes the file.
// ---------------------------------------------------------------------------

router.post('/process', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, storagePath, fileName } = req.body;

    if (!platform || !SUPPORTED_PLATFORMS.has(platform)) {
      return res.status(400).json({
        success: false,
        error: `platform must be one of: ${[...SUPPORTED_PLATFORMS].join(', ')}`,
      });
    }
    if (!storagePath || !storagePath.startsWith(`${userId}/`)) {
      // Ensure the user can only process their own files
      return res.status(400).json({ success: false, error: 'Invalid storagePath' });
    }

    log.info(`Processing: user=${userId} platform=${platform} path=${storagePath}`);

    // Download from Storage
    const { data: blob, error: dlError } = await supabaseAdmin.storage
      .from('gdpr-imports')
      .download(storagePath);

    if (dlError || !blob) {
      log.error('Download failed:', dlError?.message);
      return res.status(404).json({ success: false, error: 'File not found in storage' });
    }

    const buffer = Buffer.from(await blob.arrayBuffer());

    // Process
    const result = await processGdprImport(userId, platform, buffer, fileName || storagePath.split('/').pop());

    // Clean up — best-effort, don't fail the request if delete errors
    supabaseAdmin.storage.from('gdpr-imports').remove([storagePath]).catch((e) => {
      log.warn('Storage cleanup failed:', e.message);
    });

    if (result.error) {
      return res.status(422).json({
        success: false,
        importId: result.importId,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      importId: result.importId,
      observationsCreated: result.observationsCreated,
      factsCreated: result.factsCreated,
    });

  } catch (err) {
    log.error('process error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to process import',
      ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/imports/process-chat
// Chat history import (WhatsApp / Telegram) — uses chatHistoryIngestion pipeline.
// Accepts same upload flow (presigned URL → Supabase Storage → process-chat).
// Extra body fields:
//   ownerName  — WhatsApp: your display name (inferred if omitted)
//   myName     — Telegram: your display name as shown in the export
//   myId       — Telegram: your numeric user ID
//   chatName   — Optional label override for the chat
// ---------------------------------------------------------------------------

router.post('/process-chat', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, storagePath, ownerName, myName, myId, chatName, chatContext } = req.body;

    if (!platform || !CHAT_PLATFORMS.has(platform)) {
      return res.status(400).json({
        success: false,
        error: `platform must be one of: ${[...CHAT_PLATFORMS].join(', ')}`,
      });
    }
    if (!storagePath || !storagePath.startsWith(`${userId}/`)) {
      return res.status(400).json({ success: false, error: 'Invalid storagePath' });
    }
    if (chatContext !== undefined && !VALID_CHAT_CONTEXTS.has(chatContext)) {
      return res.status(400).json({
        success: false,
        error: `chatContext must be one of: ${[...VALID_CHAT_CONTEXTS].join(', ')}`,
      });
    }

    // Telegram requires identity info
    if (platform === 'telegram_chat' && !myName && !myId) {
      return res.status(400).json({
        success: false,
        error: 'Telegram import requires myName (your display name) or myId (your Telegram user ID)',
      });
    }

    log.info(`Chat import: user=${userId} platform=${platform} context=${chatContext ?? 'none'}`);

    // Download from Storage
    const { data: blob, error: dlError } = await supabaseAdmin.storage
      .from('gdpr-imports')
      .download(storagePath);

    if (dlError || !blob) {
      log.error('Download failed:', dlError?.message);
      return res.status(404).json({ success: false, error: 'File not found in storage' });
    }

    const buffer = Buffer.from(await blob.arrayBuffer());

    // Ingest — 55s timeout guard (Vercel maxDuration is 60s)
    const INGEST_TIMEOUT_MS = 55_000;
    const result = await Promise.race([
      ingestChatHistory(userId, buffer, platform, { ownerName, myName, myId, chatName, chatContext }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Processing timed out — try a smaller chat export (fewer messages).')), INGEST_TIMEOUT_MS)
      ),
    ]);

    // Clean up storage
    supabaseAdmin.storage.from('gdpr-imports').remove([storagePath]).catch((e) => {
      log.warn('Storage cleanup failed:', e.message);
    });

    return res.json({
      success: true,
      ...result,
    });

  } catch (err) {
    log.error('process-chat error:', err.message);
    const safeMsg = err.message?.includes('timed out') || err.message?.includes('too large')
      ? err.message
      : 'Failed to process chat import';
    return res.status(422).json({
      success: false,
      error: safeMsg,
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/imports
// ---------------------------------------------------------------------------

router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const imports = await listUserImports(userId);
    return res.json({ success: true, data: imports });
  } catch (err) {
    log.error('List error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to list imports' });
  }
});

export default router;
