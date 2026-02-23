import express from 'express';
import supabase from '../config/supabase.js';
import { authenticateUser } from '../middleware/auth.js';
import {
  getOrCreatePrivacyProfile,
  updateGlobalPrivacyLevel,
  updateClusterPrivacy,
  batchUpdateClusters,
  getPrivacyStats,
  DEFAULT_LIFE_CLUSTERS,
} from '../services/privacyService.js';

const router = express.Router();

// All privacy-settings routes require authentication
router.use(authenticateUser);

// GET / - Get or create privacy profile
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await getOrCreatePrivacyProfile(userId);
    if (!result.success) return res.status(500).json({ error: result.error });
    res.json({ success: true, settings: result.profile });
  } catch (error) {
    console.error('Get privacy settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT / - Update global privacy level and/or batch update clusters
router.put('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { globalPrivacy, clusterUpdates } = req.body;

    let profile;

    if (globalPrivacy !== undefined) {
      const result = await updateGlobalPrivacyLevel(userId, globalPrivacy);
      if (!result.success) return res.status(500).json({ error: result.error });
      profile = result.profile;
    }

    if (Array.isArray(clusterUpdates) && clusterUpdates.length > 0) {
      const result = await batchUpdateClusters(userId, clusterUpdates);
      if (!result.success) return res.status(500).json({ error: result.error });
      profile = result.profile;
    }

    if (!profile) {
      const result = await getOrCreatePrivacyProfile(userId);
      if (!result.success) return res.status(500).json({ error: result.error });
      profile = result.profile;
    }

    res.json({ success: true, settings: profile });
  } catch (error) {
    console.error('Update privacy settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /presets - Get audience presets
router.get('/presets', async (req, res) => {
  try {
    const { data: presets, error } = await supabase
      .from('audience_presets')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Failed to fetch presets:', error);
      // Return built-in presets as fallback
      return res.json({ success: true, presets: [] });
    }

    res.json({ success: true, presets: presets || [] });
  } catch (error) {
    console.error('Get presets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /presets/:presetKey/apply - Apply a preset to the user's settings
router.post('/presets/:presetKey/apply', async (req, res) => {
  try {
    const userId = req.user.id;
    const { presetKey } = req.params;

    const { data: preset, error } = await supabase
      .from('audience_presets')
      .select('*')
      .eq('preset_key', presetKey)
      .single();

    if (error || !preset) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    if (preset.global_privacy !== undefined) {
      await updateGlobalPrivacyLevel(userId, preset.global_privacy);
    }

    if (preset.default_cluster_levels && typeof preset.default_cluster_levels === 'object') {
      const clusterUpdates = Object.entries(preset.default_cluster_levels).map(([clusterId, level]) => ({
        clusterId,
        revelationLevel: level,
      }));
      await batchUpdateClusters(userId, clusterUpdates);
    }

    const result = await getOrCreatePrivacyProfile(userId);
    if (!result.success) return res.status(500).json({ error: result.error });

    res.json({ success: true, settings: result.profile });
  } catch (error) {
    console.error('Apply preset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /twins - Get contextual twins for user
router.get('/twins', async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: twins, error } = await supabase
      .from('contextual_twins')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      // Table may not exist yet — return empty list gracefully
      console.warn('Failed to fetch twins (table may not exist):', error.message);
      return res.json({ success: true, twins: [] });
    }

    const mappedTwins = (twins || []).map(t => ({ ...t, isActive: t.is_active }));

    res.json({ success: true, twins: mappedTwins });
  } catch (error) {
    console.error('Get twins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /twins - Create a contextual twin
router.post('/twins', async (req, res) => {
  try {
    const userId = req.user.id;
    const twinData = req.body;

    const { data: twin, error } = await supabase
      .from('contextual_twins')
      .insert({ ...twinData, user_id: userId })
      .select()
      .single();

    if (error) {
      console.error('Failed to create twin:', error);
      return res.status(500).json({ error: 'Failed to create twin' });
    }

    res.json({ success: true, twin });
  } catch (error) {
    console.error('Create twin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /twins/deactivate - Deactivate all twins (must come before /:id routes)
router.post('/twins/deactivate', async (req, res) => {
  try {
    const userId = req.user.id;

    const { error } = await supabase
      .from('contextual_twins')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to deactivate twins:', error);
      return res.status(500).json({ error: 'Failed to deactivate twins' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Deactivate twins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /twins/:id/activate - Activate a specific twin
router.post('/twins/:id/activate', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Deactivate all first
    await supabase
      .from('contextual_twins')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    // Activate target
    const { data: twin, error } = await supabase
      .from('contextual_twins')
      .update({
        is_active: true,
        last_activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Failed to activate twin:', error);
      return res.status(500).json({ error: 'Failed to activate twin' });
    }

    if (!twin) {
      return res.status(404).json({ error: 'Twin not found' });
    }

    res.json({ success: true, twin });
  } catch (error) {
    console.error('Activate twin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /twins/:id - Update a contextual twin
router.put('/twins/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    const { data: twin, error } = await supabase
      .from('contextual_twins')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update twin:', error);
      return res.status(500).json({ error: 'Failed to update twin' });
    }

    if (!twin) {
      return res.status(404).json({ error: 'Twin not found' });
    }

    res.json({ success: true, twin });
  } catch (error) {
    console.error('Update twin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /twins/:id - Delete a contextual twin
router.delete('/twins/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { error } = await supabase
      .from('contextual_twins')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to delete twin:', error);
      return res.status(500).json({ error: 'Failed to delete twin' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete twin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /clusters - Get cluster settings merged with defaults
router.get('/clusters', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await getOrCreatePrivacyProfile(userId);

    if (!result.success) return res.status(500).json({ error: result.error });

    const profileClusters = result.profile.clusters || [];
    const settings = [];

    Object.entries(DEFAULT_LIFE_CLUSTERS).forEach(([category, clusters]) => {
      clusters.forEach(defaultCluster => {
        const stored = profileClusters.find(c => c.id === defaultCluster.id);
        settings.push({
          clusterId: defaultCluster.id,
          name: defaultCluster.name,
          category,
          privacyLevel: stored ? stored.privacyLevel : defaultCluster.privacyLevel,
          isEnabled: stored ? stored.enabled : defaultCluster.enabled,
        });
      });
    });

    res.json({ success: true, settings });
  } catch (error) {
    console.error('Get clusters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /clusters/:id/privacy - Update privacy level for a cluster
router.put('/clusters/:id/privacy', async (req, res) => {
  try {
    const userId = req.user.id;
    const clusterId = req.params.id;
    const { privacyLevel } = req.body;

    if (privacyLevel === undefined || privacyLevel < 0 || privacyLevel > 100) {
      return res.status(400).json({ error: 'privacyLevel must be between 0 and 100' });
    }

    const result = await updateClusterPrivacy(userId, clusterId, privacyLevel);
    if (!result.success) return res.status(500).json({ error: result.error });

    res.json({ success: true, profile: result.profile });
  } catch (error) {
    console.error('Update cluster privacy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /clusters/:id/toggle - Toggle cluster enabled/disabled
router.put('/clusters/:id/toggle', async (req, res) => {
  try {
    const userId = req.user.id;
    const clusterId = req.params.id;
    const { enabled } = req.body;

    const profileResult = await getOrCreatePrivacyProfile(userId);
    if (!profileResult.success) return res.status(500).json({ error: profileResult.error });

    const cluster = (profileResult.profile.clusters || []).find(c => c.id === clusterId);
    const currentLevel = cluster ? cluster.privacyLevel : 50;

    const result = await updateClusterPrivacy(userId, clusterId, currentLevel, enabled);
    if (!result.success) return res.status(500).json({ error: result.error });

    res.json({ success: true, profile: result.profile });
  } catch (error) {
    console.error('Toggle cluster error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /statistics - Get privacy statistics
router.get('/statistics', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await getPrivacyStats(userId);
    if (!result.success) return res.status(500).json({ error: result.error });
    res.json({ success: true, statistics: result.stats });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
