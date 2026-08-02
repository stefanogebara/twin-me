/**
 * Twin Fidelity Battery Routes (R4)
 * ==================================
 * GET  /api/twin-fidelity/battery — the versioned 20-item battery
 * POST /api/twin-fidelity/answers — submit a user wave (triggers twin
 *                                   answering + scoring; aiLimiter'd)
 * GET  /api/twin-fidelity/results — all waves with metrics
 *
 * Thin by design; logic in api/services/fidelityBatteryService.js.
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { FIDELITY_BATTERY, BATTERY_VERSION } from '../config/fidelityBattery.js';
import { submitFidelityWave, getFidelityResults } from '../services/fidelityBatteryService.js';
import { computeChatCalibration } from '../services/fidelityCalibration.js';

const router = Router();

router.use(authenticateUser);

router.get('/battery', (req, res) => {
  res.json({ success: true, data: { batteryVersion: BATTERY_VERSION, items: FIDELITY_BATTERY } });
});

router.post('/answers', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { answers } = req.body || {};
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ success: false, error: 'answers object is required' });
    }

    const data = await submitFidelityWave(userId, answers);
    res.json({ success: true, data });
  } catch (error) {
    if (/incomplete battery/i.test(error.message || '')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

// R4 calibration: how well the R2 evidence-confidence scores predict
// thumbs outcomes in real chat (Brier + accuracy-by-bucket).
router.get('/calibration', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const chat = await computeChatCalibration(userId);
    res.json({ success: true, data: { chat } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

router.get('/results', async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const waves = await getFidelityResults(userId);
    res.json({ success: true, data: { waves } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

export default router;
