import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

class SimpleDocumentProcessor {
  constructor() {
    // Initialize OpenAI for embeddings (only if API key is available)
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
      try {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
      } catch (error) {
        console.warn('Failed to initialize OpenAI, using text search fallback:', error.message);
        this.openai = null;
      }
    } else {
      console.log('OpenAI API key not configured, using simple text matching fallback');
      this.openai = null;
    }

    // Simple text splitter
    this.chunkSize = 1000;
    this.chunkOverlap = 200;

    // In-memory storage for documents and embeddings
    this.documents = new Map(); // twinId -> documents array
    this.embeddings = new Map(); // twinId -> embeddings array
  }

  /**
   * Simple text splitter that creates overlapping chunks
   */
  splitText(text) {
    const chunks = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

    let currentChunk = '';
    let currentSize = 0;

    for (const sentence of sentences) {
      const sentenceSize = sentence.length;

      if (currentSize + sentenceSize > this.chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());

        // Create overlap
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(this.chunkOverlap / 6)); // Rough word estimate
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
        currentSize = currentChunk.length;
      } else {
        currentChunk += ' ' + sentence;
        currentSize += sentenceSize;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 50); // Filter out very short chunks
  }

  /**
   * Extract text from various file types
   */
  async extractText(filePath, mimeType) {
    try {
      const buffer = await fs.readFile(filePath);

      switch (mimeType) {
        case 'application/pdf':
          return await this.extractPDFText(buffer);

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/msword':
          return await this.extractWordText(buffer);

        case 'text/plain':
          return buffer.toString('utf-8');

        default:
          throw new Error(`Unsupported file type: ${mimeType}`);
      }
    } catch (error) {
      console.error('Error extracting text from file:', error);
      throw new Error(`Failed to extract text: ${error.message}`);
    }
  }

  async extractPDFText(buffer) {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  async extractWordText(buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      throw new Error(`Word document parsing failed: ${error.message}`);
    }
  }

  /**
   * Create embeddings for text chunks
   */
  async createEmbeddings(textChunks) {
    try {
      if (!this.openai) {
        console.warn('OpenAI not available, using simple text matching');
        return null; // Fall back to simple text search
      }

      const embeddings = [];

      // Process in batches to avoid rate limits
      for (let i = 0; i < textChunks.length; i += 5) {
        const batch = textChunks.slice(i, i + 5);

        const response = await this.openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: batch,
        });

        embeddings.push(...response.data.map(item => item.embedding));

        // Small delay to respect rate limits
        if (i + 5 < textChunks.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return embeddings;
    } catch (error) {
      console.warn('Failed to create embeddings, falling back to text search:', error.message);
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Simple text matching for when embeddings aren't available
   */
  simpleTextMatch(query, textChunks) {
    const queryWords = query.toLowerCase().split(/\s+/);

    const scored = textChunks.map((chunk, index) => {
      const chunkWords = chunk.toLowerCase().split(/\s+/);
      const matches = queryWords.filter(word =>
        chunkWords.some(chunkWord =>
          chunkWord.includes(word) || word.includes(chunkWord)
        )
      );

      const score = matches.length / queryWords.length;
      return { chunk, index, score };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Process document and store it
   */
  async processDocument(filePath, mimeType, twinId, metadata = {}) {
    try {
      console.log(`Processing document for twin ${twinId}: ${path.basename(filePath)}`);

      // Extract text
      const text = await this.extractText(filePath, mimeType);

      if (!text || text.trim().length === 0) {
        throw new Error('No text content found in document');
      }

      // Split text into chunks
      const chunks = this.splitText(text);
      console.log(`Split document into ${chunks.length} chunks`);

      // Create documents with metadata
      const documents = chunks.map((chunk, index) => ({
        content: chunk,
        metadata: {
          ...metadata,
          twinId,
          fileName: path.basename(filePath),
          chunkIndex: index,
          totalChunks: chunks.length,
          fileType: mimeType,
          processedAt: new Date().toISOString(),
        }
      }));

      // Store documents
      const existingDocs = this.documents.get(twinId) || [];
      this.documents.set(twinId, [...existingDocs, ...documents]);

      // Create embeddings if possible
      const embeddings = await this.createEmbeddings(chunks);
      if (embeddings) {
        const existingEmbeddings = this.embeddings.get(twinId) || [];
        this.embeddings.set(twinId, [...existingEmbeddings, ...embeddings]);
      }

      console.log(`Successfully processed ${chunks.length} chunks for twin ${twinId}`);

      return {
        success: true,
        chunksProcessed: chunks.length,
        totalCharacters: text.length,
        fileName: path.basename(filePath),
        hasEmbeddings: embeddings !== null,
        metadata
      };
    } catch (error) {
      console.error('Document processing error:', error);
      throw error;
    }
  }

  /**
   * Search for relevant context based on query
   */
  async searchRelevantContext(twinId, query, maxResults = 5) {
    try {
      const documents = this.documents.get(twinId);
      if (!documents || documents.length === 0) {
        return {
          contexts: [],
          sources: [],
          totalDocuments: 0
        };
      }

      const embeddings = this.embeddings.get(twinId);

      let results = [];

      if (embeddings && embeddings.length === documents.length && this.openai) {
        // Use embeddings for similarity search
        try {
          const queryEmbedding = await this.openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: query,
          });

          const queryVector = queryEmbedding.data[0].embedding;

          results = documents.map((doc, index) => ({
            document: doc,
            score: this.cosineSimilarity(queryVector, embeddings[index])
          })).sort((a, b) => b.score - a.score);

        } catch (embeddingError) {
          console.warn('Embedding search failed, falling back to text search');
          results = this.simpleTextMatch(query, documents.map(d => d.content))
            .map(item => ({ document: documents[item.index], score: item.score }));
        }
      } else {
        // Fall back to simple text matching
        results = this.simpleTextMatch(query, documents.map(d => d.content))
          .map(item => ({ document: documents[item.index], score: item.score }));
      }

      const topResults = results.slice(0, maxResults);

      const contexts = topResults.map(r => r.document.content);
      const sources = topResults.map(r => ({
        fileName: r.document.metadata.fileName,
        chunkIndex: r.document.metadata.chunkIndex,
        fileType: r.document.metadata.fileType,
        score: r.score
      }));

      return {
        contexts,
        sources,
        totalDocuments: documents.length
      };
    } catch (error) {
      console.error('Context search error:', error);
      return {
        contexts: [],
        sources: [],
        totalDocuments: 0
      };
    }
  }

  /**
   * Get statistics about processed documents for a twin
   */
  getDocumentStats(twinId) {
    const documents = this.documents.get(twinId);
    const embeddings = this.embeddings.get(twinId);

    if (!documents) {
      return {
        totalDocuments: 0,
        totalChunks: 0,
        hasProcessedContent: false,
        hasEmbeddings: false
      };
    }

    // Count unique files
    const uniqueFiles = new Set(documents.map(d => d.metadata.fileName));

    return {
      totalDocuments: uniqueFiles.size,
      totalChunks: documents.length,
      hasProcessedContent: true,
      hasEmbeddings: embeddings && embeddings.length > 0
    };
  }

  /**
   * Clear all documents for a specific twin
   */
  clearTwinDocuments(twinId) {
    this.documents.delete(twinId);
    this.embeddings.delete(twinId);
    console.log(`Cleared all documents for twin ${twinId}`);
  }

  /**
   * List all twins with processed documents
   */
  getProcessedTwins() {
    return Array.from(this.documents.keys());
  }
}

// Singleton instance
export const documentProcessor = new SimpleDocumentProcessor();
export default SimpleDocumentProcessor;