/**
 * Queue Service - Bull Message Queue for Background Jobs
 *
 * Provides reliable background job processing with:
 * - Automatic retries with exponential backoff
 * - Job prioritization and scheduling
 * - Progress tracking and real-time updates
 * - Job monitoring and debugging
 * - Graceful degradation if Redis unavailable
 */

import Bull from 'bull';
import { getRedisClient, isRedisAvailable } from './redisClient.js';
import {
  notifyExtractionStarted,
  notifyExtractionUpdate,
  notifyExtractionCompleted,
  notifyExtractionFailed,
  notifyConnectionStatus,
  notifyPlatformSync,
} from './websocketService.js';
import { invalidatePlatformStatusCache } from './redisClient.js';

/**
 * Queue instances
 */
let extractionQueue = null;
let soulSignatureQueue = null;
let conversationAnalysisQueue = null;

/**
 * Queue configuration
 */
const QUEUE_CONFIG = {
  redis: process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL,
  defaultJobOptions: {
    attempts: 3,                    // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',          // Exponential backoff: 1s, 2s, 4s
      delay: 1000,
    },
    removeOnComplete: 100,          // Keep last 100 completed jobs
    removeOnFail: 200,              // Keep last 200 failed jobs for debugging
  },
  limiter: {
    max: 10,                        // Max 10 jobs per duration
    duration: 1000,                 // 1 second
  },
};

/**
 * Initialize Bull queues
 */
function initializeQueues() {
  if (!QUEUE_CONFIG.redis) {
    console.warn('⚠️ Redis URL not configured - background job queue disabled');
    console.warn('⚠️ Jobs will run synchronously (slower but functional)');
    return;
  }

  try {
    console.log('🔌 Initializing Bull queues...');

    // Data Extraction Queue
    extractionQueue = new Bull('data-extraction', QUEUE_CONFIG.redis, {
      defaultJobOptions: QUEUE_CONFIG.defaultJobOptions,
      limiter: QUEUE_CONFIG.limiter,
    });

    // Soul Signature Building Queue
    soulSignatureQueue = new Bull('soul-signature', QUEUE_CONFIG.redis, {
      defaultJobOptions: QUEUE_CONFIG.defaultJobOptions,
    });

    // Conversation Analysis Queue
    conversationAnalysisQueue = new Bull('conversation-analysis', QUEUE_CONFIG.redis, {
      defaultJobOptions: {
        ...QUEUE_CONFIG.defaultJobOptions,
        attempts: 2,  // Fewer retries for AI analysis
        backoff: {
          type: 'exponential',
          delay: 2000,  // 2 second initial delay
        },
      },
    });

    // Register processors
    registerExtractionProcessor();
    registerSoulSignatureProcessor();
    registerConversationAnalysisProcessor();

    // Setup event handlers
    setupQueueEventHandlers(extractionQueue, 'extraction');
    setupQueueEventHandlers(soulSignatureQueue, 'soul-signature');
    setupQueueEventHandlers(conversationAnalysisQueue, 'conversation-analysis');

    console.log('✅ Bull queues initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Bull queues:', error.message);
    extractionQueue = null;
    soulSignatureQueue = null;
  }
}

/**
 * Register data extraction job processor
 */
function registerExtractionProcessor() {
  extractionQueue.process('extract-platform', async (job) => {
    const { userId, platform, jobId } = job.data;

    console.log(`[Queue] Processing extraction job ${job.id} for ${platform}`);

    try {
      // Update job progress
      await job.progress(0);

      // Import extraction service dynamically to avoid circular dependency
      const { default: extractionService } = await import('./dataExtractionService.js');

      // Notify extraction started
      notifyExtractionStarted(userId, jobId, platform);

      // Update progress
      await job.progress(10);

      // Perform extraction
      const result = await extractionService.extractPlatformData(userId, platform);

      // Update progress
      await job.progress(90);

      if (result.success) {
        console.log(`[Queue] ✅ Extraction job ${job.id} completed successfully`);
        await job.progress(100);

        // Trigger soul signature building after successful extraction
        if (soulSignatureQueue) {
          try {
            const soulJob = await soulSignatureQueue.add('build-signature', {
              userId,
            }, {
              priority: 10,
              delay: 2000,  // Wait 2 seconds after extraction completes
              jobId: `soul-signature:${userId}:${Date.now()}`,
            });
            console.log(`[Queue] Queued soul signature job ${soulJob.id} for user ${userId}`);
          } catch (error) {
            console.warn(`[Queue] Failed to queue soul signature job:`, error.message);
          }
        }

        return result;
      } else {
        throw new Error(result.error || result.message || 'Extraction failed');
      }
    } catch (error) {
      console.error(`[Queue] ❌ Extraction job ${job.id} failed:`, error);
      throw error; // Bull will retry based on attempts configuration
    }
  });
}

/**
 * Register soul signature building processor
 */
function registerSoulSignatureProcessor() {
  soulSignatureQueue.process('build-signature', async (job) => {
    const { userId } = job.data;

    console.log(`[Queue] Processing soul signature job ${job.id} for user ${userId}`);

    try {
      await job.progress(0);

      // Import soul signature builder
      const { default: soulBuilder } = await import('./soulSignatureBuilder.js');

      await job.progress(25);

      // Build soul signature
      const result = await soulBuilder.buildSoulSignature(userId);

      await job.progress(100);

      console.log(`[Queue] ✅ Soul signature job ${job.id} completed`);
      return result;
    } catch (error) {
      console.error(`[Queue] ❌ Soul signature job ${job.id} failed:`, error);
      throw error;
    }
  });
}

/**
 * Register conversation analysis job processor
 */
function registerConversationAnalysisProcessor() {
  conversationAnalysisQueue.process('analyze-conversation', async (job) => {
    const { userId, conversationLogId, sessionId } = job.data;

    console.log(`[Queue] Processing conversation analysis job ${job.id}`);

    try {
      await job.progress(0);

      // Import AI analyzer dynamically to avoid circular dependency
      const { default: aiAnalyzer } = await import('./conversationAIAnalyzer.js');

      await job.progress(10);

      // Run AI analysis
      const result = await aiAnalyzer.analyzeAndUpdateConversationLog(conversationLogId);

      await job.progress(90);

      if (result.success) {
        console.log(`[Queue] ✅ Conversation analysis job ${job.id} completed`);
        await job.progress(100);

        // If this completes a session (e.g., stale session), analyze the session too
        if (sessionId) {
          try {
            const sessionAnalysisJob = await conversationAnalysisQueue.add('analyze-session', {
              userId,
              sessionId,
            }, {
              priority: 15,  // Lower priority than individual messages
              delay: 5000,   // Wait 5 seconds before session analysis
              jobId: `session-analysis:${sessionId}:${Date.now()}`,
            });
            console.log(`[Queue] Queued session analysis job ${sessionAnalysisJob.id}`);
          } catch (error) {
            console.warn(`[Queue] Failed to queue session analysis:`, error.message);
          }
        }

        return result;
      } else {
        throw new Error(result.error || 'Analysis failed');
      }
    } catch (error) {
      console.error(`[Queue] ❌ Conversation analysis job ${job.id} failed:`, error);
      throw error;
    }
  });

  // Register session analysis processor
  conversationAnalysisQueue.process('analyze-session', async (job) => {
    const { sessionId } = job.data;

    console.log(`[Queue] Processing session analysis job ${job.id} for session ${sessionId}`);

    try {
      await job.progress(0);

      const { default: aiAnalyzer } = await import('./conversationAIAnalyzer.js');

      await job.progress(25);

      const result = await aiAnalyzer.analyzeSession(sessionId);

      await job.progress(100);

      console.log(`[Queue] ✅ Session analysis job ${job.id} completed`);
      return result;
    } catch (error) {
      console.error(`[Queue] ❌ Session analysis job ${job.id} failed:`, error);
      throw error;
    }
  });
}

/**
 * Setup event handlers for queue monitoring
 */
function setupQueueEventHandlers(queue, queueName) {
  queue.on('completed', (job, result) => {
    console.log(`[Queue:${queueName}] Job ${job.id} completed`, result);
  });

  queue.on('failed', (job, error) => {
    console.error(`[Queue:${queueName}] Job ${job.id} failed:`, error.message);
  });

  queue.on('stalled', (job) => {
    console.warn(`[Queue:${queueName}] Job ${job.id} stalled - reprocessing`);
  });

  queue.on('error', (error) => {
    console.error(`[Queue:${queueName}] Queue error:`, error);
  });
}

/**
 * Add data extraction job to queue
 * @param {string} userId - User UUID
 * @param {string} platform - Platform name
 * @param {string} jobId - Extraction job ID from database
 * @param {Object} options - Job options (priority, delay, etc.)
 * @returns {Promise<Object>} Bull job
 */
async function addExtractionJob(userId, platform, jobId, options = {}) {
  if (!extractionQueue) {
    console.warn('[Queue] Queue not initialized - running extraction synchronously');

    // Fallback to synchronous execution
    const { default: extractionService } = await import('./dataExtractionService.js');
    return extractionService.extractPlatformData(userId, platform);
  }

  try {
    const job = await extractionQueue.add('extract-platform', {
      userId,
      platform,
      jobId,
    }, {
      priority: options.priority || 5,  // Lower number = higher priority
      delay: options.delay || 0,        // Delay in milliseconds
      jobId: `extraction:${userId}:${platform}:${jobId}`,  // Unique job ID
    });

    console.log(`[Queue] Added extraction job ${job.id} for ${platform}`);
    return job;
  } catch (error) {
    console.error('[Queue] Failed to add extraction job:', error);
    throw error;
  }
}

/**
 * Add soul signature building job to queue
 * @param {string} userId - User UUID
 * @param {Object} options - Job options
 * @returns {Promise<Object>} Bull job
 */
async function addSoulSignatureJob(userId, options = {}) {
  if (!soulSignatureQueue) {
    console.warn('[Queue] Queue not initialized - running soul signature build synchronously');

    // Fallback to synchronous execution
    const { default: soulBuilder } = await import('./soulSignatureBuilder.js');
    return soulBuilder.buildSoulSignature(userId);
  }

  try {
    const job = await soulSignatureQueue.add('build-signature', {
      userId,
    }, {
      priority: options.priority || 10,
      delay: options.delay || 2000,  // Wait 2 seconds after extraction completes
      jobId: `soul-signature:${userId}:${Date.now()}`,
    });

    console.log(`[Queue] Added soul signature job ${job.id} for user ${userId}`);
    return job;
  } catch (error) {
    console.error('[Queue] Failed to add soul signature job:', error);
    throw error;
  }
}

/**
 * Add conversation analysis job to queue
 * @param {string} userId - User UUID
 * @param {string} conversationLogId - Conversation log UUID
 * @param {string} sessionId - Session UUID (optional)
 * @param {Object} options - Job options (priority, delay, etc.)
 * @returns {Promise<Object>} Bull job
 */
async function addConversationAnalysisJob(userId, conversationLogId, sessionId = null, options = {}) {
  if (!conversationAnalysisQueue) {
    console.warn('[Queue] Queue not initialized - running analysis synchronously');

    // Fallback to synchronous execution
    const { default: aiAnalyzer } = await import('./conversationAIAnalyzer.js');
    return aiAnalyzer.analyzeAndUpdateConversationLog(conversationLogId);
  }

  try {
    const job = await conversationAnalysisQueue.add('analyze-conversation', {
      userId,
      conversationLogId,
      sessionId,
    }, {
      priority: options.priority || 5,
      delay: options.delay || 1000,  // 1 second delay by default
      jobId: `analysis:${userId}:${conversationLogId}`,
    });

    console.log(`[Queue] Added conversation analysis job ${job.id}`);
    return job;
  } catch (error) {
    console.error('[Queue] Failed to add conversation analysis job:', error);
    throw error;
  }
}

/**
 * Add session analysis job to queue
 * @param {string} userId - User UUID
 * @param {string} sessionId - Session UUID
 * @param {Object} options - Job options
 * @returns {Promise<Object>} Bull job
 */
async function addSessionAnalysisJob(userId, sessionId, options = {}) {
  if (!conversationAnalysisQueue) {
    console.warn('[Queue] Queue not initialized - running session analysis synchronously');

    const { default: aiAnalyzer } = await import('./conversationAIAnalyzer.js');
    return aiAnalyzer.analyzeSession(sessionId);
  }

  try {
    const job = await conversationAnalysisQueue.add('analyze-session', {
      userId,
      sessionId,
    }, {
      priority: options.priority || 10,
      delay: options.delay || 2000,
      jobId: `session-analysis:${sessionId}:${Date.now()}`,
    });

    console.log(`[Queue] Added session analysis job ${job.id}`);
    return job;
  } catch (error) {
    console.error('[Queue] Failed to add session analysis job:', error);
    throw error;
  }
}

/**
 * Get job status
 * @param {string} jobId - Bull job ID
 * @param {string} queueName - Queue name ('extraction', 'soul-signature', or 'conversation-analysis')
 */
async function getJobStatus(jobId, queueName = 'extraction') {
  let queue;
  switch (queueName) {
    case 'extraction':
      queue = extractionQueue;
      break;
    case 'soul-signature':
      queue = soulSignatureQueue;
      break;
    case 'conversation-analysis':
      queue = conversationAnalysisQueue;
      break;
    default:
      queue = extractionQueue;
  }

  if (!queue) {
    return { error: 'Queue not initialized' };
  }

  try {
    const job = await queue.getJob(jobId);

    if (!job) {
      return { error: 'Job not found' };
    }

    const state = await job.getState();
    const progress = job.progress();

    return {
      id: job.id,
      state,
      progress,
      data: job.data,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
    };
  } catch (error) {
    console.error('[Queue] Error getting job status:', error);
    return { error: error.message };
  }
}

/**
 * Get queue statistics
 */
async function getQueueStats() {
  if (!extractionQueue || !soulSignatureQueue) {
    return {
      available: false,
      message: 'Queues not initialized - Redis not configured',
    };
  }

  try {
    const [
      extractionWaiting,
      extractionActive,
      extractionCompleted,
      extractionFailed,
      soulWaiting,
      soulActive,
      soulCompleted,
      soulFailed,
      analysisWaiting,
      analysisActive,
      analysisCompleted,
      analysisFailed,
    ] = await Promise.all([
      extractionQueue.getWaitingCount(),
      extractionQueue.getActiveCount(),
      extractionQueue.getCompletedCount(),
      extractionQueue.getFailedCount(),
      soulSignatureQueue.getWaitingCount(),
      soulSignatureQueue.getActiveCount(),
      soulSignatureQueue.getCompletedCount(),
      soulSignatureQueue.getFailedCount(),
      conversationAnalysisQueue?.getWaitingCount() || Promise.resolve(0),
      conversationAnalysisQueue?.getActiveCount() || Promise.resolve(0),
      conversationAnalysisQueue?.getCompletedCount() || Promise.resolve(0),
      conversationAnalysisQueue?.getFailedCount() || Promise.resolve(0),
    ]);

    return {
      available: true,
      extraction: {
        waiting: extractionWaiting,
        active: extractionActive,
        completed: extractionCompleted,
        failed: extractionFailed,
      },
      soulSignature: {
        waiting: soulWaiting,
        active: soulActive,
        completed: soulCompleted,
        failed: soulFailed,
      },
      conversationAnalysis: {
        waiting: analysisWaiting,
        active: analysisActive,
        completed: analysisCompleted,
        failed: analysisFailed,
      },
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
    };
  }
}

/**
 * Cleanup completed and failed jobs
 */
async function cleanupOldJobs() {
  if (!extractionQueue || !soulSignatureQueue) {
    return;
  }

  try {
    // Clean jobs older than 1 day
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    await extractionQueue.clean(oneDayAgo, 'completed');
    await extractionQueue.clean(oneDayAgo, 'failed');
    await soulSignatureQueue.clean(oneDayAgo, 'completed');
    await soulSignatureQueue.clean(oneDayAgo, 'failed');

    if (conversationAnalysisQueue) {
      await conversationAnalysisQueue.clean(oneDayAgo, 'completed');
      await conversationAnalysisQueue.clean(oneDayAgo, 'failed');
    }

    console.log('[Queue] ✅ Cleaned up old jobs');
  } catch (error) {
    console.error('[Queue] Error cleaning up jobs:', error);
  }
}

/**
 * Pause queue
 */
async function pauseQueue(queueName = 'extraction') {
  let queue;
  switch (queueName) {
    case 'extraction':
      queue = extractionQueue;
      break;
    case 'soul-signature':
      queue = soulSignatureQueue;
      break;
    case 'conversation-analysis':
      queue = conversationAnalysisQueue;
      break;
    default:
      queue = extractionQueue;
  }

  if (!queue) {
    console.warn('[Queue] Queue not initialized');
    return;
  }

  await queue.pause();
  console.log(`[Queue] Paused ${queueName} queue`);
}

/**
 * Resume queue
 */
async function resumeQueue(queueName = 'extraction') {
  let queue;
  switch (queueName) {
    case 'extraction':
      queue = extractionQueue;
      break;
    case 'soul-signature':
      queue = soulSignatureQueue;
      break;
    case 'conversation-analysis':
      queue = conversationAnalysisQueue;
      break;
    default:
      queue = extractionQueue;
  }

  if (!queue) {
    console.warn('[Queue] Queue not initialized');
    return;
  }

  await queue.resume();
  console.log(`[Queue] Resumed ${queueName} queue`);
}

/**
 * Get queue instances (for Bull Board)
 */
function getQueues() {
  return {
    extractionQueue,
    soulSignatureQueue,
    conversationAnalysisQueue,
  };
}

/**
 * Check if queues are available
 */
function areQueuesAvailable() {
  return !!(extractionQueue && soulSignatureQueue);
}

/**
 * Check if conversation analysis queue is available
 */
function isAnalysisQueueAvailable() {
  return !!conversationAnalysisQueue;
}

export {
  initializeQueues,
  addExtractionJob,
  addSoulSignatureJob,
  addConversationAnalysisJob,
  addSessionAnalysisJob,
  getJobStatus,
  getQueueStats,
  cleanupOldJobs,
  pauseQueue,
  resumeQueue,
  getQueues,
  areQueuesAvailable,
  isAnalysisQueueAvailable,
};

export default {
  initializeQueues,
  addExtractionJob,
  addSoulSignatureJob,
  addConversationAnalysisJob,
  addSessionAnalysisJob,
  getJobStatus,
  getQueueStats,
  cleanupOldJobs,
  pauseQueue,
  resumeQueue,
  getQueues,
  areQueuesAvailable,
  isAnalysisQueueAvailable,
};
