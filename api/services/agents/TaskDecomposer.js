/**
 * TaskDecomposer - Analyzes user queries and decomposes into sub-tasks
 *
 * Core component of the Master Orchestrator that:
 * 1. Analyzes user intent from query
 * 2. Determines which specialized agents are needed
 * 3. Creates atomic sub-tasks with clear objectives
 * 4. Identifies dependencies and parallel execution opportunities
 *
 * Based on AgentOrchestra and Anthropic's hierarchical patterns.
 */

import AgentBase from './AgentBase.js';

class TaskDecomposer extends AgentBase {
  constructor() {
    // Available specialized agents (must be defined BEFORE super() call)
    const availableAgents = [
      {
        name: 'RecommendationAgent',
        capabilities: [
          'music recommendations',
          'content suggestions',
          'activity recommendations',
          'personalized playlists',
          'YouTube video suggestions'
        ],
        keywords: ['recommend', 'suggest', 'what should i', 'help me find', 'music', 'content']
      },
      {
        name: 'InsightAgent',
        capabilities: [
          'behavioral analytics',
          'pattern statistics',
          'trend analysis',
          'habit identification',
          'frequency metrics'
        ],
        keywords: ['analyze', 'insights', 'patterns', 'trends', 'how often', 'statistics', 'metrics']
      },
      {
        name: 'PersonalityAgent',
        capabilities: [
          'MBTI assessment',
          'personality validation',
          'pattern alignment',
          'stress response analysis',
          'preparation style'
        ],
        keywords: ['personality', 'mbti', 'traits', 'am i', 'my style', 'how do i']
      },
      {
        name: 'PatternDetectorAgent',
        capabilities: [
          'temporal pattern detection',
          'correlation discovery',
          'GNN-based patterns',
          'behavioral sequences',
          'event-activity relationships'
        ],
        keywords: ['pattern', 'before', 'after', 'when', 'habit', 'routine', 'always', 'usually']
      }
    ];

    super({
      name: 'TaskDecomposer',
      role: 'Query analysis and task decomposition specialist',
      model: 'claude-opus-4-20250514', // Use Opus for reasoning
      maxTokens: 2048,
      temperature: 0.3 // Lower temperature for consistent decomposition
    });

    // Store availableAgents as instance property
    this.availableAgents = availableAgents;

    // CRITICAL: Rebuild system prompt AFTER availableAgents is assigned
    // AgentBase constructor already called buildSystemPrompt() but this.availableAgents was undefined then
    this.systemPrompt = this.buildSystemPrompt();
  }

  /**
   * Build system prompt for task decomposition
   */
  buildSystemPrompt() {
    // Handle case where availableAgents hasn't been set yet (during super() call)
    if (!this.availableAgents) {
      return 'TaskDecomposer system prompt (initializing...)';
    }

    return `You are the TaskDecomposer, a specialized AI component of Twin-Me's multi-agent orchestration system.

YOUR ROLE:
Analyze user queries and decompose them into atomic sub-tasks for specialized agents.

AVAILABLE AGENTS:
${this.availableAgents.map(agent => `
- ${agent.name}:
  Capabilities: ${agent.capabilities.join(', ')}
`).join('\n')}

YOUR TASK:
1. Analyze the user's query to extract intent
2. Determine which specialized agents are needed
3. Create specific, bounded sub-tasks for each agent
4. Identify dependencies between tasks
5. Mark tasks that can execute in parallel

OUTPUT FORMAT (JSON):
{
  "intent": "Brief description of what user wants",
  "complexity": "simple|moderate|complex",
  "tasks": [
    {
      "agent": "AgentName",
      "objective": "Specific task for this agent",
      "priority": 1,
      "parallel": true,
      "dependencies": [],
      "expectedOutput": "What this agent should return"
    }
  ],
  "reasoning": "Why you chose these agents and this decomposition"
}

RULES:
1. Keep objectives specific and bounded
2. Priority 1 = execute first, 2 = after priority 1, etc.
3. parallel: true = can run concurrently with other priority 1 tasks
4. Only add dependencies if one task REQUIRES output from another
5. Simple queries may only need 1 agent
6. Complex queries may need 3-4 agents working together

EXAMPLES:

Query: "What music should I listen to before my presentation tomorrow?"
{
  "intent": "Get music recommendations for pre-presentation preparation",
  "complexity": "moderate",
  "tasks": [
    {
      "agent": "PatternDetectorAgent",
      "objective": "Find user's music listening patterns before important events",
      "priority": 1,
      "parallel": true,
      "dependencies": [],
      "expectedOutput": "Temporal patterns showing music preferences before events"
    },
    {
      "agent": "PersonalityAgent",
      "objective": "Assess user's stress response style and preparation preferences",
      "priority": 1,
      "parallel": true,
      "dependencies": [],
      "expectedOutput": "Personality traits related to stress and preparation"
    },
    {
      "agent": "RecommendationAgent",
      "objective": "Generate music recommendations based on patterns and personality",
      "priority": 2,
      "parallel": false,
      "dependencies": ["PatternDetectorAgent", "PersonalityAgent"],
      "expectedOutput": "Personalized music playlist with reasoning"
    }
  ],
  "reasoning": "User wants recommendations, which requires understanding their patterns and personality first, then generating personalized suggestions."
}

Query: "What patterns do you see in my behavior?"
{
  "intent": "Discover behavioral patterns across platforms",
  "complexity": "moderate",
  "tasks": [
    {
      "agent": "PatternDetectorAgent",
      "objective": "Detect all temporal and correlation patterns in user data",
      "priority": 1,
      "parallel": true,
      "dependencies": [],
      "expectedOutput": "List of detected patterns with confidence scores"
    },
    {
      "agent": "InsightAgent",
      "objective": "Analyze patterns to generate human-readable insights",
      "priority": 2,
      "parallel": false,
      "dependencies": ["PatternDetectorAgent"],
      "expectedOutput": "Behavioral insights with metrics and trends"
    }
  ],
  "reasoning": "User wants insights about their behavior, which requires first detecting patterns, then analyzing them for insights."
}

Remember: Output ONLY valid JSON. No additional text.`;
  }

  /**
   * Decompose user query into sub-tasks
   *
   * @param {string} query - User's query
   * @param {object} context - Additional context (user data, calendar events, etc.)
   * @returns {Promise<object>} Task decomposition
   */
  async decompose(query, context = {}) {
    console.log(`🧩 [TaskDecomposer] Analyzing query: "${query}"`);

    try {
      // Build context-enriched prompt
      const prompt = this.buildDecompositionPrompt(query, context);

      // Execute with extended thinking for complex reasoning
      const response = await this.execute(prompt, {
        useExtendedThinking: true
      });

      // Parse JSON response
      const decomposition = this.parseJSON(response.text);

      // Validate decomposition
      if (!this.validateDecomposition(decomposition)) {
        throw new Error('Invalid decomposition format');
      }

      console.log(`✅ [TaskDecomposer] Decomposed into ${decomposition.tasks.length} tasks (${decomposition.complexity})`);

      return {
        ...decomposition,
        metadata: {
          query,
          timestamp: new Date().toISOString(),
          tokensUsed: response.usage.input_tokens + response.usage.output_tokens
        }
      };

    } catch (error) {
      console.error(`❌ [TaskDecomposer] Decomposition failed:`, error);

      // Fallback to simple single-agent task
      return this.createFallbackDecomposition(query);
    }
  }

  /**
   * Build decomposition prompt with context
   */
  buildDecompositionPrompt(query, context) {
    let prompt = `User query: "${query}"\n\n`;

    // Add context if available
    if (context.upcomingEvents && context.upcomingEvents.length > 0) {
      prompt += `Upcoming calendar events:\n`;
      context.upcomingEvents.forEach(event => {
        prompt += `- ${event.summary} at ${event.start_time}\n`;
      });
      prompt += '\n';
    }

    if (context.recentPatterns && context.recentPatterns.length > 0) {
      prompt += `Recently detected patterns:\n`;
      context.recentPatterns.forEach(pattern => {
        prompt += `- ${pattern.description} (confidence: ${pattern.confidence_score}%)\n`;
      });
      prompt += '\n';
    }

    if (context.personalityType) {
      prompt += `User personality type: ${context.personalityType}\n\n`;
    }

    prompt += `Decompose this query into sub-tasks for the available agents. Output JSON only.`;

    return prompt;
  }

  /**
   * Validate decomposition structure
   */
  validateDecomposition(decomposition) {
    const schema = {
      required: ['intent', 'complexity', 'tasks'],
      properties: {
        intent: { type: 'string' },
        complexity: { type: 'string' },
        tasks: { type: 'array' }
      }
    };

    if (!this.validateOutput(decomposition, schema)) {
      return false;
    }

    // Validate each task
    for (const task of decomposition.tasks) {
      if (!task.agent || !task.objective || !task.priority) {
        console.warn('⚠️ Task missing required fields:', task);
        return false;
      }

      // Check agent exists
      const agentExists = this.availableAgents.some(a => a.name === task.agent);
      if (!agentExists) {
        console.warn('⚠️ Unknown agent:', task.agent);
        return false;
      }
    }

    return true;
  }

  /**
   * Create fallback decomposition when AI fails
   */
  createFallbackDecomposition(query) {
    console.warn('⚠️ [TaskDecomposer] Using fallback decomposition');

    // Try to detect intent from keywords
    const lowerQuery = query.toLowerCase();
    let agent = 'InsightAgent'; // Default

    if (lowerQuery.match(/recommend|suggest|what should/)) {
      agent = 'RecommendationAgent';
    } else if (lowerQuery.match(/pattern|before|after|habit/)) {
      agent = 'PatternDetectorAgent';
    } else if (lowerQuery.match(/personality|mbti|am i/)) {
      agent = 'PersonalityAgent';
    }

    return {
      intent: 'Process user query with best-fit agent',
      complexity: 'simple',
      tasks: [
        {
          agent,
          objective: query,
          priority: 1,
          parallel: false,
          dependencies: [],
          expectedOutput: 'Response to user query'
        }
      ],
      reasoning: 'Fallback: Single-agent execution',
      metadata: {
        query,
        timestamp: new Date().toISOString(),
        fallback: true
      }
    };
  }

  /**
   * Get dependency graph from decomposition
   * Returns topologically sorted tasks
   */
  getExecutionOrder(decomposition) {
    const tasks = decomposition.tasks;

    // Group by priority
    const grouped = {};
    tasks.forEach(task => {
      if (!grouped[task.priority]) {
        grouped[task.priority] = [];
      }
      grouped[task.priority].push(task);
    });

    // Sort priorities
    const priorities = Object.keys(grouped).map(Number).sort((a, b) => a - b);

    // Build execution order
    const executionOrder = [];
    priorities.forEach(priority => {
      const tasksAtPriority = grouped[priority];

      // Separate parallel and sequential
      const parallel = tasksAtPriority.filter(t => t.parallel);
      const sequential = tasksAtPriority.filter(t => !t.parallel);

      if (parallel.length > 0) {
        executionOrder.push({
          type: 'parallel',
          tasks: parallel
        });
      }

      sequential.forEach(task => {
        executionOrder.push({
          type: 'sequential',
          tasks: [task]
        });
      });
    });

    return executionOrder;
  }

  /**
   * Estimate task complexity and execution time
   */
  estimateComplexity(decomposition) {
    const taskCount = decomposition.tasks.length;
    const parallelCount = decomposition.tasks.filter(t => t.parallel).length;

    let estimatedTime = 0;

    // Simple heuristic based on Anthropic's benchmarks
    if (taskCount === 1) {
      estimatedTime = 3; // 3 seconds for simple query
    } else if (parallelCount >= 2) {
      estimatedTime = 8; // Parallel execution saves time
    } else {
      estimatedTime = taskCount * 5; // Sequential tasks
    }

    return {
      taskCount,
      parallelTasks: parallelCount,
      sequentialTasks: taskCount - parallelCount,
      estimatedTimeSeconds: estimatedTime,
      complexity: decomposition.complexity
    };
  }
}

export default TaskDecomposer;

