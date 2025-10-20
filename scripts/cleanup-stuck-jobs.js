/**
 * Clean up stuck extraction jobs
 * Updates jobs with status 'running' or 'pending' to 'failed' if they've been running for more than 5 minutes
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupStuckJobs() {
  console.log('🔍 Checking for stuck extraction jobs...');

  // Find jobs that have been running for more than 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: stuckJobs, error: fetchError } = await supabase
    .from('data_extraction_jobs')
    .select('*')
    .in('status', ['running', 'pending'])
    .lt('started_at', fiveMinutesAgo);

  if (fetchError) {
    console.error('❌ Error fetching stuck jobs:', fetchError);
    return;
  }

  if (!stuckJobs || stuckJobs.length === 0) {
    console.log('✅ No stuck jobs found');
    return;
  }

  console.log(`📋 Found ${stuckJobs.length} stuck jobs:`);
  stuckJobs.forEach(job => {
    console.log(`  - ${job.platform} (${job.status}) - Started: ${job.started_at}`);
  });

  // Update stuck jobs to 'failed'
  const { data: updated, error: updateError } = await supabase
    .from('data_extraction_jobs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: 'Job timeout - cleaned up by maintenance script'
    })
    .in('id', stuckJobs.map(j => j.id))
    .select();

  if (updateError) {
    console.error('❌ Error updating stuck jobs:', updateError);
    return;
  }

  console.log(`✅ Successfully cleaned up ${updated.length} stuck jobs`);
}

cleanupStuckJobs()
  .then(() => {
    console.log('✅ Cleanup complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Cleanup failed:', err);
    process.exit(1);
  });
