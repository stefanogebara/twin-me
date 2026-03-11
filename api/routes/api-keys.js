/**
 * API Key Management Routes
 *
 * Allows users to create, list, and revoke API keys for Claude Desktop MCP.
 * Keys are stored as SHA-256 hashes — the plaintext is only shown once on creation.
 *
 * Routes:
 *   GET    /api/api-keys         — list user's keys (no plaintext)
 *   POST   /api/api-keys         — generate new key (returns plaintext once)
 *   DELETE /api/api-keys/:id     — revoke a key
 */

import express from 'express';
import crypto from 'crypto';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';

const router = express.Router();

function generateApiKey() {
  const randomBytes = crypto.randomBytes(24);
  const keyValue = randomBytes.toString('base64url');
  return `twm_${keyValue}`;
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// GET /api/api-keys — list keys for the authenticated user
router.get('/', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, name, is_active, created_at, last_used_at, expires_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch API keys' });
  }

  res.json({ success: true, keys: data || [] });
});

// POST /api/api-keys — create a new API key
router.post('/', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { name = 'Claude Desktop MCP' } = req.body;

  // Limit: max 5 active keys per user
  const { count } = await supabaseAdmin
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true);

  if (count >= 5) {
    return res.status(400).json({ error: 'Maximum 5 active API keys per user. Revoke an existing key first.' });
  }

  const plaintext = generateApiKey();
  const keyHash = hashKey(plaintext);

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .insert({ user_id: userId, key_hash: keyHash, name, is_active: true })
    .select('id, name, created_at')
    .single();

  if (error) {
    return res.status(500).json({ error: 'Failed to create API key' });
  }

  // Return plaintext key ONCE — it will never be shown again
  res.json({
    success: true,
    key: plaintext,
    id: data.id,
    name: data.name,
    created_at: data.created_at,
    warning: 'Copy this key now — it will not be shown again.',
  });
});

// DELETE /api/api-keys/:id — revoke a key
router.delete('/:id', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const { error } = await supabaseAdmin
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', userId); // Ensure user can only revoke their own keys

  if (error) {
    return res.status(500).json({ error: 'Failed to revoke API key' });
  }

  res.json({ success: true, message: 'API key revoked' });
});

export default router;
