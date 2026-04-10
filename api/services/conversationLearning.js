/**
 * Conversation Learning Service — log and analyze conversations for style learning.
 *
 * This service sits between the web/mobile chat surfaces and the MCP learning tables.
 * It intentionally writes to mcp_conversation_logs, which is the durable store used
 * by downstream analysis, training export, and session reflection services.
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('ConversationLearning');

const TOPIC_KEYWORDS = {
  productivity: ['plan', 'focus', 'work', 'project', 'deadline', 'task', 'meeting'],
  health: ['sleep', 'recovery', 'energy', 'health', 'workout', 'exercise', 'stress'],
  relationships: ['friend', 'partner', 'family', 'relationship', 'dating', 'people'],
  creativity: ['write', 'design', 'music', 'art', 'creative', 'build', 'idea'],
  identity: ['personality', 'pattern', 'identity', 'who am i', 'growth', 'myself'],
  technology: ['code', 'app', 'software', 'ai', 'tech', 'product'],
};

const POSITIVE_WORDS = ['good', 'great', 'excited', 'happy', 'calm', 'grateful', 'energized', 'love'];
const NEGATIVE_WORDS = ['bad', 'stressed', 'anxious', 'sad', 'overwhelmed', 'tired', 'angry', 'frustrated'];

function detectTopics(message = '') {
  const normalized = message.toLowerCase();
  const topics = Object.entries(TOPIC_KEYWORDS)
    .filter(([, keywords]) => keywords.some(keyword => normalized.includes(keyword)))
    .map(([topic]) => topic);

  return topics.length > 0 ? topics : ['general'];
}

function detectIntent(message = '') {
  const normalized = message.toLowerCase().trim();

  if (!normalized) return 'general';
  if (/(remember|note that|for future reference|don't forget)/.test(normalized)) return 'memory_storage';
  if (/(remind me|schedule|plan|todo|to-do|follow up)/.test(normalized)) return 'task_planning';
  if (/(who am i|pattern|why do i|what does this say about me)/.test(normalized)) return 'self_discovery';
  if (/(i feel|i'm feeling|i am feeling|been feeling)/.test(normalized)) return 'emotional_checkin';
  if (normalized.endsWith('?')) return 'question';

  return 'conversation';
}

function classifyMessageLength(avgWords) {
  if (avgWords < 8) return 'brief';
  if (avgWords > 20) return 'detailed';
  return 'moderate';
}

function classifyCommunicationStyle(formalityScore) {
  if (formalityScore >= 65) return 'formal';
  if (formalityScore <= 35) return 'casual';
  return 'balanced';
}

function classifyVocabularyRichness(score) {
  if (score >= 0.45) return 'diverse';
  if (score >= 0.25) return 'moderate';
  return 'focused';
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/**
 * Analyze writing style from a set of messages.
 *
 * @param {string[] | string} messages
 * @returns {object}
 */
export function analyzeWritingStyle(messages) {
  const messageList = (Array.isArray(messages) ? messages : [messages])
    .filter(Boolean)
    .map(message => String(message));

  if (messageList.length === 0) {
    return {
      formality: 0.5,
      formalityScore: 50,
      emotionalExpressiveness: 0.5,
      sentenceLength: 'medium',
      humorMarkers: 0,
      avgSentenceWordCount: 12,
      avgMessageLength: 0,
      vocabularyRichness: 0,
      emojiFrequency: 0,
      questionFrequency: 0,
      wordCount: 0,
      sentiment: 'neutral',
    };
  }

  const allText = messageList.join(' ');
  const sentences = allText.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const words = allText.trim().split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words.map(word => word.toLowerCase()));

  const exclamations = (allText.match(/!/g) || []).length;
  const questions = (allText.match(/\?/g) || []).length;
  const emojis = (allText.match(/[\p{Emoji_Presentation}]/gu) || []).length;
  const formalWords = ['however', 'therefore', 'furthermore', 'moreover', 'consequently', 'nevertheless'];
  const informalWords = ['lol', 'haha', 'tbh', 'ngl', 'idk', 'bruh', 'omg'];

  const lowered = allText.toLowerCase();
  const formalCount = formalWords.filter(word => lowered.includes(word)).length;
  const informalCount = informalWords.filter(word => lowered.includes(word)).length;
  const positiveCount = POSITIVE_WORDS.filter(word => lowered.includes(word)).length;
  const negativeCount = NEGATIVE_WORDS.filter(word => lowered.includes(word)).length;

  let sentiment = 'neutral';
  if (positiveCount > 0 && negativeCount > 0) sentiment = 'mixed';
  else if (positiveCount > negativeCount) sentiment = 'positive';
  else if (negativeCount > positiveCount) sentiment = 'negative';

  const avgSentenceLen = sentences.length > 0
    ? sentences.reduce((sum, sentence) => sum + sentence.split(/\s+/).length, 0) / sentences.length
    : words.length;

  const formality = Math.max(0, Math.min(1, 0.5 + (formalCount - informalCount) * 0.1));
  const emotionalExpressiveness = Math.min(1, (exclamations + emojis) / Math.max(1, messageList.length) * 0.3);
  const vocabularyRichness = uniqueWords.size / Math.max(1, words.length);

  return {
    formality: round(formality),
    formalityScore: Math.round(formality * 100),
    emotionalExpressiveness: round(emotionalExpressiveness),
    sentenceLength: avgSentenceLen < 8 ? 'short' : avgSentenceLen > 20 ? 'long' : 'medium',
    humorMarkers: informalCount,
    avgSentenceWordCount: Math.round(avgSentenceLen),
    avgMessageLength: Math.round(allText.length / Math.max(1, messageList.length)),
    vocabularyRichness: round(vocabularyRichness),
    emojiFrequency: round(emojis / Math.max(1, messageList.length)),
    questionFrequency: round(questions / Math.max(1, messageList.length)),
    wordCount: words.length,
    sentiment,
  };
}

function buildWritingProfileFromMessages(messages) {
  const analysis = analyzeWritingStyle(messages);

  return {
    communicationStyle: classifyCommunicationStyle(analysis.formalityScore),
    formalityScore: analysis.formalityScore,
    usesEmojis: analysis.emojiFrequency > 0.2,
    asksQuestions: analysis.questionFrequency > 0.3,
    messageLength: classifyMessageLength(analysis.avgSentenceWordCount),
    vocabularyRichness: classifyVocabularyRichness(analysis.vocabularyRichness),
    personalityIndicators: {
      curiosity: Math.min(100, Math.round(analysis.questionFrequency * 100)),
      detailOrientation: Math.min(100, analysis.avgMessageLength),
      assertiveness: Math.min(100, Math.round((analysis.emotionalExpressiveness * 60) + ((1 - analysis.formality) * 40))),
    },
    averageWordCount: analysis.avgSentenceWordCount,
    avgMessageLength: analysis.avgMessageLength,
    messageCount: messages.length,
    sentiment: analysis.sentiment,
  };
}

function normalizeStoredWritingProfile(profile) {
  return {
    communicationStyle: classifyCommunicationStyle(Number(profile.formality_score || 50)),
    formalityScore: Number(profile.formality_score || 50),
    usesEmojis: Number(profile.emoji_frequency || 0) > 0.5,
    asksQuestions: Number(profile.question_frequency || 0) > 0.3,
    messageLength: classifyMessageLength(Number(profile.avg_message_length || 12)),
    vocabularyRichness: classifyVocabularyRichness(Number(profile.vocabulary_richness || 0)),
    personalityIndicators: {
      curiosity: Number(profile.curiosity_score || 0),
      detailOrientation: Number(profile.detail_orientation || 0),
      assertiveness: Number(profile.assertiveness_score || 0),
    },
    commonTopics: profile.common_topics || [],
    totalConversations: profile.total_conversations || 0,
    totalWordsAnalyzed: profile.total_words_analyzed || 0,
  };
}

/**
 * Log a conversation exchange to the database.
 *
 * @param {{
 *   userId: string,
 *   userMessage: string,
 *   twinResponse?: string,
 *   source?: string,
 *   conversationId?: string | null,
 *   renderedSystemPrompt?: string | null,
 *   platformsContext?: object,
 *   brainStats?: object
 * }} params
 */
export async function logConversationToDatabase({
  userId,
  userMessage,
  twinResponse = null,
  source = 'twinme_web',
  conversationId = null,
  renderedSystemPrompt = null,
  platformsContext = {},
  brainStats = {},
}) {
  if (!userId || !userMessage) {
    return null;
  }

  try {
    const writingAnalysis = analyzeWritingStyle([userMessage]);
    const topicsDetected = detectTopics(userMessage);
    const intent = detectIntent(userMessage);

    const { data, error } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .insert({
        user_id: userId,
        user_message: userMessage,
        twin_response: twinResponse,
        mcp_client: source,
        platforms_context: platformsContext,
        brain_stats: {
          ...(brainStats || {}),
          ...(conversationId ? { twin_conversation_id: conversationId } : {}),
        },
        writing_analysis: writingAnalysis,
        topics_detected: topicsDetected,
        intent,
        sentiment: writingAnalysis.sentiment,
        rendered_system_prompt: renderedSystemPrompt,
        analyzed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      log.warn('Failed to log conversation', { error: error.message, userId });
      return null;
    }

    return data?.id || null;
  } catch (err) {
    log.warn('logConversationToDatabase error', { error: err.message, userId });
    return null;
  }
}

/**
 * Get the user's writing profile from stored aggregates or recent chat history.
 *
 * @param {string} userId
 * @returns {object|null}
 */
export async function getUserWritingProfile(userId) {
  try {
    const { data: aggregateProfile, error: aggregateError } = await supabaseAdmin
      .from('user_writing_patterns')
      .select('formality_score, emoji_frequency, question_frequency, avg_message_length, vocabulary_richness, curiosity_score, detail_orientation, assertiveness_score, common_topics, total_conversations, total_words_analyzed')
      .eq('user_id', userId)
      .single();

    if (!aggregateError && aggregateProfile) {
      return normalizeStoredWritingProfile(aggregateProfile);
    }

    const { data: logs, error } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .select('user_message')
      .eq('user_id', userId)
      .not('user_message', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !logs?.length) return null;

    const messages = logs.map(row => row.user_message).filter(Boolean);
    if (messages.length < 3) return null;

    return buildWritingProfileFromMessages(messages);
  } catch (err) {
    log.warn('getUserWritingProfile error', { error: err.message, userId });
    return null;
  }
}

/**
 * Get recent MCP/web conversations for context.
 *
 * @param {string} userId
 * @param {number} limit
 * @returns {Array}
 */
export async function getRecentMcpConversations(userId, limit = 10) {
  try {
    const { data, error } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .select('user_message, twin_response, created_at, mcp_client')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];

    return (data || []).map(row => ({
      userMessage: row.user_message,
      twinResponse: row.twin_response,
      createdAt: row.created_at,
      source: row.mcp_client,
    }));
  } catch (err) {
    log.warn('getRecentMcpConversations error', { error: err.message, userId });
    return [];
  }
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
  if (logsErr) log.error('Failed to fetch conversation logs:', logsErr.message);

  if (!logs || logs.length === 0) {
    return {
      totalConversations: 0,
      bySource: {},
      topTopics: [],
      topIntents: []
    };
  }

  const bySource = {};
  logs.forEach(entry => {
    const source = entry.mcp_client || 'unknown';
    bySource[source] = (bySource[source] || 0) + 1;
  });

  const topicCounts = {};
  logs.forEach(entry => {
    (entry.topics_detected || []).forEach(topic => {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });
  });
  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  const intentCounts = {};
  logs.forEach(entry => {
    const intent = entry.intent || 'unknown';
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
