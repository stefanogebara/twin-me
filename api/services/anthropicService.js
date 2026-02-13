/**
 * Anthropic Claude Service
 *
 * Handles integration with Anthropic's Claude API for twin chat responses.
 * Supports streaming, context management, and token tracking.
 */

import { complete, stream as llmStream, TIER_CHAT, TIER_ANALYSIS, TIER_EXTRACTION } from './llmGateway.js';

/**
 * Generate chat response using Claude API
 */
export async function generateChatResponse(options) {
  const {
    systemPrompt,
    messages,
    stream = false,
    maxTokens = 1024,
    temperature = 0.7,
    onStream = null
  } = options;

  try {
    console.log('[AnthropicService] Generating chat response...');
    console.log(`[AnthropicService] Messages count: ${messages.length}`);

    // Format messages for Claude API
    const formattedMessages = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }));

    if (stream && onStream) {
      return await streamChatResponse({
        systemPrompt,
        messages: formattedMessages,
        maxTokens,
        temperature,
        onStream
      });
    } else {
      return await generateNonStreamingResponse({
        systemPrompt,
        messages: formattedMessages,
        maxTokens,
        temperature
      });
    }
  } catch (error) {
    console.error('[AnthropicService] Error generating response:', error);
    throw error;
  }
}

/**
 * Generate non-streaming response
 */
async function generateNonStreamingResponse(options) {
  const { systemPrompt, messages, maxTokens, temperature } = options;

  // Convert array-format system prompt to string for gateway
  const systemString = Array.isArray(systemPrompt)
    ? systemPrompt.map(b => b.text || b).join('\n')
    : systemPrompt;

  const result = await complete({
    tier: TIER_ANALYSIS,
    system: systemString,
    messages,
    maxTokens,
    temperature,
    serviceName: 'anthropicService'
  });

  return {
    content: result.content,
    usage: result.usage,
    cost: result.cost,
    model: result.model,
    stop_reason: 'end_turn'
  };
}

/**
 * Generate streaming response
 */
async function streamChatResponse(options) {
  const { systemPrompt, messages, maxTokens, temperature, onStream } = options;

  // Convert array-format system prompt to string for gateway
  const systemString = Array.isArray(systemPrompt)
    ? systemPrompt.map(b => b.text || b).join('\n')
    : systemPrompt;

  const result = await llmStream({
    tier: TIER_CHAT,
    system: systemString,
    messages,
    maxTokens,
    temperature,
    serviceName: 'anthropicService-stream',
    onChunk: (chunk) => {
      if (onStream) {
        onStream({
          type: 'chunk',
          content: chunk,
          fullContent: '' // gateway accumulates internally
        });
      }
    }
  });

  // Final callback
  if (onStream) {
    onStream({
      type: 'complete',
      content: result.content,
      usage: result.usage,
      cost: result.cost
    });
  }

  return {
    content: result.content,
    usage: result.usage,
    cost: result.cost,
    model: result.model,
    stop_reason: 'end_turn'
  };
}


/**
 * Manage conversation context to stay within token limits
 * Claude 3.5 Sonnet has 200k context window
 */
export function pruneConversationHistory(messages, systemPrompt, maxContextTokens = 100000) {
  // Rough estimate: 1 token ≈ 4 characters
  const estimateTokens = (text) => Math.ceil((text || '').length / 4);

  // Handle both string and array-format system prompts
  let systemTokens;
  if (Array.isArray(systemPrompt)) {
    systemTokens = systemPrompt.reduce((sum, block) => sum + estimateTokens(block.text || ''), 0);
  } else {
    systemTokens = estimateTokens(systemPrompt);
  }
  let totalTokens = systemTokens;
  let prunedMessages = [];

  // Always keep the most recent messages
  // Work backwards until we hit token limit
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content);

    if (totalTokens + msgTokens > maxContextTokens) {
      console.log(`[AnthropicService] Pruned ${i + 1} older messages to stay within token limit`);
      break;
    }

    prunedMessages.unshift(messages[i]);
    totalTokens += msgTokens;
  }

  // If we pruned messages, add a system message explaining the gap
  if (prunedMessages.length < messages.length && prunedMessages.length > 0) {
    prunedMessages.unshift({
      role: 'user',
      content: '[Earlier conversation history omitted to manage context length]'
    });
  }

  console.log(`[AnthropicService] Context: ${prunedMessages.length} messages, ~${totalTokens} tokens`);

  return prunedMessages;
}

/**
 * Generate conversation title from first message
 */
export async function generateConversationTitle(firstMessage) {
  try {
    const result = await complete({
      tier: TIER_EXTRACTION,
      system: 'Generate a very short (2-5 words) title for this conversation. Just output the title, nothing else.',
      messages: [
        { role: 'user', content: firstMessage }
      ],
      maxTokens: 20,
      temperature: 0.5,
      serviceName: 'anthropicService-title'
    });

    const title = result.content.trim();
    console.log(`[AnthropicService] Generated title: "${title}"`);

    return title;
  } catch (error) {
    console.error('[AnthropicService] Error generating title:', error);
    return 'New Conversation';
  }
}

/**
 * Rate limit checker - 50 messages per hour per user
 */
const rateLimitCache = new Map();

export function checkRateLimit(userId) {
  const now = Date.now();
  const hourAgo = now - (60 * 60 * 1000);

  // Get or initialize user's request history
  let userRequests = rateLimitCache.get(userId) || [];

  // Remove requests older than 1 hour
  userRequests = userRequests.filter(timestamp => timestamp > hourAgo);

  // Check if over limit
  if (userRequests.length >= 50) {
    const oldestRequest = Math.min(...userRequests);
    const resetTime = new Date(oldestRequest + (60 * 60 * 1000));

    return {
      allowed: false,
      remaining: 0,
      resetAt: resetTime,
      message: `Rate limit exceeded. Resets at ${resetTime.toLocaleTimeString()}`
    };
  }

  // Add current request
  userRequests.push(now);
  rateLimitCache.set(userId, userRequests);

  return {
    allowed: true,
    remaining: 50 - userRequests.length,
    resetAt: new Date(now + (60 * 60 * 1000)),
    message: 'OK'
  };
}

/**
 * Clean up rate limit cache periodically
 */
setInterval(() => {
  const now = Date.now();
  const hourAgo = now - (60 * 60 * 1000);

  for (const [userId, requests] of rateLimitCache.entries()) {
    const validRequests = requests.filter(timestamp => timestamp > hourAgo);

    if (validRequests.length === 0) {
      rateLimitCache.delete(userId);
    } else {
      rateLimitCache.set(userId, validRequests);
    }
  }

  console.log(`[AnthropicService] Rate limit cache cleaned: ${rateLimitCache.size} users tracked`);
}, 5 * 60 * 1000); // Clean every 5 minutes

/**
 * Health check for Anthropic API
 */
export async function healthCheck() {
  try {
    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{ role: 'user', content: 'Hello' }],
      maxTokens: 10,
      serviceName: 'anthropicService-health'
    });

    return {
      status: 'healthy',
      model: result.model,
      message: 'LLM Gateway is responsive'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      message: 'LLM Gateway is not responding'
    };
  }
}
