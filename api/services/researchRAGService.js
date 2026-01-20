/**
 * Research RAG Service
 * Manages research paper embeddings and retrieval for evidence-backed personality inference
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

// Initialize OpenAI client
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}) : null;

class ResearchRAGService {
  constructor() {
    // Azure OpenAI configuration (primary)
    this.azureApiKey = process.env.AZURE_OPENAI_API_KEY;
    this.azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://twinme.openai.azure.com';
    this.azureDeployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-small';
    this.azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-01';

    // Determine which provider to use
    this.useAzure = !!this.azureApiKey;
    this.useOpenAI = !!openai;

    if (this.useAzure) {
      console.log('[ResearchRAG] Using Azure OpenAI for embeddings');
    } else if (this.useOpenAI) {
      console.log('[ResearchRAG] Using OpenAI for embeddings (Azure not configured)');
    } else {
      console.warn('[ResearchRAG] ⚠️ No embedding provider configured');
    }
  }

  /**
   * Generate embedding using available provider (Azure OpenAI or OpenAI)
   */
  async generateEmbedding(text) {
    // Try Azure OpenAI first
    if (this.useAzure) {
      return await this.generateEmbeddingAzure(text);
    }

    // Fall back to OpenAI
    if (this.useOpenAI) {
      return await this.generateEmbeddingOpenAI(text);
    }

    console.error('[ResearchRAG] No embedding provider available');
    return null;
  }

  /**
   * Generate embedding using Azure OpenAI API
   */
  async generateEmbeddingAzure(text) {
    try {
      const url = `${this.azureEndpoint}/openai/deployments/${this.azureDeployment}/embeddings?api-version=${this.azureApiVersion}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'api-key': this.azureApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: text,
          encoding_format: 'float'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ResearchRAG] Azure OpenAI API error:', response.status, errorText);
        return null;
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error('[ResearchRAG] Error generating Azure embedding:', error);
      return null;
    }
  }

  /**
   * Generate embedding using OpenAI API (fallback)
   */
  async generateEmbeddingOpenAI(text) {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small', // 1536 dimensions
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('[ResearchRAG] Error generating OpenAI embedding:', error);
      return null;
    }
  }

  /**
   * Index all research papers with embeddings
   */
  async indexResearchPapers() {
    console.log('[ResearchRAG] Starting research paper indexing...');
    const supabase = getSupabaseClient();

    try {
      // Get all papers without embeddings
      const { data: papers, error } = await supabase
        .from('research_paper_embeddings')
        .select('id, paper_id, title, content')
        .is('embedding', null);

      if (error) {
        console.error('[ResearchRAG] Error fetching papers:', error);
        throw error;
      }

      if (!papers || papers.length === 0) {
        console.log('[ResearchRAG] All papers already have embeddings');
        return { success: true, indexed: 0, message: 'All papers already indexed' };
      }

      console.log(`[ResearchRAG] Indexing ${papers.length} papers...`);

      let indexed = 0;
      let errors = 0;

      for (const paper of papers) {
        try {
          // Create embedding text from title + content
          const embeddingText = `${paper.title}. ${paper.content}`;

          const embedding = await this.generateEmbedding(embeddingText);

          if (!embedding) {
            console.error(`[ResearchRAG] Failed to generate embedding for ${paper.paper_id}`);
            errors++;
            continue;
          }

          // Convert to pgvector format
          const embeddingVector = `[${embedding.join(',')}]`;

          // Update paper with embedding
          const { error: updateError } = await supabase
            .from('research_paper_embeddings')
            .update({
              embedding: embeddingVector,
              updated_at: new Date().toISOString()
            })
            .eq('id', paper.id);

          if (updateError) {
            console.error(`[ResearchRAG] Error updating ${paper.paper_id}:`, updateError);
            errors++;
          } else {
            console.log(`[ResearchRAG] ✅ Indexed: ${paper.paper_id} - ${paper.title}`);
            indexed++;
          }

          // Small delay between API calls
          await new Promise(resolve => setTimeout(resolve, 200));

        } catch (err) {
          console.error(`[ResearchRAG] Error processing ${paper.paper_id}:`, err);
          errors++;
        }
      }

      console.log(`[ResearchRAG] Indexing complete: ${indexed} indexed, ${errors} errors`);
      return { success: true, indexed, errors, total: papers.length };

    } catch (error) {
      console.error('[ResearchRAG] Error in indexResearchPapers:', error);
      throw error;
    }
  }

  /**
   * Search for relevant research papers based on a query
   * @param {string} query - The search query (e.g., "music preferences and extraversion")
   * @param {number} limit - Maximum number of results
   * @param {number} threshold - Minimum similarity threshold (0-1)
   * @returns {Array} - Relevant research papers with similarity scores
   */
  async searchResearch(query, limit = 5, threshold = 0.3) {
    console.log(`[ResearchRAG] Searching for: "${query}"`);
    const supabase = getSupabaseClient();

    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      if (!queryEmbedding) {
        console.error('[ResearchRAG] Failed to generate query embedding');
        return [];
      }

      // Convert to pgvector format
      const queryVector = `[${queryEmbedding.join(',')}]`;

      // Search using vector similarity
      const { data: results, error } = await supabase.rpc('search_research_papers', {
        query_embedding: queryVector,
        match_count: limit,
        similarity_threshold: threshold
      });

      if (error) {
        // If function doesn't exist, fall back to manual similarity search
        console.warn('[ResearchRAG] RPC function not found, using fallback search');
        return await this.fallbackSearch(queryVector, limit, threshold);
      }

      console.log(`[ResearchRAG] Found ${results?.length || 0} relevant papers`);
      return results || [];

    } catch (error) {
      console.error('[ResearchRAG] Error in searchResearch:', error);
      return [];
    }
  }

  /**
   * Fallback search when RPC function is not available
   */
  async fallbackSearch(queryVector, limit, threshold) {
    const supabase = getSupabaseClient();

    try {
      // Get all papers with embeddings
      const { data: papers, error } = await supabase
        .from('research_paper_embeddings')
        .select('id, paper_id, title, content, embedding, metadata')
        .not('embedding', 'is', null);

      if (error || !papers) {
        return [];
      }

      // Parse query vector
      const queryArr = JSON.parse(queryVector);

      // Calculate cosine similarity for each paper
      const results = papers.map(paper => {
        const paperEmbedding = typeof paper.embedding === 'string'
          ? JSON.parse(paper.embedding.replace(/^\[|\]$/g, '').split(',').map(Number))
          : paper.embedding;

        const similarity = this.cosineSimilarity(queryArr, paperEmbedding);

        return {
          ...paper,
          similarity,
          embedding: undefined // Don't return embedding in results
        };
      })
      .filter(p => p.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

      return results;

    } catch (error) {
      console.error('[ResearchRAG] Error in fallback search:', error);
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (normA * normB);
  }

  /**
   * Get research context for a specific personality dimension and feature
   * @param {string} dimension - Big Five dimension (openness, conscientiousness, etc.)
   * @param {string} feature - Behavioral feature (genre_diversity, sleep_consistency, etc.)
   * @returns {Object} - Research context with citations and correlations
   */
  async getResearchContext(dimension, feature) {
    const query = `${dimension} personality ${feature} correlation behavioral research`;

    const results = await this.searchResearch(query, 3, 0.25);

    if (!results || results.length === 0) {
      return {
        hasResearch: false,
        message: 'No specific research found for this combination'
      };
    }

    // Format research context
    const context = {
      hasResearch: true,
      papers: results.map(r => ({
        title: r.title,
        paperId: r.paper_id,
        relevance: Math.round(r.similarity * 100),
        correlations: r.metadata?.correlations || {},
        sampleSize: r.metadata?.sample_size || 'unknown',
        content: r.content
      })),
      summary: this.generateResearchSummary(results, dimension, feature)
    };

    return context;
  }

  /**
   * Generate a summary of research findings
   */
  generateResearchSummary(papers, dimension, feature) {
    if (!papers || papers.length === 0) return null;

    const citations = papers.map(p => `${p.paper_id} (n=${p.metadata?.sample_size || '?'})`).join(', ');

    // Find strongest correlation mentioned
    let strongestCorr = 0;
    for (const paper of papers) {
      const corrs = paper.metadata?.correlations || {};
      for (const [key, value] of Object.entries(corrs)) {
        if (Math.abs(value) > Math.abs(strongestCorr) &&
            (key.toLowerCase().includes(dimension.toLowerCase()) ||
             key.toLowerCase().includes(feature.toLowerCase()))) {
          strongestCorr = value;
        }
      }
    }

    return {
      citations,
      paperCount: papers.length,
      strongestCorrelation: strongestCorr !== 0 ? strongestCorr : null,
      effectSize: Math.abs(strongestCorr) >= 0.4 ? 'large' :
                  Math.abs(strongestCorr) >= 0.25 ? 'medium' : 'small'
    };
  }

  /**
   * Get all indexed papers summary
   */
  async getIndexStatus() {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('research_paper_embeddings')
      .select('paper_id, title, embedding, metadata');

    if (error) {
      return { error: error.message };
    }

    const indexed = data.filter(p => p.embedding !== null).length;
    const total = data.length;

    return {
      total,
      indexed,
      pending: total - indexed,
      papers: data.map(p => ({
        paperId: p.paper_id,
        title: p.title,
        hasEmbedding: p.embedding !== null,
        sampleSize: p.metadata?.sample_size
      }))
    };
  }
}

export default new ResearchRAGService();
