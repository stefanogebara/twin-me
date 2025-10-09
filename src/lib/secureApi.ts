import type { DigitalTwin, Message, StudentProfile } from '@/types/database';

// Extend Window interface for Clerk
declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken?: () => Promise<string | null> | string | null;
      };
    };
  }
}

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

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface UsageData {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

interface SourceData {
  id?: string;
  content: string;
  metadata?: Record<string, unknown>;
  relevance_score?: number;
}

interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

interface ChatResponse {
  response: string;
  usage?: UsageData;
  model?: string;
  ragContext?: {
    foundRelevantContent: boolean;
    sourcesUsed: number;
    sources: SourceData[];
  };
}

interface AssessmentResponse {
  understanding_level: 'low' | 'medium' | 'high';
  areas_of_confusion?: string[];
  suggestions?: string[];
}

class SecureAPIClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    // Get auth token from Clerk or your auth system
    const token = localStorage.getItem('auth_token') ||
                 window.Clerk?.session?.getToken?.();

    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      ...options,
    };

    const response = await fetch(url, defaultOptions);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Anthropic/Claude AI methods
  async generateClaudeResponse(
    userMessage: string,
    context: ChatContext
  ): Promise<string> {
    try {
      const response = await this.makeRequest<ApiResponse<ChatResponse>>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: userMessage,
          context,
        }),
      });

      if (response.success && response.data) {
        return response.data.response;
      } else {
        throw new Error(response.error || 'Failed to generate response');
      }
    } catch (error) {
      console.error('Claude API Error:', error);
      throw new Error('Failed to generate response. Please check your connection and try again.');
    }
  }

  // OpenAI methods
  async generateOpenAIResponse(
    userMessage: string,
    context: ChatContext
  ): Promise<string> {
    try {
      const response = await this.makeRequest<ApiResponse<ChatResponse>>('/ai/openai-chat', {
        method: 'POST',
        body: JSON.stringify({
          message: userMessage,
          context,
        }),
      });

      if (response.success && response.data) {
        return response.data.response;
      } else {
        throw new Error(response.error || 'Failed to generate response');
      }
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw new Error('Failed to generate response. Please check your connection and try again.');
    }
  }

  async generateFollowUpQuestions(context: ChatContext): Promise<string[]> {
    try {
      const response = await this.makeRequest<{questions: string[]}>('/ai/follow-up-questions', {
        method: 'POST',
        body: JSON.stringify({ context }),
      });

      return response.questions || [];
    } catch (error) {
      console.error('Error generating follow-up questions:', error);
      return [];
    }
  }

  async generateOpenAIFollowUpQuestions(context: ChatContext): Promise<string[]> {
    try {
      const response = await this.makeRequest<{questions: string[]}>('/ai/openai-follow-up-questions', {
        method: 'POST',
        body: JSON.stringify({ context }),
      });

      return response.questions || [];
    } catch (error) {
      console.error('Error generating follow-up questions:', error);
      return [];
    }
  }

  async assessStudentUnderstanding(
    studentResponse: string,
    topic: string
  ): Promise<AssessmentResponse> {
    try {
      const response = await this.makeRequest<{assessment: AssessmentResponse}>('/ai/assess-understanding', {
        method: 'POST',
        body: JSON.stringify({
          studentResponse,
          topic,
        }),
      });

      return response.assessment || { understanding_level: 'medium' };
    } catch (error) {
      console.error('Error assessing student understanding:', error);
      return { understanding_level: 'medium' };
    }
  }

  async assessStudentUnderstandingOpenAI(
    studentResponse: string,
    topic: string
  ): Promise<AssessmentResponse> {
    try {
      const response = await this.makeRequest<{assessment: AssessmentResponse}>('/ai/openai-assess-understanding', {
        method: 'POST',
        body: JSON.stringify({
          studentResponse,
          topic,
        }),
      });

      return response.assessment || { understanding_level: 'medium' };
    } catch (error) {
      console.error('Error assessing student understanding:', error);
      return { understanding_level: 'medium' };
    }
  }

  // Voice API methods
  async synthesizeVoice(
    text: string,
    voiceId?: string,
    settings: VoiceSettings = {}
  ): Promise<string> {
    try {
      const response = await this.makeRequest<{
        success: boolean;
        audio_url?: string;
        error?: string;
      }>('/voice/synthesize', {
        method: 'POST',
        body: JSON.stringify({
          text,
          voice_id: voiceId,
          settings,
        }),
      });

      if (response.success && response.audio_url) {
        return `${this.baseUrl.replace('/api', '')}${response.audio_url}`;
      } else {
        throw new Error(response.error || 'Voice synthesis failed');
      }
    } catch (error) {
      console.error('Voice synthesis error:', error);
      throw new Error('Failed to synthesize voice. Please try again.');
    }
  }

  async transcribeAudio(audioFile: File): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('audio', audioFile);

      const response = await this.makeRequest<{
        success: boolean;
        transcription?: string;
        error?: string;
      }>('/voice/transcribe', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
      });

      if (response.success && response.transcription) {
        return response.transcription;
      } else {
        throw new Error(response.error || 'Transcription failed');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error('Failed to transcribe audio. Please try again.');
    }
  }
}

// Export singleton instance
export const secureApi = new SecureAPIClient();

// Backward compatibility - provides the same interface as the old DigitalTwinLLM
export class DigitalTwinLLM {
  static async generateResponse(
    userMessage: string,
    context: ChatContext
  ): Promise<string> {
    // Use Claude by default, fallback to OpenAI if needed
    return secureApi.generateClaudeResponse(userMessage, context);
  }

  static async generateFollowUpQuestions(context: ChatContext): Promise<string[]> {
    return secureApi.generateFollowUpQuestions(context);
  }

  static async assessStudentUnderstanding(
    studentResponse: string,
    topic: string
  ): Promise<AssessmentResponse> {
    return secureApi.assessStudentUnderstanding(studentResponse, topic);
  }
}