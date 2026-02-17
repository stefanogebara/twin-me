/**
 * Default automation rules for the AutomatedActionsEngine
 */

import { EnhancedAutomationRule } from '@/types/data-integration';

export const createDefaultRules = (): Omit<EnhancedAutomationRule, 'userId'>[] => [
  {
    id: 'personality-drift-notification',
    name: 'Personality Drift Notification',
    description: 'Notify when significant personality changes are detected',
    isActive: true,
    priority: 6,
    trigger: {
      type: 'personality_change',
      conditions: [
        { field: 'confidenceImpact', operator: 'greater_than', value: '0.3' }
      ]
    },
    action: {
      type: 'send_notification',
      payload: {
        type: 'personality_update',
        title: 'Your Twin is Evolving',
        message: 'Significant personality changes detected based on your recent activity',
        priority: 'medium'
      },
      delay: 300000, // 5 minutes
      maxRetries: 2
    },
    cooldownPeriod: 24 * 60 * 60 * 1000, // 24 hours
    triggerCount: 0
  },

  {
    id: 'weekly-learning-summary',
    name: 'Weekly Learning Summary',
    description: 'Generate weekly learning progress report',
    isActive: true,
    priority: 8,
    trigger: {
      type: 'time_based',
      conditions: [
        { field: 'dayOfWeek', operator: 'equals', value: '0' }, // Sunday
        { field: 'hour', operator: 'equals', value: '9' } // 9 AM
      ]
    },
    action: {
      type: 'generate_insight_report',
      payload: {
        reportType: 'weekly_summary',
        includeRecommendations: true,
        shareWithUser: true
      },
      maxRetries: 1
    },
    cooldownPeriod: 6 * 24 * 60 * 60 * 1000, // 6 days
    triggerCount: 0
  },

  {
    id: 'learning-encouragement',
    name: 'Learning Encouragement',
    description: 'Provide encouragement when learning engagement drops',
    isActive: true,
    priority: 5,
    trigger: {
      type: 'engagement_pattern',
      conditions: [
        { field: 'daysWithoutActivity', operator: 'greater_than', value: '3' }
      ]
    },
    action: {
      type: 'initiate_conversation',
      payload: {
        conversationType: 'encouragement',
        context: 'Noticed reduced learning activity',
        personalityTrigger: 'motivation'
      },
      delay: 3600000, // 1 hour
      maxRetries: 1
    },
    cooldownPeriod: 48 * 60 * 60 * 1000, // 48 hours
    triggerCount: 0
  },

  {
    id: 'spaced-repetition-reminder',
    name: 'Spaced Repetition Reminder',
    description: 'Schedule review sessions based on spaced repetition',
    isActive: true,
    priority: 4,
    trigger: {
      type: 'learning_milestone',
      conditions: [
        { field: 'daysSinceLastReview', operator: 'greater_than', value: '3' }
      ]
    },
    action: {
      type: 'schedule_review',
      payload: {
        contentType: 'concepts',
        reviewType: 'spaced_repetition'
      },
      delay: 1800000, // 30 minutes
      maxRetries: 2
    },
    cooldownPeriod: 12 * 60 * 60 * 1000, // 12 hours
    triggerCount: 0
  }
];
