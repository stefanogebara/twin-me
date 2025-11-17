/**
 * AgentBase - Base class for all Twin-Me AI agents
 *
 * Provides shared utilities for Claude API integration, tool management,
 * output validation, and error handling.
 *
 * Based on Anthropic's multi-agent best practices (2025):
 * - Clear delegation boundaries
 * - Specific agent instructions
 * - Tool quality enforcement
 * - Observable decision logging
 */

import Anthropic from '@anthropic-ai/sdk';

class AgentBase {
  constructor(config = {}) {
    this.name = config.name || 'BaseAgent';
    this.role = config.role || 'Assistant';
    this.model = config.model || 'claude-sonnet-4-20250514'; // Default to Sonnet 4
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.7;
    this.tools = config.tools || [];

    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Agent-specific system prompt (to be overridden)
    this.systemPrompt = this.buildSystemPrompt();

    // Metrics tracking
    this.metrics = {
      totalCalls: 0,
      totalTokens: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageLatency: 0
    };
  }

  /**
   * Build system prompt for this agent
   * MUST be overridden by subclasses
   */
  buildSystemPrompt() {
    return `You are ${this.name}, a specialized AI agent for Twin-Me.
Your role: ${this.role}

CRITICAL INSTRUCTIONS:
1. Stay within your scope of responsibility
2. Use provided tools when needed
3. Output valid JSON matching the specified schema
4. If you cannot complete a task, explain why clearly

Remember: You are part of a multi-agent system. Focus on YOUR specific task.`;
  }

  /**
   * Execute agent with Claude API
   *
   * @param {string} prompt - User prompt or task description
   * @param {object} options - Execution options
   * @returns {Promise<object>} Agent response
   */
  async execute(prompt, options = {}) {
    const startTime = Date.now();

    try {
      console.log(`🤖 [${this.name}] Executing task...`);

      // Build messages
      const messages = [
        {
          role: 'user',
          content: prompt
        }
      ];

      // Add conversation history if provided
      if (options.conversationHistory) {
        messages.unshift(...options.conversationHistory);
      }

      // Prepare API call parameters
      const apiParams = {
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: this.systemPrompt,
        messages
      };

      // Add tools if available
      if (this.tools.length > 0) {
        apiParams.tools = this.tools;
      }

      // Add extended thinking for complex reasoning (Opus only)
      if (this.model.includes('opus') && options.useExtendedThinking) {
        apiParams.thinking = {
          type: 'enabled',
          budget_tokens: 10000
        };
      }

      // Execute Claude API call
      const response = await this.client.messages.create(apiParams);

      // Update metrics
      this.updateMetrics(response, Date.now() - startTime, true);

      // Log observable decision (metadata only, not content)
      this.logDecision({
        model: this.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        toolsUsed: this.extractToolsUsed(response),
        latencyMs: Date.now() - startTime
      });

      // Process response
      const result = this.processResponse(response);

      console.log(`✅ [${this.name}] Task completed in ${Date.now() - startTime}ms`);

      return result;

    } catch (error) {
      this.metrics.failedCalls++;
      console.error(`❌ [${this.name}] Execution failed:`, error.message);

      throw new Error(`Agent ${this.name} failed: ${error.message}`);
    }
  }

  /**
   * Process Claude API response
   * Extracts content, handles tool use, validates output
   */
  processResponse(response) {
    const content = response.content;

    // Extract text content
    const textContent = content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    // Extract tool use blocks
    const toolUses = content.filter(block => block.type === 'tool_use');

    // Extract thinking content (if available)
    const thinking = content
      .filter(block => block.type === 'thinking')
      .map(block => block.thinking)
      .join('\n');

    return {
      text: textContent,
      toolUses,
      thinking,
      stopReason: response.stop_reason,
      usage: response.usage,
      raw: response
    };
  }

  /**
   * Extract which tools were used from response
   */
  extractToolsUsed(response) {
    return response.content
      .filter(block => block.type === 'tool_use')
      .map(block => block.name);
  }

  /**
   * Validate agent output against expected schema
   *
   * @param {object} output - Agent output to validate
   * @param {object} schema - JSON schema for validation
   * @returns {boolean} True if valid
   */
  validateOutput(output, schema) {
    try {
      // Simple validation - check required fields exist
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in output)) {
            console.warn(`⚠️ [${this.name}] Missing required field: ${field}`);
            return false;
          }
        }
      }

      // Check types if specified
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in output) {
            const actualType = typeof output[key];
            const expectedType = propSchema.type;

            if (expectedType && actualType !== expectedType &&
                !(expectedType === 'array' && Array.isArray(output[key]))) {
              console.warn(`⚠️ [${this.name}] Type mismatch for ${key}: expected ${expectedType}, got ${actualType}`);
              return false;
            }
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`❌ [${this.name}] Validation error:`, error);
      return false;
    }
  }

  /**
   * Parse JSON from agent response
   * Handles code blocks and malformed JSON
   */
  parseJSON(text) {
    try {
      // Try direct parse first
      return JSON.parse(text);
    } catch (e) {
      // Extract from code blocks
      const codeBlockMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        try {
          return JSON.parse(codeBlockMatch[1]);
        } catch (e2) {
          console.error(`❌ [${this.name}] Failed to parse JSON from code block`);
        }
      }

      // Try to find JSON object in text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e3) {
          console.error(`❌ [${this.name}] Failed to parse JSON from text`);
        }
      }

      throw new Error('Could not parse JSON from response');
    }
  }

  /**
   * Update agent metrics
   */
  updateMetrics(response, latencyMs, success) {
    this.metrics.totalCalls++;
    if (success) {
      this.metrics.successfulCalls++;
    }

    this.metrics.totalTokens += response.usage.input_tokens + response.usage.output_tokens;

    // Update average latency (running average)
    const alpha = 0.2; // Smoothing factor
    this.metrics.averageLatency = alpha * latencyMs + (1 - alpha) * this.metrics.averageLatency;
  }

  /**
   * Log observable decision metadata (NOT conversation content)
   * Following Anthropic best practices
   */
  logDecision(metadata) {
    console.log(`📊 [${this.name}] Decision:`, {
      agent: this.name,
      model: metadata.model,
      tokens: {
        input: metadata.inputTokens,
        output: metadata.outputTokens,
        total: metadata.inputTokens + metadata.outputTokens
      },
      toolsUsed: metadata.toolsUsed,
      latencyMs: metadata.latencyMs,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get agent metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalCalls > 0
        ? (this.metrics.successfulCalls / this.metrics.totalCalls * 100).toFixed(2) + '%'
        : 'N/A'
    };
  }

  /**
   * Reset agent metrics
   */
  resetMetrics() {
    this.metrics = {
      totalCalls: 0,
      totalTokens: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageLatency: 0
    };
  }

  /**
   * Add a tool to this agent
   */
  addTool(tool) {
    // Validate tool has required fields
    if (!tool.name || !tool.description) {
      throw new Error('Tool must have name and description');
    }

    // Check for duplicate
    const exists = this.tools.some(t => t.name === tool.name);
    if (exists) {
      console.warn(`⚠️ [${this.name}] Tool ${tool.name} already exists, replacing`);
      this.tools = this.tools.filter(t => t.name !== tool.name);
    }

    this.tools.push(tool);
    console.log(`🔧 [${this.name}] Added tool: ${tool.name}`);
  }

  /**
   * Remove a tool from this agent
   */
  removeTool(toolName) {
    const before = this.tools.length;
    this.tools = this.tools.filter(t => t.name !== toolName);
    const after = this.tools.length;

    if (before > after) {
      console.log(`🔧 [${this.name}] Removed tool: ${toolName}`);
    }
  }

  /**
   * Health check for this agent
   */
  async healthCheck() {
    try {
      const testResponse = await this.execute('Health check. Respond with "OK".');

      return {
        healthy: true,
        agent: this.name,
        model: this.model,
        toolCount: this.tools.length,
        metrics: this.getMetrics(),
        lastResponse: testResponse.text.includes('OK')
      };
    } catch (error) {
      return {
        healthy: false,
        agent: this.name,
        error: error.message
      };
    }
  }
}

export default AgentBase;
