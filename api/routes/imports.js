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

const router = Router();

const SUPPORTED_PLATFORMS = new Set(['spotify', 'youtube', 'discord', 'reddit', 'android_usage', 'whoop']);

// ---------------------------------------------------------------------------
// POST /api/imports/upload-url
// Returns a short-lived signed upload URL so the frontend can PUT the file
// directly to Supabase Storage without routing through Vercel.
// ---------------------------------------------------------------------------

router.post('/upload-url', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, fileName } = req.body;

    if (!platform || !SUPPORTED_PLATFORMS.has(platform)) {
      return res.status(400).json({
        success: false,
        error: `platform must be one of: ${[...SUPPORTED_PLATFORMS].join(', ')}`,
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
      console.error('[ImportsRoute] Failed to create signed URL:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to generate upload URL' });
    }

    return res.json({
      success: true,
      uploadUrl: data.signedUrl,
      storagePath,
    });

  } catch (err) {
    console.error('[ImportsRoute] upload-url error:', err.message);
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

    console.log(`[ImportsRoute] Processing: user=${userId} platform=${platform} path=${storagePath}`);

    // Download from Storage
    const { data: blob, error: dlError } = await supabaseAdmin.storage
      .from('gdpr-imports')
      .download(storagePath);

    if (dlError || !blob) {
      console.error('[ImportsRoute] Download failed:', dlError?.message);
      return res.status(404).json({ success: false, error: 'File not found in storage' });
    }

    const buffer = Buffer.from(await blob.arrayBuffer());

    // Process
    const result = await processGdprImport(userId, platform, buffer, fileName || storagePath.split('/').pop());

    // Clean up — best-effort, don't fail the request if delete errors
    supabaseAdmin.storage.from('gdpr-imports').remove([storagePath]).catch((e) => {
      console.warn('[ImportsRoute] Storage cleanup failed:', e.message);
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
    console.error('[ImportsRoute] process error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to process import',
      ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
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
    console.error('[ImportsRoute] List error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to list imports' });
  }
});

export default router;
