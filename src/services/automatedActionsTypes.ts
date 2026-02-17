/**
 * Type definitions for Automated Actions Engine
 */

export interface DashboardNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  actionUrl?: string;
  createdAt: Date;
  userId: string;
}

export interface ProactiveMessage {
  id: string;
  twinId: string;
  message: string;
  context: string;
  suggestedResponses: string[];
  priority: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface ContentSuggestionCriteria {
  contentType: 'article' | 'video' | 'exercise' | 'topic';
  subject: string;
  difficultyLevel: number;
  personalityMatch: number;
  reasoning: string;
}

export interface ConversationStarterPayload {
  conversationType: 'check_in' | 'review_session' | 'clarification' | 'encouragement';
  context?: string;
  previousTopics?: string[];
  personalityTrigger?: string;
}

export interface LearningPathUpdates {
  pathId: string;
  updates: {
    addTopics?: string[];
    removeTopics?: string[];
    adjustDifficulty?: number;
    changeSequence?: Array<{ topicId: string; newOrder: number }>;
  };
  reasoning: string;
}

export interface FeedbackRequest {
  id: string;
  userId: string;
  type: string;
  context: string;
  questions: string[];
  createdAt: Date;
  expiresAt: Date;
}

export interface InsightReportConfig {
  reportType: 'weekly_summary' | 'monthly_analysis' | 'personality_drift' | 'learning_progress';
  includeRecommendations: boolean;
  shareWithUser: boolean;
}

export interface InsightReport {
  id: string;
  reportType: string;
  includeRecommendations: boolean;
  shareWithUser: boolean;
}

export interface ConnectionCriteria {
  connectionType: 'study_buddy' | 'mentor' | 'peer_learner' | 'subject_expert';
  criteria: {
    subject?: string;
    learningStyle?: string;
    personality?: string;
    experience?: string;
  };
  maxRecommendations: number;
}
