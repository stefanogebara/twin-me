import express from 'express';
import { serverDb } from '../services/database.js';

const router = express.Router();

// Health check endpoint (non-blocking with timeout)
router.get('/', async (req, res) => {
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
    environment: process.env.NODE_ENV || 'development',
    database: {
      connected: dbHealth.healthy,
      error: dbHealth.error?.message || null
    }
  });
});

export default router;
