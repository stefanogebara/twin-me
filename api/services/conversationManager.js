/**
 * Conversation Manager Service
 *
 * Manages twin chat conversations and messages in the database.
 * Handles conversation creation, message storage, history retrieval, and cleanup.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Create a new conversation
 */
export async function createConversation(options) {
  const {
    userId,
    title = 'New Conversation',
    mode = 'twin',
    twinType = 'personal',
    context = 'casual',
    metadata = {}
  } = options;

  try {
    const { data, error } = await supabase
      .from('twin_conversations')
      .insert({
        user_id: userId,
        title,
        mode,
        twin_type: twinType,
        context,
        metadata
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[ConversationManager] Created conversation ${data.id} for user ${userId}`);
    return data;
  } catch (error) {
    console.error('[ConversationManager] Error creating conversation:', error);
    throw error;
  }
}

/**
 * Get conversation by ID
 */
export async function getConversation(conversationId, userId) {
  try {
    const { data, error } = await supabase
      .from('twin_conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('[ConversationManager] Error getting conversation:', error);
    throw error;
  }
}

/**
 * Get all conversations for a user
 */
export async function getUserConversations(userId, options = {}) {
  const {
    limit = 20,
    offset = 0,
    mode = null
  } = options;

  try {
    let query = supabase
      .from('twin_conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (mode) {
      query = query.eq('mode', mode);
    }

    const { data, error } = await query;

    if (error) throw error;

    console.log(`[ConversationManager] Retrieved ${data.length} conversations for user ${userId}`);
    return data;
  } catch (error) {
    console.error('[ConversationManager] Error getting conversations:', error);
    throw error;
  }
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(conversationId, userId, title) {
  try {
    const { data, error } = await supabase
      .from('twin_conversations')
      .update({ title })
      .eq('id', conversationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    console.log(`[ConversationManager] Updated conversation ${conversationId} title to "${title}"`);
    return data;
  } catch (error) {
    console.error('[ConversationManager] Error updating title:', error);
    throw error;
  }
}

/**
 * Delete conversation and all its messages
 */
export async function deleteConversation(conversationId, userId) {
  try {
    // Verify ownership before deleting
    const { data: conversation, error: getError } = await supabase
      .from('twin_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    if (getError) throw getError;
    if (!conversation) {
      throw new Error('Conversation not found or access denied');
    }

    // Delete conversation (messages will cascade delete)
    const { error: deleteError } = await supabase
      .from('twin_conversations')
      .delete()
      .eq('id', conversationId);

    if (deleteError) throw deleteError;

    console.log(`[ConversationManager] Deleted conversation ${conversationId}`);
    return { success: true };
  } catch (error) {
    console.error('[ConversationManager] Error deleting conversation:', error);
    throw error;
  }
}

/**
 * Add a message to a conversation
 */
export async function addMessage(options) {
  const {
    conversationId,
    role,
    content,
    tokensUsed = 0,
    metadata = {}
  } = options;

  try {
    const { data, error } = await supabase
      .from('twin_messages')
      .insert({
        conversation_id: conversationId,
        role,
        content,
        tokens_used: tokensUsed,
        metadata
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[ConversationManager] Added ${role} message to conversation ${conversationId}`);
    return data;
  } catch (error) {
    console.error('[ConversationManager] Error adding message:', error);
    throw error;
  }
}

/**
 * Get all messages for a conversation
 */
export async function getConversationMessages(conversationId, userId, options = {}) {
  const {
    limit = 100,
    offset = 0
  } = options;

  try {
    // First verify the conversation belongs to the user
    const conversation = await getConversation(conversationId, userId);
    if (!conversation) {
      throw new Error('Conversation not found or access denied');
    }

    // Get messages
    const { data, error } = await supabase
      .from('twin_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    console.log(`[ConversationManager] Retrieved ${data.length} messages for conversation ${conversationId}`);
    return data;
  } catch (error) {
    console.error('[ConversationManager] Error getting messages:', error);
    throw error;
  }
}

/**
 * Rate a message
 */
export async function rateMessage(messageId, conversationId, userId, rating) {
  try {
    // Verify message belongs to user's conversation
    const conversation = await getConversation(conversationId, userId);
    if (!conversation) {
      throw new Error('Conversation not found or access denied');
    }

    const { data, error } = await supabase
      .from('twin_messages')
      .update({ rating })
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .select()
      .single();

    if (error) throw error;

    console.log(`[ConversationManager] Rated message ${messageId} with ${rating} stars`);
    return data;
  } catch (error) {
    console.error('[ConversationManager] Error rating message:', error);
    throw error;
  }
}

/**
 * Track token usage for a conversation
 */
export async function trackUsage(options) {
  const {
    userId,
    conversationId,
    tokensUsed,
    estimatedCost
  } = options;

  try {
    const { data, error } = await supabase
      .from('twin_chat_usage')
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        tokens_used: tokensUsed,
        estimated_cost: estimatedCost
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[ConversationManager] Tracked usage: ${tokensUsed} tokens, $${estimatedCost.toFixed(4)}`);
    return data;
  } catch (error) {
    console.error('[ConversationManager] Error tracking usage:', error);
    // Don't throw - usage tracking shouldn't break the chat
    return null;
  }
}

/**
 * Get user's total usage statistics
 */
export async function getUserUsageStats(userId, options = {}) {
  const {
    period = '30d' // '24h', '7d', '30d', 'all'
  } = options;

  try {
    let query = supabase
      .from('twin_chat_usage')
      .select('tokens_used, estimated_cost')
      .eq('user_id', userId);

    // Add time filter
    if (period !== 'all') {
      const now = new Date();
      let startDate;

      switch (period) {
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      if (startDate) {
        query = query.gte('created_at', startDate.toISOString());
      }
    }

    const { data, error } = await query;

    if (error) throw error;

    // Calculate totals
    const totalTokens = data.reduce((sum, record) => sum + record.tokens_used, 0);
    const totalCost = data.reduce((sum, record) => sum + parseFloat(record.estimated_cost), 0);

    return {
      period,
      total_requests: data.length,
      total_tokens: totalTokens,
      total_cost: totalCost,
      avg_tokens_per_request: data.length > 0 ? Math.round(totalTokens / data.length) : 0
    };
  } catch (error) {
    console.error('[ConversationManager] Error getting usage stats:', error);
    throw error;
  }
}

/**
 * Get conversation history formatted for AI context
 */
export async function getFormattedHistory(conversationId, userId, options = {}) {
  const {
    maxMessages = 20,
    includeSystem = false
  } = options;

  try {
    const messages = await getConversationMessages(conversationId, userId, {
      limit: maxMessages
    });

    // Filter out system messages if requested
    const filteredMessages = includeSystem ?
      messages :
      messages.filter(m => m.role !== 'system');

    // Format for AI API
    return filteredMessages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.created_at
    }));
  } catch (error) {
    console.error('[ConversationManager] Error getting formatted history:', error);
    throw error;
  }
}

/**
 * Clean up old conversations (optional maintenance)
 */
export async function cleanupOldConversations(daysOld = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { data, error } = await supabase
      .from('twin_conversations')
      .delete()
      .lt('updated_at', cutoffDate.toISOString())
      .select();

    if (error) throw error;

    console.log(`[ConversationManager] Cleaned up ${data.length} conversations older than ${daysOld} days`);
    return { deleted: data.length };
  } catch (error) {
    console.error('[ConversationManager] Error cleaning up conversations:', error);
    throw error;
  }
}

/**
 * Get conversation stats for a user
 */
export async function getConversationStats(userId) {
  try {
    const { data: conversations, error: convError } = await supabase
      .from('twin_conversations')
      .select('id, mode, created_at')
      .eq('user_id', userId);

    if (convError) throw convError;

    const { data: messages, error: msgError } = await supabase
      .from('twin_messages')
      .select('conversation_id, role')
      .in('conversation_id', conversations.map(c => c.id));

    if (msgError) throw msgError;

    // Calculate stats
    const totalConversations = conversations.length;
    const totalMessages = messages.length;
    const userMessages = messages.filter(m => m.role === 'user').length;
    const assistantMessages = messages.filter(m => m.role === 'assistant').length;

    const modeBreakdown = conversations.reduce((acc, conv) => {
      acc[conv.mode] = (acc[conv.mode] || 0) + 1;
      return acc;
    }, {});

    return {
      total_conversations: totalConversations,
      total_messages: totalMessages,
      user_messages: userMessages,
      assistant_messages: assistantMessages,
      avg_messages_per_conversation: totalConversations > 0 ?
        Math.round(totalMessages / totalConversations) : 0,
      mode_breakdown: modeBreakdown
    };
  } catch (error) {
    console.error('[ConversationManager] Error getting conversation stats:', error);
    throw error;
  }
}
