/**
 * RAG (Retrieval-Augmented Generation) Service
 * Combines vector search with OpenAI API for personalized responses
 */

import { createClient } from '@supabase/supabase-js';
import embeddingGenerator from './embeddingGenerator.js';
import stylometricAnalyzer from './stylometricAnalyzer.js';
import { sanitizeUnicode, sanitizeObject } from '../utils/unicodeSanitizer.js';

// Use SUPABASE_URL (backend) - fallback to VITE_ prefix for compatibility
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Log initialization status
console.log('[RAG Service] Supabase client initialized:', {
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
});

class RAGService {
  constructor() {
    // Azure OpenAI configuration
    this.azureApiKey = process.env.AZURE_OPENAI_API_KEY;
    this.azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://twinme.openai.azure.com';
    this.azureChatDeployment = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o';
    this.azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-01';

    console.log('[RAG Service] Initialized with Azure OpenAI:', {
      hasApiKey: !!this.azureApiKey,
      endpoint: this.azureEndpoint,
      deployment: this.azureChatDeployment,
      apiVersion: this.azureApiVersion
    });
  }

  /**
   * Generate a response using RAG
   */
  async chat(userId, twinId, userMessage, conversationHistory = []) {
    console.log(`[RAG] Processing chat for user ${userId}...`);

    try {
      // Step 1: Generate query embedding
      console.log('[RAG] Generating query embedding...');
      const queryEmbedding = await embeddingGenerator.generateQueryEmbedding(userMessage);

      if (!queryEmbedding) {
        throw new Error('Failed to generate query embedding');
      }

      // Step 2: Search for relevant content (parallel)
      console.log('[RAG] Retrieving relevant context...');
      const [relevantChunks, styleProfile, pastConversations, platformInsights] = await Promise.all([
        this.searchSimilarContent(userId, queryEmbedding),
        this.getStyleProfile(userId),
        this.searchRelevantConversations(userId, queryEmbedding),
        this.getPlatformInsights(userId)
      ]);

      // Step 3: Build prompts
      console.log('[RAG] Building prompts...');
      const systemPrompt = this.buildSystemPrompt(styleProfile);
      const contextPrompt = this.buildContextPrompt(relevantChunks, pastConversations, platformInsights);

      // Step 4: Call OpenAI API
      console.log('[RAG] Calling OpenAI API...');
      const response = await this.callOpenAI(systemPrompt, contextPrompt, userMessage, conversationHistory);

      // Step 5: Store conversation in memory
      console.log('[RAG] Storing conversation memory...');
      await this.storeConversationMemory(userId, twinId, userMessage, response, queryEmbedding);

      return {
        success: true,
        response,
        context: {
          relevantChunksCount: relevantChunks.length,
          pastConversationsCount: pastConversations.length,
          confidenceScore: styleProfile?.confidence_score || 0.5
        }
      };
    } catch (error) {
      console.error('[RAG] Error in chat:', error);
      throw error;
    }
  }

  /**
   * Search for similar content using vector embeddings
   */
  async searchSimilarContent(userId, queryEmbedding, limit = 10, threshold = 0.7) {
    try {
      const queryVector = `[${queryEmbedding.join(',')}]`;

      const { data, error } = await supabase
        .rpc('search_similar_content', {
          query_embedding: queryVector,
          match_user_id: userId,
          match_platform: null,
          match_count: limit,
          similarity_threshold: threshold
        });

      if (error) {
        console.error('[RAG] Error searching similar content:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[RAG] Exception in searchSimilarContent:', error);
      return [];
    }
  }

  /**
   * Get user's style profile
   */
  async getStyleProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('user_style_profile')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.log('[RAG] No style profile found, using defaults');
        return null;
      }

      return data;
    } catch (error) {
      console.error('[RAG] Error getting style profile:', error);
      return null;
    }
  }

  /**
   * Search for relevant past conversations
   */
  async searchRelevantConversations(userId, queryEmbedding, limit = 5) {
    try {
      const queryVector = `[${queryEmbedding.join(',')}]`;

      const { data, error } = await supabase
        .from('conversation_memory')
        .select('message_content, timestamp, importance_score, embedding')
        .eq('user_id', userId)
        .order('importance_score', { ascending: false })
        .limit(limit * 2); // Get more, then filter by similarity

      if (error || !data) {
        return [];
      }

      // Filter by similarity (simplified - in production use proper cosine similarity)
      return data.slice(0, limit);
    } catch (error) {
      console.error('[RAG] Error searching conversations:', error);
      return [];
    }
  }

  /**
   * Get platform insights/statistics
   */
  async getPlatformInsights(userId) {
    try {
      const { data, error } = await supabase
        .rpc('get_platform_stats', {
          target_user_id: userId
        });

      if (error) {
        return {};
      }

      return data || {};
    } catch (error) {
      console.error('[RAG] Error getting platform insights:', error);
      return {};
    }
  }

  /**
   * Build system prompt with personality
   */
  buildSystemPrompt(styleProfile) {
    if (!styleProfile) {
      return `You are a helpful AI assistant that provides accurate, relevant information based on the user's data and context.`;
    }

    const personality = styleProfile.personality_traits || {};

    return `You are a digital twin that embodies this user's authentic personality and communication style.

# PERSONALITY PROFILE

**Communication Style:** ${styleProfile.communication_style || 'balanced'}
**Humor Style:** ${styleProfile.humor_style || 'neutral'}
**Emotional Tone:** ${this.formatEmotionalTone(styleProfile.emotional_tone)}

# PERSONALITY TRAITS (Big Five)

${personality.openness !== undefined ? `- **Openness:** ${(personality.openness * 100).toFixed(0)}% (${this.interpretTrait(personality.openness, 'openness')})` : ''}
${personality.conscientiousness !== undefined ? `- **Conscientiousness:** ${(personality.conscientiousness * 100).toFixed(0)}% (${this.interpretTrait(personality.conscientiousness, 'conscientiousness')})` : ''}
${personality.extraversion !== undefined ? `- **Extraversion:** ${(personality.extraversion * 100).toFixed(0)}% (${this.interpretTrait(personality.extraversion, 'extraversion')})` : ''}
${personality.agreeableness !== undefined ? `- **Agreeableness:** ${(personality.agreeableness * 100).toFixed(0)}% (${this.interpretTrait(personality.agreeableness, 'agreeableness')})` : ''}
${personality.neuroticism !== undefined ? `- **Neuroticism:** ${(personality.neuroticism * 100).toFixed(0)}% (${this.interpretTrait(personality.neuroticism, 'neuroticism')})` : ''}

# WRITING CHARACTERISTICS

- **Average word length:** ${styleProfile.avg_word_length?.toFixed(1) || 'N/A'} characters
- **Vocabulary richness:** ${styleProfile.vocabulary_richness ? (styleProfile.vocabulary_richness * 100).toFixed(0) + '%' : 'N/A'}
- **Sentence complexity:** ${styleProfile.sentence_complexity ? (styleProfile.sentence_complexity * 100).toFixed(0) + '%' : 'N/A'}

${styleProfile.common_words ? `**Common phrases:** ${Object.keys(styleProfile.common_words).slice(0, 10).join(', ')}` : ''}

# INSTRUCTIONS

Respond EXACTLY as this user would - matching their:
- **Tone** and emotional expression
- **Vocabulary** and word choices
- **Sentence structure** and complexity
- **Humor style** and personality
- **Communication preferences**

Do NOT simply provide information. Channel their authentic voice, perspective, and manner of expression. Be them.`;
  }

  /**
   * Format emotional tone
   */
  formatEmotionalTone(tone) {
    if (!tone) return 'Neutral';

    const positive = (tone.positive * 100).toFixed(0);
    const negative = (tone.negative * 100).toFixed(0);
    const neutral = (tone.neutral * 100).toFixed(0);

    return `${positive}% positive, ${negative}% negative, ${neutral}% neutral`;
  }

  /**
   * Interpret personality trait score
   */
  interpretTrait(score, trait) {
    if (score > 0.7) {
      const high = {
        openness: 'very creative & curious',
        conscientiousness: 'highly organized & responsible',
        extraversion: 'very social & outgoing',
        agreeableness: 'very cooperative & kind',
        neuroticism: 'emotionally sensitive'
      };
      return high[trait];
    } else if (score < 0.3) {
      const low = {
        openness: 'practical & traditional',
        conscientiousness: 'flexible & spontaneous',
        extraversion: 'reserved & independent',
        agreeableness: 'direct & competitive',
        neuroticism: 'emotionally stable'
      };
      return low[trait];
    } else {
      return 'balanced';
    }
  }

  /**
   * Build context prompt with retrieved information
   */
  buildContextPrompt(relevantChunks, pastConversations, platformInsights) {
    let prompt = `# RELEVANT CONTEXT FROM USER'S DATA\n\n`;

    if (relevantChunks && relevantChunks.length > 0) {
      prompt += `## Content from Connected Platforms\n\n`;
      relevantChunks.forEach((chunk, i) => {
        prompt += `**[${i + 1}]** ${chunk.platform} (${chunk.content_type}) - Similarity: ${(chunk.similarity * 100).toFixed(0)}%\n`;
        prompt += `${chunk.chunk_text}\n\n`;
      });
    }

    if (pastConversations && pastConversations.length > 0) {
      prompt += `## Relevant Past Conversations\n\n`;
      pastConversations.forEach((conv, i) => {
        const date = new Date(conv.timestamp).toLocaleDateString();
        prompt += `**[${i + 1}]** ${date} (Importance: ${(conv.importance_score * 100).toFixed(0)}%)\n`;
        prompt += `${conv.message_content.substring(0, 200)}...\n\n`;
      });
    }

    if (platformInsights && Object.keys(platformInsights).length > 0) {
      prompt += `## Platform Activity Summary\n\n`;
      for (const [platform, stats] of Object.entries(platformInsights)) {
        prompt += `- **${platform}:** ${stats.total_items || 0} items extracted\n`;
      }
      prompt += '\n';
    }

    if (relevantChunks.length === 0 && pastConversations.length === 0) {
      prompt += `*No specific contextual information retrieved for this query.*\n\n`;
    }

    return prompt;
  }

  /**
   * Call OpenAI API
   */
  async callOpenAI(systemPrompt, contextPrompt, userMessage, conversationHistory) {
    try {
      // Sanitize all text inputs to remove broken Unicode surrogate pairs
      const sanitizedSystemPrompt = sanitizeUnicode(systemPrompt);
      const sanitizedContextPrompt = sanitizeUnicode(contextPrompt);
      const sanitizedUserMessage = sanitizeUnicode(userMessage);

      // Build messages array with sanitized conversation history
      const messages = [
        {
          role: 'system',
          content: sanitizedSystemPrompt
        },
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: sanitizeUnicode(msg.content)
        })),
        {
          role: 'user',
          content: `${sanitizedContextPrompt}\n\n---\n\n**User's Current Message:** ${sanitizedUserMessage}`
        }
      ];

      // Create sanitized request body (no model field for Azure)
      const requestBody = {
        max_tokens: 4096,
        messages
      };

      // Additional sanitization of the entire request body
      const sanitizedBody = sanitizeObject(requestBody);

      // Build Azure OpenAI endpoint URL
      const url = `${this.azureEndpoint}/openai/deployments/${this.azureChatDeployment}/chat/completions?api-version=${this.azureApiVersion}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'api-key': this.azureApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sanitizedBody)
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[RAG] Azure OpenAI API error:', {
          status: response.status,
          error,
          endpoint: url
        });
        throw new Error(`Azure OpenAI API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('[RAG] Error calling OpenAI:', error);
      throw error;
    }
  }

  /**
   * Store conversation in memory
   */
  async storeConversationMemory(userId, twinId, userMessage, assistantResponse, queryEmbedding) {
    try {
      const conversationId = this.generateConversationId();
      const timestamp = new Date().toISOString();

      // Store user message
      await supabase
        .from('conversation_memory')
        .insert({
          user_id: userId,
          twin_id: twinId,
          conversation_id: conversationId,
          message_role: 'user',
          message_content: userMessage,
          embedding: `[${queryEmbedding.join(',')}]`,
          importance_score: 0.5,
          timestamp
        });

      // Generate embedding for assistant response
      const responseEmbedding = await embeddingGenerator.generateQueryEmbedding(assistantResponse);

      if (responseEmbedding) {
        await supabase
          .from('conversation_memory')
          .insert({
            user_id: userId,
            twin_id: twinId,
            conversation_id: conversationId,
            message_role: 'assistant',
            message_content: assistantResponse,
            embedding: `[${responseEmbedding.join(',')}]`,
            importance_score: 0.5,
            timestamp
          });
      }
    } catch (error) {
      console.error('[RAG] Error storing conversation:', error);
      // Don't throw - conversation storage failure shouldn't break the response
    }
  }

  /**
   * Generate conversation ID
   */
  generateConversationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get conversation history for a twin
   */
  async getConversationHistory(userId, twinId, limit = 10) {
    try {
      const { data, error } = await supabase
        .from('conversation_memory')
        .select('message_role, message_content, timestamp')
        .eq('user_id', userId)
        .eq('twin_id', twinId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        return [];
      }

      // Reverse to get chronological order
      return (data || []).reverse().map(msg => ({
        role: msg.message_role,
        content: msg.message_content,
        timestamp: msg.timestamp
      }));
    } catch (error) {
      console.error('[RAG] Error getting conversation history:', error);
      return [];
    }
  }
}

export default new RAGService();
