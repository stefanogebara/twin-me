/**
 * RealTimeDataSyncEngine - Continuous Twin Evolution System
 * Makes digital twins living, breathing representations that evolve in real-time
 */

import {
  DataConnector,
  SyncQueueItem,
  RawDataPoint,
  PersonalityInsight,
  TwinEvolutionEntry,
  QueueType,
  DataProvider,
  WebhookEvent,
  PersonalityTrend
} from '@/types/data-integration';

import { dataConnectorRegistry } from './DataConnectorService';
import { personalityAnalysisEngine } from './PersonalityAnalysisEngine';

// ====================================================================
// REAL-TIME SYNC ENGINE
// ====================================================================

export class RealTimeDataSyncEngine {
  private syncQueues = new Map<string, SyncQueueItem[]>();
  private activeWorkers = new Map<string, NodeJS.Timeout>();
  private webhookEndpoints = new Map<DataProvider, string>();

  constructor() {
    this.initializeWebhookEndpoints();
    this.startSyncWorkers();
    this.startHealthMonitoring();
  }

  // ====================================================================
  // WEBHOOK SYSTEM FOR REAL-TIME UPDATES
  // ====================================================================

  private initializeWebhookEndpoints() {
    // Register webhook endpoints for real-time data push
    this.webhookEndpoints.set('google_gmail', '/webhooks/gmail');
    this.webhookEndpoints.set('slack', '/webhooks/slack');
    this.webhookEndpoints.set('microsoft_outlook', '/webhooks/outlook');
    // Add more as needed
  }

  async setupWebhooksForUser(userId: string, connectors: DataConnector[]) {
    console.log(`🔗 Setting up real-time webhooks for user ${userId}`);

    const setupPromises = connectors.map(async (connector) => {
      try {
        const connectorImpl = dataConnectorRegistry.getConnector(connector.provider);

        if (connectorImpl.setupWebhook) {
          const webhookUrl = `${process.env.VITE_API_URL}${this.webhookEndpoints.get(connector.provider)}`;
          await connectorImpl.setupWebhook(connector.id, webhookUrl);

          console.log(`✅ Webhook setup complete for ${connector.provider}`);

          // Add to monitoring queue
          this.addToQueue(userId, {
            id: crypto.randomUUID(),
            userId,
            connectorId: connector.id,
            queueType: 'webhook_event',
            priority: 8, // High priority for real-time events
            status: 'pending',
            attempts: 0,
            maxAttempts: 3,
            createdAt: new Date(),
            scheduledFor: new Date()
          });
        }
      } catch (error) {
        console.error(`❌ Failed to setup webhook for ${connector.provider}:`, error);

        // Fallback to polling
        this.schedulePollingSync(userId, connector);
      }
    });

    await Promise.all(setupPromises);
  }

  async handleIncomingWebhook(
    provider: DataProvider,
    webhookData: any
  ): Promise<void> {
    console.log(`📡 Received webhook from ${provider}`);

    try {
      const connectorImpl = dataConnectorRegistry.getConnector(provider);

      if (connectorImpl.handleWebhookEvent) {
        const newDataPoints = await connectorImpl.handleWebhookEvent(webhookData);

        if (newDataPoints.length > 0) {
          // Process new data immediately for real-time updates
          await this.processIncrementalUpdate(newDataPoints[0].userId, newDataPoints);
        }
      }
    } catch (error) {
      console.error(`Error processing webhook from ${provider}:`, error);
    }
  }

  // ====================================================================
  // INCREMENTAL DATA PROCESSING
  // ====================================================================

  private async processIncrementalUpdate(
    userId: string,
    newDataPoints: RawDataPoint[]
  ): Promise<void> {
    console.log(`🔄 Processing incremental update for user ${userId} (${newDataPoints.length} data points)`);

    // 1. Analyze new data for immediate insights
    const newInsights = await personalityAnalysisEngine.analyzePersonality(userId, newDataPoints);

    // 2. Compare with existing insights to detect changes
    const existingInsights = await this.getExistingInsights(userId);
    const personalityChanges = await this.detectPersonalityChanges(existingInsights, newInsights);

    // 3. Update twin if significant changes detected
    if (personalityChanges.length > 0) {
      await this.updateTwinPersonality(userId, personalityChanges);

      // 4. Notify user of significant changes
      await this.notifyUserOfChanges(userId, personalityChanges);
    }

    // 5. Update data quality metrics
    await this.updateDataQualityMetrics(userId, newDataPoints);

    console.log(`✅ Incremental update complete for user ${userId}`);
  }

  private async detectPersonalityChanges(
    existingInsights: PersonalityInsight[],
    newInsights: PersonalityInsight[]
  ): Promise<TwinEvolutionEntry[]> {
    const changes: TwinEvolutionEntry[] = [];

    for (const newInsight of newInsights) {
      const existingInsight = existingInsights.find(
        existing => existing.insightType === newInsight.insightType
      );

      if (existingInsight) {
        // Check for significant drift
        const drift = this.calculateDriftSignificance(existingInsight, newInsight);

        if (drift.isSignificant) {
          changes.push({
            id: crypto.randomUUID(),
            twinId: 'twin-id', // Would get from database
            userId: newInsight.userId,
            changeType: 'personality_update',
            oldValue: existingInsight.insightData,
            newValue: newInsight.insightData,
            changeSummary: drift.description,
            confidenceImpact: drift.confidenceImpact,
            triggerSource: 'drift_detection',
            sourceDataIds: newInsight.sourceDataIds,
            createdAt: new Date()
          });
        }
      } else {
        // New insight type discovered
        changes.push({
          id: crypto.randomUUID(),
          twinId: 'twin-id',
          userId: newInsight.userId,
          changeType: 'new_interest',
          oldValue: null,
          newValue: newInsight.insightData,
          changeSummary: `New ${newInsight.insightType} insight discovered`,
          confidenceImpact: newInsight.confidenceScore,
          triggerSource: 'data_analysis',
          sourceDataIds: newInsight.sourceDataIds,
          createdAt: new Date()
        });
      }
    }

    return changes;
  }

  private calculateDriftSignificance(
    oldInsight: PersonalityInsight,
    newInsight: PersonalityInsight
  ) {
    const confidenceDiff = Math.abs(newInsight.confidenceScore - oldInsight.confidenceScore);

    // Consider it significant if confidence changes by more than 20%
    const isSignificant = confidenceDiff > 0.2;

    let description = '';
    if (confidenceDiff > 0.3) {
      description = `Major shift in ${newInsight.insightType} detected`;
    } else if (confidenceDiff > 0.2) {
      description = `Notable change in ${newInsight.insightType} observed`;
    } else {
      description = `Minor adjustment to ${newInsight.insightType}`;
    }

    return {
      isSignificant,
      description,
      confidenceImpact: confidenceDiff
    };
  }

  // ====================================================================
  // CONTINUOUS SYNC WORKERS
  // ====================================================================

  private startSyncWorkers() {
    console.log('🔄 Starting continuous sync workers...');

    // Primary worker - processes high-priority items every 30 seconds
    this.activeWorkers.set('primary', setInterval(() => {
      this.processSyncQueue('primary', 1, 3); // Priority 1-3 (highest)
    }, 30000));

    // Secondary worker - processes medium-priority items every 2 minutes
    this.activeWorkers.set('secondary', setInterval(() => {
      this.processSyncQueue('secondary', 4, 6); // Priority 4-6 (medium)
    }, 120000));

    // Maintenance worker - processes low-priority items every 15 minutes
    this.activeWorkers.set('maintenance', setInterval(() => {
      this.processSyncQueue('maintenance', 7, 10); // Priority 7-10 (low)
    }, 900000));

    // Drift detection worker - runs every hour
    this.activeWorkers.set('drift', setInterval(() => {
      this.runPersonalityDriftAnalysis();
    }, 3600000));
  }

  private async processSyncQueue(
    workerType: string,
    minPriority: number,
    maxPriority: number
  ) {
    console.log(`⚡ ${workerType} worker processing queue (priority ${minPriority}-${maxPriority})`);

    // Get all queues and process items within priority range
    for (const [userId, queue] of this.syncQueues) {
      const itemsToProcess = queue.filter(item =>
        item.status === 'pending' &&
        item.priority >= minPriority &&
        item.priority <= maxPriority &&
        item.scheduledFor <= new Date()
      ).slice(0, 5); // Process max 5 items per run to prevent overload

      for (const item of itemsToProcess) {
        await this.processQueueItem(item);
      }
    }
  }

  private async processQueueItem(item: SyncQueueItem) {
    try {
      item.status = 'processing';
      item.startedAt = new Date();
      item.attempts++;

      console.log(`🔄 Processing ${item.queueType} for user ${item.userId}`);

      switch (item.queueType) {
        case 'incremental_sync':
          await this.performIncrementalSync(item);
          break;
        case 'drift_analysis':
          await this.performDriftAnalysis(item);
          break;
        case 'quality_assessment':
          await this.performQualityAssessment(item);
          break;
        case 'webhook_event':
          await this.processWebhookEvent(item);
          break;
        default:
          console.warn(`Unknown queue type: ${item.queueType}`);
      }

      item.status = 'completed';
      item.completedAt = new Date();

    } catch (error) {
      console.error(`Error processing queue item:`, error);

      item.status = 'failed';
      item.errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Retry logic
      if (item.attempts < item.maxAttempts) {
        item.status = 'pending';
        item.retryAfter = new Date(Date.now() + Math.pow(2, item.attempts) * 60000); // Exponential backoff
      }
    }
  }

  // ====================================================================
  // SPECIFIC SYNC OPERATIONS
  // ====================================================================

  private async performIncrementalSync(item: SyncQueueItem) {
    const connector = await this.getConnector(item.connectorId);
    if (!connector) return;

    const connectorImpl = dataConnectorRegistry.getConnector(connector.provider);
    const lastSync = connector.lastSync || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default to 24h ago

    const newData = await connectorImpl.fetchIncrementalData(item.connectorId, lastSync);

    if (newData.length > 0) {
      await this.processIncrementalUpdate(item.userId, newData);
    }
  }

  private async performDriftAnalysis(item: SyncQueueItem) {
    console.log(`🔍 Performing personality drift analysis for user ${item.userId}`);

    // Get recent data for analysis
    const recentData = await this.getRecentUserData(item.userId, 7); // Last 7 days
    const existingInsights = await this.getExistingInsights(item.userId);

    if (recentData.length > 10) { // Need minimum data for analysis
      const driftEntries = await personalityAnalysisEngine.detectPersonalityDrift(
        item.userId,
        existingInsights,
        recentData
      );

      if (driftEntries.length > 0) {
        await this.updateTwinEvolution(item.userId, driftEntries);
      }
    }
  }

  private async performQualityAssessment(item: SyncQueueItem) {
    // Assess data quality and update metrics
    const dataQuality = await this.assessDataQuality(item.userId, item.connectorId);
    await this.updateQualityMetrics(item.userId, item.connectorId, dataQuality);
  }

  // ====================================================================
  // PERSONALITY TREND ANALYSIS
  // ====================================================================

  async generatePersonalityTrends(userId: string): Promise<PersonalityTrend[]> {
    console.log(`📊 Generating personality trends for user ${userId}`);

    const historicalInsights = await this.getHistoricalInsights(userId, 30); // Last 30 days
    const trends: PersonalityTrend[] = [];

    // Group insights by type and analyze trends
    const insightGroups = this.groupInsightsByType(historicalInsights);

    for (const [insightType, insights] of insightGroups) {
      const trend = this.calculateTrend(insights);

      if (trend.dataPoints.length >= 3) { // Need minimum data points for trend
        trends.push({
          insightType: insightType as any,
          trendDirection: trend.direction,
          changeRate: trend.changeRate,
          confidenceTrend: trend.confidenceTrend,
          dataPoints: trend.dataPoints
        });
      }
    }

    return trends.sort((a, b) => Math.abs(b.changeRate) - Math.abs(a.changeRate)); // Most changing first
  }

  private calculateTrend(insights: PersonalityInsight[]) {
    const sortedInsights = insights.sort((a, b) =>
      new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime()
    );

    const dataPoints = sortedInsights.map(insight => ({
      date: new Date(insight.lastUpdated),
      value: this.extractNumericValue(insight.insightData),
      confidence: insight.confidenceScore
    }));

    // Simple trend calculation (in production, would use more sophisticated analysis)
    const firstValue = dataPoints[0]?.value || 0;
    const lastValue = dataPoints[dataPoints.length - 1]?.value || 0;
    const changeRate = (lastValue - firstValue) / Math.max(1, dataPoints.length - 1);

    let direction: 'increasing' | 'decreasing' | 'stable' | 'volatile' = 'stable';
    if (Math.abs(changeRate) < 0.01) {
      direction = 'stable';
    } else if (changeRate > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }

    // Check for volatility
    const variance = this.calculateVariance(dataPoints.map(dp => dp.value));
    if (variance > 0.1) {
      direction = 'volatile';
    }

    return {
      direction,
      changeRate,
      confidenceTrend: this.calculateConfidenceTrend(dataPoints),
      dataPoints
    };
  }

  // ====================================================================
  // SMART NOTIFICATIONS & USER ENGAGEMENT
  // ====================================================================

  private async notifyUserOfChanges(userId: string, changes: TwinEvolutionEntry[]) {
    const significantChanges = changes.filter(change =>
      Math.abs(change.confidenceImpact) > 0.3
    );

    if (significantChanges.length > 0) {
      console.log(`📢 Notifying user ${userId} of ${significantChanges.length} significant changes`);

      // In production, would send real notifications
      // For now, just log the changes
      for (const change of significantChanges) {
        console.log(`  - ${change.changeSummary} (confidence impact: ${change.confidenceImpact.toFixed(2)})`);
      }

      // Queue user engagement follow-up
      this.addToQueue(userId, {
        id: crypto.randomUUID(),
        userId,
        connectorId: '', // Not connector-specific
        queueType: 'manual_refresh', // Will prompt user to review changes
        priority: 6,
        payload: { changes: significantChanges.map(c => c.id) },
        status: 'pending',
        attempts: 0,
        maxAttempts: 1,
        createdAt: new Date(),
        scheduledFor: new Date(Date.now() + 60000) // 1 minute delay
      });
    }
  }

  // ====================================================================
  // HEALTH MONITORING & MAINTENANCE
  // ====================================================================

  private startHealthMonitoring() {
    console.log('🏥 Starting health monitoring...');

    // Monitor queue sizes and processing rates
    setInterval(() => {
      this.monitorQueueHealth();
    }, 300000); // Every 5 minutes

    // Cleanup completed items
    setInterval(() => {
      this.cleanupCompletedItems();
    }, 3600000); // Every hour

    // Monitor connector health
    setInterval(() => {
      this.monitorConnectorHealth();
    }, 900000); // Every 15 minutes
  }

  private monitorQueueHealth() {
    let totalPending = 0;
    let totalFailed = 0;

    for (const [userId, queue] of this.syncQueues) {
      const pending = queue.filter(item => item.status === 'pending').length;
      const failed = queue.filter(item => item.status === 'failed').length;

      totalPending += pending;
      totalFailed += failed;

      // Alert if user has too many failed items
      if (failed > 10) {
        console.warn(`⚠️ User ${userId} has ${failed} failed sync items`);
      }
    }

    console.log(`📊 Queue Health: ${totalPending} pending, ${totalFailed} failed`);
  }

  private cleanupCompletedItems() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    for (const [userId, queue] of this.syncQueues) {
      const beforeCount = queue.length;
      const cleanedQueue = queue.filter(item =>
        item.status === 'pending' ||
        item.status === 'processing' ||
        (item.completedAt && item.completedAt > cutoff)
      );

      this.syncQueues.set(userId, cleanedQueue);

      if (beforeCount !== cleanedQueue.length) {
        console.log(`🧹 Cleaned up ${beforeCount - cleanedQueue.length} old items for user ${userId}`);
      }
    }
  }

  // ====================================================================
  // UTILITY METHODS
  // ====================================================================

  addToQueue(userId: string, item: SyncQueueItem) {
    const queue = this.syncQueues.get(userId) || [];
    queue.push(item);
    this.syncQueues.set(userId, queue);
  }

  private schedulePollingSync(userId: string, connector: DataConnector) {
    // Fallback polling when webhooks aren't available
    this.addToQueue(userId, {
      id: crypto.randomUUID(),
      userId,
      connectorId: connector.id,
      queueType: 'incremental_sync',
      priority: 5,
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      scheduledFor: new Date(Date.now() + connector.syncFrequency * 60000)
    });
  }

  // Mock implementations for database operations (in production, these would be real DB calls)
  private async getExistingInsights(userId: string): Promise<PersonalityInsight[]> {
    // Would fetch from database
    return [];
  }

  private async getRecentUserData(userId: string, days: number): Promise<RawDataPoint[]> {
    // Would fetch from database
    return [];
  }

  private async getConnector(connectorId: string): Promise<DataConnector | null> {
    // Would fetch from database
    return null;
  }

  private async updateTwinPersonality(userId: string, changes: TwinEvolutionEntry[]) {
    // Would update database
    console.log(`📝 Updated twin personality for user ${userId}`);
  }

  private async updateTwinEvolution(userId: string, entries: TwinEvolutionEntry[]) {
    // Would insert evolution entries into database
    console.log(`📈 Logged ${entries.length} evolution entries for user ${userId}`);
  }

  private extractNumericValue(insightData: any): number {
    // Extract a numeric value from insight data for trend analysis
    if (typeof insightData === 'object') {
      return insightData.confidence || insightData.score || insightData.level || 0.5;
    }
    return 0.5; // default
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return variance;
  }

  private calculateConfidenceTrend(dataPoints: any[]): number {
    // Simple confidence trend calculation
    if (dataPoints.length < 2) return 0;

    const firstConf = dataPoints[0].confidence;
    const lastConf = dataPoints[dataPoints.length - 1].confidence;

    return (lastConf - firstConf) / (dataPoints.length - 1);
  }

  private groupInsightsByType(insights: PersonalityInsight[]) {
    return insights.reduce((groups, insight) => {
      const type = insight.insightType;
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type)!.push(insight);
      return groups;
    }, new Map<string, PersonalityInsight[]>());
  }

  private async runPersonalityDriftAnalysis() {
    console.log('🔍 Running personality drift analysis for all users');
    // Would iterate through all active users
    // For now, just log
  }

  // Additional mock methods...
  private async getHistoricalInsights(userId: string, days: number): Promise<PersonalityInsight[]> { return []; }
  private async updateDataQualityMetrics(userId: string, dataPoints: RawDataPoint[]) {}
  private async updateQualityMetrics(userId: string, connectorId: string, quality: any) {}
  private async assessDataQuality(userId: string, connectorId: string): Promise<any> { return {}; }
  private async processWebhookEvent(item: SyncQueueItem) {}
  private async monitorConnectorHealth() {}

  // Cleanup on shutdown
  shutdown() {
    console.log('🛑 Shutting down Real-Time Data Sync Engine...');

    for (const [name, worker] of this.activeWorkers) {
      clearInterval(worker);
      console.log(`✅ Stopped ${name} worker`);
    }

    this.activeWorkers.clear();
    this.syncQueues.clear();
  }
}

// ====================================================================
// EXPORT SINGLETON
// ====================================================================

export const realTimeDataSyncEngine = new RealTimeDataSyncEngine();