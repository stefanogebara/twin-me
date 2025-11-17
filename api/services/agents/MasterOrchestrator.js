/**
 * MasterOrchestrator - Central coordinator for multi-agent system
 *
 * Coordinates the entire multi-agent workflow:
 * 1. Receives user queries
 * 2. Decomposes into sub-tasks (TaskDecomposer)
 * 3. Routes tasks to specialized agents
 * 4. Executes agents in parallel/sequential order
 * 5. Synthesizes results (ResultSynthesizer)
 * 6. Returns unified response
 *
 * Based on Anthropic's orchestrator-worker pattern with
 * Claude Opus 4 orchestrator + Claude Sonnet 4 subagents.
 */

import TaskDecomposer from './TaskDecomposer.js';
import ResultSynthesizer from './ResultSynthesizer.js';

class MasterOrchestrator {
  constructor(config = {}) {
    this.name = 'MasterOrchestrator';
    this.taskDecomposer = new TaskDecomposer();
    this.resultSynthesizer = new ResultSynthesizer();

    // Registry of available specialized agents
    this.agents = new Map();

    // Configuration
    this.config = {
      maxParallelAgents: config.maxParallelAgents || 4,
      agentTimeout: config.agentTimeout || 30000, // 30 seconds
      enableRetry: config.enableRetry !== false,
      maxRetries: config.maxRetries || 1,
      ...config
    };

    // Session state management
    this.activeSessions = new Map();

    // Metrics
    this.metrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      averageLatency: 0,
      totalAgentCalls: 0
    };
  }

  /**
   * Register a specialized agent
   *
   * @param {string} name - Agent name (must match TaskDecomposer agent names)
   * @param {AgentBase} agent - Agent instance
   */
  registerAgent(name, agent) {
    if (this.agents.has(name)) {
      console.warn(`⚠️ [MasterOrchestrator] Agent ${name} already registered, replacing`);
    }

    this.agents.set(name, agent);
    console.log(`🤖 [MasterOrchestrator] Registered agent: ${name}`);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(name) {
    if (this.agents.delete(name)) {
      console.log(`🤖 [MasterOrchestrator] Unregistered agent: ${name}`);
    }
  }

  /**
   * Get list of registered agents
   */
  getRegisteredAgents() {
    return Array.from(this.agents.keys());
  }

  /**
   * Process user query through multi-agent system
   *
   * @param {string} query - User's query
   * @param {object} options - Processing options
   * @returns {Promise<object>} Synthesized response
   */
  async processQuery(query, options = {}) {
    const sessionId = options.sessionId || this.generateSessionId();
    const startTime = Date.now();

    console.log(`\n🎭 [MasterOrchestrator] Starting session ${sessionId}`);
    console.log(`📝 Query: "${query}"`);

    try {
      // Update metrics
      this.metrics.totalQueries++;

      // Initialize session state
      this.initializeSession(sessionId, query, options);

      // Step 1: Task Decomposition
      console.log(`\n🧩 Step 1: Task Decomposition`);
      const decomposition = await this.taskDecomposer.decompose(query, options.context);

      this.updateSessionState(sessionId, 'decomposition', decomposition);

      // Log decomposition
      console.log(`📊 Complexity: ${decomposition.complexity}`);
      console.log(`📋 Tasks: ${decomposition.tasks.length}`);
      decomposition.tasks.forEach((task, i) => {
        console.log(`  ${i + 1}. ${task.agent} (priority: ${task.priority}, parallel: ${task.parallel})`);
      });

      // Step 2: Execute agents
      console.log(`\n🚀 Step 2: Agent Execution`);
      const executionOrder = this.taskDecomposer.getExecutionOrder(decomposition);
      const agentResults = await this.executeAgents(executionOrder, sessionId);

      this.updateSessionState(sessionId, 'agentResults', agentResults);

      // Step 3: Result Synthesis
      console.log(`\n🔗 Step 3: Result Synthesis`);
      const synthesis = await this.resultSynthesizer.synthesize(
        decomposition,
        agentResults,
        query
      );

      this.updateSessionState(sessionId, 'synthesis', synthesis);

      // Calculate latency
      const latencyMs = Date.now() - startTime;
      this.updateMetrics(latencyMs, true);

      console.log(`\n✅ [MasterOrchestrator] Session ${sessionId} completed in ${latencyMs}ms`);

      // Return final result
      return {
        sessionId,
        query,
        synthesis: synthesis.synthesis,
        keyInsights: synthesis.keyInsights,
        recommendations: synthesis.recommendations || [],
        metadata: {
          ...synthesis.metadata,
          latencyMs,
          decomposition: {
            intent: decomposition.intent,
            complexity: decomposition.complexity,
            taskCount: decomposition.tasks.length
          },
          agentContributions: synthesis.agentContributions || {}
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ [MasterOrchestrator] Session ${sessionId} failed:`, error);

      this.metrics.failedQueries++;
      this.updateSessionState(sessionId, 'error', error.message);

      throw new Error(`Orchestration failed: ${error.message}`);
    } finally {
      // Cleanup session after delay
      setTimeout(() => this.cleanupSession(sessionId), 60000); // 1 minute
    }
  }

  /**
   * Execute agents according to execution order
   */
  async executeAgents(executionOrder, sessionId) {
    const allResults = [];

    for (const step of executionOrder) {
      if (step.type === 'parallel') {
        console.log(`⚡ Executing ${step.tasks.length} agents in parallel...`);

        // Execute parallel tasks concurrently
        const parallelPromises = step.tasks.map(task =>
          this.executeAgent(task, sessionId, allResults)
        );

        const parallelResults = await Promise.allSettled(parallelPromises);

        // Process results
        parallelResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            allResults.push(result.value);
          } else {
            // Log failure but continue
            console.error(`❌ Parallel agent failed:`, result.reason);
            allResults.push({
              agentName: step.tasks[index].agent,
              success: false,
              error: result.reason.message,
              timestamp: new Date().toISOString()
            });
          }
        });

      } else {
        // Sequential execution
        const task = step.tasks[0];
        console.log(`🔄 Executing ${task.agent} sequentially...`);

        try {
          const result = await this.executeAgent(task, sessionId, allResults);
          allResults.push(result);
        } catch (error) {
          console.error(`❌ Sequential agent failed:`, error);
          allResults.push({
            agentName: task.agent,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    return allResults;
  }

  /**
   * Execute a single agent task
   */
  async executeAgent(task, sessionId, previousResults) {
    const startTime = Date.now();

    try {
      // Get agent instance
      const agent = this.agents.get(task.agent);
      if (!agent) {
        throw new Error(`Agent ${task.agent} not registered`);
      }

      // Build agent context from previous results if there are dependencies
      let context = {};
      if (task.dependencies && task.dependencies.length > 0) {
        context = this.buildAgentContext(task.dependencies, previousResults);
      }

      // Build agent prompt
      const prompt = this.buildAgentPrompt(task, context);

      // Execute agent with timeout
      const result = await this.executeWithTimeout(
        agent.execute(prompt),
        this.config.agentTimeout,
        `Agent ${task.agent} timed out`
      );

      this.metrics.totalAgentCalls++;

      return {
        agentName: task.agent,
        success: true,
        output: result.text,
        parsedOutput: this.tryParseOutput(result.text),
        confidence: this.extractConfidence(result.text),
        tokensUsed: result.usage.input_tokens + result.usage.output_tokens,
        latencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      // Retry logic if enabled
      if (this.config.enableRetry && !task._retryCount) {
        console.warn(`⚠️ Retrying ${task.agent}...`);
        task._retryCount = 1;
        return this.executeAgent(task, sessionId, previousResults);
      }

      throw error;
    }
  }

  /**
   * Build agent context from dependency results
   */
  buildAgentContext(dependencies, previousResults) {
    const context = {};

    dependencies.forEach(depName => {
      const depResult = previousResults.find(r => r.agentName === depName);
      if (depResult && depResult.success) {
        context[depName] = depResult.parsedOutput || depResult.output;
      }
    });

    return context;
  }

  /**
   * Build prompt for agent based on task and context
   */
  buildAgentPrompt(task, context) {
    let prompt = `Task: ${task.objective}\n\n`;

    if (task.expectedOutput) {
      prompt += `Expected output: ${task.expectedOutput}\n\n`;
    }

    if (Object.keys(context).length > 0) {
      prompt += `Context from other agents:\n`;
      Object.entries(context).forEach(([agentName, data]) => {
        const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        prompt += `\n${agentName}:\n${dataStr}\n`;
      });
      prompt += '\n';
    }

    prompt += `Complete your task and output the result.`;

    return prompt;
  }

  /**
   * Execute promise with timeout
   */
  executeWithTimeout(promise, timeoutMs, errorMessage) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      )
    ]);
  }

  /**
   * Try to parse agent output as JSON
   */
  tryParseOutput(text) {
    try {
      // Use AgentBase's parseJSON utility
      return this.taskDecomposer.parseJSON(text);
    } catch (e) {
      return null;
    }
  }

  /**
   * Extract confidence score from agent output
   */
  extractConfidence(text) {
    // Look for confidence patterns like "confidence: 0.85" or "85% confidence"
    const patterns = [
      /confidence[:\s]+(\d+\.?\d*)%?/i,
      /(\d+\.?\d*)%?\s+confidence/i,
      /"confidence"[:\s]+(\d+\.?\d*)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        return value > 1 ? value / 100 : value; // Normalize to 0-1
      }
    }

    return null;
  }

  /**
   * Initialize session state
   */
  initializeSession(sessionId, query, options) {
    this.activeSessions.set(sessionId, {
      sessionId,
      query,
      options,
      startTime: Date.now(),
      state: 'initializing',
      decomposition: null,
      agentResults: null,
      synthesis: null,
      error: null
    });
  }

  /**
   * Update session state
   */
  updateSessionState(sessionId, key, value) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session[key] = value;
      session.state = key;
    }
  }

  /**
   * Cleanup session
   */
  cleanupSession(sessionId) {
    this.activeSessions.delete(sessionId);
    console.log(`🧹 [MasterOrchestrator] Cleaned up session ${sessionId}`);
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update metrics
   */
  updateMetrics(latencyMs, success) {
    if (success) {
      this.metrics.successfulQueries++;
    }

    // Update average latency (running average)
    const alpha = 0.2;
    this.metrics.averageLatency = alpha * latencyMs + (1 - alpha) * this.metrics.averageLatency;
  }

  /**
   * Get orchestrator metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalQueries > 0
        ? (this.metrics.successfulQueries / this.metrics.totalQueries * 100).toFixed(2) + '%'
        : 'N/A',
      activeSessions: this.activeSessions.size,
      registeredAgents: this.agents.size
    };
  }

  /**
   * Get session state
   */
  getSessionState(sessionId) {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Health check for orchestrator and all agents
   */
  async healthCheck() {
    console.log('🏥 [MasterOrchestrator] Running health check...');

    const results = {
      orchestrator: {
        healthy: true,
        registeredAgents: this.agents.size,
        activeSessions: this.activeSessions.size,
        metrics: this.getMetrics()
      },
      agents: {}
    };

    // Check each agent
    for (const [name, agent] of this.agents.entries()) {
      try {
        if (typeof agent.healthCheck === 'function') {
          results.agents[name] = await agent.healthCheck();
        } else {
          results.agents[name] = { healthy: true, note: 'No health check method' };
        }
      } catch (error) {
        results.agents[name] = { healthy: false, error: error.message };
      }
    }

    const allHealthy = Object.values(results.agents).every(a => a.healthy !== false);
    results.orchestrator.healthy = allHealthy;

    return results;
  }
}

export default MasterOrchestrator;
