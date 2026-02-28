/**
 * Daily Check-In Routes
 * =====================
 * Syd-inspired 50-mood daily check-in ritual.
 * Each check-in is stored as a platform_data memory in the memory stream,
 * giving the twin awareness of the user's current emotional state.
 *
 * POST /api/checkin       - Submit today's mood check-in
 * GET  /api/checkin/today - Check if already checked in today
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { addMemory } from '../services/memoryStreamService.js';
import { supabaseAdmin } from '../services/database.js';

const router = express.Router();

const VALID_ENERGIES = ['low', 'medium', 'high'];

/**
 * POST /api/checkin
 * Submit the user's daily mood check-in.
 * Stores as a platform_data memory so the twin is aware.
 */
router.post('/', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { mood, moodEmoji, energy, note } = req.body;

  if (!mood || typeof mood !== 'string' || mood.trim().length === 0 || mood.length > 50) {
    return res.status(400).json({ success: false, error: 'Invalid mood' });
  }

  if (energy !== undefined && !VALID_ENERGIES.includes(energy)) {
    return res.status(400).json({ success: false, error: 'Invalid energy level' });
  }

  if (note !== undefined && (typeof note !== 'string' || note.length > 500)) {
    return res.status(400).json({ success: false, error: 'Note too long (max 500 chars)' });
  }

  const safeMood = mood.trim();
  const today = new Date().toISOString().split('T')[0];

  try {
    // Build natural-language memory content for the twin
    const energyPhrase = energy ? ` with ${energy} energy` : '';
    const notePhrase = note?.trim() ? `. ${note.trim()}` : '';
    const content = `Daily check-in: feeling ${safeMood}${energyPhrase}${notePhrase}`;

    await addMemory(userId, content, 'platform_data', {
      source: 'daily_checkin',
      mood: safeMood,
      moodEmoji: moodEmoji || null,
      energy: energy || null,
      note: note?.trim() || null,
      checkin_date: today,
    });

    // Upsert so re-submitting today updates rather than errors
    const { error } = await supabaseAdmin
      .from('daily_checkins')
      .upsert(
        { user_id: userId, date: today, mood: safeMood, energy: energy || null },
        { onConflict: 'user_id,date' }
      );

    if (error) {
      console.error('[Checkin] Failed to upsert daily_checkins:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to save check-in' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[Checkin] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/checkin/today
 * Returns whether the user has already checked in today,
 * and the check-in data if they have.
 */
router.get('/today', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const today = new Date().toISOString().split('T')[0];

  try {
    const { data, error } = await supabaseAdmin
      .from('daily_checkins')
      .select('mood, energy, created_at')
      .eq('user_id', userId)
      .eq('date', today)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = "no rows found" — not an error for us
      console.error('[Checkin] today query error:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to check today status' });
    }

    return res.json({ success: true, checkedIn: !!data, data: data || null });
  } catch (err) {
    console.error('[Checkin] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
