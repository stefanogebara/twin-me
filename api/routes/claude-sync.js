/**
 * Claude Desktop Sync API
 *
 * Provides endpoints for syncing Claude Desktop conversations to TwinMe.
 * This runs the sync process server-side when triggered from the Settings page.
 *
 * Note: Only uses fs operations, no shell commands.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('ClaudeSync');

const router = express.Router();

// Claude Desktop data paths (Electron app)
const CLAUDE_DESKTOP_PATH = process.platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Roaming', 'Claude')
  : path.join(os.homedir(), 'Library', 'Application Support', 'Claude');

// Claude Code (CLI) data paths - this is where most conversations are stored
const CLAUDE_CODE_PATH = path.join(os.homedir(), '.claude');

const LOCAL_STORAGE_PATH = path.join(CLAUDE_DESKTOP_PATH, 'Local Storage', 'leveldb');
const SESSION_STORAGE_PATH = path.join(CLAUDE_DESKTOP_PATH, 'Session Storage');
const CLAUDE_HISTORY_PATH = path.join(CLAUDE_CODE_PATH, 'history.jsonl');
const CLAUDE_PROJECTS_PATH = path.join(CLAUDE_CODE_PATH, 'projects');

/**
 * Extract conversation data from raw text
 */
function extractConversationData(text, sourceFile) {
  const conversations = [];

  // Pattern 1: Look for message content with "text" field
  const textPattern = /"text"\s*:\s*"([^"]{10,1000})"/g;
  let match;

  while ((match = textPattern.exec(text)) !== null) {
    const content = match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();

    if (content.length > 20 && !content.startsWith('{') && !content.includes('function')) {
      conversations.push({ content, source: sourceFile, type: 'text_field' });
    }
  }

  // Pattern 2: Look for human/assistant message patterns
  const rolePattern = /"(human|assistant|user)"\s*:\s*"([^"]{10,2000})"/gi;

  while ((match = rolePattern.exec(text)) !== null) {
    const role = match[1].toLowerCase();
    const content = match[2]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();

    if (content.length > 20) {
      conversations.push({
        content,
        role: role === 'human' || role === 'user' ? 'user' : 'assistant',
        source: sourceFile,
        type: 'role_message'
      });
    }
  }

  return conversations;
}

/**
 * Read and parse LevelDB files (using only fs operations, no shell)
 */
async function extractConversationsFromLevelDB(dbPath) {
  const conversations = [];

  try {
    if (!fs.existsSync(dbPath)) {
      log.info(`Path not found: ${dbPath}`);
      return conversations;
    }

    const files = fs.readdirSync(dbPath).filter(f => f.endsWith('.ldb') || f.endsWith('.log'));

    for (const file of files) {
      const filePath = path.join(dbPath, file);
      try {
        const content = fs.readFileSync(filePath);
        const text = content.toString('utf8', 0, content.length)
          .replace(/[^\x20-\x7E\n]/g, ' ')
          .replace(/\s+/g, ' ');

        const extracted = extractConversationData(text, file);
        conversations.push(...extracted);
      } catch (fileErr) {
        // Skip locked files
        if (fileErr.code !== 'EBUSY' && fileErr.code !== 'EACCES') {
          log.error(`Error reading ${file}:`, fileErr.message);
        }
      }
    }
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EACCES') {
      throw new Error('Claude Desktop is running. Please close it and try again.');
    }
    throw err;
  }

  return conversations;
}

/**
 * Extract conversations from Claude Code (CLI) history.jsonl
 */
async function extractConversationsFromHistory(historyPath) {
  const conversations = [];

  try {
    if (!fs.existsSync(historyPath)) {
      log.info(`History file not found: ${historyPath}`);
      return conversations;
    }

    const content = fs.readFileSync(historyPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    log.info(`Processing ${lines.length} history entries`);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Extract the display message (user input)
        if (entry.display && typeof entry.display === 'string' && entry.display.length > 30) {
          // Clean the message - remove image references and excessive whitespace
          let cleanMessage = entry.display
            .replace(/\[Image #\d+\]/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          // Skip if it's mostly code output or error messages
          if (cleanMessage.length > 30 && !cleanMessage.match(/^[\[\]{}0-9,.\s]+$/)) {
            conversations.push({
              content: cleanMessage.substring(0, 2000),
              role: 'user',
              source: 'history.jsonl',
              type: 'claude_code_history',
              timestamp: entry.timestamp,
              project: entry.project
            });
          }
        }
      } catch (parseErr) {
        // Skip invalid JSON lines
      }
    }
  } catch (err) {
    log.error('Error reading history.jsonl:', err.message);
  }

  return conversations;
}

/**
 * Extract conversations from Claude Code projects folder
 */
async function extractConversationsFromProjects(projectsPath) {
  const conversations = [];

  try {
    if (!fs.existsSync(projectsPath)) {
      log.info(`Projects folder not found: ${projectsPath}`);
      return conversations;
    }

    const projectDirs = fs.readdirSync(projectsPath);
    log.info(`Found ${projectDirs.length} project directories`);

    for (const projectDir of projectDirs) {
      const projectPath = path.join(projectsPath, projectDir);
      const stat = fs.statSync(projectPath);

      if (!stat.isDirectory()) continue;

      // Look for conversation files (*.jsonl)
      const files = fs.readdirSync(projectPath).filter(f => f.endsWith('.jsonl'));

      for (const file of files) {
        try {
          const filePath = path.join(projectPath, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);

              // Look for user messages in conversation logs
              if (entry.type === 'user' || entry.role === 'user') {
                const message = entry.message || entry.content || entry.text;
                if (message && message.length > 30) {
                  conversations.push({
                    content: message.substring(0, 2000),
                    role: 'user',
                    source: `${projectDir}/${file}`,
                    type: 'claude_code_project',
                    timestamp: entry.timestamp
                  });
                }
              }
            } catch (parseErr) {
              // Skip invalid JSON lines
            }
          }
        } catch (fileErr) {
          // Skip unreadable files
        }
      }
    }
  } catch (err) {
    log.error('Error reading projects:', err.message);
  }

  return conversations;
}

/**
 * Deduplicate and clean extracted conversations
 */
function cleanConversations(rawConversations) {
  const seen = new Set();
  const cleaned = [];

  for (const conv of rawConversations) {
    const fingerprint = conv.content.substring(0, 100).toLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    if (conv.content.length < 30) continue;
    if (conv.content.match(/^[{}\[\]0-9,.\s]+$/)) continue;

    cleaned.push({
      content: conv.content,
      role: conv.role || 'unknown',
      extractedFrom: conv.source,
      extractionMethod: conv.type
    });
  }

  return cleaned;
}

/**
 * Detect topics in a message
 */
function detectTopics(message) {
  const topics = [];
  const lower = message.toLowerCase();

  const patterns = [
    ['coding', /\b(code|function|api|bug|error|debug|programming)\b/],
    ['ai', /\b(ai|llm|claude|gpt|model|prompt)\b/],
    ['data', /\b(data|database|sql|query|table)\b/],
    ['design', /\b(design|ui|ux|layout|style|color)\b/],
    ['business', /\b(business|market|revenue|customer|strategy)\b/],
    ['writing', /\b(write|edit|document|article|content)\b/],
    ['learning', /\b(learn|study|understand|explain|how to)\b/]
  ];

  patterns.forEach(([topic, pattern]) => {
    if (pattern.test(lower)) topics.push(topic);
  });

  return topics.length > 0 ? topics : ['general'];
}

/**
 * POST /api/claude-sync/run
 * Trigger a manual sync of Claude Desktop conversations
 */
router.post('/run', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    log.info(`Starting sync for user ${userId}`);

    // Check if any Claude data exists (Desktop or Code CLI)
    const hasDesktop = fs.existsSync(CLAUDE_DESKTOP_PATH);
    const hasCode = fs.existsSync(CLAUDE_CODE_PATH);

    if (!hasDesktop && !hasCode) {
      return res.status(404).json({
        error: 'Claude not found',
        message: 'No Claude data directory found. Make sure Claude Desktop or Claude Code is installed.'
      });
    }

    log.info(`Found: Desktop=${hasDesktop}, Code=${hasCode}`);

    // Extract conversations from all sources
    let allConversations = [];

    // 1. Claude Code (CLI) history.jsonl - PRIMARY SOURCE
    if (hasCode && fs.existsSync(CLAUDE_HISTORY_PATH)) {
      try {
        const historyConvs = await extractConversationsFromHistory(CLAUDE_HISTORY_PATH);
        log.info(`Extracted ${historyConvs.length} from history.jsonl`);
        allConversations.push(...historyConvs);
      } catch (err) {
        log.error('Error reading history:', err.message);
      }
    }

    // 2. Claude Code projects
    if (hasCode && fs.existsSync(CLAUDE_PROJECTS_PATH)) {
      try {
        const projectConvs = await extractConversationsFromProjects(CLAUDE_PROJECTS_PATH);
        log.info(`Extracted ${projectConvs.length} from projects`);
        allConversations.push(...projectConvs);
      } catch (err) {
        log.error('Error reading projects:', err.message);
      }
    }

    // 3. Claude Desktop LevelDB (fallback)
    if (hasDesktop) {
      try {
        const localStorageConvs = await extractConversationsFromLevelDB(LOCAL_STORAGE_PATH);
        allConversations.push(...localStorageConvs);
      } catch (err) {
        if (err.message.includes('Claude Desktop is running')) {
          log.info('Claude Desktop is running, skipping LevelDB');
        }
      }

      try {
        const sessionStorageConvs = await extractConversationsFromLevelDB(SESSION_STORAGE_PATH);
        allConversations.push(...sessionStorageConvs);
      } catch (err) {
        // Session storage might not exist, that's ok
      }
    }

    log.info(`Raw extractions: ${allConversations.length}`);

    const cleaned = cleanConversations(allConversations);
    log.info(`After deduplication: ${cleaned.length}`);

    // Get existing conversations to avoid duplicates
    const { data: existing } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .select('user_message')
      .eq('user_id', userId)
      .eq('mcp_client', 'claude_desktop_import');

    const existingFingerprints = new Set(
      (existing || []).map(e => e.user_message?.substring(0, 100).toLowerCase())
    );

    // Filter out already synced conversations
    const newConversations = cleaned.filter(c => {
      const fingerprint = c.content.substring(0, 100).toLowerCase();
      return !existingFingerprints.has(fingerprint);
    });

    log.info(`New conversations to sync: ${newConversations.length}`);

    // Save new conversations
    let savedCount = 0;
    for (const conv of newConversations) {
      if (conv.role === 'user' || conv.role === 'unknown') {
        const { error } = await supabaseAdmin
          .from('mcp_conversation_logs')
          .insert({
            user_id: userId,
            user_message: conv.content.substring(0, 2000),
            twin_response: '[Imported from Claude Desktop]',
            mcp_client: 'claude_desktop_import',
            writing_analysis: {
              extractedFrom: conv.extractedFrom,
              extractionMethod: conv.extractionMethod,
              importedAt: new Date().toISOString()
            },
            topics_detected: detectTopics(conv.content),
            intent: 'imported_history',
            analyzed_at: new Date().toISOString()
          });

        if (!error) savedCount++;
      }
    }

    log.info(`Saved ${savedCount} new conversations`);

    res.json({
      success: true,
      conversationsSynced: savedCount,
      totalExtracted: cleaned.length,
      alreadySynced: cleaned.length - newConversations.length,
      message: savedCount > 0
        ? `Successfully synced ${savedCount} new conversations!`
        : 'No new conversations to sync.'
    });

  } catch (error) {
    log.error('Error:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

/**
 * GET /api/claude-sync/status
 * Check if Claude Desktop or Claude Code is accessible
 */
router.get('/status', authenticateUser, async (req, res) => {
  const claudeDesktopInstalled = fs.existsSync(CLAUDE_DESKTOP_PATH);
  const claudeCodeInstalled = fs.existsSync(CLAUDE_CODE_PATH);
  const localStorageExists = fs.existsSync(LOCAL_STORAGE_PATH);
  const historyExists = fs.existsSync(CLAUDE_HISTORY_PATH);

  res.json({
    claudeInstalled: claudeDesktopInstalled || claudeCodeInstalled,
    claudeDesktopInstalled,
    claudeCodeInstalled,
    localStorageExists,
    historyExists,
    platform: process.platform
  });
});

export default router;
