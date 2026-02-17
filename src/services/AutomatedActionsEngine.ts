/**
 * AutomatedActionsEngine - Twin Autonomy System
 * Enables digital twins to take proactive actions based on personality insights and data patterns
 */

import {
  TwinEvolutionEntry,
  EnhancedAutomationRule,
  ActionTrigger,
  AutomatedAction,
  TriggerCondition
} from '@/types/data-integration';

import { realTimeDataSyncEngine } from './RealTimeDataSyncEngine';
import type {
  DashboardNotification,
  ProactiveMessage,
  ContentSuggestionCriteria,
  ConversationStarterPayload,
  LearningPathUpdates,
  FeedbackRequest,
  InsightReportConfig,
  InsightReport,
  ConnectionCriteria,
} from './automatedActionsTypes';
import { createDefaultRules } from './defaultAutomationRules';

// ====================================================================
// AUTOMATED ACTIONS ENGINE
// ====================================================================

export class AutomatedActionsEngine {
  private activeRules = new Map<string, EnhancedAutomationRule[]>();
  private actionQueue = new Map<string, AutomatedAction[]>();
  private executionHistory = new Map<string, AutomatedAction[]>();
  private actionWorkers = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.initializeDefaultRules();
    this.startActionWorkers();
    this.startRuleEvaluationWorker();
  }

  // ====================================================================
  // CORE ACTION EXECUTION SYSTEM
  // ====================================================================

  async executeAction(action: AutomatedAction): Promise<boolean> {

    try {
      action.status = 'executing';
      action.executedAt = new Date();

      switch (action.actionType) {
        case 'send_notification':
          await this.sendNotificationAction(action);
          break;

        case 'schedule_review':
          await this.scheduleReviewAction(action);
          break;

        case 'suggest_content':
          await this.suggestContentAction(action);
          break;

        case 'initiate_conversation':
          await this.initiateConversationAction(action);
          break;

        case 'update_learning_path':
          await this.updateLearningPathAction(action);
          break;

        case 'request_feedback':
          await this.requestFeedbackAction(action);
          break;

        case 'sync_external_data':
          await this.syncExternalDataAction(action);
          break;

        case 'generate_insight_report':
          await this.generateInsightReportAction(action);
          break;

        case 'recommend_connections':
          await this.recommendConnectionsAction(action);
          break;

        default:
          action.status = 'failed';
          action.errorMessage = 'Unknown action type';
          return false;
      }

      action.status = 'completed';
      action.completedAt = new Date();

      // Log action execution
      this.logActionExecution(action);

      return true;

    } catch (error) {
      action.status = 'failed';
      action.errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Retry logic for failed actions
      if (action.retryCount < action.maxRetries) {
        action.retryCount++;
        action.status = 'pending';
        action.scheduledFor = new Date(Date.now() + Math.pow(2, action.retryCount) * 60000); // Exponential backoff
      }

      return false;
    }
  }

  // ====================================================================
  // SPECIFIC ACTION IMPLEMENTATIONS
  // ====================================================================

  private async sendNotificationAction(action: AutomatedAction): Promise<void> {
    const payload = action.payload as {
      type: string;
      title: string;
      message: string;
      priority: 'low' | 'medium' | 'high';
      actionUrl?: string;
    };

    // In production, would integrate with push notification service
    // For now, we'll queue it for the dashboard notification center
    await this.queueDashboardNotification(action.userId, {
      id: crypto.randomUUID(),
      type: payload.type,
      title: payload.title,
      message: payload.message,
      priority: payload.priority,
      actionUrl: payload.actionUrl,
      createdAt: new Date(),
      userId: action.userId
    });
  }

  private async scheduleReviewAction(action: AutomatedAction): Promise<void> {
    const payload = action.payload as {
      contentType: string;
      contentIds: string[];
      reviewDate: Date;
      reviewType: 'spaced_repetition' | 'knowledge_check' | 'concept_review';
    };

    // Schedule a review session based on spaced repetition algorithms
    const reviewAction: AutomatedAction = {
      id: crypto.randomUUID(),
      userId: action.userId,
      twinId: action.twinId,
      actionType: 'initiate_conversation',
      payload: {
        conversationType: 'review_session',
        content: payload.contentIds,
        reviewType: payload.reviewType
      },
      priority: 5,
      status: 'pending',
      scheduledFor: payload.reviewDate,
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 2
    };

    this.queueAction(action.userId, reviewAction);
  }

  private async suggestContentAction(action: AutomatedAction): Promise<void> {
    const payload = action.payload as {
      contentType: 'article' | 'video' | 'exercise' | 'topic';
      subject: string;
      difficultyLevel: number;
      personalityMatch: number;
      reasoning: string;
    };

    // Generate personalized content recommendations
    const suggestions = await this.generateContentSuggestions(action.userId, payload);

    // Send notification with suggestions
    await this.sendNotificationAction({
      ...action,
      payload: {
        type: 'content_suggestion',
        title: 'New Learning Content Suggested',
        message: `Your twin found ${payload.contentType} content that matches your learning style`,
        priority: 'medium' as const,
        actionUrl: `/learning-suggestions/${action.userId}`
      }
    });
  }

  private async initiateConversationAction(action: AutomatedAction): Promise<void> {
    const payload = action.payload as {
      conversationType: 'check_in' | 'review_session' | 'clarification' | 'encouragement';
      context?: string;
      previousTopics?: string[];
      personalityTrigger?: string;
    };

    // Create a proactive conversation starter based on the user's recent activity
    const conversationStarter = await this.generateConversationStarter(action.userId, payload);

    // Queue the conversation for when user is next active
    await this.queueProactiveMessage(action.userId, {
      id: crypto.randomUUID(),
      twinId: action.twinId,
      message: conversationStarter.message,
      context: conversationStarter.context,
      suggestedResponses: conversationStarter.suggestedResponses,
      priority: payload.conversationType === 'encouragement' ? 'high' : 'medium',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      createdAt: new Date()
    });
  }

  private async updateLearningPathAction(action: AutomatedAction): Promise<void> {
    const payload = action.payload as {
      pathId: string;
      updates: {
        addTopics?: string[];
        removeTopics?: string[];
        adjustDifficulty?: number;
        changeSequence?: Array<{ topicId: string; newOrder: number }>;
      };
      reasoning: string;
    };

    // Update the user's personalized learning path based on their progress and personality
    await this.applyLearningPathUpdates(action.userId, payload);

    // Notify user of path changes
    await this.sendNotificationAction({
      ...action,
      payload: {
        type: 'learning_path_update',
        title: 'Learning Path Updated',
        message: 'Your twin optimized your learning path based on your progress',
        priority: 'low' as const,
        actionUrl: `/learning-path/${action.userId}`
      }
    });
  }

  private async requestFeedbackAction(action: AutomatedAction): Promise<void> {
    const payload = action.payload as {
      feedbackType: 'learning_effectiveness' | 'content_rating' | 'difficulty_assessment' | 'teaching_style';
      context: string;
      questions: string[];
      timesSinceLast: number;
    };

    // Generate a feedback request based on recent learning activity
    const feedbackRequest = {
      id: crypto.randomUUID(),
      userId: action.userId,
      type: payload.feedbackType,
      context: payload.context,
      questions: payload.questions,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    };

    await this.createFeedbackRequest(feedbackRequest);

    // Send notification
    await this.sendNotificationAction({
      ...action,
      payload: {
        type: 'feedback_request',
        title: 'Help Improve Your Learning Experience',
        message: 'Share feedback to help your twin learn how to teach you better',
        priority: 'medium' as const,
        actionUrl: `/feedback/${feedbackRequest.id}`
      }
    });
  }

  private async syncExternalDataAction(action: AutomatedAction): Promise<void> {
    const payload = action.payload as {
      connectorId: string;
      dataTypes: string[];
      urgency: 'low' | 'medium' | 'high';
    };

    // Trigger immediate sync for specific data source
    realTimeDataSyncEngine.addToQueue(action.userId, {
      id: crypto.randomUUID(),
      userId: action.userId,
      connectorId: payload.connectorId,
      queueType: 'incremental_sync',
      priority: payload.urgency === 'high' ? 2 : payload.urgency === 'medium' ? 5 : 8,
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      scheduledFor: new Date()
    });
  }

  private async generateInsightReportAction(action: AutomatedAction): Promise<void> {
    const payload = action.payload as {
      reportType: 'weekly_summary' | 'monthly_analysis' | 'personality_drift' | 'learning_progress';
      includeRecommendations: boolean;
      shareWithUser: boolean;
    };

    // Generate comprehensive insight report
    const report = await this.generateInsightReport(action.userId, payload);

    // Save report
    await this.saveInsightReport(action.userId, report);

    if (payload.shareWithUser) {
      // Notify user of new report
      await this.sendNotificationAction({
        ...action,
        payload: {
          type: 'insight_report',
          title: 'Your Learning Insights Report is Ready',
          message: `New ${payload.reportType.replace('_', ' ')} insights available`,
          priority: 'low' as const,
          actionUrl: `/reports/${report.id}`
        }
      });
    }
  }

  private async recommendConnectionsAction(action: AutomatedAction): Promise<void> {
    const payload = action.payload as {
      connectionType: 'study_buddy' | 'mentor' | 'peer_learner' | 'subject_expert';
      criteria: {
        subject?: string;
        learningStyle?: string;
        personality?: string;
        experience?: string;
      };
      maxRecommendations: number;
    };

    // Find compatible users based on learning patterns and personality
    const recommendations = await this.findCompatibleConnections(action.userId, payload);

    if (recommendations.length > 0) {
      // Send notification with recommendations
      await this.sendNotificationAction({
        ...action,
        payload: {
          type: 'connection_recommendation',
          title: 'New Learning Connections Available',
          message: `Found ${recommendations.length} ${payload.connectionType.replace('_', ' ')} matches for you`,
          priority: 'medium' as const,
          actionUrl: `/connections/recommendations`
        }
      });
    }
  }

  // ====================================================================
  // RULE EVALUATION & TRIGGER SYSTEM
  // ====================================================================

  async evaluateRulesForUser(userId: string): Promise<AutomatedAction[]> {
    const userRules = this.activeRules.get(userId) || [];
    const triggeredActions: AutomatedAction[] = [];

    for (const rule of userRules) {
      if (!rule.isActive) continue;

      try {
        const isTriggered = await this.evaluateRuleTrigger(userId, rule.trigger);

        if (isTriggered) {
          // Check cooldown period
          if (await this.isRuleInCooldown(userId, rule.id)) {
            continue;
          }

          // Create automated action
          const action: AutomatedAction = {
            id: crypto.randomUUID(),
            userId,
            twinId: rule.twinId || 'default',
            ruleId: rule.id,
            actionType: rule.action.type,
            payload: rule.action.payload,
            priority: rule.priority,
            status: 'pending',
            scheduledFor: new Date(Date.now() + (rule.action.delay || 0)),
            createdAt: new Date(),
            retryCount: 0,
            maxRetries: rule.action.maxRetries || 3
          };

          triggeredActions.push(action);

          // Update rule last triggered time
          rule.lastTriggered = new Date();
          rule.triggerCount = (rule.triggerCount || 0) + 1;
        }
      } catch (error) {
        // Rule evaluation failed - continue with other rules
      }
    }

    // Queue triggered actions
    if (triggeredActions.length > 0) {
      triggeredActions.forEach(action => this.queueAction(userId, action));
    }

    return triggeredActions;
  }

  private async evaluateRuleTrigger(userId: string, trigger: ActionTrigger): Promise<boolean> {
    switch (trigger.type) {
      case 'personality_change':
        return await this.evaluatePersonalityChangeTrigger(userId, trigger.conditions);

      case 'learning_milestone':
        return await this.evaluateLearningMilestoneTrigger(userId, trigger.conditions);

      case 'engagement_pattern':
        return await this.evaluateEngagementPatternTrigger(userId, trigger.conditions);

      case 'time_based':
        return await this.evaluateTimeBasedTrigger(userId, trigger.conditions);

      case 'data_quality':
        return await this.evaluateDataQualityTrigger(userId, trigger.conditions);

      case 'conversation_analysis':
        return await this.evaluateConversationAnalysisTrigger(userId, trigger.conditions);

      default:
        return false;
    }
  }

  private async evaluatePersonalityChangeTrigger(userId: string, conditions: TriggerCondition[]): Promise<boolean> {
    // Get recent personality changes
    const recentChanges = await this.getRecentPersonalityChanges(userId, 7); // Last 7 days

    return conditions.some(condition => {
      switch (condition.operator) {
        case 'greater_than':
          return recentChanges.some(change =>
            Math.abs(change.confidenceImpact) > parseFloat(condition.value)
          );
        case 'contains':
          return recentChanges.some(change =>
            change.changeSummary.toLowerCase().includes(condition.value.toLowerCase())
          );
        default:
          return false;
      }
    });
  }

  private async evaluateLearningMilestoneTrigger(userId: string, conditions: TriggerCondition[]): Promise<boolean> {
    // Check learning progress metrics
    const progress = await this.getLearningProgress(userId);

    return conditions.some(condition => {
      const metric = progress[condition.field as keyof typeof progress];
      if (typeof metric === 'number') {
        switch (condition.operator) {
          case 'greater_than':
            return metric > parseFloat(condition.value);
          case 'equals':
            return metric === parseFloat(condition.value);
          case 'less_than':
            return metric < parseFloat(condition.value);
        }
      }
      return false;
    });
  }

  // ====================================================================
  // DEFAULT AUTOMATION RULES
  // ====================================================================

  private initializeDefaultRules() {
    const defaultRules = createDefaultRules();
    this.activeRules.set('default', defaultRules.map(rule => ({ ...rule, userId: 'default' })));
  }

  // ====================================================================
  // BACKGROUND WORKERS
  // ====================================================================

  private startActionWorkers() {
    // High priority action worker (every 30 seconds)
    this.actionWorkers.set('high-priority', setInterval(() => {
      this.processActionQueue('high-priority', 1, 3);
    }, 30000));

    // Medium priority action worker (every 2 minutes)
    this.actionWorkers.set('medium-priority', setInterval(() => {
      this.processActionQueue('medium-priority', 4, 6);
    }, 120000));

    // Low priority action worker (every 10 minutes)
    this.actionWorkers.set('low-priority', setInterval(() => {
      this.processActionQueue('low-priority', 7, 10);
    }, 600000));
  }

  private startRuleEvaluationWorker() {
    // Evaluate rules for all users every 5 minutes
    setInterval(() => {
      this.evaluateAllUserRules();
    }, 300000);
  }

  private async processActionQueue(
    _workerType: string,
    minPriority: number,
    maxPriority: number
  ) {

    for (const [userId, actions] of this.actionQueue) {
      const actionsToProcess = actions.filter(action =>
        action.status === 'pending' &&
        action.priority >= minPriority &&
        action.priority <= maxPriority &&
        action.scheduledFor <= new Date()
      ).slice(0, 3); // Process max 3 actions per worker run

      for (const action of actionsToProcess) {
        await this.executeAction(action);

        // Remove completed/failed actions from queue
        if (action.status === 'completed' || action.status === 'failed') {
          const updatedActions = actions.filter(a => a.id !== action.id);
          this.actionQueue.set(userId, updatedActions);

          // Add to execution history
          const history = this.executionHistory.get(userId) || [];
          history.push(action);
          this.executionHistory.set(userId, history.slice(-50)); // Keep last 50 actions
        }
      }
    }
  }

  private async evaluateAllUserRules() {
    for (const userId of this.activeRules.keys()) {
      if (userId !== 'default') {
        try {
          await this.evaluateRulesForUser(userId);
        } catch (error) {
          // Continue with other users if one fails
        }
      }
    }
  }

  // ====================================================================
  // UTILITY METHODS
  // ====================================================================

  queueAction(userId: string, action: AutomatedAction) {
    const queue = this.actionQueue.get(userId) || [];
    queue.push(action);
    this.actionQueue.set(userId, queue);
  }

  async addCustomRule(userId: string, rule: EnhancedAutomationRule) {
    const userRules = this.activeRules.get(userId) || [];
    userRules.push(rule);
    this.activeRules.set(userId, userRules);

    // Immediately evaluate the new rule
    await this.evaluateRulesForUser(userId);
  }

  getActionHistory(userId: string): AutomatedAction[] {
    return this.executionHistory.get(userId) || [];
  }

  getActiveRules(userId: string): EnhancedAutomationRule[] {
    return this.activeRules.get(userId) || [];
  }

  // Mock implementations for external integrations
  private async queueDashboardNotification(_userId: string, _notification: DashboardNotification) {
    // Would queue to notification service in production
  }

  private async queueProactiveMessage(_userId: string, _message: ProactiveMessage) {
    // Would queue message for user in production
  }

  private async generateContentSuggestions(_userId: string, _criteria: ContentSuggestionCriteria) {
    return [];
  }

  private async generateConversationStarter(_userId: string, payload: ConversationStarterPayload) {
    return {
      message: "I've noticed some interesting patterns in your learning. Want to chat about it?",
      context: payload.context || '',
      suggestedResponses: ["Sure, what did you notice?", "Tell me more", "Not right now"]
    };
  }

  private async applyLearningPathUpdates(_userId: string, _updates: LearningPathUpdates) {
    // Would update learning path in database in production
  }

  private async createFeedbackRequest(_request: FeedbackRequest) {
    // Would save feedback request in production
  }

  private async generateInsightReport(_userId: string, config: InsightReportConfig): Promise<InsightReport> {
    return { id: crypto.randomUUID(), ...config };
  }

  private async saveInsightReport(_userId: string, _report: InsightReport) {
    // Would save report to database in production
  }

  private async findCompatibleConnections(_userId: string, _criteria: ConnectionCriteria) {
    return [];
  }

  private async getRecentPersonalityChanges(userId: string, days: number): Promise<TwinEvolutionEntry[]> {
    // Would fetch from database in production
    return [];
  }

  private async getLearningProgress(userId: string) {
    // Would fetch from database in production
    return {
      totalSessions: 0,
      averageScore: 0,
      streakDays: 0,
      topicsCompleted: 0,
      daysWithoutActivity: 0,
      daysSinceLastReview: 0
    };
  }

  private async isRuleInCooldown(userId: string, ruleId: string): Promise<boolean> {
    const rules = this.activeRules.get(userId) || [];
    const rule = rules.find(r => r.id === ruleId);

    if (!rule || !rule.lastTriggered) return false;

    const cooldownEnd = new Date(rule.lastTriggered.getTime() + rule.cooldownPeriod);
    return cooldownEnd > new Date();
  }

  private logActionExecution(_action: AutomatedAction) {
    // Would log to analytics/monitoring in production
  }

  // Cleanup on shutdown
  shutdown() {
    for (const [_name, worker] of this.actionWorkers) {
      clearInterval(worker);
    }

    this.actionWorkers.clear();
    this.activeRules.clear();
    this.actionQueue.clear();
  }
}

// ====================================================================
// EXPORT SINGLETON
// ====================================================================

export const automatedActionsEngine = new AutomatedActionsEngine();