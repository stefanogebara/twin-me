/**
 * Script to clean up extraction jobs stuck in 'running' state
 * These jobs started but never completed or failed
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanupStuckJobs() {
  console.log('🧹 Cleaning up stuck extraction jobs...\n');

  try {
    // Find jobs stuck in 'running' state for more than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: stuckJobs, error: fetchError } = await supabase
      .from('data_extraction_jobs')
      .select('id, platform, user_id, started_at')
      .eq('status', 'running')
      .lt('started_at', oneHourAgo);

    if (fetchError) {
      console.error('❌ Error fetching stuck jobs:', fetchError);
      return;
    }

    if (!stuckJobs || stuckJobs.length === 0) {
      console.log('✅ No stuck jobs found');
      return;
    }

    console.log(`Found ${stuckJobs.length} stuck jobs:\n`);
    stuckJobs.forEach(job => {
      console.log(`  - ${job.platform} (started at ${job.started_at})`);
    });

    // Mark all stuck jobs as failed
    const { error: updateError } = await supabase
      .from('data_extraction_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: 'Job timed out - stuck in running state'
      })
      .eq('status', 'running')
      .lt('started_at', oneHourAgo);

    if (updateError) {
      console.error('\n❌ Error updating stuck jobs:', updateError);
      return;
    }

    console.log(`\n✅ Successfully marked ${stuckJobs.length} stuck jobs as failed`);
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the cleanup
cleanupStuckJobs().then(() => {
  console.log('\n🎯 Cleanup complete');
  process.exit(0);
});