/**
 * Moltbot Services - Main Export
 *
 * Moltbot is a self-hosted AI assistant with persistent memory that powers
 * TwinMe's proactive digital twin capabilities.
 *
 * Services:
 * - MoltbotClient: WebSocket connection to Moltbot server
 * - MoltbotWorkspaceManager: Per-user workspace initialization and management
 * - MoltbotMemoryService: Four-layer cognitive memory (episodic/semantic/procedural/predictive)
 * - MoltbotTriggerService: Proactive event detection and action execution
 *
 * Usage:
 * ```javascript
 * import { getMoltbotClient, getMemoryService, getTriggerService } from './services/moltbot';
 *
 * // Connect to Moltbot for a user
 * const client = getMoltbotClient(userId);
 * await client.connect();
 *
 * // Store an event in memory
 * const memory = getMemoryService(userId);
 * await memory.storeEvent({ platform: 'spotify', type: 'track_played', data: {...} });
 *
 * // Process an event through triggers
 * const triggers = getTriggerService(userId);
 * await triggers.processEvent('spotify', 'track_played', eventData);
 * ```
 */

// Core client
export {
  MoltbotClient,
  getMoltbotClient,
  removeMoltbotClient,
  getActiveClients,
  ConnectionState
} from './moltbotClient.js';

// Workspace management
export {
  MoltbotWorkspaceManager,
  getWorkspaceManager
} from './moltbotWorkspaceManager.js';

// Memory services
export {
  MoltbotMemoryService,
  getMemoryService
} from './moltbotMemoryService.js';

// Trigger services
export {
  MoltbotTriggerService,
  getTriggerService,
  getDefaultTriggerTemplates
} from './moltbotTriggerService.js';

// Extraction agents
export {
  getExtractionAgent,
  runExtraction,
  extractionAgentConfigs,
  SpotifyExtractionAgent,
  CalendarExtractionAgent,
  WhoopExtractionAgent
} from './extractionAgents.js';

// Agent scheduler
export {
  AgentScheduler,
  getAgentScheduler,
  getLocalScheduler
} from './agentScheduler.js';

// Re-export config
export { default as moltbotConfig, validateConfig, getPlatformCluster } from '../../config/moltbotConfig.js';

/**
 * Initialize Moltbot for a user (convenience function)
 * Call this when a user signs up or first connects platforms
 */
export async function initializeMoltbotForUser(userId, soulSignature, userProfile) {
  const { getWorkspaceManager } = await import('./moltbotWorkspaceManager.js');
  const { getTriggerService } = await import('./moltbotTriggerService.js');

  // Initialize workspace
  const workspace = getWorkspaceManager(userId);
  await workspace.initializeWorkspace(soulSignature, userProfile);

  // Install default triggers
  const triggers = getTriggerService(userId);
  await triggers.installDefaultTriggers();

  return { workspace, triggers };
}

/**
 * Cleanup Moltbot resources for a user (on logout or account deletion)
 */
export async function cleanupMoltbotForUser(userId) {
  const { removeMoltbotClient } = await import('./moltbotClient.js');
  removeMoltbotClient(userId);
}
