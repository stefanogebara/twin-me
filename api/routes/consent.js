import express from 'express';
import supabase from '../config/supabase.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// All consent routes require authentication
router.use(authenticateUser);

// GET /api/consent - Get all consents for authenticated user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: consents, error } = await supabase
      .from('user_consents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch consents:', error);
      return res.status(500).json({ error: 'Failed to fetch consents' });
    }

    res.json({ success: true, consents: consents || [] });
  } catch (error) {
    console.error('Get consents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/consent - Grant consent
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { consent_type, platform, consent_version } = req.body;

    if (!consent_type) {
      return res.status(400).json({ error: 'consent_type is required' });
    }

    const ip_address = req.ip || req.headers['x-forwarded-for'] || null;

    const { data: consent, error } = await supabase
      .from('user_consents')
      .upsert(
        {
          user_id: userId,
          consent_type,
          platform: platform || null,
          granted: true,
          consent_version: consent_version || '1.0',
          granted_at: new Date().toISOString(),
          revoked_at: null,
          ip_address,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,consent_type,platform' }
      )
      .select()
      .single();

    if (error) {
      console.error('Failed to grant consent:', error);
      return res.status(500).json({ error: 'Failed to grant consent' });
    }

    res.json({ success: true, consent });
  } catch (error) {
    console.error('Grant consent error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/consent/:consentType/:platform - Revoke consent
router.delete('/:consentType/:platform', async (req, res) => {
  try {
    const userId = req.user.id;
    const { consentType, platform } = req.params;

    const { data: consent, error } = await supabase
      .from('user_consents')
      .update({
        granted: false,
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('consent_type', consentType)
      .eq('platform', platform)
      .select()
      .single();

    if (error) {
      console.error('Failed to revoke consent:', error);
      return res.status(500).json({ error: 'Failed to revoke consent' });
    }

    if (!consent) {
      return res.status(404).json({ error: 'Consent record not found' });
    }

    res.json({ success: true, consent });
  } catch (error) {
    console.error('Revoke consent error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
