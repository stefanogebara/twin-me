import type { DigitalTwin, Message, StudentProfile, DigitalTwinInsert, DigitalTwinUpdate } from '@/lib/database';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface ChatContext {
  twin: DigitalTwin;
  studentProfile?: StudentProfile;
  conversationHistory: Message[];
  professorContext?: {
    full_name: string;
    university?: string;
    department?: string;
  };
}

interface ChatResponse {
  response: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  timestamp: string;
}

interface FollowUpQuestionsResponse {
  questions: string[];
  timestamp: string;
}

interface AssessmentResponse {
  assessment: {
    understanding_level: 'low' | 'medium' | 'high';
    areas_of_confusion?: string[];
    suggestions?: string[];
  };
  timestamp: string;
}

class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

async function makeAPICall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const config: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new APIError(
        errorData.error || `HTTP ${response.status}`,
        response.status,
        errorData.code
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }

    // Network or other errors
    throw new APIError(
      'Network error or server unavailable',
      0,
      'NETWORK_ERROR'
    );
  }
}

export class SecureDigitalTwinAPI {
  /**
   * Generate AI response through secure server endpoint
   */
  static async generateResponse(
    userMessage: string,
    context: ChatContext
  ): Promise<string> {
    try {
      const response = await makeAPICall<ChatResponse>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: userMessage,
          context,
        }),
      });

      return response.response;
    } catch (error) {
      console.error('AI API Error:', error);

      if (error instanceof APIError) {
        if (error.status === 429) {
          throw new Error('Too many requests. Please wait a moment before trying again.');
        }
        if (error.status === 400) {
          throw new Error('Invalid request. Please check your input and try again.');
        }
        if (error.code === 'NETWORK_ERROR') {
          throw new Error('Unable to connect to AI service. Please check your internet connection.');
        }
      }

      throw new Error('Failed to generate response. Please try again later.');
    }
  }

  /**
   * Generate follow-up questions through secure server endpoint
   */
  static async generateFollowUpQuestions(
    context: ChatContext
  ): Promise<string[]> {
    try {
      const response = await makeAPICall<FollowUpQuestionsResponse>('/ai/follow-up-questions', {
        method: 'POST',
        body: JSON.stringify({ context }),
      });

      return response.questions;
    } catch (error) {
      console.error('Follow-up questions error:', error);
      return []; // Fail gracefully
    }
  }

  /**
   * Assess student understanding through secure server endpoint
   */
  static async assessStudentUnderstanding(
    studentResponse: string,
    topic: string
  ): Promise<{
    understanding_level: 'low' | 'medium' | 'high';
    areas_of_confusion?: string[];
    suggestions?: string[];
  }> {
    try {
      const response = await makeAPICall<AssessmentResponse>('/ai/assess-understanding', {
        method: 'POST',
        body: JSON.stringify({
          studentResponse,
          topic,
        }),
      });

      return response.assessment;
    } catch (error) {
      console.error('Assessment error:', error);
      return { understanding_level: 'medium' }; // Fail gracefully
    }
  }

  /**
   * Health check for API server
   */
  static async healthCheck(): Promise<boolean> {
    try {
      await makeAPICall('/health');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Twin Management Operations
   */

  /**
   * Get all twins for the authenticated user
   */
  static async getMyTwins(authToken: string): Promise<DigitalTwin[]> {
    try {
      const response = await makeAPICall<{ twins: DigitalTwin[] }>('/twins', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      return response.twins;
    } catch (error) {
      console.error('Get twins error:', error);
      throw new Error('Failed to fetch digital twins');
    }
  }

  /**
   * Get a specific twin by ID
   */
  static async getTwin(twinId: string, authToken: string): Promise<DigitalTwin> {
    try {
      const response = await makeAPICall<{ twin: DigitalTwin }>(`/twins/${twinId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      return response.twin;
    } catch (error) {
      console.error('Get twin error:', error);
      throw new Error('Failed to fetch digital twin');
    }
  }

  /**
   * Create a new digital twin
   */
  static async createTwin(twinData: DigitalTwinInsert, authToken: string): Promise<DigitalTwin> {
    try {
      const response = await makeAPICall<{ twin: DigitalTwin }>('/twins', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(twinData),
      });
      return response.twin;
    } catch (error) {
      console.error('Create twin error:', error);
      if (error instanceof APIError) {
        if (error.status === 403) {
          throw new Error('You do not have permission to create this type of twin');
        }
        if (error.status === 400) {
          throw new Error('Invalid twin data. Please check your input and try again.');
        }
      }
      throw new Error('Failed to create digital twin');
    }
  }

  /**
   * Update a digital twin
   */
  static async updateTwin(twinId: string, updates: DigitalTwinUpdate, authToken: string): Promise<DigitalTwin> {
    try {
      const response = await makeAPICall<{ twin: DigitalTwin }>(`/twins/${twinId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(updates),
      });
      return response.twin;
    } catch (error) {
      console.error('Update twin error:', error);
      if (error instanceof APIError) {
        if (error.status === 403) {
          throw new Error('You do not have permission to update this twin');
        }
        if (error.status === 404) {
          throw new Error('Twin not found');
        }
        if (error.status === 400) {
          throw new Error('Invalid twin data. Please check your input and try again.');
        }
      }
      throw new Error('Failed to update digital twin');
    }
  }

  /**
   * Delete a digital twin
   */
  static async deleteTwin(twinId: string, authToken: string): Promise<void> {
    try {
      await makeAPICall(`/twins/${twinId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
    } catch (error) {
      console.error('Delete twin error:', error);
      if (error instanceof APIError) {
        if (error.status === 403) {
          throw new Error('You do not have permission to delete this twin');
        }
        if (error.status === 404) {
          throw new Error('Twin not found');
        }
      }
      throw new Error('Failed to delete digital twin');
    }
  }

  /**
   * Get all active professor twins (public endpoint)
   */
  static async getActiveProfessorTwins(): Promise<DigitalTwin[]> {
    try {
      const response = await makeAPICall<{ twins: DigitalTwin[] }>('/twins/public/active', {
        method: 'GET',
      });
      return response.twins;
    } catch (error) {
      console.error('Get active professor twins error:', error);
      return []; // Fail gracefully
    }
  }

  /**
   * Document Management Operations
   */

  /**
   * Get document statistics for a twin
   */
  static async getDocumentStats(twinId: string, authToken: string): Promise<any> {
    try {
      const response = await makeAPICall(`/documents/stats/${twinId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      return response;
    } catch (error) {
      console.error('Get document stats error:', error);
      throw new Error('Failed to fetch document statistics');
    }
  }

  /**
   * Search documents for relevant context
   */
  static async searchDocuments(twinId: string, query: string, maxResults: number = 5, authToken: string): Promise<any> {
    try {
      const response = await makeAPICall('/documents/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          twinId,
          query,
          maxResults
        }),
      });
      return response;
    } catch (error) {
      console.error('Search documents error:', error);
      throw new Error('Failed to search documents');
    }
  }

  /**
   * Clear all documents for a twin (professor only)
   */
  static async clearTwinDocuments(twinId: string, authToken: string): Promise<void> {
    try {
      await makeAPICall(`/documents/clear/${twinId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
    } catch (error) {
      console.error('Clear documents error:', error);
      if (error instanceof APIError) {
        if (error.status === 403) {
          throw new Error('You do not have permission to clear documents');
        }
      }
      throw new Error('Failed to clear documents');
    }
  }

  /**
   * Get all twins with processed documents (professor only)
   */
  static async getProcessedTwins(authToken: string): Promise<DigitalTwin[]> {
    try {
      const response = await makeAPICall<{ twins: DigitalTwin[] }>('/documents/twins', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      return response.twins;
    } catch (error) {
      console.error('Get processed twins error:', error);
      return []; // Fail gracefully
    }
  }
}

// Export for backward compatibility (can be removed after migration)
export const DigitalTwinClaude = SecureDigitalTwinAPI;