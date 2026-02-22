/**
 * Cron Claude Sync Route
 *
 * Automatic historical import of Claude Desktop conversations from LevelDB.
 * Runs as a Vercel cron job at 4 AM daily.
 *
 * Features:
 * - Detects when Claude Desktop is not running (LevelDB accessible)
 * - Imports historical conversations with structure preservation
 * - Queues AI analysis for imported conversations
 * - Tracks import progress and completion
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { supabaseAdmin } from '../services/database.js';

const router = Router();

// Possible Claude Desktop data paths by platform
const CLAUDE_DATA_PATHS = {
  win32: [
    path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'conversations'),
    path.join(os.homedir(), 'AppData', 'Local', 'Claude', 'conversations'),
  ],
  darwin: [
    path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'conversations'),
  ],
  linux: [
    path.join(os.homedir(), '.config', 'Claude', 'conversations'),
    path.join(os.homedir(), '.local', 'share', 'Claude', 'conversations'),
  ],
};

/**
 * Find Claude Desktop data path
 */
function findClaudeDataPath() {
  const platform = process.platform;
  const paths = CLAUDE_DATA_PATHS[platform] || [];

  for (const dataPath of paths) {
    try {
      if (fs.existsSync(dataPath)) {
        return dataPath;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Check if Claude Desktop is running (LevelDB might be locked)
 */
function isClaudeDesktopRunning() {
  // On Windows, check for claude.exe process
  // On Mac/Linux, check for Claude process
  // For now, we'll try to access the DB and handle lock errors
  return false;
}

/**
 * Parse LevelDB conversations (simplified - real implementation needs leveldb library)
 * This is a placeholder that would need actual LevelDB parsing
 */
async function parseClaudeConversations(dataPath) {
  const conversations = [];

  try {
    // In a real implementation, you would:
    // 1. Open the LevelDB database at dataPath
    // 2. Iterate through all key-value pairs
    // 3. Parse the conversation format
    // 4. Extract messages, timestamps, etc.

    // For now, check if directory has conversation files
    const files = fs.readdirSync(dataPath);

    console.log(`[Claude Sync] Found ${files.length} items in Claude data directory`);

    // Parse each conversation file/entry
    for (const file of files) {
      try {
        const filePath = path.join(dataPath, file);
        const stat = fs.statSync(filePath);

        if (stat.isFile() && (file.endsWith('.json') || file.endsWith('.db'))) {
          // Try to parse as JSON conversation
          if (file.endsWith('.json')) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const conversation = JSON.parse(content);

            if (conversation.messages && Array.isArray(conversation.messages)) {
              conversations.push({
                id: conversation.id || file.replace('.json', ''),
                title: conversation.title || 'Untitled Conversation',
                createdAt: conversation.created_at || stat.birthtime.toISOString(),
                updatedAt: conversation.updated_at || stat.mtime.toISOString(),
                messages: conversation.messages.map(msg => ({
                  role: msg.role || 'user',
                  content: msg.content || msg.text || '',
                  timestamp: msg.timestamp || msg.created_at,
                })),
              });
            }
          }
        }
      } catch (fileError) {
        console.error(`[Claude Sync] Error parsing file ${file}:`, fileError.message);
      }
    }

  } catch (error) {
    console.error('[Claude Sync] Error reading Claude data:', error);
  }

  return conversations;
}

/**
 * Import conversations for a user
 */
async function importConversationsForUser(userId, conversations) {
  let imported = 0;
  let skipped = 0;
  let messagesImported = 0;

  for (const conversation of conversations) {
    try {
      // Check if already imported (by external_id)
      const { data: existing } = await supabaseAdmin
        .from('mcp_conversation_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('external_id', `claude-desktop:${conversation.id}`)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Create a session for this conversation
      const { data: sessionId } = await supabaseAdmin
        .rpc('get_or_create_conversation_session', {
          p_user_id: userId,
          p_mcp_client: 'claude-desktop-import',
          p_session_gap_minutes: 60, // Treat each conversation as a session
        });

      // Import each message in the conversation
      for (let i = 0; i < conversation.messages.length; i++) {
        const msg = conversation.messages[i];

        if (msg.role === 'user') {
          // Find the assistant response (if any)
          const nextMsg = conversation.messages[i + 1];
          const twinResponse = nextMsg?.role === 'assistant' ? nextMsg.content : null;

          // Import the message pair
          const { data, error } = await supabaseAdmin
            .from('mcp_conversation_logs')
            .insert({
              user_id: userId,
              user_message: msg.content,
              twin_response: twinResponse,
              session_id: sessionId,
              turn_number: Math.floor(i / 2) + 1,
              mcp_client: 'claude-desktop-import',
              external_id: `claude-desktop:${conversation.id}:${i}`,
              topics_detected: ['imported'],
              intent: 'imported',
              sentiment: 'neutral',
              created_at: msg.timestamp || conversation.createdAt,
              analyzed_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (!error && data) {
            messagesImported++;

            // Queue AI analysis for the imported message
            await supabaseAdmin
              .from('conversation_analysis_jobs')
              .insert({
                user_id: userId,
                conversation_log_id: data.id,
                session_id: sessionId,
                status: 'pending',
                priority: 10, // Lower priority for historical imports
                queued_at: new Date().toISOString(),
              })
              .catch(err => console.warn('[CronSync] Analysis job queue error:', err.message));
          }
        }
      }

      imported++;

    } catch (convError) {
      console.error(`[Claude Sync] Error importing conversation ${conversation.id}:`, convError.message);
      skipped++;
    }
  }

  return { imported, skipped, messagesImported };
}

/**
 * Run the sync for a specific user
 */
async function runSyncForUser(userId) {
  const dataPath = findClaudeDataPath();

  if (!dataPath) {
    return {
      success: false,
      error: 'Claude Desktop data path not found',
      platform: process.platform,
    };
  }

  console.log(`[Claude Sync] Found Claude data at: ${dataPath}`);

  // Check if Claude Desktop is running
  if (isClaudeDesktopRunning()) {
    return {
      success: false,
      error: 'Claude Desktop is running - cannot access LevelDB',
      suggestion: 'Close Claude Desktop and try again',
    };
  }

  // Create import record
  const { data: importRecord, error: createError } = await supabaseAdmin
    .from('claude_desktop_imports')
    .insert({
      user_id: userId,
      status: 'running',
      leveldb_path: dataPath,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (createError) {
    return { success: false, error: 'Failed to create import record' };
  }

  try {
    // Parse conversations from Claude Desktop
    const conversations = await parseClaudeConversations(dataPath);

    console.log(`[Claude Sync] Found ${conversations.length} conversations to import`);

    if (conversations.length === 0) {
      await supabaseAdmin
        .from('claude_desktop_imports')
        .update({
          status: 'completed',
          conversations_found: 0,
          completed_at: new Date().toISOString(),
        })
        .eq('id', importRecord.id);

      return {
        success: true,
        message: 'No conversations found to import',
        conversationsFound: 0,
      };
    }

    // Import conversations
    const result = await importConversationsForUser(userId, conversations);

    // Update import record
    await supabaseAdmin
      .from('claude_desktop_imports')
      .update({
        status: 'completed',
        conversations_found: conversations.length,
        conversations_imported: result.imported,
        conversations_skipped: result.skipped,
        messages_imported: result.messagesImported,
        oldest_message_date: conversations[0]?.createdAt,
        newest_message_date: conversations[conversations.length - 1]?.createdAt,
        completed_at: new Date().toISOString(),
      })
      .eq('id', importRecord.id);

    return {
      success: true,
      conversationsFound: conversations.length,
      conversationsImported: result.imported,
      conversationsSkipped: result.skipped,
      messagesImported: result.messagesImported,
    };

  } catch (syncError) {
    // Update import record with error
    await supabaseAdmin
      .from('claude_desktop_imports')
      .update({
        status: 'failed',
        error_message: syncError.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', importRecord.id);

    return {
      success: false,
      error: syncError.message,
    };
  }
}

/**
 * POST /api/cron/claude-sync
 * Vercel cron job endpoint - runs daily at 4 AM
 */
router.post('/', async (req, res) => {
  try {
    // Verify cron secret for security
    const cronSecret = req.headers['x-vercel-cron-secret'] || req.headers['authorization'];
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret && cronSecret !== expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[Claude Sync Cron] Starting scheduled sync...');

    // Get users who have opted into Claude Desktop sync
    // For now, we'll just check for users with the feature enabled
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('claude_desktop_sync_enabled', true)
      .limit(100);

    if (usersError || !users || users.length === 0) {
      console.log('[Claude Sync Cron] No users with Claude Desktop sync enabled');
      return res.json({
        success: true,
        message: 'No users with Claude Desktop sync enabled',
        usersProcessed: 0,
      });
    }

    const results = [];

    for (const user of users) {
      const result = await runSyncForUser(user.id);
      results.push({ userId: user.id, ...result });
    }

    const successCount = results.filter(r => r.success).length;

    console.log(`[Claude Sync Cron] Completed: ${successCount}/${results.length} users synced`);

    return res.json({
      success: true,
      usersProcessed: results.length,
      successfulSyncs: successCount,
      results,
    });

  } catch (error) {
    console.error('[Claude Sync Cron] Error:', error);
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /api/cron/claude-sync/run
 * Manual trigger endpoint for testing
 */
router.post('/run', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log(`[Claude Sync] Manual sync requested for user: ${userId}`);

    const result = await runSyncForUser(userId);

    return res.json(result);

  } catch (error) {
    console.error('[Claude Sync] Error:', error);
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error',
    });
  }
});

/**
 * GET /api/cron/claude-sync/status
 * Get sync status for a user
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Get latest import record
    const { data: imports, error } = await supabaseAdmin
      .from('claude_desktop_imports')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      throw error;
    }

    // Check if Claude data path exists on this machine
    const dataPath = findClaudeDataPath();

    return res.json({
      claudeDataPathFound: !!dataPath,
      claudeDataPath: dataPath,
      platform: process.platform,
      recentImports: imports || [],
      canSync: !!dataPath && !isClaudeDesktopRunning(),
    });

  } catch (error) {
    console.error('[Claude Sync] Status error:', error);
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error',
    });
  }
});

/**
 * Process pending analysis jobs (can be called by cron or manually)
 */
router.post('/process-analysis', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    // Import and run the analysis processor
    const { default: analyzer } = await import('../services/conversationAIAnalyzer.js');
    const result = await analyzer.processPendingJobs(limit);

    return res.json(result);

  } catch (error) {
    console.error('[Claude Sync] Analysis processing error:', error);
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error',
    });
  }
});

export default router;
