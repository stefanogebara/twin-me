/**
 * Embedding Generator Service
 * Generates vector embeddings for text content using OpenAI API
 */

import { createClient } from '@supabase/supabase-js';

// Use SUPABASE_URL (backend) - fallback to VITE_ prefix for compatibility
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class EmbeddingGenerator {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.embeddingModel = 'text-embedding-3-small'; // 1536 dimensions
    this.chunkSize = 800; // Optimal chunk size in characters

    // Log API key status (first 8 chars for security)
    if (!this.openaiApiKey) {
      console.error('[Embeddings] ❌ OPENAI_API_KEY not found in environment variables');
    } else {
      console.log('[Embeddings] ✅ OpenAI API key configured:', this.openaiApiKey.substring(0, 8) + '...');
    }
  }

  /**
   * Generate embeddings for all unprocessed text content
   */
  async generateEmbeddings(userId, limit = 100) {
    console.log(`[Embeddings] Generating embeddings for user ${userId}...`);

    try {
      // Get text content without embeddings
      const { data: textContent, error } = await supabase
        .from('user_text_content')
        .select('id, text_content, content_type, platform, timestamp')
        .eq('user_id', userId)
        .limit(limit);

      if (error || !textContent || textContent.length === 0) {
        console.log('[Embeddings] No text content found for embedding generation');
        return { success: false, message: 'No text content to process' };
      }

      // Check which already have embeddings
      const textContentIds = textContent.map(t => t.id);
      const { data: existingEmbeddings } = await supabase
        .from('user_embeddings')
        .select('text_content_id')
        .in('text_content_id', textContentIds);

      const existingIds = new Set((existingEmbeddings || []).map(e => e.text_content_id));
      const toProcess = textContent.filter(t => !existingIds.has(t.id));

      if (toProcess.length === 0) {
        console.log('[Embeddings] All text content already has embeddings');
        return { success: true, generated: 0, message: 'All content processed' };
      }

      console.log(`[Embeddings] Processing ${toProcess.length} text items...`);

      let generated = 0;
      let errors = 0;

      // Process in batches to respect rate limits
      const batchSize = 10;
      for (let i = 0; i < toProcess.length; i += batchSize) {
        const batch = toProcess.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (item) => {
            try {
              await this.generateEmbeddingForText(userId, item);
              generated++;
            } catch (error) {
              console.error(`[Embeddings] Error processing text ${item.id}:`, error);
              errors++;
            }
          })
        );

        // Small delay between batches to respect rate limits
        if (i + batchSize < toProcess.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`[Embeddings] Generated ${generated} embeddings (${errors} errors)`);
      return {
        success: true,
        generated,
        errors,
        total: toProcess.length
      };
    } catch (error) {
      console.error('[Embeddings] Error in generateEmbeddings:', error);
      throw error;
    }
  }

  /**
   * Generate embedding for a single text item
   */
  async generateEmbeddingForText(userId, textItem) {
    const { id, text_content, content_type, platform, timestamp } = textItem;

    // Chunk text if it's too long
    const chunks = this.chunkText(text_content, this.chunkSize);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Generate embedding
      const embedding = await this.generateEmbedding(chunk);

      if (!embedding) {
        throw new Error('Failed to generate embedding');
      }

      // Store in database
      await this.storeEmbedding({
        user_id: userId,
        text_content_id: id,
        embedding,
        chunk_text: chunk,
        chunk_index: i,
        chunk_size: chunk.length,
        platform,
        content_type,
        timestamp,
        tags: []
      });
    }
  }

  /**
   * Generate embedding using OpenAI API
   */
  async generateEmbedding(text) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.embeddingModel,
          input: text,
          encoding_format: 'float'
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[Embeddings] OpenAI API error:', {
          status: response.status,
          statusText: response.statusText,
          error: error,
          apiKey: this.openaiApiKey ? `${this.openaiApiKey.substring(0, 10)}...` : 'NOT SET'
        });
        return null;
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error('[Embeddings] Error calling OpenAI API:', error);
      return null;
    }
  }

  /**
   * Chunk text into optimal sizes
   */
  chunkText(text, maxChunkSize = 800) {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks = [];
    const sentences = text.split(/[.!?]+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      // If adding this sentence exceeds chunk size, save current chunk
      if (currentChunk.length + trimmedSentence.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = trimmedSentence + '.';
      } else {
        currentChunk += (currentChunk ? ' ' : '') + trimmedSentence + '.';
      }
    }

    // Add remaining chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text]; // Fallback to original text
  }

  /**
   * Store embedding in database
   */
  async storeEmbedding(data) {
    try {
      // Convert embedding array to pgvector format
      const embeddingVector = `[${data.embedding.join(',')}]`;

      const { error } = await supabase
        .from('user_embeddings')
        .insert({
          user_id: data.user_id,
          text_content_id: data.text_content_id,
          embedding: embeddingVector,
          chunk_text: data.chunk_text,
          chunk_index: data.chunk_index,
          chunk_size: data.chunk_size,
          platform: data.platform,
          content_type: data.content_type,
          timestamp: data.timestamp,
          tags: data.tags
        });

      if (error) {
        console.error('[Embeddings] Error storing embedding:', error);
        throw error;
      }
    } catch (error) {
      console.error('[Embeddings] Exception storing embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embedding for a query (for search)
   */
  async generateQueryEmbedding(queryText) {
    return await this.generateEmbedding(queryText);
  }

  /**
   * Get embedding statistics for a user
   */
  async getEmbeddingStats(userId) {
    try {
      const { count: totalText } = await supabase
        .from('user_text_content')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { count: embeddingsCount } = await supabase
        .from('user_embeddings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { data: platformBreakdown } = await supabase
        .from('user_embeddings')
        .select('platform')
        .eq('user_id', userId);

      const platformCounts = {};
      (platformBreakdown || []).forEach(item => {
        platformCounts[item.platform] = (platformCounts[item.platform] || 0) + 1;
      });

      return {
        totalTextItems: totalText || 0,
        totalEmbeddings: embeddingsCount || 0,
        platformBreakdown: platformCounts,
        averageChunksPerText: totalText > 0 ? (embeddingsCount / totalText).toFixed(2) : 0
      };
    } catch (error) {
      console.error('[Embeddings] Error getting stats:', error);
      return null;
    }
  }

  /**
   * Search for similar content using vector similarity
   */
  async searchSimilar(userId, queryText, limit = 10, threshold = 0.7, platform = null) {
    try {
      // Generate query embedding
      const queryEmbedding = await this.generateQueryEmbedding(queryText);

      if (!queryEmbedding) {
        throw new Error('Failed to generate query embedding');
      }

      // Convert to pgvector format
      const queryVector = `[${queryEmbedding.join(',')}]`;

      // Use the search_similar_content function from database
      const { data, error } = await supabase
        .rpc('search_similar_content', {
          query_embedding: queryVector,
          match_user_id: userId,
          match_platform: platform,
          match_count: limit,
          similarity_threshold: threshold
        });

      if (error) {
        console.error('[Embeddings] Error searching similar content:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[Embeddings] Error in searchSimilar:', error);
      return [];
    }
  }
}

export default new EmbeddingGenerator();
