/**
 * Soul Observer AI Analyzer
 * Uses Claude API to generate deep personality insights from behavioral patterns
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
}) : null;

class SoulObserverAIAnalyzer {

  /**
   * Generate deep psychological insights using Claude
   */
  async analyzeSessionWithClaude(userId, sessionId) {
    if (!anthropic) {
      console.warn('[AI Analyzer] Anthropic API key not configured, skipping AI analysis');
      return null;
    }

    try {
      // Get session data and detected patterns
      const sessionData = await this.gatherSessionData(sessionId);

      // Build prompt for Claude
      const prompt = this.buildAnalysisPrompt(sessionData);

      console.log('[AI Analyzer] Requesting Claude analysis...');

      // Call Claude API
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const analysis = response.content[0].text;

      console.log('[AI Analyzer] Claude analysis received');

      // Parse Claude's response and structure it
      const structuredInsights = this.parseClaudeAnalysis(analysis, sessionData);

      // Store insights in database
      await this.storeAIInsights(userId, sessionId, structuredInsights);

      return structuredInsights;

    } catch (error) {
      console.error('[AI Analyzer] Error in Claude analysis:', error);
      throw error;
    }
  }

  /**
   * Gather all relevant session data for analysis
   */
  async gatherSessionData(sessionId) {
    try {
      // Get session
      const { data: session } = await supabase
        .from('soul_observer_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      // Get patterns
      const { data: patterns } = await supabase
        .from('behavioral_patterns')
        .select('*')
        .contains('behavioral_indicators', { sessionId });

      // Get events (summary only)
      const { data: events } = await supabase
        .from('soul_observer_events')
        .select('event_type, event_data, timestamp')
        .eq('session_id', sessionId)
        .limit(100); // Sample for context

      return {
        session: session || {},
        patterns: patterns || [],
        eventSample: events || []
      };

    } catch (error) {
      console.error('[AI Analyzer] Error gathering session data:', error);
      throw error;
    }
  }

  /**
   * Build comprehensive analysis prompt for Claude
   */
  buildAnalysisPrompt(sessionData) {
    const { session, patterns, eventSample } = sessionData;

    return `You are an expert behavioral psychologist analyzing digital behavior patterns to understand personality and cognitive traits. Analyze the following browsing session data and provide deep psychological insights.

## Session Overview
- Duration: ${session.duration_seconds ? `${Math.round(session.duration_seconds / 60)} minutes` : 'unknown'}
- Total Events: ${session.total_events || 0}
- Domains Visited: ${session.domains_visited?.length || 0}
- Primary Activity: ${session.primary_activity || 'general browsing'}

## Behavioral Metrics
**Typing Patterns:**
- Speed: ${session.typing_speed_wpm || 'N/A'} WPM
- Correction Rate: ${session.typing_correction_rate ? `${Math.round(session.typing_correction_rate * 100)}%` : 'N/A'}

**Mouse Behavior:**
- Pattern: ${session.mouse_movement_pattern || 'N/A'}
- Average Speed: ${session.mouse_avg_speed || 'N/A'} px/s

**Scroll Behavior:**
- Pattern: ${session.scroll_pattern || 'N/A'}
- Average Speed: ${session.scroll_avg_speed || 'N/A'} px/s

**Focus & Attention:**
- Average Focus Duration: ${session.focus_avg_duration ? `${Math.round(session.focus_avg_duration)} seconds` : 'N/A'}
- Multitasking Score: ${session.multitasking_score !== null ? `${Math.round(session.multitasking_score * 100)}%` : 'N/A'}

**Detected Patterns:**
${patterns.map(p => `- ${p.pattern_name}: ${p.pattern_description} (confidence: ${Math.round(p.confidence_score * 100)}%)`).join('\n') || 'None detected'}

**Current Personality Indicators (Big Five):**
${session.personality_indicators ? `
- Openness: ${Math.round(session.personality_indicators.openness * 100)}%
- Conscientiousness: ${Math.round(session.personality_indicators.conscientiousness * 100)}%
- Extraversion: ${Math.round(session.personality_indicators.extraversion * 100)}%
- Agreeableness: ${Math.round(session.personality_indicators.agreeableness * 100)}%
- Neuroticism: ${Math.round(session.personality_indicators.neuroticism * 100)}%
` : 'Not yet calculated'}

## Your Analysis Task

Provide a comprehensive psychological analysis addressing:

1. **Cognitive Style**: How does this person process information? (analytical vs intuitive, fast vs deliberate, etc.)

2. **Work Style**: What's their optimal work environment and approach? (deep work vs multitasking, structured vs flexible, etc.)

3. **Decision-Making**: How do they make decisions? (impulsive vs deliberate, confident vs cautious, data-driven vs intuitive)

4. **Stress Indicators**: Are there signs of cognitive load, stress, or distraction? What might be causing them?

5. **Personality Insights**: Deep dive into personality traits beyond the Big Five. What makes this person unique?

6. **Productivity Patterns**: When and how are they most productive? What environmental factors matter?

7. **Recommendations**: Specific, actionable suggestions for optimizing their digital behavior and productivity.

Format your response as structured JSON:
{
  "cognitive_style": {
    "summary": "brief description",
    "details": "detailed analysis",
    "confidence": 0.0-1.0
  },
  "work_style": {
    "summary": "brief description",
    "optimal_environment": "description",
    "recommendations": ["list of recommendations"]
  },
  "decision_making": {
    "style": "description",
    "strengths": ["list"],
    "areas_for_development": ["list"]
  },
  "stress_indicators": {
    "level": "low/moderate/high",
    "signs": ["list of observed indicators"],
    "suggestions": ["list of stress management suggestions"]
  },
  "personality_insights": {
    "core_traits": ["list of key personality traits"],
    "behavioral_patterns": ["list of notable patterns"],
    "uniqueness": "what makes this person unique"
  },
  "productivity_patterns": {
    "peak_times": "when they're most productive",
    "optimal_conditions": ["list"],
    "blockers": ["list of productivity blockers"]
  },
  "recommendations": {
    "immediate": ["actionable items for immediate implementation"],
    "long_term": ["strategic suggestions for long-term improvement"]
  }
}

Provide deep, insightful analysis based on psychological research and behavioral science. Be specific and actionable.`;
  }

  /**
   * Parse Claude's analysis into structured data
   */
  parseClaudeAnalysis(analysis, sessionData) {
    try {
      // Try to extract JSON from Claude's response
      const jsonMatch = analysis.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          raw_analysis: analysis,
          structured_insights: parsed,
          analysis_timestamp: new Date().toISOString(),
          session_context: {
            duration_seconds: sessionData.session.duration_seconds,
            total_events: sessionData.session.total_events,
            patterns_detected: sessionData.patterns.length
          }
        };
      } else {
        // If no JSON found, return raw analysis
        return {
          raw_analysis: analysis,
          structured_insights: null,
          analysis_timestamp: new Date().toISOString(),
          parsing_error: 'Could not extract structured JSON from Claude response'
        };
      }
    } catch (error) {
      console.error('[AI Analyzer] Error parsing Claude analysis:', error);
      return {
        raw_analysis: analysis,
        structured_insights: null,
        parsing_error: error.message
      };
    }
  }

  /**
   * Store AI-generated insights in database
   */
  async storeAIInsights(userId, sessionId, insights) {
    try {
      // Update session with AI insights
      await supabase
        .from('soul_observer_sessions')
        .update({
          ai_insights: insights,
          ai_analyzed: true
        })
        .eq('session_id', sessionId);

      // Create individual insight records if structured insights available
      if (insights.structured_insights) {
        const insightRecords = this.createInsightRecords(userId, sessionId, insights.structured_insights);

        if (insightRecords.length > 0) {
          await supabase
            .from('soul_observer_insights')
            .insert(insightRecords);
        }
      }

      console.log('[AI Analyzer] Stored AI insights successfully');

    } catch (error) {
      console.error('[AI Analyzer] Error storing insights:', error);
      throw error;
    }
  }

  /**
   * Convert structured insights into individual insight records
   */
  createInsightRecords(userId, sessionId, structuredInsights) {
    const records = [];

    // Cognitive style insight
    if (structuredInsights.cognitive_style) {
      records.push({
        user_id: userId,
        session_id: sessionId,
        insight_category: 'cognitive_state',
        insight_text: structuredInsights.cognitive_style.summary,
        insight_data: { details: structuredInsights.cognitive_style.details },
        confidence: structuredInsights.cognitive_style.confidence || 0.7,
        evidence_count: 1
      });
    }

    // Work style insight
    if (structuredInsights.work_style) {
      records.push({
        user_id: userId,
        session_id: sessionId,
        insight_category: 'work_style',
        insight_text: structuredInsights.work_style.summary,
        insight_data: {
          optimal_environment: structuredInsights.work_style.optimal_environment,
          recommendations: structuredInsights.work_style.recommendations
        },
        confidence: 0.8,
        evidence_count: 1
      });
    }

    // Decision making insight
    if (structuredInsights.decision_making) {
      records.push({
        user_id: userId,
        session_id: sessionId,
        insight_category: 'decision_making',
        insight_text: structuredInsights.decision_making.style,
        insight_data: {
          strengths: structuredInsights.decision_making.strengths,
          areas_for_development: structuredInsights.decision_making.areas_for_development
        },
        confidence: 0.75,
        evidence_count: 1
      });
    }

    // Stress indicators
    if (structuredInsights.stress_indicators) {
      records.push({
        user_id: userId,
        session_id: sessionId,
        insight_category: 'stress_level',
        insight_text: `Stress level: ${structuredInsights.stress_indicators.level}`,
        insight_data: {
          signs: structuredInsights.stress_indicators.signs,
          suggestions: structuredInsights.stress_indicators.suggestions
        },
        confidence: 0.7,
        evidence_count: 1
      });
    }

    // Productivity patterns
    if (structuredInsights.productivity_patterns) {
      records.push({
        user_id: userId,
        session_id: sessionId,
        insight_category: 'productivity',
        insight_text: `Peak productivity: ${structuredInsights.productivity_patterns.peak_times}`,
        insight_data: {
          optimal_conditions: structuredInsights.productivity_patterns.optimal_conditions,
          blockers: structuredInsights.productivity_patterns.blockers
        },
        confidence: 0.8,
        evidence_count: 1
      });
    }

    return records;
  }
}

export default new SoulObserverAIAnalyzer();
