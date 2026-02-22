/**
 * Conversation Learning Service
 *
 * Shared between MCP server and TwinMe web platform.
 * Handles:
 * - Logging conversations to unified database
 * - Analyzing writing style
 * - Extracting topics and intent
 * - Updating user writing patterns
 * - Storing learned facts from conversations
 */

import { supabaseAdmin } from './database.js';

/**
 * Analyze writing style from a message
 * This extracts patterns that help understand how the user communicates
 */
export function analyzeWritingStyle(message) {
  const words = message.split(/\s+/).filter(w => w.length > 0);
  const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, '')));

  // Count questions and exclamations
  const questionCount = (message.match(/\?/g) || []).length;
  const exclamationCount = (message.match(/!/g) || []).length;

  // Count emojis (basic pattern)
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojiCount = (message.match(emojiRegex) || []).length;

  // Calculate formality score based on various indicators
  let formalityScore = 50; // Start neutral

  // Informal indicators (reduce score)
  if (message.includes('lol') || message.includes('haha')) formalityScore -= 10;
  if (emojiCount > 0) formalityScore -= 5 * Math.min(emojiCount, 3);
  if (message.match(/\b(gonna|wanna|gotta|kinda|sorta)\b/i)) formalityScore -= 10;
  if (message.match(/\b(u|ur|r|pls|thx|ty)\b/i)) formalityScore -= 15;
  if (exclamationCount > 2) formalityScore -= 5;

  // Formal indicators (increase score)
  if (message.match(/\b(please|thank you|would you|could you)\b/i)) formalityScore += 10;
  if (message.match(/\b(however|therefore|furthermore|consequently)\b/i)) formalityScore += 15;
  if (message.match(/\b(I would|I am|do not|cannot)\b/)) formalityScore += 5;

  // Clamp to 0-100
  formalityScore = Math.max(0, Math.min(100, formalityScore));

  // Vocabulary richness
  const vocabularyRichness = words.length > 0 ? uniqueWords.size / words.length : 0;

  // Get top words (excluding common stop words)
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'although', 'though', 'after', 'before', 'when', 'i', 'me', 'my', 'myself', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'about']);

  const wordFreq = {};
  words.forEach(w => {
    const clean = w.toLowerCase().replace(/[^a-z]/g, '');
    if (clean.length > 2 && !stopWords.has(clean)) {
      wordFreq[clean] = (wordFreq[clean] || 0) + 1;
    }
  });

  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  // Simple sentiment detection
  const positiveWords = ['good', 'great', 'awesome', 'amazing', 'love', 'happy', 'excellent', 'wonderful', 'fantastic', 'perfect', 'best', 'thanks', 'thank', 'excited', 'glad'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'sad', 'angry', 'frustrated', 'annoyed', 'disappointed', 'worst', 'horrible', 'wrong', 'problem', 'issue', 'error', 'bug', 'broken'];

  const lowerMessage = message.toLowerCase();
  const positiveCount = positiveWords.filter(w => lowerMessage.includes(w)).length;
  const negativeCount = negativeWords.filter(w => lowerMessage.includes(w)).length;

  let sentiment = 'neutral';
  if (positiveCount > 0 && negativeCount > 0) sentiment = 'mixed';
  else if (positiveCount > negativeCount) sentiment = 'positive';
  else if (negativeCount > positiveCount) sentiment = 'negative';

  return {
    messageLength: message.length,
    wordCount: words.length,
    sentenceCount: sentences.length,
    avgSentenceLength: sentences.length > 0 ? words.length / sentences.length : 0,
    questionCount,
    exclamationCount,
    emojiCount,
    formalityScore,
    vocabularyRichness: Math.round(vocabularyRichness * 100) / 100,
    topWords,
    detectedLanguage: 'en',
    sentiment
  };
}

/**
 * Detect topics/themes in a message
 */
export function detectTopics(message) {
  const topics = [];
  const lower = message.toLowerCase();

  const topicPatterns = [
    ['health', /\b(health|recovery|sleep|hrv|heart rate|whoop|fitness|exercise|workout|energy)\b/i],
    ['music', /\b(music|spotify|song|playlist|artist|listening|track|album|genre)\b/i],
    ['schedule', /\b(calendar|meeting|event|schedule|appointment|busy|free|tomorrow|today|week)\b/i],
    ['personality', /\b(personality|trait|pattern|behavior|soul|signature|who am i|about me|myself)\b/i],
    ['mood', /\b(mood|feeling|emotion|happy|sad|stressed|anxious|excited|tired)\b/i],
    ['work', /\b(work|job|project|task|deadline|office|career|professional)\b/i],
    ['productivity', /\b(productive|focus|concentrate|efficiency|goals|accomplish|achieve)\b/i],
    ['relationships', /\b(friend|family|relationship|social|people|connection|meeting someone)\b/i],
    ['learning', /\b(learn|study|course|knowledge|skill|improve|develop|growth)\b/i],
    ['recommendation', /\b(recommend|suggest|advice|what should|help me|guide)\b/i],
    ['reflection', /\b(think|reflect|wonder|realize|notice|observe|pattern)\b/i],
    ['planning', /\b(plan|prepare|organize|strategy|next|future|goal)\b/i],
  ];

  topicPatterns.forEach(([topic, pattern]) => {
    if (pattern.test(lower)) {
      topics.push(topic);
    }
  });

  // Return empty array instead of 'general' - vague topics aren't useful
  return topics;
}

/**
 * Detect the user's intent/what they're asking for
 */
export function detectIntent(message) {
  const lower = message.toLowerCase();

  if (/\b(how am i|how.*doing|what.*state|check.*on me)\b/i.test(lower)) {
    return 'status_check';
  }
  if (/\b(what.*pattern|what.*notice|what.*learn|tell.*about.*me)\b/i.test(lower)) {
    return 'self_discovery';
  }
  if (/\b(recommend|suggest|what should|help me decide|advice)\b/i.test(lower)) {
    return 'recommendation';
  }
  if (/\b(why|explain|how does|what is|tell me about)\b/i.test(lower)) {
    return 'information';
  }
  if (/\b(predict|forecast|what will|tomorrow|future|upcoming)\b/i.test(lower)) {
    return 'prediction';
  }
  if (/\b(remind|remember|don't forget|note that)\b/i.test(lower)) {
    return 'memory_storage';
  }
  if (/\b(hi|hello|hey|good morning|good evening)\b/i.test(lower)) {
    return 'greeting';
  }
  if (/\b(thanks|thank you|appreciate|great job)\b/i.test(lower)) {
    return 'gratitude';
  }
  if (/\?$/.test(message.trim())) {
    return 'question';
  }

  return 'conversation';
}

/**
 * Log a conversation to the database for learning
 * Works for both MCP and web platform conversations
 */
export async function logConversationToDatabase(entry) {
  try {
    const writingAnalysis = analyzeWritingStyle(entry.userMessage);
    const topicsDetected = detectTopics(entry.userMessage);
    const intent = detectIntent(entry.userMessage);

    console.log('[Conversation Learning] Logging conversation:', {
      userId: entry.userId,
      source: entry.source || 'web',
      messageLength: entry.userMessage.length,
      topics: topicsDetected,
      intent,
      sentiment: writingAnalysis.sentiment
    });

    const { data, error } = await supabaseAdmin
      .from('mcp_conversation_logs')
      .insert({
        user_id: entry.userId,
        user_message: entry.userMessage,
        twin_response: entry.twinResponse,
        platforms_context: entry.platformsContext || {},
        brain_stats: entry.brainStats || {},
        writing_analysis: writingAnalysis,
        topics_detected: topicsDetected,
        intent,
        sentiment: writingAnalysis.sentiment,
        mcp_client: entry.source || 'twinme_web',
        session_id: entry.sessionId || entry.conversationId,
        analyzed_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Conversation Learning] Failed to log:', error);
      return null;
    }

    // Update aggregated writing patterns asynchronously
    updateUserWritingPatterns(entry.userId, writingAnalysis).catch(err => {
      console.error('[Conversation Learning] Failed to update patterns:', err);
    });

    // Store learned facts from the conversation
    await storeLearnedFacts(entry.userId, entry.userMessage, topicsDetected, intent);

    return data?.id || null;

  } catch (err) {
    console.error('[Conversation Learning] Error:', err);
    return null;
  }
}

/**
 * Update aggregated writing patterns for a user
 */
async function updateUserWritingPatterns(userId, analysis) {
  // Get existing patterns
  const { data: existing } = await supabaseAdmin
    .from('user_writing_patterns')
    .select('*')
    .eq('user_id', userId)
    .single();

  const totalConversations = (existing?.total_conversations || 0) + 1;
  const totalWords = (existing?.total_words_analyzed || 0) + analysis.wordCount;

  // Calculate running averages
  const avgMessageLength = existing
    ? ((existing.avg_message_length * existing.total_conversations) + analysis.messageLength) / totalConversations
    : analysis.messageLength;

  const avgSentenceLength = existing
    ? ((existing.avg_sentence_length * existing.total_conversations) + analysis.avgSentenceLength) / totalConversations
    : analysis.avgSentenceLength;

  const formalityScore = existing
    ? ((existing.formality_score * existing.total_conversations) + analysis.formalityScore) / totalConversations
    : analysis.formalityScore;

  const vocabularyRichness = existing
    ? ((existing.vocabulary_richness * existing.total_conversations) + analysis.vocabularyRichness) / totalConversations
    : analysis.vocabularyRichness;

  // Merge common topics
  const existingTopics = existing?.common_topics || [];
  const newTopics = analysis.topWords.slice(0, 5);
  const mergedTopics = [...new Set([...existingTopics, ...newTopics])].slice(0, 20);

  // Calculate question frequency
  const questionFrequency = existing
    ? ((existing.question_frequency * existing.total_conversations) + analysis.questionCount) / totalConversations
    : analysis.questionCount;

  // Calculate emoji frequency
  const emojiPer100 = analysis.wordCount > 0 ? (analysis.emojiCount / analysis.wordCount) * 100 : 0;
  const emojiFrequency = existing
    ? ((existing.emoji_frequency * existing.total_conversations) + emojiPer100) / totalConversations
    : emojiPer100;

  // Derive personality indicators
  const curiosityScore = Math.min(100, 50 + (analysis.questionCount * 10));
  const detailOrientation = Math.min(100, analysis.avgSentenceLength * 5);
  const assertiveness = 100 - analysis.questionCount * 5 + analysis.exclamationCount * 5;

  // Upsert the patterns
  const { error: patternsErr } = await supabaseAdmin
    .from('user_writing_patterns')
    .upsert({
      user_id: userId,
      avg_message_length: Math.round(avgMessageLength),
      avg_sentence_length: Math.round(avgSentenceLength * 10) / 10,
      vocabulary_richness: Math.round(vocabularyRichness * 100) / 100,
      formality_score: Math.round(formalityScore),
      emoji_frequency: Math.round(emojiFrequency * 100) / 100,
      question_frequency: Math.round(questionFrequency * 100) / 100,
      common_topics: mergedTopics,
      curiosity_score: Math.max(0, Math.min(100, Math.round(curiosityScore))),
      detail_orientation: Math.max(0, Math.min(100, Math.round(detailOrientation))),
      assertiveness_score: Math.max(0, Math.min(100, Math.round(assertiveness))),
      total_conversations: totalConversations,
      total_words_analyzed: totalWords,
      last_updated: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });
  if (patternsErr) console.warn('[ConversationLearning] Failed to upsert writing patterns:', patternsErr.message);
}

/**
 * Extract and store learned facts from conversation
 */
async function storeLearnedFacts(userId, message, topics, intent) {
  // Only store certain intents as learned facts
  if (!['memory_storage', 'self_discovery', 'status_check'].includes(intent)) {
    return;
  }

  const factPatterns = [
    ['preference', /I (?:like|love|prefer|enjoy|hate|dislike) (.+?)(?:\.|,|$)/i],
    ['identity', /I am (?:a |an )?(.+?)(?:\.|,|$)/i],
    ['habit', /I (?:usually|always|often|sometimes|never) (.+?)(?:\.|,|$)/i],
    ['goal', /I (?:want to|need to|plan to|hope to) (.+?)(?:\.|,|$)/i],
    ['feeling', /I (?:feel|am feeling) (.+?)(?:\.|,|$)/i],
  ];

  for (const [category, pattern] of factPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const factValue = match[1].trim();
      if (factValue.length > 3 && factValue.length < 200) {
        const { error: factInsertErr } = await supabaseAdmin
          .from('learned_facts')
          .insert({
            user_id: userId,
            category,
            key: category,
            value: factValue,
            source: 'conversation',
            confidence: 0.7,
            created_at: new Date().toISOString()
          });
        if (factInsertErr && !factInsertErr.message?.includes('duplicate')) {
          console.warn('[ConversationLearning] Failed to insert learned fact:', factInsertErr.message);
        }
      }
    }
  }

  // Store topics as interests
  if (topics.length > 0 && topics[0] !== 'general') {
    for (const topic of topics.slice(0, 2)) {
      const { error: insertErr } = await supabaseAdmin
        .from('learned_facts')
        .insert({
          user_id: userId,
          category: 'interest',
          key: 'topic_discussed',
          value: topic,
          source: 'conversation',
          confidence: 0.5,
          created_at: new Date().toISOString()
        });
      // Ignore duplicates
      if (insertErr) { /* expected for duplicate topics */ }
    }
  }
}

/**
 * Get recent conversations (from both MCP and web)
 */
export async function getRecentMcpConversations(userId, limit = 10) {
  const { data, error } = await supabaseAdmin
    .from('mcp_conversation_logs')
    .select('user_message, twin_response, created_at, mcp_client, topics_detected, intent')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map(row => ({
    userMessage: row.user_message,
    twinResponse: row.twin_response,
    createdAt: row.created_at,
    source: row.mcp_client,
    topics: row.topics_detected,
    intent: row.intent
  }));
}

/**
 * Get writing patterns summary for inclusion in twin context
 */
export async function getUserWritingProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('user_writing_patterns')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    communicationStyle: data.formality_score >= 60 ? 'formal' : data.formality_score >= 40 ? 'balanced' : 'casual',
    formalityScore: data.formality_score,
    usesEmojis: data.emoji_frequency > 0.5,
    asksQuestions: data.question_frequency > 0.3,
    messageLength: data.avg_message_length > 100 ? 'detailed' : data.avg_message_length > 30 ? 'moderate' : 'brief',
    vocabularyRichness: data.vocabulary_richness > 0.7 ? 'diverse' : data.vocabulary_richness > 0.5 ? 'moderate' : 'focused',
    personalityIndicators: {
      curiosity: data.curiosity_score,
      detailOrientation: data.detail_orientation,
      assertiveness: data.assertiveness_score
    },
    commonTopics: data.common_topics || [],
    totalConversations: data.total_conversations,
    totalWordsAnalyzed: data.total_words_analyzed
  };
}

/**
 * Get conversation statistics for a user
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
