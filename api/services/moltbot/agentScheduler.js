/**
 * Moltbot Agent Scheduler
 *
 * Manages scheduled extraction jobs for connected platforms.
 * Uses Moltbot's cron system for persistent, reliable scheduling.
 *
 * Features:
 * - Initializes extraction agents when user connects platforms
 * - Manages cron job lifecycle (create, pause, resume, delete)
 * - Handles rate limiting and API quotas
 * - Provides execution status and history
 */

import { getMoltbotClient } from './moltbotClient.js';
import { extractionAgentConfigs, runExtraction } from './extractionAgents.js';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/moltbotConfig.js';

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

/**
 * AgentScheduler - Manages extraction agent scheduling
 */
class AgentScheduler {
  constructor(userId) {
    if (!userId) {
      throw new Error('userId is required for AgentScheduler');
    }
    this.userId = userId;
    this.client = getMoltbotClient(userId);
    this.runningJobs = new Map();
  }

  /**
   * Initialize extraction agents for all connected platforms
   */
  async initializeUserAgents() {
    const connectedPlatforms = await this.getConnectedPlatforms();
    const results = {
      scheduled: [],
      skipped: [],
      errors: []
    };

    for (const platform of connectedPlatforms) {
      const agentConfig = extractionAgentConfigs[platform];
      if (!agentConfig) {
        results.skipped.push({ platform, reason: 'No agent configured' });
        continue;
      }

      try {
        if (agentConfig.type === 'polling') {
          await this.schedulePollingAgent(platform, agentConfig);
          results.scheduled.push({ platform, type: 'polling', schedule: agentConfig.schedule });
        } else if (agentConfig.type === 'webhook') {
          // Webhook agents also have fallback polling
          await this.schedulePollingAgent(platform, agentConfig);
          results.scheduled.push({ platform, type: 'webhook+polling', schedule: agentConfig.schedule });
        }
      } catch (error) {
        results.errors.push({ platform, error: error.message });
      }
    }

    console.log(`[AgentScheduler] Initialized for user ${this.userId}:`, results);
    return results;
  }

  /**
   * Schedule a polling extraction agent
   */
  async schedulePollingAgent(platform, agentConfig) {
    const jobName = `extract_${platform}`;

    // Check if job already exists
    const existingJobs = await this.listJobs();
    const existing = existingJobs.find(j => j.name === jobName);

    if (existing && existing.enabled) {
      console.log(`[AgentScheduler] Job ${jobName} already scheduled for user ${this.userId}`);
      return existing;
    }

    // Schedule via Moltbot cron
    const jobConfig = {
      name: jobName,
      schedule: agentConfig.schedule,
      action: {
        type: 'platform.extract',
        platform,
        userId: this.userId,
        endpoints: agentConfig.endpoints
      }
    };

    // If Moltbot is available, use its cron system
    try {
      await this.client.scheduleCron(jobName, agentConfig.schedule, jobConfig.action);
    } catch (error) {
      // Fallback: store in database for local scheduler
      console.log(`[AgentScheduler] Moltbot cron unavailable, using database scheduler`);
    }

    // Always store in database for tracking
    await this.storeJobConfig(jobName, platform, agentConfig.schedule, jobConfig.action);

    return jobConfig;
  }

  /**
   * Store job configuration in database
   */
  async storeJobConfig(jobName, platform, schedule, action) {
    await getSupabaseClient()
      .from('moltbot_extraction_jobs')
      .upsert({
        user_id: this.userId,
        job_name: jobName,
        platform,
        schedule,
        action,
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,job_name' });
  }

  /**
   * Get all connected platforms for this user
   */
  async getConnectedPlatforms() {
    const { data, error } = await getSupabaseClient()
      .from('platform_connections')
      .select('platform')
      .eq('user_id', this.userId)
      .eq('status', 'connected');

    if (error) throw error;
    return (data || []).map(d => d.platform);
  }

  /**
   * List all scheduled jobs for this user
   */
  async listJobs() {
    const { data, error } = await getSupabaseClient()
      .from('moltbot_extraction_jobs')
      .select('*')
      .eq('user_id', this.userId);

    if (error) throw error;
    return data || [];
  }

  /**
   * Pause a job
   */
  async pauseJob(jobName) {
    await getSupabaseClient()
      .from('moltbot_extraction_jobs')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('user_id', this.userId)
      .eq('job_name', jobName);

    // Cancel in Moltbot
    try {
      await this.client.cancelCron(jobName);
    } catch (error) {
      // Ignore if Moltbot unavailable
    }

    return { paused: true, jobName };
  }

  /**
   * Resume a paused job
   */
  async resumeJob(jobName) {
    const { data: job } = await getSupabaseClient()
      .from('moltbot_extraction_jobs')
      .select('*')
      .eq('user_id', this.userId)
      .eq('job_name', jobName)
      .single();

    if (!job) throw new Error(`Job not found: ${jobName}`);

    await getSupabaseClient()
      .from('moltbot_extraction_jobs')
      .update({ enabled: true, updated_at: new Date().toISOString() })
      .eq('user_id', this.userId)
      .eq('job_name', jobName);

    // Re-schedule in Moltbot
    try {
      await this.client.scheduleCron(jobName, job.schedule, job.action);
    } catch (error) {
      // Ignore if Moltbot unavailable
    }

    return { resumed: true, jobName };
  }

  /**
   * Delete a job
   */
  async deleteJob(jobName) {
    await getSupabaseClient()
      .from('moltbot_extraction_jobs')
      .delete()
      .eq('user_id', this.userId)
      .eq('job_name', jobName);

    try {
      await this.client.cancelCron(jobName);
    } catch (error) {
      // Ignore if Moltbot unavailable
    }

    return { deleted: true, jobName };
  }

  /**
   * Run extraction immediately for a platform
   */
  async runNow(platform) {
    console.log(`[AgentScheduler] Running immediate extraction for ${platform}, user ${this.userId}`);

    const startTime = Date.now();
    try {
      const result = await runExtraction(this.userId, platform);

      // Log execution
      await this.logExecution(platform, 'success', result, Date.now() - startTime);

      return { success: true, platform, result };
    } catch (error) {
      await this.logExecution(platform, 'error', { error: error.message }, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Log job execution
   */
  async logExecution(platform, status, result, durationMs) {
    await getSupabaseClient()
      .from('moltbot_job_runs')
      .insert({
        user_id: this.userId,
        platform,
        status,
        result,
        duration_ms: durationMs,
        executed_at: new Date().toISOString()
      });

    // Update last run time on job
    await getSupabaseClient()
      .from('moltbot_extraction_jobs')
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: status,
        run_count: getSupabaseClient().rpc ? undefined : 1 // Would use rpc increment
      })
      .eq('user_id', this.userId)
      .eq('job_name', `extract_${platform}`);
  }

  /**
   * Get execution history
   */
  async getExecutionHistory(platform = null, limit = 50) {
    let query = getSupabaseClient()
      .from('moltbot_job_runs')
      .select('*')
      .eq('user_id', this.userId)
      .order('executed_at', { ascending: false })
      .limit(limit);

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Get scheduler status overview
   */
  async getStatus() {
    const jobs = await this.listJobs();
    const recentRuns = await this.getExecutionHistory(null, 10);

    const platforms = {};
    for (const job of jobs) {
      platforms[job.platform] = {
        enabled: job.enabled,
        schedule: job.schedule,
        lastRun: job.last_run_at,
        lastStatus: job.last_run_status
      };
    }

    return {
      userId: this.userId,
      platforms,
      totalJobs: jobs.length,
      enabledJobs: jobs.filter(j => j.enabled).length,
      recentRuns: recentRuns.slice(0, 5).map(r => ({
        platform: r.platform,
        status: r.status,
        duration: r.duration_ms,
        time: r.executed_at
      }))
    };
  }

  /**
   * Handle platform connection event
   * Call this when a user connects a new platform
   */
  async onPlatformConnected(platform) {
    const agentConfig = extractionAgentConfigs[platform];
    if (!agentConfig) {
      console.log(`[AgentScheduler] No agent configured for ${platform}`);
      return { scheduled: false, reason: 'No agent configured' };
    }

    await this.schedulePollingAgent(platform, agentConfig);

    // Run initial extraction
    try {
      await this.runNow(platform);
    } catch (error) {
      console.error(`[AgentScheduler] Initial extraction failed for ${platform}:`, error.message);
    }

    return { scheduled: true, platform };
  }

  /**
   * Handle platform disconnection event
   */
  async onPlatformDisconnected(platform) {
    const jobName = `extract_${platform}`;
    await this.deleteJob(jobName);
    return { removed: true, platform };
  }
}

/**
 * Local scheduler for when Moltbot is unavailable
 * Uses setInterval to run jobs based on cron schedule
 */
class LocalScheduler {
  constructor() {
    this.intervals = new Map();
    this.running = false;
  }

  /**
   * Start the local scheduler
   */
  async start() {
    if (this.running) return;
    this.running = true;

    console.log('[LocalScheduler] Starting...');

    // Load all enabled jobs
    const { data: jobs } = await getSupabaseClient()
      .from('moltbot_extraction_jobs')
      .select('*')
      .eq('enabled', true);

    for (const job of jobs || []) {
      this.scheduleJob(job);
    }

    // Check for new jobs periodically
    this.checkInterval = setInterval(() => this.checkForNewJobs(), 60000);
  }

  /**
   * Stop the local scheduler
   */
  stop() {
    this.running = false;
    clearInterval(this.checkInterval);

    for (const [key, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();

    console.log('[LocalScheduler] Stopped');
  }

  /**
   * Schedule a job based on its cron expression
   */
  scheduleJob(job) {
    const key = `${job.user_id}_${job.job_name}`;

    // Clear existing interval
    if (this.intervals.has(key)) {
      clearInterval(this.intervals.get(key));
    }

    // Parse cron to interval (simplified - only handles */N minutes)
    const intervalMs = this.cronToInterval(job.schedule);
    if (!intervalMs) {
      console.warn(`[LocalScheduler] Cannot parse cron: ${job.schedule}`);
      return;
    }

    const interval = setInterval(async () => {
      if (!this.running) return;

      try {
        console.log(`[LocalScheduler] Running job: ${job.job_name} for user ${job.user_id}`);
        await runExtraction(job.user_id, job.platform);

        // Log execution
        await getSupabaseClient()
          .from('moltbot_job_runs')
          .insert({
            user_id: job.user_id,
            platform: job.platform,
            status: 'success',
            executed_at: new Date().toISOString()
          });
      } catch (error) {
        console.error(`[LocalScheduler] Job failed: ${job.job_name}`, error.message);
      }
    }, intervalMs);

    this.intervals.set(key, interval);
    console.log(`[LocalScheduler] Scheduled ${key} every ${intervalMs / 1000}s`);
  }

  /**
   * Convert cron expression to milliseconds (simplified)
   */
  cronToInterval(cron) {
    // Handle "*/N * * * *" (every N minutes)
    const match = cron.match(/^\*\/(\d+) \* \* \* \*$/);
    if (match) {
      return parseInt(match[1]) * 60 * 1000;
    }

    // Handle "0 * * * *" (every hour)
    if (cron === '0 * * * *') {
      return 60 * 60 * 1000;
    }

    // Handle "0 */N * * *" (every N hours)
    const hourMatch = cron.match(/^0 \*\/(\d+) \* \* \*$/);
    if (hourMatch) {
      return parseInt(hourMatch[1]) * 60 * 60 * 1000;
    }

    return null;
  }

  /**
   * Check for newly added jobs
   */
  async checkForNewJobs() {
    const { data: jobs } = await getSupabaseClient()
      .from('moltbot_extraction_jobs')
      .select('*')
      .eq('enabled', true);

    for (const job of jobs || []) {
      const key = `${job.user_id}_${job.job_name}`;
      if (!this.intervals.has(key)) {
        this.scheduleJob(job);
      }
    }
  }
}

// Singleton instance for local scheduler
let localSchedulerInstance = null;

/**
 * Get or create local scheduler instance
 */
export function getLocalScheduler() {
  if (!localSchedulerInstance) {
    localSchedulerInstance = new LocalScheduler();
  }
  return localSchedulerInstance;
}

/**
 * Factory function to get scheduler for a user
 */
export function getAgentScheduler(userId) {
  return new AgentScheduler(userId);
}

export { AgentScheduler, LocalScheduler };
