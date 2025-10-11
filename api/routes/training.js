import express from 'express';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// Verify Supabase is properly initialized
if (!supabase) {
  console.error('[Training API] Supabase client not initialized');
}

// In-memory storage for training jobs (in production, use Redis or database)
const trainingJobs = new Map();

/**
 * GET /api/training/status
 * Get current training status and metrics
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.id;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if there's an active training job
    const activeJob = trainingJobs.get(userId);

    // Get total samples from user_text_content (processed text samples for training)
    const { count: totalSamples, error: samplesError } = await supabase
      .from('user_text_content')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (samplesError) {
      console.error('Error fetching samples count:', samplesError);
    }

    // Get connected platforms count
    const { data: platforms, error: platformsError } = await supabase
      .from('soul_data_sources')
      .select('provider', { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'connected');

    if (platformsError) {
      console.error('Error fetching platforms:', platformsError);
    }

    const connectedPlatforms = platforms?.length || 0;

    // Check if model exists (twin created)
    const { data: twinData, error: twinError } = await supabase
      .from('digital_twins')
      .select('id, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (twinError && twinError.code !== 'PGRST116') {
      console.error('Error fetching twin data:', twinError);
    }

    let modelStatus = 'idle';
    let accuracy = 0;
    let lastTraining = null;

    if (activeJob) {
      modelStatus = 'training';
      accuracy = activeJob.currentAccuracy || 0;
    } else if (twinData) {
      modelStatus = 'ready';
      // Calculate accuracy based on data completeness
      accuracy = Math.min(75 + (connectedPlatforms * 3), 95);
      lastTraining = twinData.updated_at;
    }

    const metrics = {
      modelStatus,
      accuracy: parseFloat(accuracy.toFixed(1)),
      totalSamples: totalSamples || 0,
      lastTraining,
      epochs: activeJob?.totalEpochs || 10,
      currentEpoch: activeJob?.currentEpoch || 0,
      connectedPlatforms,
      progress: activeJob ? Math.round((activeJob.currentEpoch / activeJob.totalEpochs) * 100) : 0,
    };

    res.json({ success: true, metrics });
  } catch (error) {
    console.error('Error fetching training status:', error);
    res.status(500).json({ error: 'Failed to fetch training status' });
  }
});

/**
 * POST /api/training/start
 * Start training the model
 */
router.post('/start', async (req, res) => {
  try {
    const userId = req.body.userId || req.user?.id;
    const epochs = req.body.epochs || 10;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if already training
    if (trainingJobs.has(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Training already in progress'
      });
    }

    // Verify user has data to train on
    const { count: dataCount, error: dataError } = await supabase
      .from('user_text_content')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (dataError) {
      console.error('Error checking training data:', dataError);
      return res.status(500).json({ error: 'Failed to verify training data' });
    }

    if (!dataCount || dataCount === 0) {
      return res.status(400).json({
        success: false,
        error: 'No training data available. Please connect at least one platform.'
      });
    }

    // Create training job
    const jobId = `train_${userId}_${Date.now()}`;
    const job = {
      jobId,
      userId,
      status: 'training',
      totalEpochs: epochs,
      currentEpoch: 0,
      currentAccuracy: 0,
      startTime: new Date().toISOString(),
    };

    trainingJobs.set(userId, job);

    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert([{
        event_type: 'training_started',
        event_data: { epochs, dataCount },
        user_id: userId,
        session_id: jobId,
        timestamp: new Date().toISOString(),
      }]);

    // Simulate training progress (in production, this would be an async job)
    simulateTraining(userId, epochs);

    res.json({
      success: true,
      message: 'Training started successfully',
      jobId
    });
  } catch (error) {
    console.error('Error starting training:', error);
    res.status(500).json({ error: 'Failed to start training' });
  }
});

/**
 * POST /api/training/stop
 * Stop ongoing training
 */
router.post('/stop', async (req, res) => {
  try {
    const userId = req.body.userId || req.user?.id;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const job = trainingJobs.get(userId);

    if (!job) {
      return res.status(400).json({
        success: false,
        error: 'No training in progress'
      });
    }

    // Remove the job
    trainingJobs.delete(userId);

    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert([{
        event_type: 'training_stopped',
        event_data: {
          jobId: job.jobId,
          completedEpochs: job.currentEpoch,
          totalEpochs: job.totalEpochs
        },
        user_id: userId,
        session_id: job.jobId,
        timestamp: new Date().toISOString(),
      }]);

    res.json({ success: true, message: 'Training stopped' });
  } catch (error) {
    console.error('Error stopping training:', error);
    res.status(500).json({ error: 'Failed to stop training' });
  }
});

/**
 * POST /api/training/reset
 * Reset the model
 */
router.post('/reset', async (req, res) => {
  try {
    const userId = req.body.userId || req.user?.id;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Stop any ongoing training
    trainingJobs.delete(userId);

    // In a real implementation, you would reset model weights here
    // For now, we'll just update the twin's updated_at timestamp

    const { error: updateError } = await supabase
      .from('digital_twins')
      .update({ updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error resetting model:', updateError);
      return res.status(500).json({ error: 'Failed to reset model' });
    }

    // Log analytics event
    await supabase
      .from('analytics_events')
      .insert([{
        event_type: 'model_reset',
        event_data: {},
        user_id: userId,
        session_id: `reset_${Date.now()}`,
        timestamp: new Date().toISOString(),
      }]);

    res.json({ success: true, message: 'Model reset successfully' });
  } catch (error) {
    console.error('Error resetting model:', error);
    res.status(500).json({ error: 'Failed to reset model' });
  }
});

/**
 * Simulate training progress
 * In production, this would be replaced with actual model training
 */
async function simulateTraining(userId, totalEpochs) {
  const job = trainingJobs.get(userId);
  if (!job) return;

  const epochDuration = 2000; // 2 seconds per epoch

  for (let epoch = 1; epoch <= totalEpochs; epoch++) {
    // Check if job was cancelled
    const currentJob = trainingJobs.get(userId);
    if (!currentJob || currentJob.jobId !== job.jobId) {
      console.log(`Training cancelled for user ${userId}`);
      return;
    }

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, epochDuration));

    // Update progress
    const progress = (epoch / totalEpochs) * 100;
    const accuracy = 70 + (progress * 0.25); // Accuracy increases from 70% to 95%

    job.currentEpoch = epoch;
    job.currentAccuracy = accuracy;
    trainingJobs.set(userId, job);

    console.log(`Training progress for ${userId}: Epoch ${epoch}/${totalEpochs}, Accuracy: ${accuracy.toFixed(1)}%`);
  }

  // Training complete
  const finalJob = trainingJobs.get(userId);
  if (finalJob && finalJob.jobId === job.jobId) {
    // Update the twin's updated_at to mark completion
    await supabase
      .from('digital_twins')
      .update({ updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    // Log completion event
    await supabase
      .from('analytics_events')
      .insert([{
        event_type: 'training_completed',
        event_data: {
          epochs: totalEpochs,
          finalAccuracy: finalJob.currentAccuracy
        },
        user_id: userId,
        session_id: job.jobId,
        timestamp: new Date().toISOString(),
      }]);

    // Remove job from active jobs
    trainingJobs.delete(userId);
    console.log(`Training completed for user ${userId}`);
  }
}

export default router;
