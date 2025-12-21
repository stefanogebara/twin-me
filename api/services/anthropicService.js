/**
 * Anthropic Claude Service
 *
 * Handles integration with Anthropic's Claude API for twin chat responses.
 * Supports streaming, context management, and token tracking.
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Claude 3.5 Sonnet pricing (per million tokens)
const PRICING = {
  input: 3.00,  // $3 per 1M input tokens
  output: 15.00  // $15 per 1M output tokens
};

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

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: maxTokens,
    temperature: temperature,
    system: systemPrompt,
    messages: messages
  });

  const content = response.content[0].text;
  const usage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    total_tokens: response.usage.input_tokens + response.usage.output_tokens
  };

  const cost = calculateCost(usage);

  console.log(`[AnthropicService] Response generated: ${usage.total_tokens} tokens, $${cost.toFixed(4)}`);

  return {
    content,
    usage,
    cost,
    model: response.model,
    stop_reason: response.stop_reason
  };
}

/**
 * Generate streaming response
 */
async function streamChatResponse(options) {
  const { systemPrompt, messages, maxTokens, temperature, onStream } = options;

  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: maxTokens,
    temperature: temperature,
    system: systemPrompt,
    messages: messages,
    stream: true
  });

  for await (const event of stream) {
    if (event.type === 'message_start') {
      inputTokens = event.message.usage.input_tokens;
    }

    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const chunk = event.delta.text;
      fullContent += chunk;

      // Call stream callback
      if (onStream) {
        onStream({
          type: 'chunk',
          content: chunk,
          fullContent: fullContent
        });
      }
    }

    if (event.type === 'message_delta') {
      outputTokens = event.usage.output_tokens;
    }

    if (event.type === 'message_stop') {
      const usage = {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      };

      const cost = calculateCost(usage);

      console.log(`[AnthropicService] Streaming complete: ${usage.total_tokens} tokens, $${cost.toFixed(4)}`);

      // Final callback
      if (onStream) {
        onStream({
          type: 'complete',
          content: fullContent,
          usage,
          cost
        });
      }
    }
  }

  const usage = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens
  };

  const cost = calculateCost(usage);

  return {
    content: fullContent,
    usage,
    cost,
    model: 'claude-sonnet-4-5-20250929',
    stop_reason: 'end_turn'
  };
}

/**
 * Calculate cost based on token usage
 */
function calculateCost(usage) {
  const inputCost = (usage.input_tokens / 1_000_000) * PRICING.input;
  const outputCost = (usage.output_tokens / 1_000_000) * PRICING.output;
  return inputCost + outputCost;
}

/**
 * Manage conversation context to stay within token limits
 * Claude 3.5 Sonnet has 200k context window
 */
export function pruneConversationHistory(messages, systemPrompt, maxContextTokens = 100000) {
  // Rough estimate: 1 token ≈ 4 characters
  const estimateTokens = (text) => Math.ceil(text.length / 4);

  let systemTokens = estimateTokens(systemPrompt);
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
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 20,
      temperature: 0.5,
      system: 'Generate a very short (2-5 words) title for this conversation. Just output the title, nothing else.',
      messages: [
        { role: 'user', content: firstMessage }
      ]
    });

    const title = response.content[0].text.trim();
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
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hello' }]
    });

    return {
      status: 'healthy',
      model: response.model,
      message: 'Anthropic API is responsive'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      message: 'Anthropic API is not responding'
    };
  }
}
