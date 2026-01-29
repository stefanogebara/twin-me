/**
 * Resume Upload API Routes
 *
 * Handles resume/CV upload and parsing for enrichment
 */

import express from 'express';
import multer from 'multer';
import { resumeParserService } from '../services/resumeParserService.js';
import { profileEnrichmentService } from '../services/profileEnrichmentService.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload a PDF, TXT, DOC, or DOCX file.'));
    }
  }
});

// Lazy Supabase client
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

/**
 * POST /api/resume/upload
 * Upload and parse a resume file
 */
router.post('/upload', upload.single('resume'), async (req, res) => {
  try {
    const { userId, name } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[Resume Upload] Processing resume for user ${userId}`);
    console.log(`[Resume Upload] File: ${req.file.originalname}, Size: ${req.file.size}, Type: ${req.file.mimetype}`);

    // Determine file type
    let fileType = 'text';
    if (req.file.mimetype === 'application/pdf') {
      fileType = 'pdf';
    }

    // Parse the resume
    const parseResult = await resumeParserService.parseResume(
      req.file.buffer,
      fileType,
      name
    );

    if (!parseResult.success) {
      console.error('[Resume Upload] Parse failed:', parseResult.error);
      return res.status(400).json({
        success: false,
        error: 'Failed to parse resume',
        details: parseResult.error
      });
    }

    console.log('[Resume Upload] Resume parsed successfully');

    // Get existing enrichment data
    const existingEnrichment = await profileEnrichmentService.getEnrichment(userId);
    const existingData = existingEnrichment.data || {};

    // Merge resume data with existing enrichment
    const mergedData = resumeParserService.mergeWithEnrichment(existingData, parseResult);

    // Save merged data
    const saveResult = await profileEnrichmentService.saveEnrichment(
      userId,
      existingData.email || 'resume@upload.user',
      {
        ...mergedData,
        source: existingData.source ? `${existingData.source}+resume` : 'resume'
      }
    );

    if (!saveResult.success) {
      console.error('[Resume Upload] Failed to save:', saveResult.error);
    }

    // Return the extracted data
    res.json({
      success: true,
      message: 'Resume parsed successfully',
      data: {
        personal: parseResult.data.personal,
        experience: parseResult.data.experience,
        education: parseResult.data.education,
        skills: parseResult.data.skills,
        certifications: parseResult.data.certifications,
        projects: parseResult.data.projects,
        languages: parseResult.data.personal?.languages || [],
        // Merged summary for display
        summary: {
          name: parseResult.data.personal?.name || name,
          current_role: parseResult.data.experience?.[0]?.title,
          current_company: parseResult.data.experience?.[0]?.company,
          education_summary: parseResult.data.education?.[0]
            ? `${parseResult.data.education[0].degree || 'Degree'} from ${parseResult.data.education[0].institution}`
            : null,
          location: parseResult.data.personal?.location,
          experience_count: parseResult.data.experience?.length || 0,
          skills_count: Object.values(parseResult.data.skills || {}).flat().length
        }
      }
    });

  } catch (error) {
    console.error('[Resume Upload] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process resume',
      details: error.message
    });
  }
});

/**
 * POST /api/resume/parse-text
 * Parse resume from pasted text
 */
router.post('/parse-text', async (req, res) => {
  try {
    const { userId, text, name } = req.body;

    if (!text || text.trim().length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Please provide resume text (minimum 50 characters)'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[Resume Parse] Processing text resume for user ${userId}`);

    // Parse the resume text
    const parseResult = await resumeParserService.parseResume(text, 'text', name);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to parse resume text',
        details: parseResult.error
      });
    }

    // Get existing enrichment and merge
    const existingEnrichment = await profileEnrichmentService.getEnrichment(userId);
    const existingData = existingEnrichment.data || {};
    const mergedData = resumeParserService.mergeWithEnrichment(existingData, parseResult);

    // Save merged data
    await profileEnrichmentService.saveEnrichment(
      userId,
      existingData.email || 'resume@text.user',
      {
        ...mergedData,
        source: existingData.source ? `${existingData.source}+resume_text` : 'resume_text'
      }
    );

    res.json({
      success: true,
      message: 'Resume text parsed successfully',
      data: {
        personal: parseResult.data.personal,
        experience: parseResult.data.experience,
        education: parseResult.data.education,
        skills: parseResult.data.skills,
        summary: {
          name: parseResult.data.personal?.name || name,
          current_role: parseResult.data.experience?.[0]?.title,
          current_company: parseResult.data.experience?.[0]?.company,
          experience_count: parseResult.data.experience?.length || 0
        }
      }
    });

  } catch (error) {
    console.error('[Resume Parse] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to parse resume text',
      details: error.message
    });
  }
});

/**
 * GET /api/resume/data/:userId
 * Get parsed resume data for a user
 */
router.get('/data/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const enrichment = await profileEnrichmentService.getEnrichment(userId);

    if (!enrichment.success || !enrichment.data?.resume_data) {
      return res.json({
        success: true,
        hasResume: false,
        data: null
      });
    }

    res.json({
      success: true,
      hasResume: true,
      data: enrichment.data.resume_data
    });

  } catch (error) {
    console.error('[Resume Data] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get resume data'
    });
  }
});

export default router;
