import express from 'express';
import { serverDb } from '../services/database.js';

const router = express.Router();

// Fast liveness check (<10ms, no DB)
router.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Deep health check with DB connectivity (for monitoring dashboards)
router.get('/deep', async (req, res) => {
  let dbHealth = { healthy: false, error: null };
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB health check timeout')), 3000)
    );
    dbHealth = await Promise.race([serverDb.healthCheck(), timeout]);
  } catch (e) {
    dbHealth = { healthy: false, error: e };
  }

  res.json({
    status: dbHealth.healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    database: {
      connected: dbHealth.healthy,
      error: dbHealth.error?.message || null
    }
  });
});

export default router;
