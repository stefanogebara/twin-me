/**
 * GDPR / Data Export Import Routes
 *
 * POST /api/imports/gdpr  — upload and ingest a platform data export
 * GET  /api/imports       — list past imports for the authenticated user
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticateUser } from '../middleware/auth.js';
import { processGdprImport, listUserImports } from '../services/gdprImportService.js';

const router = Router();

// ---------------------------------------------------------------------------
// Multer config — memory storage, 100 MB limit
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/json',
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream', // some browsers send ZIPs this way
      'text/csv',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.json') || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload a JSON or ZIP file.'));
    }
  },
});

const SUPPORTED_PLATFORMS = new Set(['spotify', 'youtube', 'discord', 'reddit']);

// ---------------------------------------------------------------------------
// POST /api/imports/gdpr
// ---------------------------------------------------------------------------

router.post('/gdpr', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    if (!platform || !SUPPORTED_PLATFORMS.has(platform)) {
      return res.status(400).json({
        success: false,
        error: `platform must be one of: ${[...SUPPORTED_PLATFORMS].join(', ')}`,
      });
    }

    console.log(`[ImportsRoute] GDPR import: user=${userId} platform=${platform} file=${req.file.originalname} size=${req.file.size}`);

    const result = await processGdprImport(userId, platform, req.file.buffer, req.file.originalname);

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
    console.error('[ImportsRoute] Unexpected error:', err.message);
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
