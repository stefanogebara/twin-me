/**
 * ResultSynthesizer - Aggregates and synthesizes multi-agent results
 *
 * Takes outputs from multiple specialized agents and creates a coherent,
 * unified response for the user.
 *
 * Responsibilities:
 * 1. Aggregate results from parallel and sequential agents
 * 2. Resolve conflicts between agent outputs
 * 3. Generate natural language synthesis
 * 4. Maintain attribution to source agents
 * 5. Handle partial failures gracefully
 *
 * Based on Anthropic's result synthesis patterns.
 */

import AgentBase from './AgentBase.js';

class ResultSynthesizer extends AgentBase {
  constructor() {
    super({
      name: 'ResultSynthesizer',
      role: 'Multi-agent result aggregation and synthesis specialist',
      model: 'claude-opus-4-20250514', // Use Opus for synthesis quality
      maxTokens: 4096,
      temperature: 0.7 // Balanced for coherent but creative synthesis
    });
  }

  /**
   * Build system prompt for result synthesis
   */
  buildSystemPrompt() {
    return `You are the ResultSynthesizer, a specialized AI component of Twin-Me's multi-agent orchestration system.

YOUR ROLE:
Synthesize outputs from multiple specialized agents into a coherent, unified response.

YOUR TASK:
1. Read outputs from all agents
2. Identify key insights and recommendations
3. Resolve any conflicts or contradictions
4. Create a natural, conversational response
5. Attribute information to source agents when relevant
6. Maintain technical accuracy while being user-friendly

OUTPUT FORMAT (JSON):
{
  "synthesis": "Natural language response to user",
  "keyInsights": [
    "Insight 1",
    "Insight 2"
  ],
  "recommendations": [
    {
      "type": "action|content|insight",
      "title": "Short title",
      "description": "Detailed recommendation",
      "source": "AgentName",
      "confidence": 0.85
    }
  ],
  "agentContributions": {
    "AgentName": "What this agent contributed"
  },
  "metadata": {
    "totalAgents": 3,
    "synthesisQuality": "high|medium|low",
    "conflictsResolved": 0
  }
}

SYNTHESIS GUIDELINES:
1. Be conversational and natural - talk to the user like a helpful friend
2. Lead with the most important insights
3. Use "I noticed..." or "Based on your data..." for personalization
4. If agents disagree, present both views or explain the resolution
5. Include specific examples when available
6. End with actionable next steps if relevant

EXAMPLE:

Input from agents:
- PatternDetectorAgent: "Detected pattern: User listens to lo-fi music 20 minutes before presentations (85% confidence, 5 occurrences)"
- PersonalityAgent: "User type INTJ: prefers structured preparation with calming music"
- RecommendationAgent: "Recommended playlist: Focus Flow (ambient, lo-fi) - 25 tracks"

Output:
{
  "synthesis": "I noticed a really interesting pattern in your behavior! You consistently listen to lo-fi and ambient music about 20 minutes before important presentations. This makes total sense for your INTJ personality type - you're preparing methodically with music that helps you focus.\\n\\nBased on this pattern, I've created a 'Focus Flow' playlist with 25 tracks that match your pre-presentation routine. It's calibrated to your preferred energy levels (low tempo, calming) and will help you get in the zone before your next big moment.",
  "keyInsights": [
    "You have a consistent 20-minute pre-presentation music routine",
    "Your preparation style aligns with INTJ traits (structured, focused)",
    "Lo-fi and ambient genres are your go-to for stress management"
  ],
  "recommendations": [
    {
      "type": "content",
      "title": "Focus Flow Playlist",
      "description": "25-track playlist of lo-fi and ambient music optimized for your pre-presentation routine",
      "source": "RecommendationAgent",
      "confidence": 0.87
    },
    {
      "type": "action",
      "title": "Start your playlist 20 minutes before events",
      "description": "Based on your detected pattern, begin listening about 20 minutes before important meetings or presentations",
      "source": "PatternDetectorAgent",
      "confidence": 0.85
    }
  ],
  "agentContributions": {
    "PatternDetectorAgent": "Discovered the 20-minute pre-event music pattern",
    "PersonalityAgent": "Validated pattern against INTJ traits",
    "RecommendationAgent": "Generated personalized playlist"
  },
  "metadata": {
    "totalAgents": 3,
    "synthesisQuality": "high",
    "conflictsResolved": 0
  }
}

Remember: Output ONLY valid JSON. No additional text.`;
  }

  /**
   * Synthesize results from multiple agents
   *
   * @param {object} decomposition - Original task decomposition
   * @param {array} agentResults - Results from all agents
   * @param {string} originalQuery - User's original query
   * @returns {Promise<object>} Synthesized result
   */
  async synthesize(decomposition, agentResults, originalQuery) {
    console.log(`🔗 [ResultSynthesizer] Synthesizing results from ${agentResults.length} agents...`);

    try {
      // Build synthesis prompt
      const prompt = this.buildSynthesisPrompt(decomposition, agentResults, originalQuery);

      // Execute synthesis with extended thinking
      const response = await this.execute(prompt, {
        useExtendedThinking: true
      });

      // Parse JSON response
      const synthesis = this.parseJSON(response.text);

      // Validate synthesis
      if (!this.validateSynthesis(synthesis)) {
        throw new Error('Invalid synthesis format');
      }

      console.log(`✅ [ResultSynthesizer] Synthesis complete (quality: ${synthesis.metadata.synthesisQuality})`);

      return {
        ...synthesis,
        raw: response,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ [ResultSynthesizer] Synthesis failed:`, error);

      // Fallback to simple concatenation
      return this.createFallbackSynthesis(agentResults, originalQuery);
    }
  }

  /**
   * Build synthesis prompt with all agent results
   */
  buildSynthesisPrompt(decomposition, agentResults, originalQuery) {
    let prompt = `Original user query: "${originalQuery}"\n\n`;
    prompt += `Intent: ${decomposition.intent}\n`;
    prompt += `Complexity: ${decomposition.complexity}\n\n`;

    prompt += `AGENT RESULTS:\n\n`;

    agentResults.forEach((result, index) => {
      prompt += `${index + 1}. ${result.agentName}:\n`;

      if (result.success) {
        // Include agent output (truncate if too long)
        const output = typeof result.output === 'string'
          ? result.output
          : JSON.stringify(result.output, null, 2);

        const truncated = output.length > 1000
          ? output.substring(0, 1000) + '... [truncated]'
          : output;

        prompt += `Output:\n${truncated}\n\n`;

        if (result.confidence) {
          prompt += `Confidence: ${(result.confidence * 100).toFixed(0)}%\n`;
        }
      } else {
        prompt += `Status: Failed\n`;
        prompt += `Error: ${result.error}\n\n`;
      }
    });

    prompt += `\nSynthesize these agent results into a coherent response for the user. Output JSON only.`;

    return prompt;
  }

  /**
   * Validate synthesis structure
   */
  validateSynthesis(synthesis) {
    const schema = {
      required: ['synthesis', 'keyInsights', 'metadata'],
      properties: {
        synthesis: { type: 'string' },
        keyInsights: { type: 'array' },
        metadata: { type: 'object' }
      }
    };

    return this.validateOutput(synthesis, schema);
  }

  /**
   * Create fallback synthesis when AI fails
   */
  createFallbackSynthesis(agentResults, originalQuery) {
    console.warn('⚠️ [ResultSynthesizer] Using fallback synthesis');

    // Simple concatenation of successful results
    const successfulResults = agentResults.filter(r => r.success);

    let synthesis = `Based on your query "${originalQuery}", here's what I found:\n\n`;

    successfulResults.forEach(result => {
      const output = typeof result.output === 'string'
        ? result.output
        : JSON.stringify(result.output);

      synthesis += `• ${result.agentName}: ${output}\n`;
    });

    const failedResults = agentResults.filter(r => !r.success);
    if (failedResults.length > 0) {
      synthesis += `\nNote: ${failedResults.length} agent(s) encountered errors.`;
    }

    return {
      synthesis,
      keyInsights: successfulResults.map(r => `${r.agentName} completed successfully`),
      recommendations: [],
      agentContributions: Object.fromEntries(
        successfulResults.map(r => [r.agentName, 'Provided output'])
      ),
      metadata: {
        totalAgents: agentResults.length,
        synthesisQuality: 'low',
        conflictsResolved: 0,
        fallback: true
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Resolve conflicts between agent outputs
   * Uses confidence scores and agent specialization
   */
  resolveConflicts(agentResults, conflictType = 'pattern') {
    console.log(`🔍 [ResultSynthesizer] Resolving conflicts in ${conflictType}...`);

    // Find conflicting results
    const conflicts = this.detectConflicts(agentResults, conflictType);

    if (conflicts.length === 0) {
      return agentResults;
    }

    // Resolution strategies:
    // 1. Highest confidence wins
    // 2. Most specialized agent wins
    // 3. Majority vote for boolean conflicts

    const resolved = [];

    conflicts.forEach(conflict => {
      // Sort by confidence
      const sorted = conflict.options.sort((a, b) => {
        const confA = a.confidence || 0;
        const confB = b.confidence || 0;
        return confB - confA;
      });

      // Take highest confidence
      const winner = sorted[0];
      resolved.push({
        ...winner,
        metadata: {
          ...winner.metadata,
          resolvedConflict: true,
          alternativeOptions: sorted.slice(1)
        }
      });

      console.log(`✅ Resolved conflict: chose ${winner.agentName} (confidence: ${winner.confidence})`);
    });

    return resolved;
  }

  /**
   * Detect conflicts in agent outputs
   */
  detectConflicts(agentResults, conflictType) {
    // Simple implementation: look for contradictory boolean outputs
    // In production, this would be more sophisticated

    const conflicts = [];

    // Group results by output type
    const grouped = {};
    agentResults.forEach(result => {
      const outputType = this.getOutputType(result);
      if (!grouped[outputType]) {
        grouped[outputType] = [];
      }
      grouped[outputType].push(result);
    });

    // Check each group for conflicts
    Object.entries(grouped).forEach(([type, results]) => {
      if (results.length > 1) {
        // Check if outputs contradict
        const values = results.map(r => this.normalizeOutput(r.output));
        const unique = [...new Set(values)];

        if (unique.length > 1) {
          conflicts.push({
            type,
            options: results
          });
        }
      }
    });

    return conflicts;
  }

  /**
   * Get output type from agent result
   */
  getOutputType(result) {
    if (result.agentName.includes('Pattern')) return 'pattern';
    if (result.agentName.includes('Recommendation')) return 'recommendation';
    if (result.agentName.includes('Insight')) return 'insight';
    if (result.agentName.includes('Personality')) return 'personality';
    return 'unknown';
  }

  /**
   * Normalize output for comparison
   */
  normalizeOutput(output) {
    if (typeof output === 'string') {
      return output.toLowerCase().trim();
    }
    return JSON.stringify(output);
  }

  /**
   * Calculate synthesis quality score
   */
  calculateQuality(agentResults, synthesis) {
    let score = 100;

    // Deduct for failed agents
    const failedCount = agentResults.filter(r => !r.success).length;
    score -= failedCount * 20;

    // Deduct for missing insights
    if (!synthesis.keyInsights || synthesis.keyInsights.length === 0) {
      score -= 15;
    }

    // Deduct for missing recommendations
    if (!synthesis.recommendations || synthesis.recommendations.length === 0) {
      score -= 10;
    }

    // Deduct for short synthesis
    if (synthesis.synthesis && synthesis.synthesis.length < 100) {
      score -= 10;
    }

    // Quality thresholds
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }
}

export default ResultSynthesizer;
