/**
 * Soul Observer LLM Context Management
 * RAG (Retrieval-Augmented Generation) system for feeding behavioral insights to user's digital twin
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}) : null;

class SoulObserverLLMContext {

  /**
   * Generate LLM context from behavioral data
   * This creates natural language summaries that can be fed to the user's digital twin
   */
  async generateLLMContext(userId, twinId = null, daysBack = 7) {
    try {
      console.log(`[LLM Context] Generating context for user ${userId}, last ${daysBack} days`);

      // Get behavioral summary from database function
      const { data: summary, error } = await supabase
        .rpc('get_behavioral_summary', {
          target_user_id: userId,
          days_back: daysBack
        });

      if (error) throw error;

      // Get recent patterns
      const { data: patterns } = await supabase
        .from('behavioral_patterns')
        .select('*')
        .eq('user_id', userId)
        .gte('last_confirmed', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString())
        .order('confidence_score', { ascending: false })
        .limit(10);

      // Get recent insights
      const { data: insights } = await supabase
        .from('soul_observer_insights')
        .select('*')
        .eq('user_id', userId)
        .gte('generated_at', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString())
        .order('confidence', { ascending: false })
        .limit(15);

      // Generate context entries
      const contextEntries = await this.createContextEntries(userId, twinId, summary, patterns || [], insights || []);

      // Store context entries in database
      if (contextEntries.length > 0) {
        await this.storeContextEntries(contextEntries);
      }

      return {
        success: true,
        entriesGenerated: contextEntries.length,
        timePeriod: { days: daysBack },
        summary: contextEntries.map(e => e.context_text).join('\n\n')
      };

    } catch (error) {
      console.error('[LLM Context] Error generating context:', error);
      throw error;
    }
  }

  /**
   * Create context entries from behavioral data
   */
  async createContextEntries(userId, twinId, summary, patterns, insights) {
    const entries = [];
    const now = new Date().toISOString();

    // Entry 1: Behavioral Summary
    if (summary && summary.behavioral_profile) {
      const behavioralText = this.createBehavioralSummaryText(summary);

      entries.push({
        user_id: userId,
        twin_id: twinId,
        context_type: 'behavioral_summary',
        context_text: behavioralText,
        source_sessions: [],
        source_patterns: [],
        importance_score: 0.9,
        relevance_contexts: ['personality', 'work_style', 'productivity'],
        valid_from: now,
        valid_until: null // Still valid
      });
    }

    // Entry 2: Personality Traits
    if (patterns.length > 0) {
      const personalityText = this.createPersonalityTraitsText(patterns);

      entries.push({
        user_id: userId,
        twin_id: twinId,
        context_type: 'personality_trait',
        context_text: personalityText,
        source_sessions: [],
        source_patterns: patterns.map(p => p.id),
        importance_score: 0.95,
        relevance_contexts: ['personality', 'self_knowledge', 'relationships'],
        valid_from: now,
        valid_until: null
      });
    }

    // Entry 3: Work Style
    const workStylePatterns = patterns.filter(p => p.pattern_type === 'work_style');
    if (workStylePatterns.length > 0) {
      const workStyleText = this.createWorkStyleText(workStylePatterns, summary);

      entries.push({
        user_id: userId,
        twin_id: twinId,
        context_type: 'work_style',
        context_text: workStyleText,
        source_sessions: [],
        source_patterns: workStylePatterns.map(p => p.id),
        importance_score: 0.85,
        relevance_contexts: ['productivity', 'work', 'collaboration'],
        valid_from: now,
        valid_until: null
      });
    }

    // Entry 4: Decision Style
    const decisionPatterns = patterns.filter(p => p.pattern_type === 'decision_making');
    if (decisionPatterns.length > 0) {
      const decisionText = this.createDecisionStyleText(decisionPatterns);

      entries.push({
        user_id: userId,
        twin_id: twinId,
        context_type: 'decision_style',
        context_text: decisionText,
        source_sessions: [],
        source_patterns: decisionPatterns.map(p => p.id),
        importance_score: 0.88,
        relevance_contexts: ['decision_making', 'planning', 'choices'],
        valid_from: now,
        valid_until: null
      });
    }

    // Entry 5: Productivity Patterns
    const productivityPatterns = patterns.filter(p => p.pattern_type === 'productivity_rhythm');
    if (productivityPatterns.length > 0) {
      const productivityText = this.createProductivityText(productivityPatterns, summary);

      entries.push({
        user_id: userId,
        twin_id: twinId,
        context_type: 'productivity_pattern',
        context_text: productivityText,
        source_sessions: [],
        source_patterns: productivityPatterns.map(p => p.id),
        importance_score: 0.82,
        relevance_contexts: ['productivity', 'scheduling', 'time_management'],
        valid_from: now,
        valid_until: null
      });
    }

    // Entry 6: Cognitive Profile
    if (insights.length > 0) {
      const cognitiveInsights = insights.filter(i => i.insight_category === 'cognitive_state' || i.insight_category === 'information_processing');
      if (cognitiveInsights.length > 0) {
        const cognitiveText = this.createCognitiveProfileText(cognitiveInsights);

        entries.push({
          user_id: userId,
          twin_id: twinId,
          context_type: 'cognitive_profile',
          context_text: cognitiveText,
          source_sessions: [],
          source_patterns: [],
          importance_score: 0.87,
          relevance_contexts: ['learning', 'cognition', 'processing'],
          valid_from: now,
          valid_until: null
        });
      }
    }

    // Generate embeddings for each context entry
    for (const entry of entries) {
      if (openai) {
        try {
          const embedding = await this.generateEmbedding(entry.context_text);
          entry.embedding = embedding;
        } catch (error) {
          console.error('[LLM Context] Error generating embedding for context entry:', error);
          // Continue without embedding
        }
      }
    }

    return entries;
  }

  /**
   * Create behavioral summary text
   */
  createBehavioralSummaryText(summary) {
    const parts = [];

    parts.push("# User's Behavioral Profile\n");

    if (summary.typing_profile) {
      const wpm = Math.round(summary.typing_profile.avg_wpm || 0);
      const correctionRate = Math.round((summary.typing_profile.correction_rate || 0) * 100);

      parts.push(`**Writing Style**: Types at ${wpm} words per minute with a ${correctionRate}% correction rate. This indicates ${wpm > 60 ? 'confident, decisive' : 'thoughtful, careful'} communication.`);
    }

    if (summary.behavioral_profile) {
      const bp = summary.behavioral_profile;

      parts.push(`**Mouse Behavior**: ${bp.mouse_pattern || 'Unknown'} mouse movements suggest ${this.interpretMousePattern(bp.mouse_pattern)}.`);

      parts.push(`**Reading Style**: ${bp.scroll_pattern || 'Unknown'} scrolling pattern indicates ${this.interpretScrollPattern(bp.scroll_pattern)}.`);

      if (bp.work_style) {
        parts.push(`**Work Approach**: Demonstrates ${bp.work_style} work style.`);
      }

      if (bp.decision_style) {
        parts.push(`**Decision Making**: Shows ${bp.decision_style} decision-making pattern.`);
      }

      if (bp.avg_focus_duration) {
        const focusMin = Math.round(bp.avg_focus_duration / 60);
        parts.push(`**Attention Span**: Average focus duration of ${focusMin} seconds, suggesting ${focusMin > 300 ? 'excellent' : focusMin > 180 ? 'good' : 'moderate'} concentration ability.`);
      }

      if (bp.multitasking_tendency !== null && bp.multitasking_tendency !== undefined) {
        const multitasking = bp.multitasking_tendency > 0.7 ? 'high' : bp.multitasking_tendency > 0.3 ? 'moderate' : 'low';
        parts.push(`**Multitasking**: ${multitasking} multitasking tendency.`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Create personality traits text
   */
  createPersonalityTraitsText(patterns) {
    const parts = [];

    parts.push("# User's Personality Traits (Behavioral Evidence)\n");

    patterns.forEach(pattern => {
      parts.push(`**${pattern.pattern_name}**: ${pattern.pattern_description} (Confidence: ${Math.round(pattern.confidence_score * 100)}%)`);

      if (pattern.personality_correlation) {
        const correlations = Object.entries(pattern.personality_correlation)
          .filter(([, value]) => Math.abs(value) > 0.3)
          .map(([trait, value]) => `${trait}: ${value > 0 ? '+' : ''}${Math.round(value * 100)}%`)
          .join(', ');

        if (correlations) {
          parts.push(`  *Personality correlations: ${correlations}*`);
        }
      }
    });

    return parts.join('\n\n');
  }

  /**
   * Create work style text
   */
  createWorkStyleText(patterns, summary) {
    const parts = [];

    parts.push("# User's Work Style\n");

    patterns.forEach(pattern => {
      parts.push(`- ${pattern.pattern_description}`);
    });

    if (summary?.behavioral_profile?.avg_focus_duration) {
      const focusMin = Math.round(summary.behavioral_profile.avg_focus_duration / 60);
      parts.push(`- Typical focus sessions last ${focusMin} seconds`);
    }

    return parts.join('\n');
  }

  /**
   * Create decision style text
   */
  createDecisionStyleText(patterns) {
    const parts = [];

    parts.push("# User's Decision-Making Style\n");

    patterns.forEach(pattern => {
      parts.push(`${pattern.pattern_description}`);
    });

    return parts.join('\n\n');
  }

  /**
   * Create productivity text
   */
  createProductivityText(patterns, summary) {
    const parts = [];

    parts.push("# User's Productivity Patterns\n");

    patterns.forEach(pattern => {
      parts.push(`- ${pattern.pattern_description}`);

      if (pattern.pattern_metrics && pattern.pattern_metrics.peakHours) {
        parts.push(`  Peak productivity hours: ${pattern.pattern_metrics.peakHours.join(', ')}`);
      }
    });

    return parts.join('\n');
  }

  /**
   * Create cognitive profile text
   */
  createCognitiveProfileText(insights) {
    const parts = [];

    parts.push("# User's Cognitive Profile\n");

    insights.forEach(insight => {
      parts.push(`${insight.insight_text}`);
    });

    return parts.join('\n\n');
  }

  /**
   * Generate embedding for context text
   */
  async generateEmbedding(text) {
    if (!openai) return null;

    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('[LLM Context] Error generating embedding:', error);
      return null;
    }
  }

  /**
   * Store context entries in database
   */
  async storeContextEntries(entries) {
    try {
      const { data, error } = await supabase
        .from('llm_behavioral_context')
        .upsert(entries, {
          onConflict: 'user_id,twin_id,context_type',
          ignoreDuplicates: false
        })
        .select();

      if (error) throw error;

      console.log(`[LLM Context] Stored ${data.length} context entries`);

      return data;
    } catch (error) {
      console.error('[LLM Context] Error storing context entries:', error);
      throw error;
    }
  }

  /**
   * Retrieve relevant context for LLM conversation
   */
  async retrieveRelevantContext(userId, twinId, query, limit = 5) {
    try {
      // If query is provided, do semantic search
      if (query && openai) {
        const queryEmbedding = await this.generateEmbedding(query);

        if (queryEmbedding) {
          // Semantic search using vector similarity
          const { data, error } = await supabase
            .rpc('search_similar_llm_context', {
              query_embedding: queryEmbedding,
              match_user_id: userId,
              match_twin_id: twinId,
              match_count: limit
            });

          if (!error && data) {
            // Update retrieval tracking
            await this.updateRetrievalStats(data.map(d => d.id));

            return data.map(d => d.context_text);
          }
        }
      }

      // Fallback: Get most recent high-importance context
      const { data, error } = await supabase
        .from('llm_behavioral_context')
        .select('id, context_text')
        .eq('user_id', userId)
        .is('valid_until', null) // Only valid context
        .order('importance_score', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Update retrieval tracking
      if (data && data.length > 0) {
        await this.updateRetrievalStats(data.map(d => d.id));
      }

      return data ? data.map(d => d.context_text) : [];

    } catch (error) {
      console.error('[LLM Context] Error retrieving context:', error);
      return [];
    }
  }

  /**
   * Update retrieval statistics
   */
  async updateRetrievalStats(contextIds) {
    try {
      const now = new Date().toISOString();

      for (const id of contextIds) {
        await supabase
          .rpc('increment_context_retrieval', {
            context_id: id,
            retrieved_at: now
          });
      }
    } catch (error) {
      console.error('[LLM Context] Error updating retrieval stats:', error);
      // Non-critical, continue
    }
  }

  // Helper interpretation functions
  interpretMousePattern(pattern) {
    const interpretations = {
      'smooth': 'purposeful, confident navigation',
      'erratic': 'exploratory, creative thinking',
      'purposeful': 'deliberate, goal-oriented behavior',
      'exploratory': 'curious, investigative approach'
    };
    return interpretations[pattern] || 'unknown pattern';
  }

  interpretScrollPattern(pattern) {
    const interpretations = {
      'reading': 'deep, comprehensive reading',
      'skimming': 'efficient information scanning',
      'hunting': 'targeted information seeking'
    };
    return interpretations[pattern] || 'unknown pattern';
  }
}

export default new SoulObserverLLMContext();
