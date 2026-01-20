/**
 * Wearable Connectors API Routes
 *
 * Handles wearable device connections via Open Wearables service.
 * Supports: Garmin, Polar, Suunto, Whoop, Apple Health
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import openWearablesService from '../services/openWearablesService.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

// Supported wearable providers
const PROVIDERS = ['garmin', 'polar', 'suunto', 'whoop', 'apple_health'];

/**
 * POST /api/wearables/connect
 * Get connection link for a wearable provider
 */
router.post('/connect', authenticateUser, async (req, res) => {
  try {
    const { userId, email } = req.user;
    const { provider } = req.body;

    console.log('[Wearables] Connect request:', { userId, provider });

    // Validate provider
    if (!provider || !PROVIDERS.includes(provider)) {
      return res.status(400).json({
        error: `Invalid provider. Supported: ${PROVIDERS.join(', ')}`
      });
    }

    // Get or create user in Open Wearables
    let owUser;
    try {
      owUser = await openWearablesService.getUser(userId);
      console.log('[Wearables] Found existing Open Wearables user:', owUser.id);
    } catch {
      // User doesn't exist, create them
      owUser = await openWearablesService.createUser(userId, email);
      console.log('[Wearables] Created new Open Wearables user:', owUser.id);
    }

    // Store Open Wearables user ID mapping in platform_connections
    await supabaseAdmin.from('platform_connections').upsert({
      user_id: userId,
      platform: 'open_wearables',
      metadata: { ow_user_id: owUser.id },
      status: 'pending'
    }, { onConflict: 'user_id,platform' });

    // Generate connection link
    const callbackUrl = `${process.env.CLIENT_URL}/connect-data?wearable=success&provider=${provider}`;
    const connectionData = await openWearablesService.getConnectionLink(owUser.id, provider, callbackUrl);

    console.log('[Wearables] Generated auth URL for provider:', provider);

    res.json({
      success: true,
      authUrl: connectionData.authorization_url,
      provider
    });
  } catch (error) {
    console.error('[Wearables] Connect error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/wearables/status
 * Get user's connected wearables
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.user;

    // Get Open Wearables user ID from platform_connections
    const { data: connection, error: connError } = await supabaseAdmin
      .from('platform_connections')
      .select('metadata, last_sync')
      .eq('user_id', userId)
      .eq('platform', 'open_wearables')
      .single();

    if (connError || !connection?.metadata?.ow_user_id) {
      return res.json({ connected: false, providers: [] });
    }

    // Get connections from Open Wearables
    const connections = await openWearablesService.getConnections(connection.metadata.ow_user_id);

    res.json({
      connected: Array.isArray(connections) && connections.length > 0,
      providers: (connections || []).map(c => ({
        provider: c.provider,
        connected_at: c.connected_at,
        last_sync: c.last_sync
      })),
      twinme_last_sync: connection.last_sync
    });
  } catch (error) {
    console.error('[Wearables] Status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/wearables/disconnect
 * Disconnect a wearable provider
 */
router.post('/disconnect', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.user;
    const { provider } = req.body;

    console.log('[Wearables] Disconnect request:', { userId, provider });

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }

    // Get Open Wearables user ID
    const { data: connection } = await supabaseAdmin
      .from('platform_connections')
      .select('metadata')
      .eq('user_id', userId)
      .eq('platform', 'open_wearables')
      .single();

    if (!connection?.metadata?.ow_user_id) {
      return res.status(404).json({ error: 'No wearable connection found' });
    }

    // Disconnect from Open Wearables
    await openWearablesService.disconnectProvider(connection.metadata.ow_user_id, provider);

    console.log('[Wearables] Disconnected provider:', provider);

    res.json({ success: true, provider });
  } catch (error) {
    console.error('[Wearables] Disconnect error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/wearables/sync
 * Sync wearable data and store in TwinMe
 */
router.post('/sync', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.user;
    const { days = 30 } = req.body;

    console.log('[Wearables] Sync request:', { userId, days });

    // Get Open Wearables user ID
    const { data: connection } = await supabaseAdmin
      .from('platform_connections')
      .select('metadata')
      .eq('user_id', userId)
      .eq('platform', 'open_wearables')
      .single();

    if (!connection?.metadata?.ow_user_id) {
      return res.status(404).json({ error: 'No wearable connection found. Please connect a wearable first.' });
    }

    const owUserId = connection.metadata.ow_user_id;

    // Fetch all data from Open Wearables
    const data = await openWearablesService.getAllData(owUserId, days);

    // Prepare data for storage
    const dataToStore = [
      ...data.activities.map(a => ({
        type: 'workout',
        data: a,
        date: a.start_time || a.date || new Date().toISOString()
      })),
      ...data.sleep.map(s => ({
        type: 'sleep',
        data: s,
        date: s.date || s.start_time || new Date().toISOString()
      })),
      ...data.daily.map(d => ({
        type: 'daily_summary',
        data: d,
        date: d.date || new Date().toISOString()
      })),
      ...data.heartRate.map(h => ({
        type: 'heart_rate',
        data: h,
        date: h.timestamp || h.date || new Date().toISOString()
      }))
    ];

    console.log('[Wearables] Storing data:', {
      activities: data.activities.length,
      sleep: data.sleep.length,
      daily: data.daily.length,
      heartRate: data.heartRate.length
    });

    // Store in user_platform_data
    let stored = 0;
    for (const item of dataToStore) {
      const { error } = await supabaseAdmin.from('user_platform_data').upsert({
        user_id: userId,
        platform: 'wearable',
        data_type: item.type,
        raw_data: item.data,
        extracted_at: item.date,
        processed: false
      }, {
        onConflict: 'user_id,platform,data_type,extracted_at',
        ignoreDuplicates: false
      });

      if (!error) stored++;
    }

    // Update last_sync on platform_connections
    await supabaseAdmin
      .from('platform_connections')
      .update({
        last_sync: new Date().toISOString(),
        status: 'active'
      })
      .eq('user_id', userId)
      .eq('platform', 'open_wearables');

    console.log('[Wearables] Sync complete:', { stored, total: dataToStore.length });

    res.json({
      success: true,
      synced: {
        activities: data.activities.length,
        sleep: data.sleep.length,
        daily: data.daily.length,
        heartRate: data.heartRate.length,
        total_stored: stored
      }
    });
  } catch (error) {
    console.error('[Wearables] Sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/wearables/data
 * Get synced wearable data for user
 */
router.get('/data', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.user;
    const { type, days = 30 } = req.query;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let query = supabaseAdmin
      .from('user_platform_data')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'wearable')
      .gte('extracted_at', startDate)
      .order('extracted_at', { ascending: false });

    if (type) {
      query = query.eq('data_type', type);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    res.json({ data: data || [] });
  } catch (error) {
    console.error('[Wearables] Data fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/wearables/providers
 * Get list of supported wearable providers
 */
router.get('/providers', (req, res) => {
  const providerInfo = [
    { id: 'garmin', name: 'Garmin', description: 'Garmin watches and fitness devices' },
    { id: 'polar', name: 'Polar', description: 'Polar heart rate monitors and fitness watches' },
    { id: 'suunto', name: 'Suunto', description: 'Suunto sports watches' },
    { id: 'whoop', name: 'WHOOP', description: 'WHOOP fitness and recovery band' },
    { id: 'apple_health', name: 'Apple Health', description: 'Apple Watch and Health app data' }
  ];

  res.json({ providers: providerInfo });
});

/**
 * GET /api/wearables/health
 * Check Open Wearables service health
 */
router.get('/health', async (req, res) => {
  try {
    const isHealthy = await openWearablesService.healthCheck();
    res.json({
      open_wearables: isHealthy ? 'connected' : 'unavailable',
      url: process.env.OPEN_WEARABLES_URL || 'http://localhost:8000'
    });
  } catch (error) {
    res.json({
      open_wearables: 'unavailable',
      error: error.message
    });
  }
});

export default router;
