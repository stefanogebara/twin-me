/**
 * API Keys Management Routes
 *
 * Allows users to generate and manage API keys for MCP server authentication.
 */

import express from 'express';
import crypto from 'crypto';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';

const router = express.Router();

/**
 * Hash an API key for secure storage
 */
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key
 */
function generateApiKey() {
  const randomBytes = crypto.randomBytes(24);
  const keyValue = randomBytes.toString('base64url');
  return `twm_${keyValue}`;
}

/**
 * POST /api/keys - Generate a new API key
 */
router.post('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name = 'MCP Server Key', expiresIn } = req.body;

    // Generate key
    const fullKey = generateApiKey();
    const keyHash = hashKey(fullKey);

    // Calculate expiration if provided (in days)
    let expiresAt = null;
    if (expiresIn && typeof expiresIn === 'number') {
      expiresAt = new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000).toISOString();
    }

    // Store in database
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .insert({
        user_id: userId,
        key_hash: keyHash,
        name: name,
        is_active: true,
        expires_at: expiresAt
      })
      .select('id, name, created_at, expires_at')
      .single();

    if (error) {
      console.error('[API Keys] Error creating key:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create API key'
      });
    }

    // Return the key - this is the only time it will be shown
    res.json({
      success: true,
      key: fullKey,
      keyInfo: {
        id: data.id,
        name: data.name,
        createdAt: data.created_at,
        expiresAt: data.expires_at
      },
      message: 'Save this key securely. It will not be shown again.'
    });

  } catch (error) {
    console.error('[API Keys] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create API key'
    });
  }
});

/**
 * GET /api/keys - List all API keys for the user
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .select('id, name, is_active, created_at, last_used_at, expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API Keys] Error listing keys:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to list API keys'
      });
    }

    res.json({
      success: true,
      keys: data.map(key => ({
        id: key.id,
        name: key.name,
        isActive: key.is_active,
        createdAt: key.created_at,
        lastUsedAt: key.last_used_at,
        expiresAt: key.expires_at,
        isExpired: key.expires_at && new Date(key.expires_at) < new Date()
      }))
    });

  } catch (error) {
    console.error('[API Keys] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list API keys'
    });
  }
});

/**
 * DELETE /api/keys/:id - Revoke an API key
 */
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const keyId = req.params.id;

    const { error } = await supabaseAdmin
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', keyId)
      .eq('user_id', userId);

    if (error) {
      console.error('[API Keys] Error revoking key:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to revoke API key'
      });
    }

    res.json({
      success: true,
      message: 'API key revoked successfully'
    });

  } catch (error) {
    console.error('[API Keys] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke API key'
    });
  }
});

/**
 * PATCH /api/keys/:id - Update API key name
 */
router.patch('/:id', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const keyId = req.params.id;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      });
    }

    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .update({ name })
      .eq('id', keyId)
      .eq('user_id', userId)
      .select('id, name')
      .single();

    if (error) {
      console.error('[API Keys] Error updating key:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update API key'
      });
    }

    res.json({
      success: true,
      key: data
    });

  } catch (error) {
    console.error('[API Keys] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update API key'
    });
  }
});

/**
 * GET /api/keys/claude-config - Get Claude Desktop configuration template
 */
router.get('/claude-config', authenticateUser, async (req, res) => {
  try {
    // Get the project path
    const projectPath = process.cwd().replace(/\\/g, '/');

    const config = {
      mcpServers: {
        twinme: {
          command: 'node',
          args: [`${projectPath}/api/mcp-server/dist/index.js`],
          env: {
            TWINME_API_KEY: '<YOUR_API_KEY_HERE>',
            SUPABASE_URL: process.env.SUPABASE_URL || '<SUPABASE_URL>',
            SUPABASE_SERVICE_ROLE_KEY: '<SUPABASE_SERVICE_ROLE_KEY>',
            ANTHROPIC_API_KEY: '<ANTHROPIC_API_KEY>'
          }
        }
      }
    };

    const instructions = `# Claude Desktop Configuration for TwinMe

## Step 1: Generate an API key
Click "Generate New Key" to create your TwinMe API key.

## Step 2: Add to Claude Desktop config

### Windows
Add the following to: %APPDATA%\\Claude\\claude_desktop_config.json

### macOS
Add the following to: ~/Library/Application Support/Claude/claude_desktop_config.json

## Configuration:
\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`

## Step 3: Replace placeholders
- Replace <YOUR_API_KEY_HERE> with your generated API key
- Set the Supabase and Anthropic credentials

## Step 4: Restart Claude Desktop
After saving the config, restart Claude Desktop for changes to take effect.

## Using TwinMe in Claude Desktop
Try asking Claude:
- "What tools do you have from TwinMe?"
- "Chat with my twin about my day"
- "Get my soul signature"
- "Show me my live Spotify data"
`;

    res.json({
      success: true,
      config,
      instructions
    });

  } catch (error) {
    console.error('[API Keys] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate config'
    });
  }
});

export default router;
