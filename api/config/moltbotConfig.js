/**
 * Moltbot Configuration
 *
 * Moltbot is a self-hosted AI assistant with persistent memory that powers
 * TwinMe's proactive digital twin capabilities.
 *
 * Architecture:
 * - WebSocket gateway for real-time communication
 * - Per-user workspaces with isolated memory
 * - Cron job support for scheduled extraction
 * - Multi-layer memory (episodic, semantic, procedural, predictive)
 */

const config = {
  // WebSocket connection settings
  ws: {
    url: process.env.MOLTBOT_WS_URL || 'ws://127.0.0.1:18789',
    reconnect: {
      maxAttempts: 5,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2
    },
    heartbeat: {
      intervalMs: 30000,
      timeoutMs: 10000
    }
  },

  // Authentication
  auth: {
    apiKey: process.env.MOLTBOT_API_KEY,
    // Encryption key for workspace data (uses same as token encryption)
    encryptionKey: process.env.MOLTBOT_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY
  },

  // Workspace configuration
  workspace: {
    root: process.env.MOLTBOT_WORKSPACE_ROOT || '/data/moltbot/workspaces',
    files: {
      soul: 'SOUL.md',
      user: 'USER.md',
      agents: 'AGENTS.md',
      tools: 'TOOLS.md'
    },
    memoryLayers: ['episodic', 'semantic', 'procedural', 'predictive']
  },

  // Memory retention policies
  memory: {
    episodic: {
      rawRetentionDays: 30,      // Keep raw events for 30 days
      summaryRetention: 'forever' // Keep summaries forever
    },
    semantic: {
      retention: 'forever',       // Facts are permanent
      minConfidence: 0.3          // Minimum confidence to store
    },
    procedural: {
      updateFrequency: 'weekly',  // How often to recalculate patterns
      minObservations: 3          // Minimum observations to create pattern
    },
    predictive: {
      recalculateFrequency: 'daily',
      expirationHours: 24
    }
  },

  // Extraction agent defaults
  extraction: {
    agents: {
      spotify: {
        type: 'polling',
        intervalCron: '*/5 * * * *',  // Every 5 minutes
        endpoints: ['currently_playing', 'recently_played']
      },
      whoop: {
        type: 'webhook',
        events: ['recovery.updated', 'workout.completed', 'sleep.completed']
      },
      calendar: {
        type: 'polling',
        intervalCron: '0 * * * *',    // Every hour
        endpoints: ['events']
      },
      github: {
        type: 'polling',
        intervalCron: '0 */6 * * *',  // Every 6 hours
        endpoints: ['events', 'commits']
      }
    }
  },

  // Proactive trigger defaults
  triggers: {
    defaultCooldownMinutes: 60,
    maxTriggersPerHour: 10,
    evaluationBatchSize: 50
  },

  // Cluster definitions for personality profiling
  clusters: {
    personal: {
      name: 'Personal',
      platforms: ['spotify', 'netflix', 'youtube', 'discord', 'reddit', 'twitch'],
      description: 'Entertainment, social, hobbies'
    },
    professional: {
      name: 'Professional',
      platforms: ['gmail', 'calendar', 'github', 'linkedin', 'slack', 'teams'],
      description: 'Work communication, scheduling, code'
    },
    health: {
      name: 'Health',
      platforms: ['whoop', 'apple_health', 'oura', 'fitbit', 'garmin'],
      description: 'Sleep, recovery, fitness'
    },
    creative: {
      name: 'Creative',
      platforms: ['instagram', 'tiktok', 'pinterest', 'behance'],
      description: 'Content creation, aesthetics'
    }
  }
};

/**
 * Validate configuration on load
 */
export function validateConfig() {
  const warnings = [];
  const errors = [];

  // Check required in production
  if (process.env.NODE_ENV === 'production') {
    if (!config.auth.apiKey) {
      errors.push('MOLTBOT_API_KEY is required in production');
    }
    if (!config.auth.encryptionKey) {
      errors.push('MOLTBOT_ENCRYPTION_KEY or ENCRYPTION_KEY is required in production');
    }
    if (config.ws.url.includes('127.0.0.1') || config.ws.url.includes('localhost')) {
      warnings.push('MOLTBOT_WS_URL points to localhost in production - ensure this is intentional');
    }
  }

  // Development warnings
  if (process.env.NODE_ENV === 'development') {
    if (!config.auth.apiKey) {
      warnings.push('MOLTBOT_API_KEY not set - using unauthenticated connection');
    }
  }

  return { warnings, errors, isValid: errors.length === 0 };
}

/**
 * Get platform cluster
 */
export function getPlatformCluster(platform) {
  const platformLower = platform.toLowerCase();
  for (const [clusterId, cluster] of Object.entries(config.clusters)) {
    if (cluster.platforms.includes(platformLower)) {
      return clusterId;
    }
  }
  return 'personal'; // Default
}

export default config;
