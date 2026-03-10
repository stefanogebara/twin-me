/**
 * Conversation Learning Service — Log and analyze conversations for style learning
 *
 * Provides conversation logging to DB and writing style analysis
 * for the MCP server and twin-chat integration.
 */

import { supabaseAdmin } from './database.js';

/**
 * Log a conversation exchange to the database.
 *
 * @param {{ userId: string, role: string, content: string, metadata?: object }} params
 */
export async function logConversationToDatabase({ userId, role, content, metadata = {} }) {
  try {
    const { error } = await supabaseAdmin
      .from('twin_messages')
      .insert({
        user_id: userId,
        role,
        content,
        metadata,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.warn('[ConversationLearning] Log error:', error.message);
    }
  } catch (err) {
    console.warn('[ConversationLearning] logConversationToDatabase error:', err.message);
  }
}

/**
 * Get the user's writing profile from recent conversations.
 * Returns style metrics like average message length, vocabulary, etc.
 *
 * @param {string} userId
 * @returns {object|null}
 */
export async function getUserWritingProfile(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('twin_messages')
      .select('content')
      .eq('user_id', userId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data?.length) return null;

    const messages = data.map(d => d.content).filter(Boolean);
    if (messages.length < 3) return null;

    const avgLength = messages.reduce((sum, m) => sum + m.length, 0) / messages.length;
    const words = messages.flatMap(m => m.split(/\s+/));
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const vocabularyRichness = uniqueWords.size / Math.max(1, words.length);

    return {
      avgMessageLength: Math.round(avgLength),
      messageCount: messages.length,
      vocabularyRichness: Math.round(vocabularyRichness * 100) / 100,
      averageWordCount: Math.round(words.length / messages.length),
    };
  } catch (err) {
    console.warn('[ConversationLearning] getUserWritingProfile error:', err.message);
    return null;
  }
}

/**
 * Get recent MCP (tool-assisted) conversations for context.
 *
 * @param {string} userId
 * @param {number} limit
 * @returns {Array}
 */
export async function getRecentMcpConversations(userId, limit = 10) {
  try {
    const { data, error } = await supabaseAdmin
      .from('twin_messages')
      .select('role, content, created_at, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return data || [];
  } catch (err) {
    console.warn('[ConversationLearning] getRecentMcpConversations error:', err.message);
    return [];
  }
}

/**
 * Analyze writing style from a set of messages.
 *
 * @param {string[]} messages
 * @returns {object}
 */
export function analyzeWritingStyle(messages) {
  if (!messages?.length) {
    return { formality: 0.5, emotionalExpressiveness: 0.5, sentenceLength: 'medium', humorMarkers: 0 };
  }

  const allText = messages.join(' ');
  const sentences = allText.split(/[.!?]+/).filter(Boolean);
  const avgSentenceLen = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / Math.max(1, sentences.length);

  // Simple heuristics
  const exclamations = (allText.match(/!/g) || []).length;
  const emojis = (allText.match(/[\p{Emoji_Presentation}]/gu) || []).length;
  const formalWords = ['however', 'therefore', 'furthermore', 'moreover', 'consequently', 'nevertheless'];
  const informalWords = ['lol', 'haha', 'tbh', 'ngl', 'idk', 'bruh', 'omg'];

  const formalCount = formalWords.filter(w => allText.toLowerCase().includes(w)).length;
  const informalCount = informalWords.filter(w => allText.toLowerCase().includes(w)).length;
  const formality = Math.max(0, Math.min(1, 0.5 + (formalCount - informalCount) * 0.1));
  const emotionalExpressiveness = Math.min(1, (exclamations + emojis) / Math.max(1, messages.length) * 0.3);

  return {
    formality: Math.round(formality * 100) / 100,
    emotionalExpressiveness: Math.round(emotionalExpressiveness * 100) / 100,
    sentenceLength: avgSentenceLen < 8 ? 'short' : avgSentenceLen > 20 ? 'long' : 'medium',
    humorMarkers: informalCount,
    avgSentenceWordCount: Math.round(avgSentenceLen),
  };
}

/**
 * Get aggregate conversation statistics for a user.
 * Queries mcp_conversation_logs for source breakdown, topics, and intents.
 *
 * @param {string} userId
 * @returns {{ totalConversations: number, bySource: object, topTopics: Array, topIntents: Array }}
 */
export async function getConversationStats(userId) {
  const { data: logs, error: logsErr } = await supabaseAdmin
    .from('mcp_conversation_logs')
    .select('mcp_client, topics_detected, intent, created_at')
    .eq('user_id', userId);
  if (logsErr) console.error('[ConversationLearning] Failed to fetch conversation logs:', logsErr.message);

  if (!logs || logs.length === 0) {
    return {
      totalConversations: 0,
      bySource: {},
      topTopics: [],
      topIntents: []
    };
  }

  // Count by source
  const bySource = {};
  logs.forEach(log => {
    const source = log.mcp_client || 'unknown';
    bySource[source] = (bySource[source] || 0) + 1;
  });

  // Count topics
  const topicCounts = {};
  logs.forEach(log => {
    (log.topics_detected || []).forEach(topic => {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });
  });
  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  // Count intents
  const intentCounts = {};
  logs.forEach(log => {
    const intent = log.intent || 'unknown';
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  });
  const topIntents = Object.entries(intentCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([intent, count]) => ({ intent, count }));

  return {
    totalConversations: logs.length,
    bySource,
    topTopics,
    topIntents
  };
}
