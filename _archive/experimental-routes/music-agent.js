/**
 * Music Agent API Routes
 *
 * Endpoints for AI-powered music automation:
 * - Collect listening history from Spotify
 * - Learn user preferences
 * - Generate playlists based on mood/activity
 * - Execute agent tasks
 */

import express from 'express';
import MusicAgent from '../services/MusicAgent.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// DATA COLLECTION
// ============================================

/**
 * POST /api/music-agent/collect
 * Collect user's listening history from Spotify
 */
router.post('/collect', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`🎵 Starting data collection for user ${userId}`);

    // Initialize Music Agent
    const agent = await MusicAgent.initialize(userId);

    // Collect listening history
    const result = await agent.collectListeningHistory();

    res.json({
      success: true,
      message: `Collected ${result.totalTracks} tracks from Spotify`,
      data: {
        totalTracks: result.totalTracks,
        topTracksCount: {
          short_term: result.topTracks.short_term.length,
          medium_term: result.topTracks.medium_term.length,
          long_term: result.topTracks.long_term.length
        },
        recentTracksCount: result.recentTracks.length
      }
    });

  } catch (error) {
    console.error('Music Agent collection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to collect listening history',
      details: error.message
    });
  }
});

// ============================================
// PREFERENCE LEARNING
// ============================================

/**
 * POST /api/music-agent/learn
 * Learn user preferences from listening history
 */
router.post('/learn', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`🧠 Starting preference learning for user ${userId}`);

    // Initialize Music Agent
    const agent = await MusicAgent.initialize(userId);

    // Learn preferences
    const preferences = await agent.learnPreferences();

    res.json({
      success: true,
      message: 'Preferences learned successfully',
      data: {
        audioFeatures: preferences.audioFeatures,
        topGenres: preferences.genres.slice(0, 5),
        topArtists: preferences.artists.slice(0, 5),
        topMoods: preferences.moods.slice(0, 3),
        confidence: preferences.confidence
      }
    });

  } catch (error) {
    console.error('Music Agent learning error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to learn preferences',
      details: error.message
    });
  }
});

/**
 * GET /api/music-agent/preferences/:userId
 * Get user's learned preferences
 */
router.get('/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: preferences, error } = await supabase
      .from('agent_music_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !preferences) {
      return res.status(404).json({
        success: false,
        error: 'No preferences found. Run learning first.'
      });
    }

    res.json({
      success: true,
      data: preferences
    });

  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get preferences',
      details: error.message
    });
  }
});

// ============================================
// PLAYLIST GENERATION
// ============================================

/**
 * POST /api/music-agent/generate-playlist
 * Generate AI playlist based on mood or activity
 *
 * Body: {
 *   userId: string,
 *   mood?: 'happy' | 'sad' | 'energetic' | 'calm' | 'focus' | 'party',
 *   activity?: 'workout' | 'studying' | 'coding' | 'running' | 'sleeping',
 *   duration?: number (minutes, default 60),
 *   includeFamiliar?: boolean,
 *   includeNew?: boolean
 * }
 */
router.post('/generate-playlist', async (req, res) => {
  try {
    const {
      userId,
      mood,
      activity,
      duration = 60,
      includeFamiliar = true,
      includeNew = true
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    if (!mood && !activity) {
      return res.status(400).json({
        success: false,
        error: 'Either mood or activity is required'
      });
    }

    console.log(`🎼 Generating ${mood || activity} playlist for user ${userId}`);

    // Initialize Music Agent
    const agent = await MusicAgent.initialize(userId);

    // Generate playlist
    const playlist = await agent.generatePlaylist({
      mood,
      activity,
      duration,
      includeFamiliar,
      includeNew
    });

    res.json({
      success: true,
      message: `Generated "${playlist.name}" with ${playlist.tracks.length} tracks`,
      data: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        trackCount: playlist.tracks.length,
        duration: duration,
        tracks: playlist.tracks,
        metrics: {
          diversity: playlist.diversity_score,
          relevance: playlist.relevance_score,
          novelty: playlist.novelty_score
        }
      }
    });

  } catch (error) {
    console.error('Playlist generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate playlist',
      details: error.message
    });
  }
});

/**
 * GET /api/music-agent/playlists/:userId
 * Get user's generated playlists
 */
router.get('/playlists/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const { data: playlists, error, count } = await supabase
      .from('agent_music_playlists')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      success: true,
      data: playlists,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Get playlists error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get playlists',
      details: error.message
    });
  }
});

/**
 * GET /api/music-agent/playlist/:playlistId
 * Get specific playlist details
 */
router.get('/playlist/:playlistId', async (req, res) => {
  try {
    const { playlistId } = req.params;

    const { data: playlist, error } = await supabase
      .from('agent_music_playlists')
      .select('*')
      .eq('id', playlistId)
      .single();

    if (error || !playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }

    res.json({
      success: true,
      data: playlist
    });

  } catch (error) {
    console.error('Get playlist error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get playlist',
      details: error.message
    });
  }
});

/**
 * DELETE /api/music-agent/playlist/:playlistId
 * Delete a playlist
 */
router.delete('/playlist/:playlistId', async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const { error } = await supabase
      .from('agent_music_playlists')
      .delete()
      .eq('id', playlistId)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Playlist deleted successfully'
    });

  } catch (error) {
    console.error('Delete playlist error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete playlist',
      details: error.message
    });
  }
});

// ============================================
// TASK MANAGEMENT
// ============================================

/**
 * POST /api/music-agent/task
 * Create and queue a new agent task
 *
 * Body: {
 *   userId: string,
 *   taskName: 'collect_data' | 'learn_preferences' | 'generate_playlist',
 *   taskParameters?: object,
 *   priority?: number (1-10),
 *   scheduledFor?: ISO date string
 * }
 */
router.post('/task', async (req, res) => {
  try {
    const {
      userId,
      taskName,
      taskParameters = {},
      priority = 5,
      scheduledFor = null
    } = req.body;

    if (!userId || !taskName) {
      return res.status(400).json({
        success: false,
        error: 'userId and taskName are required'
      });
    }

    // Create task in database
    const { data: task, error } = await supabase
      .from('agent_tasks')
      .insert({
        user_id: userId,
        agent_type: 'music',
        task_type: scheduledFor ? 'scheduled' : 'on_demand',
        task_name: taskName,
        task_parameters: taskParameters,
        priority,
        scheduled_for: scheduledFor,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    // If no schedule, execute immediately
    if (!scheduledFor) {
      // Execute in background
      executeTaskInBackground(task.id, userId);

      return res.json({
        success: true,
        message: 'Task queued for immediate execution',
        data: task
      });
    }

    res.json({
      success: true,
      message: `Task scheduled for ${scheduledFor}`,
      data: task
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create task',
      details: error.message
    });
  }
});

/**
 * GET /api/music-agent/tasks/:userId
 * Get user's agent tasks
 */
router.get('/tasks/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, limit = 20 } = req.query;

    let query = supabase
      .from('agent_tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_type', 'music')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: tasks, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: tasks
    });

  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tasks',
      details: error.message
    });
  }
});

/**
 * Execute task in background (non-blocking)
 */
async function executeTaskInBackground(taskId, userId) {
  try {
    const agent = await MusicAgent.initialize(userId);
    await agent.executeTask(taskId);
    console.log(`✅ Task ${taskId} completed successfully`);
  } catch (error) {
    console.error(`❌ Task ${taskId} failed:`, error);
  }
}

// ============================================
// AGENT STATUS & INSIGHTS
// ============================================

/**
 * GET /api/music-agent/status/:userId
 * Get Music Agent status and statistics
 */
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get tracks count
    const { count: tracksCount } = await supabase
      .from('agent_music_tracks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Get playlists count
    const { count: playlistsCount } = await supabase
      .from('agent_music_playlists')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Get preferences
    const { data: preferences } = await supabase
      .from('agent_music_preferences')
      .select('total_tracks_analyzed, confidence_score, last_learning_at')
      .eq('user_id', userId)
      .single();

    // Get recent tasks
    const { data: recentTasks } = await supabase
      .from('agent_tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_type', 'music')
      .order('created_at', { ascending: false })
      .limit(5);

    res.json({
      success: true,
      data: {
        tracksAnalyzed: tracksCount || 0,
        playlistsGenerated: playlistsCount || 0,
        learningConfidence: preferences?.confidence_score || 0,
        lastLearning: preferences?.last_learning_at,
        recentTasks: recentTasks || [],
        status: tracksCount > 0 ? 'active' : 'not_initialized'
      }
    });

  } catch (error) {
    console.error('Get agent status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get agent status',
      details: error.message
    });
  }
});

/**
 * GET /api/music-agent/insights/:userId
 * Get AI-generated insights about user's music taste
 */
router.get('/insights/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: insights, error } = await supabase
      .from('agent_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_type', 'music')
      .eq('is_acknowledged', false)
      .order('importance', { ascending: false })
      .limit(10);

    if (error) throw error;

    res.json({
      success: true,
      data: insights || []
    });

  } catch (error) {
    console.error('Get insights error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get insights',
      details: error.message
    });
  }
});

/**
 * POST /api/music-agent/initialize
 * One-click initialization: collect data + learn preferences
 */
router.post('/initialize', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`🚀 Initializing Music Agent for user ${userId}`);

    // Initialize agent
    const agent = await MusicAgent.initialize(userId);

    // Step 1: Collect data
    console.log('Step 1: Collecting listening history...');
    const collection = await agent.collectListeningHistory();

    // Step 2: Learn preferences
    console.log('Step 2: Learning preferences...');
    const preferences = await agent.learnPreferences();

    res.json({
      success: true,
      message: `Music Agent initialized! Analyzed ${collection.totalTracks} tracks.`,
      data: {
        tracksCollected: collection.totalTracks,
        confidence: preferences.confidence,
        topGenres: preferences.genres.slice(0, 5),
        topMoods: preferences.moods.slice(0, 3)
      }
    });

  } catch (error) {
    console.error('Music Agent initialization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize Music Agent',
      details: error.message
    });
  }
});

export default router;
