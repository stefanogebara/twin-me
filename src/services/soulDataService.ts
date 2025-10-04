/**
 * Soul Data Service
 * API client for soul data extraction, analysis, and RAG chat
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface ExtractionStatus {
  success: boolean;
  recentJobs: Array<{
    id: string;
    platform: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    total_items: number | null;
    processed_items: number;
    failed_items: number;
    started_at: string;
    completed_at: string | null;
    error_message: string | null;
  }>;
  statistics: Record<string, any>;
  lastSync: string | null;
}

export interface ProcessingStats {
  success: boolean;
  stats: {
    totalRawItems: number;
    processedItems: number;
    pendingItems: number;
    platformBreakdown: Record<string, number>;
  };
}

export interface StyleProfile {
  success: boolean;
  profile: {
    avg_word_length: number;
    vocabulary_richness: number;
    sentence_complexity: number;
    personality_traits: {
      openness: number;
      conscientiousness: number;
      extraversion: number;
      agreeableness: number;
      neuroticism: number;
    };
    communication_style: string;
    humor_style: string;
    emotional_tone: {
      positive: number;
      negative: number;
      neutral: number;
    };
    confidence_score: number;
    sample_size: number;
  };
}

export interface EmbeddingStats {
  success: boolean;
  stats: {
    totalTextItems: number;
    totalEmbeddings: number;
    platformBreakdown: Record<string, number>;
    averageChunksPerText: string;
  };
}

export interface ChatResponse {
  success: boolean;
  response: string;
  context: {
    relevantChunksCount: number;
    pastConversationsCount: number;
    confidenceScore: number;
  };
}

class SoulDataService {
  /**
   * Extract data from specific platform
   */
  async extractPlatform(userId: string, platform: string): Promise<any> {
    const response = await fetch(`${API_URL}/soul-data/extract/${platform}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    return response.json();
  }

  /**
   * Extract data from all connected platforms
   */
  async extractAll(userId: string): Promise<any> {
    const response = await fetch(`${API_URL}/soul-data/extract-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    return response.json();
  }

  /**
   * Get extraction status and recent jobs
   */
  async getExtractionStatus(userId: string): Promise<ExtractionStatus> {
    const response = await fetch(`${API_URL}/soul-data/extraction-status?userId=${userId}`);
    return response.json();
  }

  /**
   * Trigger text processing
   */
  async processText(userId: string, limit: number = 100): Promise<any> {
    const response = await fetch(`${API_URL}/soul-data/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, limit })
    });
    return response.json();
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(userId: string): Promise<ProcessingStats> {
    const response = await fetch(`${API_URL}/soul-data/processing-stats?userId=${userId}`);
    return response.json();
  }

  /**
   * Trigger stylometric analysis
   */
  async analyzeStyle(userId: string): Promise<any> {
    const response = await fetch(`${API_URL}/soul-data/analyze-style`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    return response.json();
  }

  /**
   * Get user's style profile
   */
  async getStyleProfile(userId: string): Promise<StyleProfile> {
    const response = await fetch(`${API_URL}/soul-data/style-profile?userId=${userId}`);
    return response.json();
  }

  /**
   * Generate embeddings
   */
  async generateEmbeddings(userId: string, limit: number = 100): Promise<any> {
    const response = await fetch(`${API_URL}/soul-data/generate-embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, limit })
    });
    return response.json();
  }

  /**
   * Get embedding statistics
   */
  async getEmbeddingStats(userId: string): Promise<EmbeddingStats> {
    const response = await fetch(`${API_URL}/soul-data/embedding-stats?userId=${userId}`);
    return response.json();
  }

  /**
   * Chat with RAG-powered digital twin
   */
  async chat(
    userId: string,
    message: string,
    twinId: string | null = null,
    conversationHistory: Array<{ role: string; content: string }> = []
  ): Promise<ChatResponse> {
    const response = await fetch(`${API_URL}/soul-data/rag/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, twinId, message, conversationHistory })
    });
    return response.json();
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(
    userId: string,
    twinId: string,
    limit: number = 10
  ): Promise<any> {
    const response = await fetch(
      `${API_URL}/soul-data/rag/conversation-history?userId=${userId}&twinId=${twinId}&limit=${limit}`
    );
    return response.json();
  }

  /**
   * Run full pipeline (extract → process → analyze → embed)
   */
  async runFullPipeline(userId: string, platform?: string): Promise<any> {
    const response = await fetch(`${API_URL}/soul-data/full-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, platform })
    });
    return response.json();
  }

  /**
   * Poll extraction status until completion
   */
  async pollExtractionStatus(
    userId: string,
    onProgress?: (status: ExtractionStatus) => void
  ): Promise<ExtractionStatus> {
    let status = await this.getExtractionStatus(userId);

    if (onProgress) onProgress(status);

    // Check if any jobs are still running
    while (status.recentJobs.some(job => job.status === 'running' || job.status === 'pending')) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Poll every 3 seconds
      status = await this.getExtractionStatus(userId);
      if (onProgress) onProgress(status);
    }

    return status;
  }
}

export const soulDataService = new SoulDataService();
