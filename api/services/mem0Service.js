/**
 * Mem0-Style Memory Service for TwinMe
 *
 * Lightweight implementation using:
 * - Anthropic Claude for fact extraction (same tokens you're already using)
 * - Supabase for storage (already configured)
 *
 * Provides intelligent memory layer for:
 * 1. Conversation memory - remembering chat interactions
 * 2. Platform data memory - tracking extracted data over time
 * 3. User preferences - learning patterns from behavior
 */

import { complete, TIER_EXTRACTION } from './llmGateway.js';
import { supabaseAdmin } from './database.js';

// Memory extraction prompt
const MEMORY_EXTRACTION_PROMPT = `You are a memory extraction system. Analyze the conversation and extract key facts, preferences, and insights about the user.

Rules:
1. Extract only meaningful, reusable facts (not trivial details)
2. Focus on preferences, patterns, interests, and personal information
3. Keep each fact concise (1-2 sentences max)
4. Return facts in JSON array format

Examples of good facts:
- "User prefers jazz music, especially Miles Davis"
- "User works in software development"
- "User has low energy in mornings based on sleep patterns"
- "User is interested in AI and machine learning"

Examples of facts to skip:
- "User said hello" (trivial)
- "User asked a question" (too generic)

Conversation to analyze:
User: {userMessage}
Assistant: {assistantResponse}

Return JSON array of extracted facts. If no meaningful facts, return empty array [].
Return ONLY the JSON array, no other text.`;

/**
 * Extract facts from a conversation using Claude
 */
async function extractFacts(userMessage, assistantResponse) {
  try {
    const prompt = MEMORY_EXTRACTION_PROMPT
      .replace('{userMessage}', userMessage.substring(0, 300))
      .replace('{assistantResponse}', assistantResponse.substring(0, 300));

    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
      temperature: 0,
      serviceName: 'mem0Service'
    });

    const text = result.content || '[]';

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        console.warn('[Memory] Failed to parse fact extraction JSON:', jsonMatch[0].substring(0, 100));
        return [];
      }
    }
    return [];
  } catch (error) {
    console.error('[Memory] Fact extraction error:', error.message);
    return [];
  }
}

/**
 * Add conversation to memory
 * Extracts facts and stores them in Supabase
 */
async function addConversationMemory(userId, userMessage, assistantResponse, metadata = {}) {
  try {
    // Extract facts using Claude
    const facts = await extractFacts(userMessage, assistantResponse);

    // Store conversation reference
    const { data: convData, error: convError } = await supabaseAdmin
      .from('user_memories')
      .insert({
        user_id: userId,
        memory_type: 'conversation',
        content: userMessage.substring(0, 500),
        response: assistantResponse.substring(0, 500),
        metadata: {
          ...metadata,
          extracted_facts: facts.length,
          timestamp: new Date().toISOString()
        }
      })
      .select('id')
      .single();

    if (convError) {
      // Table might not exist yet, create it
      if (convError.code === '42P01') {
        console.warn('[Memory] user_memories table not found - creating...');
        await createMemoryTable();
        // Retry insert
        const { error: retryErr } = await supabaseAdmin.from('user_memories').insert({
          user_id: userId,
          memory_type: 'conversation',
          content: userMessage.substring(0, 500),
          response: assistantResponse.substring(0, 500),
          metadata: { ...metadata, extracted_facts: facts.length }
        });
        if (retryErr) {
          console.error('[Memory] Retry insert failed after table creation:', retryErr.message);
        }
      } else {
        console.error('[Memory] Failed to store conversation:', convError);
      }
    }

    // Store extracted facts
    if (facts.length > 0) {
      const factRecords = facts.map(fact => ({
        user_id: userId,
        memory_type: 'fact',
        content: typeof fact === 'string' ? fact : JSON.stringify(fact),
        metadata: {
          source: 'conversation',
          extracted_at: new Date().toISOString()
        }
      }));

      const { error: factsErr } = await supabaseAdmin.from('user_memories').insert(factRecords);
      if (factsErr) {
        console.error('[Memory] Failed to store facts batch:', factsErr.message);
      } else {
        console.log(`[Memory] Stored ${facts.length} facts for user ${userId}`);
      }
    }

    return { success: true, factsExtracted: facts.length };
  } catch (error) {
    console.error('[Memory] addConversationMemory error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Search memories by semantic relevance
 * Uses keyword matching (can upgrade to embeddings later)
 */
async function searchMemories(userId, query, limit = 5) {
  try {
    // Simple keyword search (can upgrade to vector search later)
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    if (keywords.length === 0) {
      return [];
    }

    // Search for memories containing keywords
    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      if (error.code === '42P01') {
        // Table doesn't exist
        return [];
      }
      console.error('[Memory] Search error:', error);
      return [];
    }

    // Score and rank by keyword matches
    const scored = data.map(mem => {
      const content = (mem.content || '').toLowerCase();
      const score = keywords.reduce((acc, kw) => {
        return acc + (content.includes(kw) ? 1 : 0);
      }, 0);
      return { ...mem, score };
    });

    // Return top matches
    return scored
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(m => ({
        memory: m.content,
        type: m.memory_type,
        timestamp: m.created_at,
        metadata: m.metadata
      }));
  } catch (error) {
    console.error('[Memory] searchMemories error:', error.message);
    return [];
  }
}

/**
 * Add platform data as memory
 */
async function addPlatformMemory(userId, platform, dataType, data) {
  try {
    const description = formatPlatformData(platform, dataType, data);

    const { error } = await supabaseAdmin
      .from('user_memories')
      .insert({
        user_id: userId,
        memory_type: 'platform_data',
        content: description,
        metadata: {
          platform,
          dataType,
          timestamp: new Date().toISOString(),
          rawData: JSON.stringify(data).substring(0, 500)
        }
      });

    if (error) {
      console.error('[Memory] Failed to store platform data:', error.message);
      return null;
    }

    console.log(`[Memory] Stored ${platform} ${dataType} for user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error('[Memory] addPlatformMemory error:', error.message);
    return null;
  }
}

/**
 * Format platform data into natural language
 */
function formatPlatformData(platform, dataType, data) {
  switch (platform) {
    case 'spotify':
      if (dataType === 'currently_playing' && data) {
        return `Listening to "${data.name}" by ${data.artist}`;
      }
      if (dataType === 'recent_tracks' && Array.isArray(data)) {
        const tracks = data.slice(0, 3).map(t => `"${t.name}"`).join(', ');
        return `Recently played: ${tracks}`;
      }
      if (dataType === 'top_artists' && Array.isArray(data)) {
        return `Top artists: ${data.slice(0, 3).join(', ')}`;
      }
      break;
    case 'whoop':
      if (dataType === 'recovery') {
        return `Recovery score: ${data.score}%`;
      }
      if (dataType === 'sleep') {
        return `Slept ${data.hours} hours`;
      }
      break;
    case 'calendar':
    case 'google_calendar':
      if (dataType === 'today_events' && Array.isArray(data)) {
        const events = data.slice(0, 3).map(e => e.summary).join(', ');
        return `Today's events: ${events || 'none'}`;
      }
      break;
  }
  return `${platform} ${dataType}: ${JSON.stringify(data).substring(0, 200)}`;
}

/**
 * Get all memories for a user
 */
async function getAllMemories(userId, limit = 20) {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (error.code === '42P01') return [];
      console.error('[Memory] getAllMemories error:', error);
      return [];
    }

    return data.map(m => ({
      id: m.id,
      memory: m.content,
      type: m.memory_type,
      timestamp: m.created_at,
      metadata: m.metadata
    }));
  } catch (error) {
    console.error('[Memory] getAllMemories error:', error.message);
    return [];
  }
}

/**
 * Add a user fact/preference
 */
async function addUserFact(userId, fact, category = 'general') {
  try {
    const { error } = await supabaseAdmin
      .from('user_memories')
      .insert({
        user_id: userId,
        memory_type: 'fact',
        content: fact,
        metadata: {
          category,
          source: 'manual',
          timestamp: new Date().toISOString()
        }
      });

    if (error) {
      console.error('[Memory] Failed to add fact:', error.message);
      return null;
    }

    console.log(`[Memory] Added fact for user ${userId}: ${fact.substring(0, 50)}...`);
    return { success: true };
  } catch (error) {
    console.error('[Memory] addUserFact error:', error.message);
    return null;
  }
}

/**
 * Delete a memory
 */
async function deleteMemory(memoryId) {
  try {
    const { error } = await supabaseAdmin
      .from('user_memories')
      .delete()
      .eq('id', memoryId);

    if (error) {
      console.error('[Memory] Delete error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Memory] deleteMemory error:', error.message);
    return false;
  }
}

/**
 * Clear all memories for a user
 */
async function clearUserMemories(userId) {
  try {
    const { error } = await supabaseAdmin
      .from('user_memories')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('[Memory] Clear error:', error);
      return false;
    }

    console.log(`[Memory] Cleared all memories for user ${userId}`);
    return true;
  } catch (error) {
    console.error('[Memory] clearUserMemories error:', error.message);
    return false;
  }
}

/**
 * Get memory statistics
 */
async function getMemoryStats(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('memory_type')
      .eq('user_id', userId);

    if (error) {
      if (error.code === '42P01') return { total: 0, byType: {} };
      console.error('[Memory] Stats error:', error);
      return { total: 0, byType: {} };
    }

    const byType = {};
    data.forEach(m => {
      byType[m.memory_type] = (byType[m.memory_type] || 0) + 1;
    });

    return {
      total: data.length,
      byType
    };
  } catch (error) {
    console.error('[Memory] getMemoryStats error:', error.message);
    return { total: 0, byType: {} };
  }
}

/**
 * Create the memory table if it doesn't exist
 */
async function createMemoryTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS user_memories (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      memory_type VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      response TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_memories_type ON user_memories(memory_type);
    CREATE INDEX IF NOT EXISTS idx_user_memories_created ON user_memories(created_at DESC);
  `;

  const { error } = await supabaseAdmin.rpc('exec_sql', { sql });
  if (error) {
    // Table might already exist or exec_sql rpc not available
    console.warn('[Memory] Could not create table via RPC:', error.message);
  } else {
    console.log('[Memory] Created user_memories table');
  }
}

// Dummy functions for compatibility (mem0 interface)
function initializeMemory() {
  console.log('[Memory] Custom memory service initialized (using Claude + Supabase)');
  return true;
}

function getMemory() {
  return true; // Service is always available
}

// Export all functions
export {
  initializeMemory,
  getMemory,
  addConversationMemory,
  searchMemories,
  addPlatformMemory,
  getAllMemories,
  deleteMemory,
  clearUserMemories,
  addUserFact,
  getMemoryStats
};

export default {
  initializeMemory,
  getMemory,
  addConversationMemory,
  searchMemories,
  addPlatformMemory,
  getAllMemories,
  deleteMemory,
  clearUserMemories,
  addUserFact,
  getMemoryStats
};
