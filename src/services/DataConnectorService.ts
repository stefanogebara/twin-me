/**
 * DataConnectorService - Core OAuth and Data Integration Engine
 * Handles connections to external APIs and data ingestion
 */

import {
  DataProvider,
  DataConnector,
  RawDataPoint,
  DataType,
  InstantTwinConfig,
  TwinGenerationProgress,
  DataIngestionError
} from '@/types/data-integration';

// ====================================================================
// BASE DATA CONNECTOR INTERFACE
// ====================================================================

export interface IDataConnector {
  provider: DataProvider;

  // OAuth authentication
  authenticate(userId: string, redirectUrl?: string): Promise<string>; // returns auth URL
  handleCallback(code: string, state: string): Promise<DataConnector>;
  refreshToken(connectorId: string): Promise<void>;
  disconnect(connectorId: string): Promise<void>;

  // Data fetching
  fetchInitialData(connectorId: string, timeRange: { start: Date; end: Date }): Promise<RawDataPoint[]>;
  fetchIncrementalData(connectorId: string, since: Date): Promise<RawDataPoint[]>;

  // Real-time updates
  setupWebhook?(connectorId: string, callbackUrl: string): Promise<void>;
  handleWebhookEvent?(event: any): Promise<RawDataPoint[]>;

  // Metadata
  getSupportedDataTypes(): DataType[];
  getRateLimits(): { requestsPerHour: number; requestsPerDay: number };
  getRequiredScopes(): string[];
}

// ====================================================================
// GOOGLE WORKSPACE CONNECTOR
// ====================================================================

export class GoogleWorkspaceConnector implements IDataConnector {
  provider: DataProvider = 'google_gmail';

  // OAuth credentials should be handled server-side for security

  async authenticate(userId: string, redirectUrl?: string): Promise<string> {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ].join(' ');

    const authUrl = `https://accounts.google.com/oauth2/auth?` +
      `client_id=${this.clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUrl || 'http://localhost:8084/oauth/callback')}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `response_type=code&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `state=${userId}`;

    return authUrl;
  }

  async handleCallback(code: string, state: string): Promise<DataConnector> {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: 'http://localhost:8084/oauth/callback'
      })
    });

    const tokens = await tokenResponse.json();

    // Store connector in database
    const connector: DataConnector = {
      id: crypto.randomUUID(),
      userId: state,
      provider: this.provider,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      connectedAt: new Date(),
      isActive: true,
      permissions: {
        read_emails: true,
        read_calendar: true,
        read_drive_metadata: true
      },
      totalSynced: 0,
      lastSyncStatus: 'pending',
      errorCount: 0,
      syncFrequency: 15 // minutes
    };

    return connector;
  }

  async refreshToken(connectorId: string): Promise<void> {
    // Implementation for token refresh
    console.log('Refreshing token for connector:', connectorId);
  }

  async disconnect(connectorId: string): Promise<void> {
    // Revoke tokens and mark connector as inactive
    console.log('Disconnecting connector:', connectorId);
  }

  async fetchInitialData(
    connectorId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<RawDataPoint[]> {
    const dataPoints: RawDataPoint[] = [];

    // Fetch emails (last 30 days)
    const emails = await this.fetchEmails(connectorId, timeRange);
    dataPoints.push(...emails);

    // Fetch calendar events
    const calendarEvents = await this.fetchCalendarEvents(connectorId, timeRange);
    dataPoints.push(...calendarEvents);

    return dataPoints;
  }

  private async fetchEmails(
    connectorId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<RawDataPoint[]> {
    // Simplified email fetching - in production, use Gmail API
    return Array.from({ length: 50 }, (_, i) => ({
      id: crypto.randomUUID(),
      userId: 'user-id', // from connector
      connectorId,
      dataType: 'email' as DataType,
      content: {
        subject: `Sample Email ${i + 1}`,
        body: `This is email content for analysis. It shows communication style and patterns.`,
        from: 'sender@example.com',
        to: ['user@example.com'],
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      },
      metadata: {
        messageId: `msg-${i}`,
        threadId: `thread-${Math.floor(i / 5)}`,
        labels: ['INBOX']
      },
      processed: false,
      qualityScore: 0.8 + Math.random() * 0.2,
      sourceTimestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      ingestedAt: new Date(),
      sensitivityLevel: 'medium'
    }));
  }

  private async fetchCalendarEvents(
    connectorId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<RawDataPoint[]> {
    // Simplified calendar fetching
    return Array.from({ length: 20 }, (_, i) => ({
      id: crypto.randomUUID(),
      userId: 'user-id',
      connectorId,
      dataType: 'calendar_event' as DataType,
      content: {
        title: `Meeting ${i + 1}`,
        description: 'Important discussion about project progress',
        start: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
        end: new Date(Date.now() + i * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        attendees: ['colleague@company.com']
      },
      metadata: {
        eventId: `event-${i}`,
        calendarId: 'primary',
        created: new Date()
      },
      processed: false,
      qualityScore: 0.9,
      sourceTimestamp: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
      ingestedAt: new Date(),
      sensitivityLevel: 'low'
    }));
  }

  async fetchIncrementalData(connectorId: string, since: Date): Promise<RawDataPoint[]> {
    // Fetch only new data since last sync
    return this.fetchInitialData(connectorId, { start: since, end: new Date() });
  }

  getSupportedDataTypes(): DataType[] {
    return ['email', 'calendar_event', 'document'];
  }

  getRateLimits() {
    return { requestsPerHour: 1000, requestsPerDay: 10000 };
  }

  getRequiredScopes(): string[] {
    return [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly'
    ];
  }
}

// ====================================================================
// SLACK CONNECTOR
// ====================================================================

export class SlackConnector implements IDataConnector {
  provider: DataProvider = 'slack';

  // OAuth credentials should be handled server-side for security

  async authenticate(userId: string, redirectUrl?: string): Promise<string> {
    const scopes = ['channels:read', 'im:read', 'groups:read', 'users:read', 'chat:write'].join(',');

    return `https://slack.com/oauth/v2/authorize?` +
      `client_id=${this.clientId}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `redirect_uri=${encodeURIComponent(redirectUrl || 'http://localhost:8084/oauth/callback')}&` +
      `state=${userId}`;
  }

  async handleCallback(code: string, state: string): Promise<DataConnector> {
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code
      })
    });

    const tokens = await tokenResponse.json();

    return {
      id: crypto.randomUUID(),
      userId: state,
      provider: this.provider,
      accessToken: tokens.access_token,
      connectedAt: new Date(),
      isActive: true,
      permissions: {
        read_messages: true,
        read_channels: true,
        write_messages: true
      },
      totalSynced: 0,
      lastSyncStatus: 'pending',
      errorCount: 0,
      syncFrequency: 5 // minutes - more frequent for chat
    };
  }

  async refreshToken(connectorId: string): Promise<void> {
    // Slack tokens don't expire, but we might need to handle revocation
  }

  async disconnect(connectorId: string): Promise<void> {
    // Revoke Slack app permissions
  }

  async fetchInitialData(
    connectorId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<RawDataPoint[]> {
    // Fetch Slack messages from channels and DMs
    return this.fetchSlackMessages(connectorId, timeRange);
  }

  private async fetchSlackMessages(
    connectorId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<RawDataPoint[]> {
    // Simplified Slack message fetching
    return Array.from({ length: 100 }, (_, i) => ({
      id: crypto.randomUUID(),
      userId: 'user-id',
      connectorId,
      dataType: 'slack_message' as DataType,
      content: {
        text: `This is a Slack message showing communication patterns and work style.`,
        channel: '#general',
        timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        user: 'U123456',
        reactions: []
      },
      metadata: {
        messageId: `msg-${i}`,
        channelId: 'C123456',
        teamId: 'T123456',
        messageType: 'message'
      },
      processed: false,
      qualityScore: 0.7 + Math.random() * 0.3,
      sourceTimestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      ingestedAt: new Date(),
      sensitivityLevel: 'medium'
    }));
  }

  async fetchIncrementalData(connectorId: string, since: Date): Promise<RawDataPoint[]> {
    return this.fetchSlackMessages(connectorId, { start: since, end: new Date() });
  }

  getSupportedDataTypes(): DataType[] {
    return ['slack_message'];
  }

  getRateLimits() {
    return { requestsPerHour: 100, requestsPerDay: 1000 };
  }

  getRequiredScopes(): string[] {
    return ['channels:read', 'im:read', 'groups:read', 'users:read'];
  }
}

// ====================================================================
// DATA CONNECTOR REGISTRY
// ====================================================================

export class DataConnectorRegistry {
  private connectors = new Map<DataProvider, IDataConnector>();

  constructor() {
    // Register available connectors
    this.connectors.set('google_gmail', new GoogleWorkspaceConnector());
    this.connectors.set('slack', new SlackConnector());

    // Add more connectors as they're implemented
    // this.connectors.set('microsoft_outlook', new MicrosoftConnector());
    // this.connectors.set('linkedin', new LinkedInConnector());
  }

  getConnector(provider: DataProvider): IDataConnector {
    const connector = this.connectors.get(provider);
    if (!connector) {
      throw new Error(`Connector not found for provider: ${provider}`);
    }
    return connector;
  }

  getAvailableProviders(): DataProvider[] {
    return Array.from(this.connectors.keys());
  }

  getSupportedDataTypes(): Record<DataProvider, DataType[]> {
    const result: Record<string, DataType[]> = {};
    for (const [provider, connector] of this.connectors) {
      result[provider] = connector.getSupportedDataTypes();
    }
    return result;
  }
}

// ====================================================================
// INSTANT TWIN GENERATION SERVICE
// ====================================================================

export class InstantTwinGenerator {
  private connectorRegistry = new DataConnectorRegistry();

  async generateInstantTwin(config: InstantTwinConfig): Promise<TwinGenerationProgress> {
    const progress: TwinGenerationProgress = {
      userId: config.userId,
      stage: 'connecting',
      progress: 0,
      currentTask: 'Initializing connections...',
      estimatedTimeRemaining: 60,
      connectorsConnected: [],
      dataPointsIngested: 0,
      insightsGenerated: 0
    };

    try {
      // Phase 1: Connect to services (20% of progress)
      progress.currentTask = 'Connecting to your services...';
      await this.updateProgress(progress, 10);

      const connectors = await this.establishConnections(config.selectedProviders, config.userId);
      progress.connectorsConnected = connectors.map(c => c.provider);
      await this.updateProgress(progress, 20);

      // Phase 2: Rapid data ingestion (40% of progress)
      progress.stage = 'ingesting';
      progress.currentTask = 'Ingesting your data...';
      await this.updateProgress(progress, 30);

      const rawData = await this.ingestCriticalData(connectors, config.dataTimeRange);
      progress.dataPointsIngested = rawData.length;
      await this.updateProgress(progress, 60);

      // Phase 3: AI analysis (30% of progress)
      progress.stage = 'analyzing';
      progress.currentTask = 'Analyzing your personality...';
      await this.updateProgress(progress, 70);

      const insights = await this.analyzePersonality(rawData, config.userId);
      progress.insightsGenerated = insights.length;
      await this.updateProgress(progress, 85);

      // Phase 4: Twin generation (10% of progress)
      progress.stage = 'generating';
      progress.currentTask = 'Creating your digital twin...';
      await this.updateProgress(progress, 90);

      const twin = await this.createTwin(config.userId, insights);
      progress.currentTask = 'Your twin is ready!';

      // Complete!
      progress.stage = 'ready';
      progress.progress = 100;
      progress.estimatedTimeRemaining = 0;
      progress.completedAt = new Date();

      return progress;

    } catch (error) {
      progress.stage = 'error';
      progress.error = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  private async establishConnections(
    providers: DataProvider[],
    userId: string
  ): Promise<DataConnector[]> {
    // In a real implementation, this would check existing connections
    // For now, simulate connected providers
    return providers.map(provider => ({
      id: crypto.randomUUID(),
      userId,
      provider,
      connectedAt: new Date(),
      isActive: true,
      permissions: { read_all: true },
      totalSynced: 0,
      lastSyncStatus: 'success' as const,
      errorCount: 0,
      syncFrequency: 15
    }));
  }

  private async ingestCriticalData(
    connectors: DataConnector[],
    timeRange: { start: Date; end: Date }
  ): Promise<RawDataPoint[]> {
    const allData: RawDataPoint[] = [];

    // Parallel data ingestion for speed
    const ingestionPromises = connectors.map(async (connector) => {
      const connectorImpl = this.connectorRegistry.getConnector(connector.provider);
      return await connectorImpl.fetchInitialData(connector.id, timeRange);
    });

    const results = await Promise.all(ingestionPromises);
    return results.flat();
  }

  private async analyzePersonality(data: RawDataPoint[], userId: string) {
    // Simulate AI personality analysis
    // In production, this would use Claude/GPT for analysis
    return [
      {
        id: crypto.randomUUID(),
        userId,
        insightType: 'writing_style' as const,
        insightData: {
          tone: 'professional',
          formality: 0.7,
          hasHumor: true,
          empathyLevel: 0.8,
          directness: 0.6,
          vocabulary: ['innovative', 'collaboration', 'efficient'],
          sentenceStructure: 'medium',
          emojiUsage: 0.3
        },
        confidenceScore: 0.85,
        sourceDataCount: data.length,
        sourceDataIds: data.slice(0, 20).map(d => d.id),
        validFrom: new Date(),
        analysisMethod: 'ai_analysis' as const,
        lastUpdated: new Date(),
        updateTrigger: 'new_data' as const
      }
    ];
  }

  private async createTwin(userId: string, insights: any[]) {
    // Create the digital twin in the database using the insights
    return {
      id: crypto.randomUUID(),
      userId,
      name: 'Instant Twin',
      createdAt: new Date(),
      insights
    };
  }

  private async updateProgress(progress: TwinGenerationProgress, percentage: number) {
    progress.progress = percentage;
    progress.estimatedTimeRemaining = Math.max(0, (100 - percentage) * 0.6); // rough estimate

    // In real app, emit real-time update to frontend
    console.log(`Progress: ${percentage}% - ${progress.currentTask}`);

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// ====================================================================
// EXPORT SINGLETON INSTANCES
// ====================================================================

export const dataConnectorRegistry = new DataConnectorRegistry();
export const instantTwinGenerator = new InstantTwinGenerator();