/**
 * GNN Pattern Detector Service
 *
 * Integrates with Python-based PyTorch Geometric GNN model for
 * heterogeneous graph-based behavioral pattern detection.
 *
 * This service acts as a bridge between Node.js backend and Python ML model.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import neo4jGraphService from './neo4jGraphService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GNNPatternDetector {
  constructor() {
    this.pythonScriptPath = path.join(__dirname, '..', '..', 'ml', 'gnn_model.py');
    this.modelPath = path.join(__dirname, '..', '..', 'ml', 'models', 'gnn_pattern_detector.pth');
  }

  /**
   * Train GNN model on user behavior graph
   */
  async trainModel(userId, options = {}) {
    const {
      epochs = 100,
      learningRate = 0.001,
      hiddenChannels = 128,
      numLayers = 4
    } = options;

    console.log(`🧠 Training GNN model for user ${userId}...`);

    try {
      // Export graph data from Neo4j
      const graphData = await neo4jGraphService.exportGraphForGNN(userId);

      if (graphData.nodes.length < 10) {
        throw new Error('Insufficient graph data for training. Need at least 10 nodes.');
      }

      console.log(`📊 Graph data: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`);

      // Call Python training script
      const trainingResult = await this.executePythonScript('train', {
        userId,
        graphData,
        epochs,
        learningRate,
        hiddenChannels,
        numLayers,
        modelPath: this.modelPath
      });

      console.log('✅ GNN model training complete');

      return {
        success: true,
        modelPath: this.modelPath,
        trainingMetrics: trainingResult.metrics,
        graphStats: {
          nodes: graphData.nodes.length,
          edges: graphData.edges.length
        }
      };
    } catch (error) {
      console.error('❌ GNN training failed:', error);
      throw error;
    }
  }

  /**
   * Detect patterns using trained GNN model
   */
  async detectPatterns(userId, options = {}) {
    const {
      minConfidence = 0.75,
      topK = 10
    } = options;

    console.log(`🔍 Detecting patterns for user ${userId} using GNN...`);

    try {
      // Export current graph data
      const graphData = await neo4jGraphService.exportGraphForGNN(userId);

      if (graphData.nodes.length === 0) {
        return [];
      }

      // Run inference
      const inferenceResult = await this.executePythonScript('infer', {
        userId,
        graphData,
        modelPath: this.modelPath,
        minConfidence,
        topK
      });

      const patterns = inferenceResult.patterns || [];

      console.log(`✅ Detected ${patterns.length} patterns`);

      // Enhance patterns with Neo4j query results for validation
      const enhancedPatterns = await Promise.all(
        patterns.map(async (pattern) => {
          // Get example events from Neo4j
          const cypher = await neo4jGraphService.detectTemporalPatterns(userId, {
            minOccurrences: 1,
            minConfidence: 0.5
          });

          return {
            ...pattern,
            validation: {
              neo4j_confirmed: cypher.length > 0,
              example_events: cypher[0]?.example_events || []
            }
          };
        })
      );

      return enhancedPatterns;
    } catch (error) {
      console.error('❌ GNN pattern detection failed:', error);
      throw error;
    }
  }

  /**
   * Get pattern embeddings for clustering similar patterns
   */
  async getPatternEmbeddings(userId) {
    console.log(`🧬 Generating pattern embeddings for user ${userId}...`);

    try {
      const graphData = await neo4jGraphService.exportGraphForGNN(userId);

      const embeddingResult = await this.executePythonScript('embed', {
        userId,
        graphData,
        modelPath: this.modelPath
      });

      return {
        embeddings: embeddingResult.embeddings,
        nodeIds: embeddingResult.nodeIds,
        metadata: graphData.metadata
      };
    } catch (error) {
      console.error('❌ Embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Execute Python script with proper error handling
   */
  async executePythonScript(command, data) {
    return new Promise((resolve, reject) => {
      // Use python3 or python depending on system
      const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

      const python = spawn(pythonCommand, [
        this.pythonScriptPath,
        command,
        JSON.stringify(data)
      ]);

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error('Python stderr:', data.toString());
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse Python output: ${error.message}\nOutput: ${stdout}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  }

  /**
   * Check if Python environment and dependencies are available
   */
  async checkPythonEnvironment() {
    try {
      const result = await this.executePythonScript('check', {});
      return {
        available: true,
        pythonVersion: result.pythonVersion,
        dependencies: result.dependencies
      };
    } catch (error) {
      return {
        available: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate pattern correlation strength using GNN embeddings
   * This helps determine causality vs correlation
   */
  async calculateCorrelationStrength(userId, patternId1, patternId2) {
    console.log(`🔗 Calculating correlation between patterns ${patternId1} and ${patternId2}`);

    try {
      const embeddings = await this.getPatternEmbeddings(userId);

      // Find embeddings for both patterns
      const idx1 = embeddings.nodeIds.indexOf(patternId1);
      const idx2 = embeddings.nodeIds.indexOf(patternId2);

      if (idx1 === -1 || idx2 === -1) {
        throw new Error('Pattern IDs not found in embeddings');
      }

      const embed1 = embeddings.embeddings[idx1];
      const embed2 = embeddings.embeddings[idx2];

      // Calculate cosine similarity
      const similarity = this.cosineSimilarity(embed1, embed2);

      return {
        patternId1,
        patternId2,
        correlationStrength: similarity,
        interpretation: similarity > 0.8 ? 'strong' : similarity > 0.6 ? 'moderate' : 'weak'
      };
    } catch (error) {
      console.error('❌ Correlation calculation failed:', error);
      throw error;
    }
  }

  /**
   * Cosine similarity between two vectors
   */
  cosineSimilarity(vec1, vec2) {
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (mag1 * mag2);
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const pyEnv = await this.checkPythonEnvironment();
      const neo4jHealth = await neo4jGraphService.healthCheck();

      return {
        healthy: pyEnv.available && neo4jHealth.healthy,
        python: pyEnv,
        neo4j: neo4jHealth,
        modelExists: await this.modelExists()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Check if trained model exists
   */
  async modelExists() {
    try {
      const fs = await import('fs/promises');
      await fs.access(this.modelPath);
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
const gnnPatternDetector = new GNNPatternDetector();

export default gnnPatternDetector;
