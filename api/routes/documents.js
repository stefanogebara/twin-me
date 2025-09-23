import express from 'express';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import { authenticateUser, requireProfessor, userRateLimit } from '../middleware/auth.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';

dotenv.config();

const router = express.Router();

// Dynamic import to ensure environment variables are loaded
async function getDocumentProcessor() {
  const { documentProcessor } = await import('../services/simpleDocumentProcessor.js');
  return documentProcessor;
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads/documents';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only specific file types
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed types: PDF, Word documents, and text files.`));
    }
  }
});

// Input validation
const validateProcessRequest = [
  body('twinId')
    .isUUID()
    .withMessage('Invalid twin ID format'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// POST /api/documents/upload - Upload and process a document (Requires authentication)
router.post('/upload', authenticateUser, userRateLimit(50, 15 * 60 * 1000), upload.single('document'), validateProcessRequest, handleValidationErrors, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded'
      });
    }

    const { twinId, title, description } = req.body;
    const filePath = req.file.path;
    const mimeType = req.file.mimetype;

    console.log(`Processing uploaded file: ${req.file.originalname} for twin ${twinId}`);

    // Process the document
    const documentProcessor = await getDocumentProcessor();
    const result = await documentProcessor.processDocument(
      filePath,
      mimeType,
      twinId,
      {
        originalName: req.file.originalname,
        title: title || req.file.originalname,
        description: description || '',
        uploadedAt: new Date().toISOString(),
        fileSize: req.file.size
      }
    );

    // Clean up the uploaded file after processing
    try {
      await fs.unlink(filePath);
    } catch (cleanupError) {
      console.warn('Failed to clean up uploaded file:', cleanupError);
    }

    res.json({
      success: true,
      message: 'Document processed successfully',
      result: {
        fileName: result.fileName,
        chunksProcessed: result.chunksProcessed,
        totalCharacters: result.totalCharacters,
        processedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Document upload error:', error);

    // Clean up file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.warn('Failed to clean up file after error:', cleanupError);
      }
    }

    res.status(500).json({
      error: 'Failed to process document',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/documents/stats/:twinId - Get document statistics for a twin (Requires authentication)
router.get('/stats/:twinId', authenticateUser, async (req, res) => {
  try {
    const { twinId } = req.params;
    const documentProcessor = await getDocumentProcessor();
    const stats = documentProcessor.getDocumentStats(twinId);

    res.json({
      twinId,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Stats retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve document statistics'
    });
  }
});

// POST /api/documents/search - Search for relevant context (Requires authentication)
router.post('/search', authenticateUser, [
  body('twinId')
    .isUUID()
    .withMessage('Invalid twin ID format'),
  body('query')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Query must be between 1 and 500 characters'),
  body('maxResults')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Max results must be between 1 and 10')
], handleValidationErrors, async (req, res) => {
  try {
    const { twinId, query, maxResults = 5 } = req.body;

    const documentProcessor = await getDocumentProcessor();
    const results = await documentProcessor.searchRelevantContext(
      twinId,
      query,
      parseInt(maxResults)
    );

    res.json({
      query,
      twinId,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Context search error:', error);
    res.status(500).json({
      error: 'Failed to search documents',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// DELETE /api/documents/clear/:twinId - Clear all documents for a twin (Requires professor role)
router.delete('/clear/:twinId', authenticateUser, requireProfessor, async (req, res) => {
  try {
    const { twinId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(twinId)) {
      return res.status(400).json({
        error: 'Invalid twin ID format'
      });
    }

    const documentProcessor = await getDocumentProcessor();
    documentProcessor.clearTwinDocuments(twinId);

    res.json({
      success: true,
      message: `All documents cleared for twin ${twinId}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Document clearing error:', error);
    res.status(500).json({
      error: 'Failed to clear documents'
    });
  }
});

// GET /api/documents/twins - List all twins with processed documents (Requires professor role)
router.get('/twins', authenticateUser, requireProfessor, async (req, res) => {
  try {
    const documentProcessor = await getDocumentProcessor();
    const twins = documentProcessor.getProcessedTwins();

    res.json({
      twins,
      count: twins.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Twins listing error:', error);
    res.status(500).json({
      error: 'Failed to list processed twins'
    });
  }
});

export default router;