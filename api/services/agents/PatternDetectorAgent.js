/**
 * PatternDetectorAgent - Specialized agent for behavioral pattern detection
 *
 * Responsibilities:
 * - Detect temporal patterns using Neo4j Cypher queries
 * - Run GNN model inference for complex patterns
 * - Calculate pattern correlations
 * - Identify behavioral sequences and routines
 *
 * Tools:
 * - Neo4j graph database queries
 * - GNN pattern detector (Python bridge)
 * - Pattern correlation calculator
 */

import AgentBase from './AgentBase.js';
import neo4jGraphService from '../neo4jGraphService.js';
import gnnPatternDetector from '../gnnPatternDetector.js';

class PatternDetectorAgent extends AgentBase {
  constructor() {
    super({
      name: 'PatternDetectorAgent',
      role: 'Behavioral pattern detection specialist using GNN and Neo4j',
      model: 'claude-sonnet-4-20250514', // Sonnet 4 for speed
      maxTokens: 3072,
      temperature: 0.2 // Low temperature for consistent pattern detection
    });

    // Add tools for pattern detection
    this.initializeTools();
  }

  /**
   * Initialize agent tools
   */
  initializeTools() {
    // Tool 1: Detect temporal patterns using Neo4j Cypher
    this.addTool({
      name: 'detect_temporal_patterns',
      description: `Query Neo4j graph database for temporal behavioral patterns.

Returns patterns where user activities PRECEDE calendar events within a time window.
This tool finds habits like "user listens to lo-fi music 20 minutes before presentations".

Use this when:
- User asks about their habits or routines
- User asks "what do I do before X"
- User wants to understand their preparation style
- Detecting correlation between activities and events

Parameters:
- event_type: Type of calendar event (presentation, meeting, interview, etc.)
- min_occurrences: Minimum pattern occurrences (default: 3)
- min_confidence: Minimum confidence score 0-1 (default: 0.7)
- time_window_minutes: Max minutes between activity and event (default: 30)`,
      input_schema: {
        type: 'object',
        properties: {
          event_type: {
            type: 'string',
            description: 'Type of calendar event to analyze'
          },
          min_occurrences: {
            type: 'number',
            description: 'Minimum pattern occurrences (default: 3)'
          },
          min_confidence: {
            type: 'number',
            description: 'Minimum confidence 0-1 (default: 0.7)'
          },
          time_window_minutes: {
            type: 'number',
            description: 'Max minutes between activity and event (default: 30)'
          }
        },
        required: ['event_type']
      }
    });

    // Tool 2: Get graph statistics
    this.addTool({
      name: 'get_graph_stats',
      description: `Get statistics about user's behavior graph in Neo4j.

Returns counts of calendar events, music activities, and temporal relationships.

Use this when:
- User asks about data coverage
- Checking if enough data exists for pattern detection
- Understanding the scope of available behavioral data`,
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    });

    // Tool 3: Run GNN pattern detection
    this.addTool({
      name: 'run_gnn_detection',
      description: `Run Graph Neural Network model to detect complex patterns.

Uses PyTorch Geometric to find non-obvious correlations and behavioral patterns
that simple queries might miss. More sophisticated than Cypher queries but slower.

Use this when:
- Cypher queries don't find patterns
- User asks for "hidden patterns" or "deep insights"
- Looking for multi-hop correlations
- Need pattern embeddings for clustering

Parameters:
- min_confidence: Minimum confidence score 0-1 (default: 0.75)
- top_k: Number of top patterns to return (default: 10)`,
      input_schema: {
        type: 'object',
        properties: {
          min_confidence: {
            type: 'number',
            description: 'Minimum confidence 0-1 (default: 0.75)'
          },
          top_k: {
            type: 'number',
            description: 'Number of patterns to return (default: 10)'
          }
        },
        required: []
      }
    });
  }

  /**
   * Build system prompt for pattern detection
   */
  buildSystemPrompt() {
    return `You are the PatternDetectorAgent, a specialized AI agent for Twin-Me's behavioral pattern detection system.

YOUR ROLE:
Detect temporal and correlation patterns in user behavioral data using Neo4j graph database and GNN models.

YOUR CAPABILITIES:
1. Temporal pattern detection (music before events, routines, habits)
2. Graph statistics and data coverage analysis
3. GNN-based complex pattern discovery
4. Pattern confidence scoring

YOUR TOOLS:
- detect_temporal_patterns: Query Neo4j for temporal patterns
- get_graph_stats: Check data coverage
- run_gnn_detection: Use ML model for complex patterns

YOUR TASK:
1. Analyze the user's request
2. Choose the appropriate tool(s)
3. Execute pattern detection
4. Format results clearly with confidence scores
5. Explain patterns in user-friendly language

OUTPUT FORMAT (JSON):
{
  "patterns": [
    {
      "pattern_type": "temporal_music_before_event",
      "trigger": {
        "type": "calendar_event",
        "event_type": "presentation"
      },
      "response": {
        "type": "music_activity",
        "genre": "lo-fi",
        "characteristics": {...}
      },
      "time_offset_minutes": 20,
      "occurrence_count": 5,
      "confidence_score": 85,
      "description": "You consistently listen to lo-fi music 20 minutes before presentations"
    }
  ],
  "summary": "Brief summary of detected patterns",
  "data_coverage": {
    "calendar_events": 45,
    "music_activities": 230,
    "temporal_edges": 18
  },
  "confidence": 0.85
}

GUIDELINES:
1. Start with Cypher queries (fast) before trying GNN (slow)
2. Look for patterns with at least 3 occurrences
3. Confidence threshold: 70% minimum
4. Explain patterns in natural language
5. Include specific examples when available
6. If no patterns found, suggest data collection strategies

EXAMPLES:

User: "What do I do before important meetings?"
→ Use detect_temporal_patterns with event_type="meeting"
→ Return temporal patterns with music, activities before meetings

User: "Do I have any hidden patterns?"
→ Use run_gnn_detection for complex correlations
→ Return non-obvious multi-hop patterns

Remember: Focus ONLY on pattern detection. Do NOT generate recommendations or analyze personality.`;
  }

  /**
   * Execute pattern detection
   * Overrides base execute to handle tool calls
   */
  async execute(prompt, options = {}) {
    const userId = options.userId;

    if (!userId) {
      throw new Error('PatternDetectorAgent requires userId in options');
    }

    // Store userId for tool execution
    this._currentUserId = userId;

    try {
      // Execute with tools
      const response = await super.execute(prompt, options);

      // Handle tool use
      if (response.toolUses && response.toolUses.length > 0) {
        const toolResults = await this.executeTools(response.toolUses, userId);

        // Continue conversation with tool results
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
      console.log(`🔧 [PatternDetectorAgent] Executing tool: ${toolUse.name}`);

      try {
        let result;

        switch (toolUse.name) {
          case 'detect_temporal_patterns':
            result = await this.detectTemporalPatterns(userId, toolUse.input);
            break;

          case 'get_graph_stats':
            result = await this.getGraphStats(userId);
            break;

          case 'run_gnn_detection':
            result = await this.runGNNDetection(userId, toolUse.input);
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

    const apiParams = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: this.systemPrompt,
      messages
    };

    if (this.tools.length > 0) {
      apiParams.tools = this.tools;
    }

    const response = await this.client.messages.create(apiParams);

    return this.processResponse(response);
  }

  /**
   * Tool implementation: Detect temporal patterns
   */
  async detectTemporalPatterns(userId, params = {}) {
    const {
      event_type = 'all',
      min_occurrences = 3,
      min_confidence = 0.7,
      time_window_minutes = 30
    } = params;

    console.log(`🔍 Detecting temporal patterns for event type: ${event_type}`);

    // Connect to Neo4j if not connected
    if (!neo4jGraphService.isConnected) {
      await neo4jGraphService.connect();
    }

    // Query patterns
    const patterns = await neo4jGraphService.detectTemporalPatterns(userId, {
      minOccurrences: min_occurrences,
      minConfidence: min_confidence,
      timeWindowMinutes: time_window_minutes
    });

    // Filter by event type if specified
    let filteredPatterns = patterns;
    if (event_type !== 'all') {
      filteredPatterns = patterns.filter(p =>
        p.trigger?.event_type?.toLowerCase().includes(event_type.toLowerCase())
      );
    }

    return {
      patterns: filteredPatterns,
      total_patterns: filteredPatterns.length,
      event_type,
      parameters: { min_occurrences, min_confidence, time_window_minutes }
    };
  }

  /**
   * Tool implementation: Get graph statistics
   */
  async getGraphStats(userId) {
    console.log(`📊 Getting graph statistics for user ${userId}`);

    if (!neo4jGraphService.isConnected) {
      await neo4jGraphService.connect();
    }

    const stats = await neo4jGraphService.getUserGraphStats(userId);

    if (!stats) {
      return {
        has_data: false,
        message: 'No graph data found. User needs to connect platforms and sync data.',
        recommendation: 'Connect Spotify, Google Calendar, or other platforms to enable pattern detection.'
      };
    }

    return {
      has_data: true,
      calendar_events: stats.calendarEvents,
      music_activities: stats.musicActivities,
      temporal_edges: stats.precedesEdges,
      sufficient_for_patterns: stats.calendarEvents >= 5 && stats.musicActivities >= 10
    };
  }

  /**
   * Tool implementation: Run GNN detection
   */
  async runGNNDetection(userId, params = {}) {
    const {
      min_confidence = 0.75,
      top_k = 10
    } = params;

    console.log(`🧠 Running GNN pattern detection for user ${userId}`);

    // Check if GNN model exists
    const modelExists = await gnnPatternDetector.modelExists();

    if (!modelExists) {
      return {
        error: 'GNN model not trained',
        message: 'Train the GNN model first using POST /api/gnn-patterns/train',
        fallback: 'Using Cypher-based pattern detection instead'
      };
    }

    // Run GNN inference
    const patterns = await gnnPatternDetector.detectPatterns(userId, {
      minConfidence: min_confidence,
      topK: top_k
    });

    return {
      patterns,
      total_patterns: patterns.length,
      source: 'gnn_model',
      parameters: { min_confidence, top_k }
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    const base = await super.healthCheck();

    // Check Neo4j connection
    const neo4jHealth = await neo4jGraphService.healthCheck();

    // Check GNN model availability
    const gnnHealth = await gnnPatternDetector.healthCheck();

    return {
      ...base,
      neo4j: neo4jHealth,
      gnn: gnnHealth,
      tools: this.tools.map(t => t.name)
    };
  }
}

export default PatternDetectorAgent;
