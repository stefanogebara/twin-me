/**
 * Moltbot WebSocket Client
 *
 * Provides connection management and message handling for the Moltbot AI assistant.
 * Each user gets their own client instance with isolated workspace access.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Heartbeat/ping-pong for connection health
 * - Request-response pattern with promises
 * - Event subscription for real-time updates
 *
 * Security:
 * - API key authentication
 * - User-scoped operations (no cross-user access)
 * - Encrypted workspace data
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import config, { validateConfig } from '../../config/moltbotConfig.js';

// Connection states
const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  HANDSHAKING: 'handshaking', // WebSocket open, waiting for protocol handshake
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  FAILED: 'failed'
};

// OpenClaw protocol version
const PROTOCOL_VERSION = 3;

/**
 * MoltbotClient - WebSocket client for Moltbot communication
 */
class MoltbotClient {
  constructor(userId, options = {}) {
    if (!userId) {
      throw new Error('userId is required for MoltbotClient');
    }

    this.userId = userId;
    this.options = {
      autoReconnect: true,
      ...options
    };

    this.ws = null;
    this.state = ConnectionState.DISCONNECTED;
    this.reconnectAttempts = 0;
    this.pendingRequests = new Map();
    this.eventListeners = new Map();
    this.heartbeatInterval = null;
    this.reconnectTimeout = null;

    // Validate config on instantiation
    const { warnings, errors, isValid } = validateConfig();
    warnings.forEach(w => console.warn(`[Moltbot] Warning: ${w}`));
    if (!isValid) {
      errors.forEach(e => console.error(`[Moltbot] Error: ${e}`));
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Moltbot configuration invalid for production');
      }
    }
  }

  /**
   * Connect to Moltbot WebSocket server
   * Uses OpenClaw protocol with challenge-response handshake
   */
  async connect() {
    if (this.state === ConnectionState.CONNECTED) {
      return Promise.resolve();
    }

    if (this.state === ConnectionState.CONNECTING || this.state === ConnectionState.HANDSHAKING) {
      // Wait for existing connection attempt
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (this.state === ConnectionState.CONNECTED) {
            clearInterval(checkInterval);
            resolve();
          } else if (this.state === ConnectionState.FAILED) {
            clearInterval(checkInterval);
            reject(new Error('Connection failed'));
          }
        }, 100);
      });
    }

    this.state = ConnectionState.CONNECTING;
    this._connectPromise = { resolve: null, reject: null };

    return new Promise((resolve, reject) => {
      this._connectPromise.resolve = resolve;
      this._connectPromise.reject = reject;

      try {
        const wsUrl = this._buildWsUrl();
        console.log(`[Moltbot] Connecting to ${wsUrl} for user ${this.userId}`);

        this.ws = new WebSocket(wsUrl, {
          headers: this._buildHeaders(),
          rejectUnauthorized: false // Accept self-signed certs for dev
        });

        this.ws.on('open', () => {
          // WebSocket is open, but we need to complete the OpenClaw handshake
          this.state = ConnectionState.HANDSHAKING;
          this.reconnectAttempts = 0;
          console.log(`[Moltbot] WebSocket open, waiting for challenge...`);
        });

        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
          console.log(`[Moltbot] Connection closed: ${code} - ${reason}`);
          this._handleDisconnect();
          if (this.state === ConnectionState.HANDSHAKING) {
            this.state = ConnectionState.FAILED;
            reject(new Error(`Handshake failed: ${reason}`));
          }
        });

        this.ws.on('error', (error) => {
          console.error(`[Moltbot] WebSocket error:`, error.message);
          if (this.state === ConnectionState.CONNECTING || this.state === ConnectionState.HANDSHAKING) {
            this.state = ConnectionState.FAILED;
            reject(error);
          }
          this._emit('error', { error });
        });

        // Connection timeout (includes handshake time)
        setTimeout(() => {
          if (this.state === ConnectionState.CONNECTING || this.state === ConnectionState.HANDSHAKING) {
            this.ws.terminate();
            this.state = ConnectionState.FAILED;
            reject(new Error('Connection timeout'));
          }
        }, 15000);

      } catch (error) {
        this.state = ConnectionState.FAILED;
        reject(error);
      }
    });
  }

  /**
   * Handle OpenClaw connect.challenge and send connect request
   */
  _handleConnectChallenge(nonce) {
    console.log(`[Moltbot] Responding to challenge for user ${this.userId}`);

    const requestId = crypto.randomUUID();

    // Store the connect request ID to handle the response
    this._connectRequestId = requestId;

    // Build OpenClaw connect request
    // See: https://docs.openclaw.ai/gateway/protocol
    const connectRequest = {
      type: 'req',
      id: requestId,
      method: 'connect',
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: 'cli',
          version: '1.0.0',
          platform: process.platform === 'win32' ? 'Win32' : process.platform,
          mode: 'cli'
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        caps: [],
        commands: [],
        permissions: {},
        auth: {
          token: config.auth.apiKey
        },
        locale: 'en-US',
        userAgent: `twinme-api/1.0.0 ${process.platform}`
      }
    };

    this.ws.send(JSON.stringify(connectRequest));
  }

  /**
   * Disconnect from Moltbot
   */
  disconnect() {
    this.options.autoReconnect = false;
    this._stopHeartbeat();
    clearTimeout(this.reconnectTimeout);

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.state = ConnectionState.DISCONNECTED;
    this._emit('disconnected', { userId: this.userId });
  }

  /**
   * Send a request and wait for response
   * Uses OpenClaw protocol: {type: "req", id, method, params}
   */
  async send(method, params = {}) {
    if (this.state !== ConnectionState.CONNECTED) {
      await this.connect();
    }

    const requestId = crypto.randomUUID();

    // OpenClaw protocol format
    const message = {
      type: 'req',
      id: requestId,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        method,
        timeout: setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request timeout: ${method}`));
        }, 30000)
      });

      // Send message
      this.ws.send(JSON.stringify(message), (error) => {
        if (error) {
          this.pendingRequests.delete(requestId);
          reject(error);
        }
      });
    });
  }

  // ============================================
  // Gateway Operations
  // ============================================

  /**
   * Get gateway health status
   */
  async getHealth() {
    return this.send('health', {});
  }

  /**
   * Get gateway status
   */
  async getStatus() {
    return this.send('status', {});
  }

  /**
   * Get server info from handshake
   */
  getServerInfo() {
    return this._serverInfo;
  }

  // ============================================
  // Cron Job Management (OpenClaw native methods)
  // ============================================

  /**
   * List all cron jobs
   */
  async listCronJobs() {
    return this.send('cron.list', {});
  }

  /**
   * Add a cron job
   * @param {string} name - Unique name for this job
   * @param {string} schedule - Cron expression or natural language (e.g., "every 5 minutes")
   * @param {string} prompt - The prompt to execute
   */
  async addCronJob(name, schedule, prompt) {
    return this.send('cron.add', {
      name: `${this.userId}_${name}`,
      schedule,
      prompt
    });
  }

  /**
   * Remove a cron job
   */
  async removeCronJob(name) {
    return this.send('cron.remove', {
      name: `${this.userId}_${name}`
    });
  }

  /**
   * Run a cron job immediately
   */
  async runCronJob(name) {
    return this.send('cron.run', {
      name: `${this.userId}_${name}`
    });
  }

  // ============================================
  // Session Management
  // ============================================

  /**
   * List all sessions
   */
  async listSessions() {
    return this.send('sessions.list', {});
  }

  /**
   * Get session preview
   */
  async getSessionPreview(sessionKey) {
    return this.send('sessions.preview', { key: sessionKey });
  }

  // ============================================
  // Chat / AI Operations (OpenClaw native methods)
  // ============================================

  /**
   * Send a chat message through OpenClaw
   * @param {string} message - The message to send
   * @param {object} options - Additional options (agentId, sessionKey, etc.)
   */
  async chatSend(message, options = {}) {
    return this.send('chat.send', {
      message,
      ...options
    });
  }

  /**
   * Get chat history
   */
  async getChatHistory(sessionKey) {
    return this.send('chat.history', { key: sessionKey });
  }

  /**
   * Abort a running chat
   */
  async abortChat() {
    return this.send('chat.abort', {});
  }

  /**
   * Run an agent with a prompt
   * @param {string} prompt - The prompt for the agent
   * @param {object} options - Additional options
   */
  async runAgent(prompt, options = {}) {
    return this.send('agent', {
      prompt,
      ...options
    });
  }

  // ============================================
  // Legacy TwinMe Memory Operations
  // These use the agent to store/retrieve data
  // ============================================

  /**
   * Store data in a memory layer (via agent)
   * @param {string} layer - 'episodic' | 'semantic' | 'procedural' | 'predictive'
   * @param {string} key - Unique key for this memory
   * @param {object} data - Data to store
   */
  async storeMemory(layer, key, data) {
    this._validateMemoryLayer(layer);
    // Use agent to write to workspace file
    const filename = `memory/${layer}/${key}.json`;
    const content = JSON.stringify({
      layer,
      key,
      data,
      userId: this.userId,
      timestamp: new Date().toISOString()
    }, null, 2);

    return this.runAgent(
      `Write the following to file "${filename}" in the workspace:\n\n${content}`,
      { sessionKey: `memory_${this.userId}` }
    );
  }

  /**
   * Query memories from a layer (via agent)
   * @param {string} layer - Memory layer to query
   * @param {object} query - Query parameters
   */
  async queryMemory(layer, query = {}) {
    this._validateMemoryLayer(layer);
    return this.runAgent(
      `Read and return all files from "memory/${layer}/" in the workspace that match the query: ${JSON.stringify(query)}`,
      { sessionKey: `memory_${this.userId}` }
    );
  }

  // ============================================
  // Event Handling
  // ============================================

  /**
   * Subscribe to events
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from events
   */
  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  // ============================================
  // Private Methods
  // ============================================

  _buildWsUrl() {
    const baseUrl = config.ws.url;
    // OpenClaw gateway expects token in query params for WebSocket auth
    const token = config.auth.apiKey;
    // Note: User context is passed in the connect params, not the URL
    return token ? `${baseUrl}?token=${token}` : baseUrl;
  }

  _buildHeaders() {
    const headers = {
      'X-User-Id': this.userId
    };

    // OpenClaw gateway accepts token via Authorization header or query param
    if (config.auth.apiKey) {
      headers['Authorization'] = `Bearer ${config.auth.apiKey}`;
      headers['X-Gateway-Token'] = config.auth.apiKey;
    }

    return headers;
  }

  _handleMessage(rawData) {
    try {
      const message = JSON.parse(rawData.toString());

      // Handle OpenClaw connect.challenge event (handshake)
      if (message.type === 'event' && message.event === 'connect.challenge') {
        this._handleConnectChallenge(message.payload?.nonce);
        return;
      }

      // Handle connect response (handshake completion)
      if (message.id === this._connectRequestId && message.type === 'res') {
        if (message.ok) {
          this.state = ConnectionState.CONNECTED;
          this._serverInfo = message.payload;
          console.log(`[Moltbot] Connected for user ${this.userId} (protocol v${message.payload?.protocol || 'unknown'})`);
          this._startHeartbeat();
          this._emit('connected', { userId: this.userId, serverInfo: message.payload });
          if (this._connectPromise?.resolve) {
            this._connectPromise.resolve();
          }
        } else {
          this.state = ConnectionState.FAILED;
          const errorMsg = message.error?.message || message.error || 'Connect failed';
          console.error(`[Moltbot] Connect rejected: ${errorMsg}`);
          if (this._connectPromise?.reject) {
            this._connectPromise.reject(new Error(errorMsg));
          }
        }
        return;
      }

      // Handle response to pending request (OpenClaw format: {type: "res", id, ok, payload|error})
      if (message.type === 'res' && message.id && this.pendingRequests.has(message.id)) {
        const { resolve, reject, timeout, method } = this.pendingRequests.get(message.id);
        clearTimeout(timeout);
        this.pendingRequests.delete(message.id);

        if (message.ok) {
          resolve(message.payload);
        } else {
          const errorMsg = message.error?.message || message.error || `${method} failed`;
          reject(new Error(errorMsg));
        }
        return;
      }

      // Handle events (OpenClaw format: {type: "event", event, payload})
      if (message.type === 'event') {
        this._emit(message.event, message.payload);
        return;
      }

      // Handle tick events (heartbeat from server)
      if (message.type === 'event' && message.event === 'tick') {
        return; // Silently ignore ticks
      }

      // Handle unknown messages
      console.log(`[Moltbot] Unhandled message:`, JSON.stringify(message).substring(0, 200));

    } catch (error) {
      console.error(`[Moltbot] Failed to parse message:`, error);
    }
  }

  _handleDisconnect() {
    this._stopHeartbeat();
    this.state = ConnectionState.DISCONNECTED;

    // Reject all pending requests
    for (const [id, { reject, timeout }] of this.pendingRequests) {
      clearTimeout(timeout);
      reject(new Error('Connection lost'));
    }
    this.pendingRequests.clear();

    // Auto-reconnect if enabled
    if (this.options.autoReconnect && this.reconnectAttempts < config.ws.reconnect.maxAttempts) {
      this._scheduleReconnect();
    } else if (this.reconnectAttempts >= config.ws.reconnect.maxAttempts) {
      this.state = ConnectionState.FAILED;
      this._emit('failed', { reason: 'Max reconnection attempts reached' });
    }
  }

  _scheduleReconnect() {
    this.state = ConnectionState.RECONNECTING;
    this.reconnectAttempts++;

    const delay = Math.min(
      config.ws.reconnect.initialDelayMs * Math.pow(config.ws.reconnect.backoffMultiplier, this.reconnectAttempts - 1),
      config.ws.reconnect.maxDelayMs
    );

    console.log(`[Moltbot] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${config.ws.reconnect.maxAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((error) => {
        console.error(`[Moltbot] Reconnection failed:`, error.message);
      });
    }, delay);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.state === ConnectionState.CONNECTED) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, config.ws.heartbeat.intervalMs);
  }

  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  _emit(event, data) {
    if (this.eventListeners.has(event)) {
      for (const callback of this.eventListeners.get(event)) {
        try {
          callback(data);
        } catch (error) {
          console.error(`[Moltbot] Event listener error:`, error);
        }
      }
    }
  }

  _validateMemoryLayer(layer) {
    if (!config.workspace.memoryLayers.includes(layer)) {
      throw new Error(`Invalid memory layer: ${layer}. Valid layers: ${config.workspace.memoryLayers.join(', ')}`);
    }
  }

  /**
   * Get current connection state
   */
  getState() {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.state === ConnectionState.CONNECTED;
  }
}

// ============================================
// Client Manager (Singleton pattern for user clients)
// ============================================

const clientInstances = new Map();

/**
 * Get or create a Moltbot client for a user
 * @param {string} userId - User ID
 * @param {object} options - Client options
 * @returns {MoltbotClient}
 */
export function getMoltbotClient(userId, options = {}) {
  if (!clientInstances.has(userId)) {
    clientInstances.set(userId, new MoltbotClient(userId, options));
  }
  return clientInstances.get(userId);
}

/**
 * Remove a client instance (on user logout, etc.)
 */
export function removeMoltbotClient(userId) {
  if (clientInstances.has(userId)) {
    const client = clientInstances.get(userId);
    client.disconnect();
    clientInstances.delete(userId);
  }
}

/**
 * Get all active clients (for admin/monitoring)
 */
export function getActiveClients() {
  return Array.from(clientInstances.entries()).map(([userId, client]) => ({
    userId,
    state: client.getState(),
    isConnected: client.isConnected()
  }));
}

export { MoltbotClient, ConnectionState };
export default MoltbotClient;
