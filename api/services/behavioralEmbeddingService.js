/**
 * Behavioral Embedding Service
 * Generates vector embeddings for Soul Observer sessions using Claude/OpenAI
 * Enables semantic similarity search for behavioral patterns
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Lazy initialization to avoid crashes if env vars not loaded yet
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

// Initialize AI clients
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
}) : null;

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}) : null;

class BehavioralEmbeddingService {

  /**
   * Generate behavioral fingerprint text from session data
   * This text will be embedded into a vector
   */
  async generateBehavioralFingerprint(sessionId) {
    try {
      const supabase = getSupabaseClient();

      // Get session data
      const { data: session, error: sessionError } = await supabase
        .from('soul_observer_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (sessionError) throw sessionError;

      // Get detected patterns for this session
      const { data: patterns, error: patternsError } = await supabase
        .from('behavioral_patterns')
        .select('*')
        .contains('behavioral_indicators', { sessionId });

      if (patternsError) throw patternsError;

      // Create behavioral fingerprint as natural language
      const fingerprint = this.createFingerprintText(session, patterns || []);

      return {
        fingerprintText: fingerprint,
        session,
        patterns
      };

    } catch (error) {
      console.error('[Behavioral Embedding] Error generating fingerprint:', error);
      throw error;
    }
  }

  /**
   * Create natural language description of behavioral session
   */
  createFingerprintText(session, patterns) {
    const parts = [];

    // Session metadata
    const duration = session.duration_seconds
      ? `${Math.round(session.duration_seconds / 60)} minutes`
      : 'unknown duration';

    parts.push(`Browsing session lasting ${duration}`);

    // Typing behavior
    if (session.typing_speed_wpm) {
      parts.push(`typing at ${Math.round(session.typing_speed_wpm)} words per minute`);
      if (session.typing_correction_rate) {
        const correctionPct = Math.round(session.typing_correction_rate * 100);
        parts.push(`with ${correctionPct}% correction rate`);
      }
    }

    // Mouse behavior
    if (session.mouse_movement_pattern) {
      parts.push(`${session.mouse_movement_pattern} mouse movements`);
    }

    // Scroll behavior
    if (session.scroll_pattern) {
      parts.push(`${session.scroll_pattern} scroll pattern`);
    }

    // Focus behavior
    if (session.focus_avg_duration) {
      const focusMin = Math.round(session.focus_avg_duration / 60);
      parts.push(`average focus duration of ${focusMin} seconds`);
    }

    // Multitasking
    if (session.multitasking_score !== null) {
      const multitaskingLevel = session.multitasking_score > 0.7 ? 'high' :
                               session.multitasking_score > 0.3 ? 'moderate' : 'low';
      parts.push(`${multitaskingLevel} multitasking`);
    }

    // Work style
    if (session.work_style_analysis) {
      parts.push(`work style: ${session.work_style_analysis}`);
    }

    // Decision making
    if (session.decision_making_style) {
      parts.push(`decision style: ${session.decision_making_style}`);
    }

    // Primary activity
    if (session.primary_activity) {
      parts.push(`primary activity: ${session.primary_activity}`);
    }

    // Detected patterns
    if (patterns.length > 0) {
      const patternNames = patterns.map(p => p.pattern_name).join(', ');
      parts.push(`behavioral patterns: ${patternNames}`);
    }

    // Personality indicators (Big Five)
    if (session.personality_indicators) {
      const traits = [];
      const indicators = session.personality_indicators;

      if (indicators.openness > 0.6) traits.push('open to experience');
      if (indicators.conscientiousness > 0.6) traits.push('conscientious');
      if (indicators.extraversion > 0.6) traits.push('extraverted');
      if (indicators.agreeableness > 0.6) traits.push('agreeable');
      if (indicators.neuroticism > 0.6) traits.push('emotionally reactive');

      if (traits.length > 0) {
        parts.push(`personality traits: ${traits.join(', ')}`);
      }
    }

    // Domains visited
    if (session.domains_visited && session.domains_visited.length > 0) {
      const domainSample = session.domains_visited.slice(0, 5).join(', ');
      parts.push(`visited domains: ${domainSample}`);
    }

    return parts.join('; ') + '.';
  }

  /**
   * Generate embedding using OpenAI (preferred for embeddings)
   */
  async generateEmbeddingOpenAI(text) {
    if (!openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small', // 1536 dimensions
        input: text,
      });

      return response.data[0].embedding;

    } catch (error) {
      console.error('[Behavioral Embedding] OpenAI embedding error:', error);
      throw error;
    }
  }

  /**
   * Generate embedding using Claude (fallback)
   * Note: Claude doesn't have native embeddings, so we use a workaround
   */
  async generateEmbeddingClaude(text) {
    if (!anthropic) {
      throw new Error('Anthropic API key not configured');
    }

    try {
      // Use Claude to generate a semantic summary, then hash it to vector
      // This is a simplified approach - ideally use a dedicated embedding model
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Generate a brief semantic summary of this behavioral pattern (max 50 words): ${text}`
        }]
      });

      const summary = response.content[0].text;

      // Convert summary to pseudo-embedding (simplified)
      // In production, use a proper embedding model
      const embedding = this.textToVector(summary);

      return embedding;

    } catch (error) {
      console.error('[Behavioral Embedding] Claude embedding error:', error);
      throw error;
    }
  }

  /**
   * Simple text-to-vector conversion (fallback method)
   * WARNING: This is a simplified approach. Use OpenAI embeddings in production.
   */
  textToVector(text, dimensions = 1536) {
    const vector = new Array(dimensions).fill(0);

    // Simple character-based hashing
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const index = charCode % dimensions;
      vector[index] += charCode / 1000;
    }

    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(val => val / magnitude);
  }

  /**
   * Generate and store embedding for a session
   */
  async embedSession(userId, sessionId) {
    try {
      console.log(`[Behavioral Embedding] Generating embedding for session ${sessionId}`);

      // Step 1: Generate behavioral fingerprint
      const { fingerprintText, session, patterns } = await this.generateBehavioralFingerprint(sessionId);

      console.log('[Behavioral Embedding] Fingerprint:', fingerprintText);

      // Step 2: Generate vector embedding
      let embedding;
      if (openai) {
        embedding = await this.generateEmbeddingOpenAI(fingerprintText);
        console.log('[Behavioral Embedding] Generated OpenAI embedding (1536 dimensions)');
      } else if (anthropic) {
        embedding = await this.generateEmbeddingClaude(fingerprintText);
        console.log('[Behavioral Embedding] Generated Claude-based embedding (1536 dimensions)');
      } else {
        embedding = this.textToVector(fingerprintText);
        console.log('[Behavioral Embedding] Generated fallback embedding (1536 dimensions)');
      }

      // Step 3: Extract metadata
      const sessionDate = new Date(session.started_at).toISOString().split('T')[0];
      const dominantPatterns = patterns.map(p => p.pattern_name);

      // Step 4: Store embedding in database
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('user_behavioral_embeddings')
        .insert({
          user_id: userId,
          session_id: session.id,
          embedding,
          fingerprint_text: fingerprintText,
          session_date: sessionDate,
          primary_activity: session.primary_activity,
          dominant_patterns: dominantPatterns,
          personality_snapshot: session.personality_indicators || {},
          contexts: [],
          domains: session.domains_visited || []
        })
        .select()
        .single();

      if (error) {
        console.error('[Behavioral Embedding] Error storing embedding:', error);
        throw error;
      }

      console.log(`[Behavioral Embedding] Stored embedding for session ${sessionId}`);

      // Step 5: Update session to mark embeddings generated
      await supabase
        .from('soul_observer_sessions')
        .update({ embeddings_generated: true })
        .eq('session_id', sessionId);

      return {
        success: true,
        embeddingId: data.id,
        fingerprintText,
        dimensions: embedding.length
      };

    } catch (error) {
      console.error('[Behavioral Embedding] Error in embedSession:', error);
      throw error;
    }
  }

  /**
   * Find similar behavioral sessions using vector similarity
   */
  async findSimilarSessions(userId, sessionId, limit = 10) {
    try {
      const supabase = getSupabaseClient();

      // Get the embedding for the target session
      const { data: targetEmbedding, error: targetError } = await supabase
        .from('user_behavioral_embeddings')
        .select('embedding')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .single();

      if (targetError) throw targetError;

      // Use the database function to find similar sessions
      const { data: similarSessions, error: searchError } = await supabase
        .rpc('search_similar_behavioral_sessions', {
          query_embedding: targetEmbedding.embedding,
          match_user_id: userId,
          match_activity: null,
          match_count: limit,
          similarity_threshold: 0.7
        });

      if (searchError) throw searchError;

      return {
        targetSessionId: sessionId,
        similarSessions: similarSessions || [],
        count: similarSessions?.length || 0
      };

    } catch (error) {
      console.error('[Behavioral Embedding] Error finding similar sessions:', error);
      throw error;
    }
  }

  /**
   * Batch generate embeddings for user sessions
   */
  async batchGenerateEmbeddings(userId, limit = 50) {
    try {
      const supabase = getSupabaseClient();

      // Get unprocessed sessions
      const { data: sessions, error } = await supabase
        .from('soul_observer_sessions')
        .select('session_id')
        .eq('user_id', userId)
        .eq('ai_analyzed', true)
        .eq('embeddings_generated', false)
        .limit(limit);

      if (error) throw error;

      console.log(`[Behavioral Embedding] Batch generating ${sessions.length} embeddings`);

      const results = {
        total: sessions.length,
        successful: 0,
        failed: 0
      };

      for (const session of sessions) {
        try {
          await this.embedSession(userId, session.session_id);
          results.successful++;
        } catch (err) {
          console.error(`[Behavioral Embedding] Failed to embed session ${session.session_id}:`, err);
          results.failed++;
        }
      }

      return results;

    } catch (error) {
      console.error('[Behavioral Embedding] Error in batch generation:', error);
      throw error;
    }
  }
}

export default new BehavioralEmbeddingService();
