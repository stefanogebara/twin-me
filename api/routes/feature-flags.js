/**
 * User-Facing Feature Flags API
 * ==============================
 * GET  /api/feature-flags  — load user's personality engine flags (object format)
 * POST /api/feature-flags  — toggle a flag { flag: string, value: boolean }
 *
 * These 4 flags are read by twin-chat.js via getFeatureFlags() and live in
 * the feature_flags table. Settings.tsx uses this endpoint to keep the UI
 * in sync with the DB (previously only wrote to localStorage — non-functional).
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getFeatureFlags, setFeatureFlag } from '../services/featureFlagsService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('FeatureFlagsUser');
const router = express.Router();

/** Flags shown in the Settings → Personality Engine section */
const USER_FLAGS = ['personality_oracle', 'neurotransmitter_modes', 'connectome_neuropils', 'graph_retrieval', 'llm_wiki'];

/** Defaults match twin-chat.js behaviour (absent row = enabled, except opt-in flags) */
const FLAG_DEFAULTS = {
  personality_oracle: false,    // opt-in — requires trained model
  neurotransmitter_modes: true, // on by default
  connectome_neuropils: true,   // on by default
  graph_retrieval: false,       // opt-in — experimental
  llm_wiki: false,              // opt-in — compiled wiki injected into twin context
};

/**
 * GET /api/feature-flags
 * Returns { personality_oracle, neurotransmitter_modes, connectome_neuropils, graph_retrieval }
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const dbFlags = await getFeatureFlags(req.user.id);
    const result = {};
    for (const name of USER_FLAGS) {
      result[name] = name in dbFlags ? dbFlags[name] : FLAG_DEFAULTS[name];
    }
    return res.json({ success: true, flags: result });
  } catch (err) {
    log.error('GET /feature-flags error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to load flags' });
  }
});

/**
 * POST /api/feature-flags
 * Body: { flag: string, value: boolean }
 */
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { flag, value } = req.body;
    if (!USER_FLAGS.includes(flag)) {
      return res.status(400).json({ success: false, error: `Unknown flag. Valid: ${USER_FLAGS.join(', ')}` });
    }
    await setFeatureFlag(req.user.id, flag, Boolean(value));
    return res.json({ success: true, flag, value: Boolean(value) });
  } catch (err) {
    log.error('POST /feature-flags error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to save flag' });
  }
});

export default router;
