#!/usr/bin/env node

/**
 * Claude Desktop Conversation Sync
 *
 * Extracts conversation history from Claude Desktop's local storage
 * and syncs it to TwinMe's database for the digital twin to learn from.
 *
 * Usage:
 *   node sync-claude-conversations.js [--user-id <uuid>] [--dry-run]
 *
 * IMPORTANT: Close Claude Desktop before running this script!
 * The LevelDB files are locked while the app is running.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '..', '.env') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Configuration
const CLAUDE_DATA_PATH = process.platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Roaming', 'Claude')
  : path.join(os.homedir(), 'Library', 'Application Support', 'Claude');

const LOCAL_STORAGE_PATH = path.join(CLAUDE_DATA_PATH, 'Local Storage', 'leveldb');
const SESSION_STORAGE_PATH = path.join(CLAUDE_DATA_PATH, 'Session Storage');

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Read and parse LevelDB files (simplified approach without external dependencies)
 * This reads the raw .ldb files and extracts text content
 */
async function extractConversationsFromLevelDB(dbPath) {
  const conversations = [];

  try {
    const files = fs.readdirSync(dbPath).filter(f => f.endsWith('.ldb') || f.endsWith('.log'));

    for (const file of files) {
      const filePath = path.join(dbPath, file);
      const content = fs.readFileSync(filePath);

      // Convert to string, keeping printable characters
      const text = content.toString('utf8', 0, content.length)
        .replace(/[^\x20-\x7E\n]/g, ' ')
        .replace(/\s+/g, ' ');

      // Extract conversation-like patterns
      const extracted = extractConversationData(text, file);
      conversations.push(...extracted);
    }
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EACCES') {
      console.error('\n ERROR: Claude Desktop is running!');
      console.error('   Please close Claude Desktop and try again.\n');
      process.exit(1);
    }
    throw err;
  }

  return conversations;
}

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
      conversations.push({
        content,
        source: sourceFile,
        type: 'text_field'
      });
    }
  }

  // Pattern 2: Look for paragraph content
  const paragraphPattern = /"paragraph"[^}]*"text"\s*:\s*"([^"]{10,1000})"/g;

  while ((match = paragraphPattern.exec(text)) !== null) {
    const content = match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();

    if (content.length > 20 && !content.startsWith('{')) {
      conversations.push({
        content,
        source: sourceFile,
        type: 'paragraph'
      });
    }
  }

  // Pattern 3: Look for human/assistant message patterns
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

  // Pattern 4: Direct content extraction (compressed format)
  // Looking for patterns like: ext":"actual message content"
  const compressedPattern = /ext"\s*:\s*"([^"]{20,500})/g;

  while ((match = compressedPattern.exec(text)) !== null) {
    const content = match[1].trim();

    // Filter out code/JSON/technical content
    if (!content.includes('{') &&
        !content.includes('function') &&
        !content.includes('import ') &&
        !content.includes('const ') &&
        content.length > 20) {
      conversations.push({
        content,
        source: sourceFile,
        type: 'compressed'
      });
    }
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
    // Create a fingerprint for deduplication
    const fingerprint = conv.content.substring(0, 100).toLowerCase();

    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    // Skip very short or obviously non-conversation content
    if (conv.content.length < 30) continue;
    if (conv.content.match(/^[{}\[\]0-9,.\s]+$/)) continue;
    if (conv.content.includes('undefined') && conv.content.length < 50) continue;

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
 * Analyze extracted content for writing patterns
 */
function analyzeWritingPatterns(conversations) {
  const userMessages = conversations.filter(c => c.role === 'user' || c.role === 'unknown');

  if (userMessages.length === 0) return null;

  let totalWords = 0;
  let totalSentences = 0;
  let totalQuestions = 0;
  let totalEmojis = 0;
  const allWords = [];

  for (const msg of userMessages) {
    const words = msg.content.split(/\s+/);
    const sentences = msg.content.split(/[.!?]+/).filter(s => s.trim());
    const questions = (msg.content.match(/\?/g) || []).length;
    const emojis = (msg.content.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;

    totalWords += words.length;
    totalSentences += sentences.length;
    totalQuestions += questions;
    totalEmojis += emojis;
    allWords.push(...words.map(w => w.toLowerCase().replace(/[^a-z]/g, '')).filter(w => w.length > 3));
  }

  // Calculate word frequency
  const wordFreq = {};
  allWords.forEach(w => { wordFreq[w] = (wordFreq[w] || 0) + 1; });

  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);

  return {
    totalMessages: userMessages.length,
    avgMessageLength: Math.round(totalWords / userMessages.length),
    avgSentenceLength: totalSentences > 0 ? Math.round(totalWords / totalSentences) : 0,
    questionFrequency: totalQuestions / userMessages.length,
    emojiFrequency: totalEmojis / userMessages.length,
    topWords
  };
}

/**
 * Simple topic detection
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
 * Save extracted conversations to TwinMe database
 */
async function syncToDatabase(userId, conversations, patterns, dryRun = false) {
  console.log(`\n Extraction Summary:`);
  console.log(`   Total messages extracted: ${conversations.length}`);
  console.log(`   User messages: ${conversations.filter(c => c.role === 'user' || c.role === 'unknown').length}`);
  console.log(`   Assistant messages: ${conversations.filter(c => c.role === 'assistant').length}`);

  if (patterns) {
    console.log(`\n Writing Patterns Detected:`);
    console.log(`   Avg message length: ${patterns.avgMessageLength} words`);
    console.log(`   Questions per message: ${patterns.questionFrequency.toFixed(2)}`);
    console.log(`   Top words: ${patterns.topWords.slice(0, 10).join(', ')}`);
  }

  if (dryRun) {
    console.log('\n DRY RUN - No data saved. Sample messages:');
    conversations.slice(0, 5).forEach((c, i) => {
      console.log(`\n[${i + 1}] (${c.role}): "${c.content.substring(0, 100)}..."`);
    });
    return;
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('\n Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.error('   Run with --dry-run to see what would be extracted.\n');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('\n Syncing to TwinMe database...');

  // Store conversations as learned facts / memories
  let savedCount = 0;

  for (const conv of conversations) {
    if (conv.role === 'user' || conv.role === 'unknown') {
      // Store user messages for learning
      const { error } = await supabase
        .from('mcp_conversation_logs')
        .insert({
          user_id: userId,
          user_message: conv.content.substring(0, 2000),
          twin_response: '[Imported from Claude Desktop history]',
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

  // Update writing patterns
  if (patterns) {
    await supabase
      .from('user_writing_patterns')
      .upsert({
        user_id: userId,
        total_conversations: patterns.totalMessages,
        avg_message_length: patterns.avgMessageLength,
        avg_sentence_length: patterns.avgSentenceLength,
        question_frequency: patterns.questionFrequency,
        emoji_frequency: patterns.emojiFrequency,
        common_topics: patterns.topWords,
        last_updated: new Date().toISOString()
      }, { onConflict: 'user_id' });
  }

  console.log(` Saved ${savedCount} conversations to TwinMe!`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const userIdIndex = args.indexOf('--user-id');
  const userId = userIdIndex >= 0 ? args[userIdIndex + 1] : null;

  console.log(' Claude Desktop Conversation Sync');
  console.log('====================================\n');

  if (!userId && !dryRun) {
    console.log('No --user-id provided.');
    console.log('Use --dry-run to see what would be extracted without saving.\n');
    console.error(' Please provide --user-id <uuid> or use --dry-run');
    process.exit(1);
  }

  console.log(` Claude data path: ${CLAUDE_DATA_PATH}`);
  if (userId) console.log(` User ID: ${userId}`);
  console.log(` Dry run: ${dryRun}\n`);

  // Check if Claude Desktop is closed
  console.log(' Reading Local Storage...');
  const localStorageConvs = await extractConversationsFromLevelDB(LOCAL_STORAGE_PATH);

  console.log(' Reading Session Storage...');
  const sessionStorageConvs = await extractConversationsFromLevelDB(SESSION_STORAGE_PATH);

  // Combine and clean
  const allConversations = [...localStorageConvs, ...sessionStorageConvs];
  console.log(`\n Raw extractions: ${allConversations.length}`);

  const cleaned = cleanConversations(allConversations);
  console.log(` After deduplication: ${cleaned.length}`);

  // Analyze patterns
  const patterns = analyzeWritingPatterns(cleaned);

  // Sync to database
  await syncToDatabase(userId, cleaned, patterns, dryRun);

  console.log('\n Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
