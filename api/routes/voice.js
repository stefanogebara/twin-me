import express from 'express';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import { voiceService } from '../services/voiceService.js';
import { serverDb } from '../services/database.js';
import { authenticateUser, requireProfessor, userRateLimit } from '../middleware/auth.js';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Configure multer for voice file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads/voice';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `voice-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/m4a'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

// Input validation middleware
const validateTTSRequest = [
  body('text')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Text must be between 1 and 2000 characters'),
  body('voice_id')
    .optional()
    .isString()
    .withMessage('Voice ID must be a string'),
  body('settings')
    .optional()
    .isObject()
    .withMessage('Settings must be an object'),
];

const validateVoiceCloneRequest = [
  body('voice_name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Voice name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('twin_id')
    .isUUID()
    .withMessage('Invalid twin ID format'),
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

// GET /api/voice/status - Check voice service availability
router.get('/status', userRateLimit(50, 15 * 60 * 1000), async (req, res) => {
  try {
    const isEnabled = voiceService.isEnabled();

    if (isEnabled) {
      const userInfo = await voiceService.getUserInfo();
      res.json({
        enabled: true,
        status: 'available',
        subscription: userInfo.success ? userInfo.user : null,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        enabled: false,
        status: 'unavailable',
        message: 'Voice service not configured',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Voice status check failed:', error);
    res.status(500).json({
      error: 'Failed to check voice service status',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/voice/voices - Get available voices
router.get('/voices', authenticateUser, userRateLimit(30, 15 * 60 * 1000), async (req, res) => {
  try {
    if (!voiceService.isEnabled()) {
      return res.status(503).json({
        error: 'Voice service unavailable',
        message: 'Voice service is not configured'
      });
    }

    const result = await voiceService.getAvailableVoices();

    if (result.success) {
      res.json({
        voices: result.voices,
        count: result.voices.length,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        error: 'Failed to fetch voices',
        message: result.error
      });
    }
  } catch (error) {
    console.error('Error fetching voices:', error);
    res.status(500).json({
      error: 'Failed to fetch voices',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/voice/synthesize - Convert text to speech
router.post('/synthesize', authenticateUser, userRateLimit(20, 15 * 60 * 1000), validateTTSRequest, handleValidationErrors, async (req, res) => {
  try {
    if (!voiceService.isEnabled()) {
      return res.status(503).json({
        error: 'Voice service unavailable',
        message: 'Voice service is not configured'
      });
    }

    const { text, voice_id, settings = {} } = req.body;

    const result = await voiceService.textToSpeech(text, voice_id, settings);

    if (result.success) {
      // Save audio file
      const filename = `tts_${Date.now()}.mp3`;
      const saveResult = await voiceService.saveAudioToFile(result.audioBuffer, filename);

      if (saveResult.success) {
        res.json({
          success: true,
          audio_url: `/api/audio/${filename}`,
          filename: saveResult.filename,
          text: text,
          voice_id: voice_id,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          error: 'Failed to save audio file',
          message: saveResult.error
        });
      }
    } else {
      res.status(500).json({
        error: 'Text-to-speech failed',
        message: result.error
      });
    }
  } catch (error) {
    console.error('Error in text-to-speech:', error);
    res.status(500).json({
      error: 'Text-to-speech failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/voice/clone - Clone a voice from audio sample
router.post('/clone', authenticateUser, requireProfessor, userRateLimit(5, 60 * 60 * 1000), upload.single('audio'), validateVoiceCloneRequest, handleValidationErrors, async (req, res) => {
  try {
    if (!voiceService.isEnabled()) {
      return res.status(503).json({
        error: 'Voice service unavailable',
        message: 'Voice service is not configured'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'No audio file provided',
        message: 'Please upload an audio file for voice cloning'
      });
    }

    const { voice_name, description, twin_id } = req.body;
    const userId = req.user.id;

    // Verify user owns the twin
    const { data: twin, error: twinError } = await serverDb.getDigitalTwin(twin_id);

    if (twinError) {
      return res.status(500).json({
        error: 'Failed to verify twin ownership',
        message: process.env.NODE_ENV === 'development' ? twinError.message : 'Internal server error'
      });
    }

    if (!twin || twin.creator_id !== userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only clone voices for your own twins'
      });
    }

    // Clone the voice
    const cloneResult = await voiceService.cloneVoice(req.file.path, voice_name, description);

    if (cloneResult.success) {
      // Save voice profile to database
      const voiceProfileData = {
        twin_id: twin_id,
        elevenlabs_voice_id: cloneResult.voiceId,
        voice_name: voice_name,
        voice_description: description,
        is_cloned: true
      };

      const { data: voiceProfile, error: dbError } = await serverDb.createVoiceProfile(voiceProfileData);

      if (dbError) {
        console.error('Failed to save voice profile to database:', dbError);
        // Don't fail the request, just log the error
      }

      // Clean up uploaded file
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Failed to clean up uploaded file:', cleanupError);
      }

      res.json({
        success: true,
        voice_id: cloneResult.voiceId,
        voice_name: voice_name,
        voice_profile: voiceProfile,
        message: 'Voice cloned successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        error: 'Voice cloning failed',
        message: cloneResult.error
      });
    }
  } catch (error) {
    console.error('Error in voice cloning:', error);
    res.status(500).json({
      error: 'Voice cloning failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/voice/twins/:twinId/profiles - Get voice profiles for a twin
router.get('/twins/:twinId/profiles', authenticateUser, userRateLimit(50, 15 * 60 * 1000), async (req, res) => {
  try {
    const { twinId } = req.params;
    const userId = req.user.id;

    // Verify user owns the twin or it's an active professor twin
    const { data: twin, error: twinError } = await serverDb.getDigitalTwin(twinId);

    if (twinError) {
      return res.status(500).json({
        error: 'Failed to verify twin access',
        message: process.env.NODE_ENV === 'development' ? twinError.message : 'Internal server error'
      });
    }

    if (!twin) {
      return res.status(404).json({
        error: 'Twin not found'
      });
    }

    if (twin.creator_id !== userId && !(twin.is_active && twin.twin_type === 'professor')) {
      return res.status(403).json({
        error: 'Access denied to this twin'
      });
    }

    const { data: voiceProfiles, error } = await serverDb.getVoiceProfilesByTwin(twinId);

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch voice profiles',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    res.json({
      voice_profiles: voiceProfiles,
      count: voiceProfiles.length,
      twin_id: twinId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching voice profiles:', error);
    res.status(500).json({
      error: 'Failed to fetch voice profiles',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// DELETE /api/voice/profiles/:profileId - Delete a voice profile
router.delete('/profiles/:profileId', authenticateUser, requireProfessor, userRateLimit(10, 15 * 60 * 1000), async (req, res) => {
  try {
    const { profileId } = req.params;
    const userId = req.user.id;

    // Get voice profile and verify ownership
    const { data: voiceProfile, error: fetchError } = await serverDb.getVoiceProfile(profileId);

    if (fetchError) {
      return res.status(500).json({
        error: 'Failed to fetch voice profile',
        message: process.env.NODE_ENV === 'development' ? fetchError.message : 'Internal server error'
      });
    }

    if (!voiceProfile) {
      return res.status(404).json({
        error: 'Voice profile not found'
      });
    }

    // Verify user owns the twin
    const { data: twin, error: twinError } = await serverDb.getDigitalTwin(voiceProfile.twin_id);

    if (twinError || !twin || twin.creator_id !== userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    // Delete from ElevenLabs if it's a cloned voice
    if (voiceProfile.is_cloned && voiceProfile.elevenlabs_voice_id && voiceService.isEnabled()) {
      const deleteResult = await voiceService.deleteVoice(voiceProfile.elevenlabs_voice_id);
      if (!deleteResult.success) {
        console.error('Failed to delete voice from ElevenLabs:', deleteResult.error);
      }
    }

    // Delete from database
    const { success, error } = await serverDb.deleteVoiceProfile(profileId);

    if (error) {
      return res.status(500).json({
        error: 'Failed to delete voice profile',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    res.json({
      success: true,
      message: 'Voice profile deleted successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error deleting voice profile:', error);
    res.status(500).json({
      error: 'Failed to delete voice profile',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default router;