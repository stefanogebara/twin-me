/**
 * useOrchestrator Hook
 *
 * React hook for interacting with the multi-agent orchestrator API.
 * Provides methods for querying the orchestrator, getting recommendations,
 * and insights with loading states and error handling.
 *
 * Usage:
 * ```tsx
 * const { query, recommend, insights, isLoading, error } = useOrchestrator();
 *
 * const result = await query({
 *   query: "What music should I listen to before my presentation?",
 *   context: { upcomingEvent: "presentation" }
 * });
 * ```
 */

import { useMutation } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001/api';

interface AuthHeaders {
  'Content-Type': string;
  'Authorization'?: string;
}

const getAuthHeaders = (): AuthHeaders => {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: AuthHeaders = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

// ====================================================================
// TYPES
// ====================================================================

export interface OrchestratorRequest {
  query: string;
  context?: Record<string, any>;
  sessionId?: string;
}

export interface OrchestratorRecommendRequest {
  type?: 'music' | 'video';
  context?: Record<string, any>;
}

export interface OrchestratorRecommendation {
  type: 'music' | 'video' | 'action' | 'content' | 'insight';
  title: string;
  description: string;
  url?: string;
  confidence: number;
  reasoning: string;
  sourceAgent: string;
}

export interface OrchestratorInsight {
  category: 'temporal_patterns' | 'habits' | 'trends' | 'anomalies';
  insight: string;
  evidence: {
    pattern_count: number;
    avg_confidence: number;
    occurrences: number;
    timespan_days?: number;
  };
  significance: 'high' | 'medium' | 'low';
  recommendation?: string;
}

export interface OrchestratorResponse {
  success: boolean;
  sessionId: string;
  query: string;
  synthesis: string;
  keyInsights: string[];
  recommendations: OrchestratorRecommendation[];
  metadata: {
    latencyMs: number;
    decomposition?: any;
    agentContributions?: Record<string, string>;
    totalAgentsUsed?: number;
  };
  latencyMs?: number;
}

export interface OrchestratorInsightsResponse extends OrchestratorResponse {
  insights?: OrchestratorInsight[];
  metrics?: {
    total_patterns: number;
    high_confidence_patterns: number;
    average_confidence: number;
    most_common_type?: string;
    data_quality: 'excellent' | 'good' | 'fair' | 'poor';
  };
  trends?: {
    emerging: string[];
    stable: string[];
    declining: string[];
  };
}

export interface OrchestratorError {
  error: string;
  message: string;
  details?: any;
}

// ====================================================================
// API FUNCTIONS
// ====================================================================

/**
 * Main orchestrator query
 * Processes complex queries through multi-agent system
 */
async function queryOrchestrator(request: OrchestratorRequest): Promise<OrchestratorResponse> {
  console.log('[useOrchestrator] Querying orchestrator:', request.query);

  const response = await fetch(`${API_URL}/orchestrator/query`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error: OrchestratorError = await response.json();
    throw new Error(error.message || 'Orchestrator query failed');
  }

  const data: OrchestratorResponse = await response.json();
  console.log('✅ [useOrchestrator] Query succeeded:', {
    latency: data.latencyMs,
    agentsUsed: data.metadata?.totalAgentsUsed
  });

  return data;
}

/**
 * Quick recommendation endpoint
 * Fast content recommendations without complex query
 */
async function getRecommendations(request: OrchestratorRecommendRequest): Promise<OrchestratorResponse> {
  console.log('[useOrchestrator] Getting recommendations:', request.type);

  const response = await fetch(`${API_URL}/orchestrator/recommend`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error: OrchestratorError = await response.json();
    throw new Error(error.message || 'Recommendation request failed');
  }

  const data: OrchestratorResponse = await response.json();
  console.log('✅ [useOrchestrator] Recommendations retrieved');

  return data;
}

/**
 * Get behavioral insights
 * Analytics and pattern insights from user data
 */
async function getInsights(): Promise<OrchestratorInsightsResponse> {
  console.log('[useOrchestrator] Getting behavioral insights');

  const response = await fetch(`${API_URL}/orchestrator/insights`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error: OrchestratorError = await response.json();
    throw new Error(error.message || 'Insights request failed');
  }

  const data: OrchestratorInsightsResponse = await response.json();
  console.log('✅ [useOrchestrator] Insights retrieved');

  return data;
}

/**
 * Check orchestrator health
 */
async function checkHealth(): Promise<any> {
  const response = await fetch(`${API_URL}/orchestrator/health`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Health check failed');
  }

  return response.json();
}

/**
 * Get orchestrator metrics
 */
async function getMetrics(): Promise<any> {
  const response = await fetch(`${API_URL}/orchestrator/metrics`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to get metrics');
  }

  return response.json();
}

// ====================================================================
// REACT HOOK
// ====================================================================

export function useOrchestrator() {
  // Main query mutation
  const queryMutation = useMutation({
    mutationFn: queryOrchestrator,
    onSuccess: (data) => {
      console.log('🎭 [useOrchestrator] Query succeeded:', {
        synthesis: data.synthesis.substring(0, 100) + '...',
        insights: data.keyInsights.length,
        recommendations: data.recommendations.length,
        latency: data.latencyMs
      });
    },
    onError: (error: Error) => {
      console.error('❌ [useOrchestrator] Query failed:', error.message);
    }
  });

  // Recommendation mutation
  const recommendMutation = useMutation({
    mutationFn: getRecommendations,
    onSuccess: (data) => {
      console.log('🎵 [useOrchestrator] Recommendations succeeded:', {
        recommendations: data.recommendations.length
      });
    },
    onError: (error: Error) => {
      console.error('❌ [useOrchestrator] Recommendations failed:', error.message);
    }
  });

  // Insights mutation
  const insightsMutation = useMutation({
    mutationFn: getInsights,
    onSuccess: (data) => {
      console.log('📊 [useOrchestrator] Insights succeeded:', {
        insights: data.keyInsights?.length,
        metrics: data.metrics
      });
    },
    onError: (error: Error) => {
      console.error('❌ [useOrchestrator] Insights failed:', error.message);
    }
  });

  // Health check mutation
  const healthMutation = useMutation({
    mutationFn: checkHealth,
  });

  // Metrics mutation
  const metricsMutation = useMutation({
    mutationFn: getMetrics,
  });

  return {
    // Query methods
    query: queryMutation.mutateAsync,
    recommend: recommendMutation.mutateAsync,
    insights: insightsMutation.mutateAsync,
    checkHealth: healthMutation.mutateAsync,
    getMetrics: metricsMutation.mutateAsync,

    // Loading states
    isLoading: queryMutation.isPending ||
               recommendMutation.isPending ||
               insightsMutation.isPending,
    isQueryLoading: queryMutation.isPending,
    isRecommendLoading: recommendMutation.isPending,
    isInsightsLoading: insightsMutation.isPending,

    // Error states
    error: queryMutation.error ||
           recommendMutation.error ||
           insightsMutation.error,
    queryError: queryMutation.error,
    recommendError: recommendMutation.error,
    insightsError: insightsMutation.error,

    // Data
    queryData: queryMutation.data,
    recommendData: recommendMutation.data,
    insightsData: insightsMutation.data,

    // Reset methods
    reset: () => {
      queryMutation.reset();
      recommendMutation.reset();
      insightsMutation.reset();
    }
  };
}
