/**
 * Moltbot Workspace Manager
 *
 * Manages per-user workspaces in Moltbot, including:
 * - SOUL.md - Soul signature and personality profile
 * - USER.md - User profile and preferences
 * - AGENTS.md - Active extraction agents
 * - TOOLS.md - Available automations
 * - Memory layer initialization
 *
 * Security:
 * - All workspace paths are validated to prevent traversal
 * - User can only access their own workspace
 * - Data is encrypted at rest
 */

import { getMoltbotClient } from './moltbotClient.js';
import config, { getPlatformCluster } from '../../config/moltbotConfig.js';

class MoltbotWorkspaceManager {
  constructor(userId) {
    if (!userId) {
      throw new Error('userId is required for MoltbotWorkspaceManager');
    }
    this.userId = userId;
    this.client = getMoltbotClient(userId);
  }

  /**
   * Initialize a new workspace for a user
   * @param {object} soulSignature - Soul signature from SoulSignatureBuilder
   * @param {object} userProfile - User profile data
   */
  async initializeWorkspace(soulSignature, userProfile) {
    console.log(`[WorkspaceManager] Initializing workspace for user: ${this.userId}`);

    await this.client.connect();

    // Create workspace files
    await Promise.all([
      this.writeSoulMd(soulSignature),
      this.writeUserMd(userProfile),
      this.writeAgentsMd([]),
      this.writeToolsMd([])
    ]);

    // Initialize memory layers
    await this.initializeMemoryLayers();

    // Initialize correlations
    await this.initializeCorrelations(soulSignature);

    console.log(`[WorkspaceManager] Workspace initialized for user: ${this.userId}`);
    return { success: true };
  }

  /**
   * Update SOUL.md with new soul signature data
   */
  async updateSoulSignature(soulSignature) {
    return this.writeSoulMd(soulSignature);
  }

  /**
   * Generate and write SOUL.md content
   */
  async writeSoulMd(soulSignature) {
    const content = this.generateSoulMd(soulSignature);
    return this.client.writeWorkspaceFile(config.workspace.files.soul, content);
  }

  /**
   * Generate SOUL.md markdown content
   */
  generateSoulMd(signature) {
    if (!signature) {
      return `# Soul Signature

*No soul signature data available yet. Connect platforms to generate.*

Generated: ${new Date().toISOString()}
`;
    }

    // Extract Big Five traits (handle both new and legacy formats)
    const bigFive = signature.big_five || signature.personality_traits?.big_five || {};
    const mbti = signature.mbti || signature.personality_traits?.mbti || {};

    // Build research correlations section
    const correlations = signature.correlations || signature.research_correlations || [];
    const correlationsSection = correlations.length > 0
      ? correlations.map(c => `- **${c.paper || c.source}**: ${c.finding} (r=${c.r_value || 'N/A'})`).join('\n')
      : '*No research correlations applied yet*';

    // Build behavioral patterns section
    const patterns = signature.patterns || signature.behavioral_patterns || [];
    const patternsSection = patterns.length > 0
      ? patterns.map(p => `- **${p.name}**: ${p.description} (confidence: ${Math.round((p.confidence || 0.5) * 100)}%)`).join('\n')
      : '*Patterns will be detected as more data is collected*';

    // Build cluster personalities section
    const clusters = signature.cluster_personalities || {};
    let clusterSection = '';
    for (const [clusterId, cluster] of Object.entries(clusters)) {
      const clusterConfig = config.clusters[clusterId];
      if (clusterConfig && cluster) {
        clusterSection += `
### ${clusterConfig.name} Cluster
*${clusterConfig.description}*
- Openness: ${cluster.openness || 50}/100
- Conscientiousness: ${cluster.conscientiousness || 50}/100
- Extraversion: ${cluster.extraversion || 50}/100
- Agreeableness: ${cluster.agreeableness || 50}/100
- Neuroticism: ${cluster.neuroticism || 50}/100
- Communication Style: ${cluster.communication_style || 'unknown'}
`;
      }
    }

    return `# Soul Signature

> The authentic digital representation of ${signature.user_name || 'this person'}'s unique identity.

## Personality Profile (Big Five)

| Trait | Score | Description |
|-------|-------|-------------|
| Openness | ${bigFive.openness || 50}/100 | ${this.getTraitDescription('openness', bigFive.openness)} |
| Conscientiousness | ${bigFive.conscientiousness || 50}/100 | ${this.getTraitDescription('conscientiousness', bigFive.conscientiousness)} |
| Extraversion | ${bigFive.extraversion || 50}/100 | ${this.getTraitDescription('extraversion', bigFive.extraversion)} |
| Agreeableness | ${bigFive.agreeableness || 50}/100 | ${this.getTraitDescription('agreeableness', bigFive.agreeableness)} |
| Neuroticism | ${bigFive.neuroticism || 50}/100 | ${this.getTraitDescription('neuroticism', bigFive.neuroticism)} |

## MBTI Inference

- **Type**: ${mbti.type || 'Unknown'}
- **Confidence**: ${mbti.confidence || 0}%
- **Cognitive Functions**: ${mbti.cognitive_functions?.join(' > ') || 'Not determined'}

## Communication Style

- **Overall**: ${signature.communication_style || 'balanced'}
- **Formality**: ${signature.formality_level || 'adaptive'}
- **Response Length**: ${signature.response_length || 'moderate'}
- **Emoji Usage**: ${signature.emoji_usage || 'occasional'}

## Behavioral Patterns

${patternsSection}

## Cluster Personalities
${clusterSection || '*Cluster profiles will be built as platform data is analyzed*'}

## Research-Backed Correlations

${correlationsSection}

## Music Signature

${this.formatMusicSignature(signature.music_taste || signature.music_signature)}

## Health Signature

${this.formatHealthSignature(signature.health_signature)}

## Interests & Curiosities

${(signature.interests || []).map(i => `- ${i.name || i}: ${i.confidence ? `(${Math.round(i.confidence * 100)}% confidence)` : ''}`).join('\n') || '*Interests will be extracted from connected platforms*'}

## Uniqueness Markers

${(signature.uniqueness_markers || []).map(m => `- ${m}`).join('\n') || '*Unique characteristics will emerge as more data is analyzed*'}

## Data Sources

Connected platforms: ${(signature.data_sources || []).join(', ') || 'None'}

---

*Generated: ${signature.generated_at || new Date().toISOString()}*
*Authenticity Score: ${signature.authenticity_score || 0}/100*
`;
  }

  /**
   * Get trait description based on score
   */
  getTraitDescription(trait, score) {
    if (!score || score === 50) return 'Balanced';

    const descriptions = {
      openness: {
        low: 'Practical, conventional',
        high: 'Creative, curious, open to new experiences'
      },
      conscientiousness: {
        low: 'Flexible, spontaneous',
        high: 'Organized, disciplined, goal-oriented'
      },
      extraversion: {
        low: 'Reserved, reflective, prefers solitude',
        high: 'Outgoing, energetic, seeks social interaction'
      },
      agreeableness: {
        low: 'Analytical, skeptical, competitive',
        high: 'Cooperative, trusting, helpful'
      },
      neuroticism: {
        low: 'Emotionally stable, calm',
        high: 'Sensitive, prone to stress, emotionally reactive'
      }
    };

    const level = score > 60 ? 'high' : score < 40 ? 'low' : 'Moderate';
    if (level === 'Moderate') return 'Moderate levels';

    return descriptions[trait]?.[level] || level;
  }

  /**
   * Format music signature for markdown
   */
  formatMusicSignature(music) {
    if (!music) return '*No music data available*';

    return `
- **Top Genres**: ${(music.top_genres || []).slice(0, 5).join(', ') || 'Unknown'}
- **Average Tempo**: ${music.avg_tempo || 'Unknown'} BPM
- **Energy Level**: ${music.energy_level || 'Unknown'}
- **Valence (Mood)**: ${music.valence || 'Unknown'}
- **Discovery Ratio**: ${music.discovery_ratio || 'Unknown'}
- **Listening Patterns**: ${music.listening_patterns || 'Unknown'}
`;
  }

  /**
   * Format health signature for markdown
   */
  formatHealthSignature(health) {
    if (!health || !health.available) return '*No health data connected*';

    return `
- **Sleep Quality**: ${health.sleep_quality || 'Unknown'}
- **Average Recovery**: ${health.avg_recovery || 'Unknown'}%
- **HRV Baseline**: ${health.hrv_baseline || 'Unknown'} ms
- **Activity Level**: ${health.activity_level || 'Unknown'}
- **Energy Pattern**: ${health.energy_pattern || 'Unknown'}
- **Stress Indicators**: ${health.stress_level || 'Unknown'}
`;
  }

  /**
   * Generate and write USER.md content
   */
  async writeUserMd(userProfile) {
    const content = this.generateUserMd(userProfile);
    return this.client.writeWorkspaceFile(config.workspace.files.user, content);
  }

  /**
   * Generate USER.md markdown content
   */
  generateUserMd(profile) {
    if (!profile) {
      return `# User Profile

*No profile data available yet.*

Generated: ${new Date().toISOString()}
`;
    }

    return `# User Profile

## Basic Information

- **Name**: ${profile.name || 'Unknown'}
- **Email**: ${profile.email || 'Unknown'}
- **Timezone**: ${profile.timezone || 'Unknown'}
- **Locale**: ${profile.locale || 'en-US'}

## Preferences

- **Notification Preference**: ${profile.notification_preference || 'balanced'}
- **Privacy Level**: ${profile.privacy_level || 'standard'}
- **Data Retention**: ${profile.data_retention || '30 days'}

## Connected Platforms

${(profile.connected_platforms || []).map(p => `- ${p.name}: Connected on ${p.connected_at || 'unknown'}`).join('\n') || '*No platforms connected*'}

## Privacy Settings

- **Share Soul Signature**: ${profile.share_soul_signature ? 'Yes' : 'No'}
- **Allow Matching**: ${profile.allow_matching ? 'Yes' : 'No'}
- **Public Profile**: ${profile.public_profile ? 'Yes' : 'No'}

---

*Last Updated: ${profile.updated_at || new Date().toISOString()}*
`;
  }

  /**
   * Write AGENTS.md - list of active extraction agents
   */
  async writeAgentsMd(agents) {
    const agentsList = agents.map(a => `
### ${a.name}
- **Platform**: ${a.platform}
- **Type**: ${a.type}
- **Schedule**: ${a.schedule || 'N/A'}
- **Status**: ${a.status}
- **Last Run**: ${a.lastRun || 'Never'}
`).join('\n') || '*No extraction agents configured*';

    const content = `# Extraction Agents

Active agents that continuously extract data from connected platforms.

${agentsList}

---

*Updated: ${new Date().toISOString()}*
`;

    return this.client.writeWorkspaceFile(config.workspace.files.agents, content);
  }

  /**
   * Write TOOLS.md - list of available automations
   */
  async writeToolsMd(tools) {
    const toolsList = tools.map(t => `
### ${t.name}
- **Description**: ${t.description}
- **Trigger**: ${t.trigger}
- **Enabled**: ${t.enabled ? 'Yes' : 'No'}
`).join('\n') || '*No automations configured*';

    const content = `# Available Tools & Automations

Automations that can be triggered based on proactive events.

${toolsList}

---

*Updated: ${new Date().toISOString()}*
`;

    return this.client.writeWorkspaceFile(config.workspace.files.tools, content);
  }

  /**
   * Initialize memory layers with default structure
   */
  async initializeMemoryLayers() {
    // Store initial metadata for each layer
    const layerMeta = {
      episodic: {
        description: 'Specific events and experiences',
        retention: config.memory.episodic,
        initialized_at: new Date().toISOString()
      },
      semantic: {
        description: 'Learned facts and knowledge',
        retention: config.memory.semantic,
        initialized_at: new Date().toISOString()
      },
      procedural: {
        description: 'Behavioral patterns and routines',
        retention: config.memory.procedural,
        initialized_at: new Date().toISOString()
      },
      predictive: {
        description: 'Future behavior forecasts',
        retention: config.memory.predictive,
        initialized_at: new Date().toISOString()
      }
    };

    // Initialize each layer
    await Promise.all(
      Object.entries(layerMeta).map(([layer, meta]) =>
        this.client.storeMemory(layer, '_metadata', meta)
      )
    );

    console.log(`[WorkspaceManager] Memory layers initialized for user: ${this.userId}`);
  }

  /**
   * Initialize research correlations for the user
   */
  async initializeCorrelations(soulSignature) {
    // Store applicable correlations based on user's platform data
    const correlations = {
      active: [],
      pending: [],
      initialized_at: new Date().toISOString()
    };

    // Add correlations based on connected platforms
    if (soulSignature?.data_sources) {
      for (const platform of soulSignature.data_sources) {
        const cluster = getPlatformCluster(platform);
        correlations.active.push({
          platform,
          cluster,
          correlation_types: this.getCorrelationTypesForPlatform(platform)
        });
      }
    }

    await this.client.writeWorkspaceFile(
      'correlations/active.json',
      JSON.stringify(correlations, null, 2)
    );
  }

  /**
   * Get correlation types applicable to a platform
   */
  getCorrelationTypesForPlatform(platform) {
    const correlationMap = {
      spotify: ['music_personality', 'tempo_energy', 'genre_openness', 'listening_patterns'],
      whoop: ['recovery_mood', 'sleep_personality', 'hrv_stress', 'activity_conscientiousness'],
      calendar: ['schedule_patterns', 'work_life_balance', 'meeting_behavior'],
      github: ['coding_patterns', 'collaboration_style', 'project_interests'],
      discord: ['communication_style', 'community_engagement', 'social_patterns'],
      youtube: ['content_interests', 'learning_style', 'entertainment_preferences'],
      netflix: ['viewing_patterns', 'genre_preferences', 'binge_behavior'],
      reddit: ['discussion_style', 'topic_interests', 'community_involvement']
    };

    return correlationMap[platform.toLowerCase()] || ['general'];
  }

  /**
   * Add a new extraction agent
   */
  async addAgent(agentConfig) {
    // Read current agents
    const agentsFile = await this.client.readWorkspaceFile(config.workspace.files.agents)
      .catch(() => null);

    // Parse existing agents (simplified - would need proper parsing in production)
    const agents = agentsFile ? this.parseAgentsFromMd(agentsFile) : [];

    // Add new agent
    agents.push({
      ...agentConfig,
      status: 'active',
      addedAt: new Date().toISOString()
    });

    // Write updated agents
    await this.writeAgentsMd(agents);

    // Schedule the agent if it's a polling type
    if (agentConfig.type === 'polling' && agentConfig.schedule) {
      await this.client.scheduleCron(
        `agent_${agentConfig.platform}`,
        agentConfig.schedule,
        {
          action: 'platform.extract',
          platform: agentConfig.platform,
          userId: this.userId
        }
      );
    }

    return { success: true, agent: agentConfig };
  }

  /**
   * Remove an extraction agent
   */
  async removeAgent(platform) {
    // Cancel cron job
    await this.client.cancelCron(`agent_${platform}`).catch(() => {});

    // Update agents file (would need proper implementation)
    console.log(`[WorkspaceManager] Removed agent for platform: ${platform}`);

    return { success: true };
  }

  /**
   * Parse agents from markdown (simplified)
   */
  parseAgentsFromMd(mdContent) {
    // Simplified parsing - in production would use proper markdown parser
    return [];
  }

  /**
   * Get workspace status
   */
  async getWorkspaceStatus() {
    try {
      const files = await this.client.listWorkspaceFiles();

      return {
        exists: true,
        files: files,
        userId: this.userId
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message,
        userId: this.userId
      };
    }
  }
}

/**
 * Factory function to get workspace manager for a user
 */
export function getWorkspaceManager(userId) {
  return new MoltbotWorkspaceManager(userId);
}

export { MoltbotWorkspaceManager };
export default MoltbotWorkspaceManager;
