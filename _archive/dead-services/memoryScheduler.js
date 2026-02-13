import cron from 'node-cron';
import { SleepTimeCompute } from './memoryArchitecture.js';

/**
 * Memory Consolidation Scheduler
 * Runs sleep-time compute jobs during low-traffic periods
 */
class MemoryScheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Start all scheduled memory consolidation jobs
   */
  start() {
    if (this.isRunning) {
      console.log('[Memory Scheduler] Already running');
      return;
    }

    console.log('[Memory Scheduler] Starting scheduled jobs...');

    // Job 1: Full consolidation (runs at 3 AM daily)
    // Consolidates platform data into soul signatures for all users
    const fullConsolidationJob = cron.schedule('0 3 * * *', async () => {
      console.log('[Memory Scheduler] Running full consolidation at 3 AM...');
      try {
        await SleepTimeCompute.runForAllUsers();
        console.log('[Memory Scheduler] Full consolidation completed');
      } catch (error) {
        console.error('[Memory Scheduler] Full consolidation failed:', error);
      }
    }, {
      timezone: 'America/New_York' // Adjust to your timezone
    });

    this.jobs.push({ name: 'Full Consolidation', job: fullConsolidationJob });

    // Job 2: Incremental updates (runs every 6 hours)
    // Updates core memory from recent conversations
    const incrementalJob = cron.schedule('0 */6 * * *', async () => {
      console.log('[Memory Scheduler] Running incremental consolidation...');
      try {
        await SleepTimeCompute.runForAllUsers();
        console.log('[Memory Scheduler] Incremental consolidation completed');
      } catch (error) {
        console.error('[Memory Scheduler] Incremental consolidation failed:', error);
      }
    });

    this.jobs.push({ name: 'Incremental Consolidation', job: incrementalJob });

    // Job 3: Cleanup old archived messages (runs weekly on Sunday at 2 AM)
    const cleanupJob = cron.schedule('0 2 * * 0', async () => {
      console.log('[Memory Scheduler] Running weekly cleanup...');
      try {
        await this.cleanupOldArchives();
        console.log('[Memory Scheduler] Cleanup completed');
      } catch (error) {
        console.error('[Memory Scheduler] Cleanup failed:', error);
      }
    });

    this.jobs.push({ name: 'Weekly Cleanup', job: cleanupJob });

    this.isRunning = true;
    console.log(`[Memory Scheduler] ✅ Started ${this.jobs.length} scheduled jobs:`);
    console.log('  - Full Consolidation: Daily at 3 AM');
    console.log('  - Incremental Updates: Every 6 hours');
    console.log('  - Archive Cleanup: Weekly on Sunday at 2 AM');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    console.log('[Memory Scheduler] Stopping all jobs...');
    this.jobs.forEach(({ name, job }) => {
      job.stop();
      console.log(`  - Stopped: ${name}`);
    });
    this.jobs = [];
    this.isRunning = false;
    console.log('[Memory Scheduler] All jobs stopped');
  }

  /**
   * Cleanup archived messages older than 90 days
   */
  async cleanupOldArchives() {
    const { supabaseAdmin } = await import('../config/supabase.js');

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data, error } = await supabaseAdmin
      .from('working_memory_archive')
      .delete()
      .lt('archived_at', ninetyDaysAgo.toISOString());

    if (error) {
      console.error('[Memory Scheduler] Archive cleanup error:', error);
      throw error;
    }

    console.log(`[Memory Scheduler] Cleaned up archives older than 90 days`);
    return data;
  }

  /**
   * Manually trigger consolidation for a specific user
   */
  async triggerForUser(userId) {
    console.log(`[Memory Scheduler] Manually triggering consolidation for user: ${userId}`);
    try {
      await SleepTimeCompute.scheduleForUser(userId);
      console.log(`[Memory Scheduler] Consolidation completed for user: ${userId}`);
      return { success: true };
    } catch (error) {
      console.error(`[Memory Scheduler] Consolidation failed for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: this.jobs.map(({ name }) => name),
      nextRuns: this.jobs.map(({ name, job }) => ({
        name,
        nextRun: job.nextDate()?.toISOString() || 'N/A'
      }))
    };
  }
}

// Singleton instance
const memoryScheduler = new MemoryScheduler();

export { memoryScheduler, MemoryScheduler };
