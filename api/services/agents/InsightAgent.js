/**
 * InsightAgent - Specialized agent for behavioral analytics and insights
 *
 * Responsibilities:
 * - Analyze behavioral patterns for trends and metrics
 * - Generate human-readable insights from data
 * - Calculate statistics (frequency, consistency, correlations)
 * - Identify anomalies and changes over time
 *
 * Tools:
 * - SQL queries to behavioral_patterns table
 * - Pattern statistics calculator
 * - Trend analysis
 */

import AgentBase from './AgentBase.js';
import { serverDb } from '../database.js';

class InsightAgent extends AgentBase {
  constructor() {
    super({
      name: 'InsightAgent',
      role: 'Behavioral analytics and insight generation specialist',
      model: 'claude-sonnet-4-20250514', // Sonnet 4 for speed
      maxTokens: 3072,
      temperature: 0.5 // Balanced for analytical yet readable insights
    });

    this.initializeTools();
  }

  /**
   * Initialize agent tools
   */
  initializeTools() {
    // Tool 1: Query behavioral patterns
    this.addTool({
      name: 'query_patterns',
      description: `Query stored behavioral patterns from the database.

Returns detected patterns with confidence scores, occurrence counts, and descriptions.

Use this when:
- User asks "what patterns do you see"
- Analyzing overall behavioral trends
- Getting pattern statistics
- Understanding user habits

Parameters:
- min_confidence: Minimum confidence score 0-100 (default: 70)
- pattern_type: Filter by type (temporal, correlation, sequence, etc.)
- limit: Number of patterns to return (default: 20)`,
      input_schema: {
        type: 'object',
        properties: {
          min_confidence: {
            type: 'number',
            description: 'Minimum confidence score 0-100 (default: 70)'
          },
          pattern_type: {
            type: 'string',
            description: 'Filter by pattern type'
          },
          limit: {
            type: 'number',
            description: 'Max patterns to return (default: 20)'
          }
        },
        required: []
      }
    });

    // Tool 2: Calculate pattern statistics
    this.addTool({
      name: 'calculate_statistics',
      description: `Calculate aggregate statistics across all user patterns.

Returns metrics like:
- Total patterns detected
- Average confidence score
- Most common pattern types
- Consistency trends
- Temporal distribution

Use this when:
- User wants overall analytics
- Comparing current vs historical behavior
- Understanding data quality`,
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    });

    // Tool 3: Analyze pattern trends
    this.addTool({
      name: 'analyze_trends',
      description: `Analyze how patterns change over time.

Identifies:
- Emerging patterns (newly detected)
- Stable patterns (consistent over time)
- Declining patterns (becoming less frequent)
- Seasonal variations

Use this when:
- User asks "how am I changing"
- Looking for behavior evolution
- Identifying habit formation or breaking`,
      input_schema: {
        type: 'object',
        properties: {
          time_range_days: {
            type: 'number',
            description: 'Days to analyze (default: 90)'
          }
        },
        required: []
      }
    });
  }

  /**
   * Build system prompt for insights
   */
  buildSystemPrompt() {
    return `You are the InsightAgent, a specialized AI agent for Twin-Me's behavioral analytics system.

YOUR ROLE:
Analyze behavioral patterns and generate human-readable insights with metrics and trends.

YOUR CAPABILITIES:
1. Pattern querying and filtering
2. Statistical analysis (frequency, consistency, trends)
3. Trend detection (emerging, stable, declining)
4. Anomaly identification

YOUR TOOLS:
- query_patterns: Get patterns from database
- calculate_statistics: Compute aggregate metrics
- analyze_trends: Detect behavior changes over time

YOUR TASK:
1. Analyze user's request
2. Query relevant patterns and statistics
3. Identify key insights and trends
4. Generate actionable recommendations
5. Present in user-friendly language

OUTPUT FORMAT (JSON):
{
  "insights": [
    {
      "category": "temporal_patterns|habits|trends|anomalies",
      "insight": "Clear, conversational insight statement",
      "evidence": {
        "pattern_count": 5,
        "avg_confidence": 0.85,
        "occurrences": 42,
        "timespan_days": 90
      },
      "significance": "high|medium|low",
      "recommendation": "Actionable suggestion based on this insight"
    }
  ],
  "metrics": {
    "total_patterns": 12,
    "high_confidence_patterns": 8,
    "average_confidence": 0.82,
    "most_common_type": "temporal_music_before_event",
    "data_quality": "excellent|good|fair|poor"
  },
  "trends": {
    "emerging": ["New pattern emerging..."],
    "stable": ["Consistent pattern over 90 days..."],
    "declining": ["Pattern becoming less frequent..."]
  },
  "summary": "Overall behavioral summary",
  "confidence": 0.85
}

INSIGHT GENERATION GUIDELINES:
1. Be conversational - write like talking to a friend
2. Use specific numbers (not vague terms like "often")
3. Connect patterns to user goals or outcomes
4. Identify both positive and concerning trends
5. Provide actionable recommendations
6. Explain significance (why this matters)

EXAMPLES:

Good insight:
"You have a strong pre-presentation routine (detected in 8 out of 10 presentations over 60 days). You consistently listen to lo-fi music 20 minutes beforehand. This is working well - your calendar shows no rescheduled presentations, suggesting good preparation."

Bad insight:
"Pattern detected: music before events."

Good recommendation:
"Based on your consistent 20-minute music prep, consider blocking this time in your calendar before important events to protect your routine."

Bad recommendation:
"Listen to music."

METRICS INTERPRETATION:
- Confidence 80%+: Strong pattern, trust it
- Confidence 70-80%: Emerging pattern, monitor it
- Confidence <70%: Weak pattern, collect more data

Occurrence count:
- 10+: Established habit
- 5-9: Forming habit
- 3-4: Potential pattern
- <3: Insufficient data

DATA QUALITY:
- Excellent: 50+ events, 200+ activities, 20+ patterns
- Good: 20+ events, 100+ activities, 10+ patterns
- Fair: 10+ events, 50+ activities, 5+ patterns
- Poor: <10 events, need more data

Remember: Focus ONLY on insights and analytics. Do NOT generate recommendations for music/content.`;
  }

  /**
   * Execute insight generation
   */
  async execute(prompt, options = {}) {
    const userId = options.userId;

    if (!userId) {
      throw new Error('InsightAgent requires userId in options');
    }

    this._currentUserId = userId;

    try {
      const response = await super.execute(prompt, options);

      // Handle tool use
      if (response.toolUses && response.toolUses.length > 0) {
        const toolResults = await this.executeTools(response.toolUses, userId);

        const followUpResponse = await this.continueWithToolResults(
          prompt,
          response,
          toolResults,
          options
        );

        return followUpResponse;
      }

      return response;

    } finally {
      this._currentUserId = null;
    }
  }

  /**
   * Execute tool calls
   */
  async executeTools(toolUses, userId) {
    const results = [];

    for (const toolUse of toolUses) {
      console.log(`🔧 [InsightAgent] Executing tool: ${toolUse.name}`);

      try {
        let result;

        switch (toolUse.name) {
          case 'query_patterns':
            result = await this.queryPatterns(userId, toolUse.input);
            break;

          case 'calculate_statistics':
            result = await this.calculateStatistics(userId);
            break;

          case 'analyze_trends':
            result = await this.analyzeTrends(userId, toolUse.input);
            break;

          default:
            result = { error: `Unknown tool: ${toolUse.name}` };
        }

        results.push({
          tool_use_id: toolUse.id,
          type: 'tool_result',
          content: JSON.stringify(result)
        });

      } catch (error) {
        console.error(`❌ Tool ${toolUse.name} failed:`, error);
        results.push({
          tool_use_id: toolUse.id,
          type: 'tool_result',
          is_error: true,
          content: error.message
        });
      }
    }

    return results;
  }

  /**
   * Continue conversation with tool results
   */
  async continueWithToolResults(originalPrompt, firstResponse, toolResults, options) {
    const messages = [
      { role: 'user', content: originalPrompt },
      { role: 'assistant', content: firstResponse.raw.content },
      { role: 'user', content: toolResults }
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: this.systemPrompt,
      messages,
      tools: this.tools
    });

    return this.processResponse(response);
  }

  /**
   * Tool implementation: Query patterns
   */
  async queryPatterns(userId, params = {}) {
    const {
      min_confidence = 70,
      pattern_type = null,
      limit = 20
    } = params;

    console.log(`📊 Querying patterns (confidence >= ${min_confidence}%)`);

    let query = serverDb
      .from('behavioral_patterns')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence_score', min_confidence)
      .eq('is_active', true)
      .order('confidence_score', { ascending: false })
      .limit(limit);

    if (pattern_type) {
      query = query.eq('pattern_type', pattern_type);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to query patterns: ${error.message}`);
    }

    return {
      patterns: data || [],
      total: data?.length || 0,
      filters: { min_confidence, pattern_type }
    };
  }

  /**
   * Tool implementation: Calculate statistics
   */
  async calculateStatistics(userId) {
    console.log(`📈 Calculating pattern statistics`);

    // Get all patterns
    const { data: patterns, error } = await serverDb
      .from('behavioral_patterns')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error || !patterns || patterns.length === 0) {
      return {
        total_patterns: 0,
        message: 'No patterns detected yet. Connect more platforms and sync data.'
      };
    }

    // Calculate metrics
    const totalPatterns = patterns.length;
    const highConfidence = patterns.filter(p => p.confidence_score >= 80).length;
    const avgConfidence = patterns.reduce((sum, p) => sum + p.confidence_score, 0) / totalPatterns;

    // Pattern type distribution
    const typeCounts = {};
    patterns.forEach(p => {
      typeCounts[p.pattern_type] = (typeCounts[p.pattern_type] || 0) + 1;
    });

    const mostCommonType = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])[0];

    // Data quality assessment
    let dataQuality = 'poor';
    if (totalPatterns >= 20) dataQuality = 'excellent';
    else if (totalPatterns >= 10) dataQuality = 'good';
    else if (totalPatterns >= 5) dataQuality = 'fair';

    return {
      total_patterns: totalPatterns,
      high_confidence_patterns: highConfidence,
      medium_confidence_patterns: patterns.filter(p => p.confidence_score >= 70 && p.confidence_score < 80).length,
      low_confidence_patterns: patterns.filter(p => p.confidence_score < 70).length,
      average_confidence: Math.round(avgConfidence),
      most_common_type: mostCommonType ? mostCommonType[0] : null,
      type_distribution: typeCounts,
      data_quality: dataQuality
    };
  }

  /**
   * Tool implementation: Analyze trends
   */
  async analyzeTrends(userId, params = {}) {
    const { time_range_days = 90 } = params;

    console.log(`📉 Analyzing trends over ${time_range_days} days`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - time_range_days);

    // Get patterns created in time range
    const { data: patterns, error } = await serverDb
      .from('behavioral_patterns')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false });

    if (error || !patterns || patterns.length === 0) {
      return {
        emerging: [],
        stable: [],
        declining: [],
        message: 'Insufficient data for trend analysis'
      };
    }

    // Simple trend classification based on creation date and consistency
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    const emerging = patterns.filter(p => {
      const created = new Date(p.created_at).getTime();
      return created > thirtyDaysAgo && p.occurrence_count < 10;
    });

    const stable = patterns.filter(p => {
      return p.consistency_rate >= 80 && p.occurrence_count >= 10;
    });

    const declining = patterns.filter(p => {
      return p.consistency_rate < 60 && p.occurrence_count >= 5;
    });

    return {
      emerging: emerging.map(p => p.description || p.pattern_type),
      stable: stable.map(p => p.description || p.pattern_type),
      declining: declining.map(p => p.description || p.pattern_type),
      time_range_days,
      total_analyzed: patterns.length
    };
  }
}

export default InsightAgent;
