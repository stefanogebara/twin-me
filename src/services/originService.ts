/**
 * Origin Service
 * Frontend API client for origin data (geographic, education, career, values)
 * Part of the Soul Signature framework - captures "hands-on" data platforms can't reveal
 */

// VITE_API_URL already includes /api suffix (e.g., http://localhost:3001/api)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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

// ============================================================================
// TYPES
// ============================================================================

export interface OriginData {
  id?: string;
  user_id?: string;

  // Geographic Origin
  birthplace_city?: string;
  birthplace_country?: string;
  cultural_background?: string[];
  languages_spoken?: string[];
  current_city?: string;
  current_country?: string;
  places_lived?: string[];

  // Education Background
  highest_education?: string;
  field_of_study?: string;
  institutions?: string[];
  learning_style?: string;

  // Career Stage
  career_stage?: string;
  industry?: string;
  years_experience?: number;
  career_goals?: string;
  work_style?: string;

  // Core Values
  core_values?: string[];
  life_priorities?: Record<string, number>;

  // Personal Context
  defining_experiences?: string;
  life_motto?: string;

  // Metadata
  completion_percentage?: number;
  created_at?: string;
  updated_at?: string;
}

export interface OriginQuestion {
  id: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'multi_select';
  label: string;
  field: string;
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[];
  maxSelections?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}

export interface OriginSection {
  title: string;
  description: string;
  questions: OriginQuestion[];
}

export interface OriginQuestions {
  geographic: OriginSection;
  education: OriginSection;
  career: OriginSection;
  values: OriginSection;
}

export interface OriginSummary {
  geographic: {
    origin: string | null;
    current: string | null;
    culturalInfluences: string[];
    languages: string[];
    mobilityScore: number;
  };
  education: {
    level: string | undefined;
    field: string | undefined;
    learningStyle: string | undefined;
  };
  career: {
    stage: string | undefined;
    industry: string | undefined;
    yearsExperience: number | undefined;
    workStyle: string | undefined;
    goals: string | undefined;
  };
  values: {
    core: string[];
    priorities: Record<string, number>;
    motto: string | undefined;
  };
  completionPercentage: number;
}

// ============================================================================
// API RESPONSES
// ============================================================================

interface QuestionsResponse {
  success: boolean;
  questions: OriginQuestions;
  metadata: {
    totalSections: number;
    isSkippable: boolean;
  };
}

interface OriginDataResponse {
  success: boolean;
  data: OriginData | null;
  hasData: boolean;
  completionPercentage: number;
}

interface SaveOriginResponse {
  success: boolean;
  data: OriginData;
  message: string;
  completionPercentage: number;
}

interface OriginSummaryResponse {
  success: boolean;
  summary: OriginSummary | null;
  hasData: boolean;
  completionPercentage?: number;
}

interface ValueOptionsResponse {
  success: boolean;
  options: { value: string; label: string; description: string }[];
}

// ============================================================================
// ORIGIN SERVICE
// ============================================================================

export const originService = {
  /**
   * Get origin question definitions for the form
   */
  getQuestions: async (): Promise<QuestionsResponse> => {
    const response = await fetch(`${API_URL}/origin/questions`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch origin questions: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get user's origin data
   */
  getOriginData: async (userId: string): Promise<OriginDataResponse> => {
    const response = await fetch(
      `${API_URL}/origin/data?userId=${encodeURIComponent(userId)}`,
      {
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch origin data: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Save origin data (create or update)
   */
  saveOriginData: async (
    userId: string,
    data: Partial<OriginData>
  ): Promise<SaveOriginResponse> => {
    const response = await fetch(`${API_URL}/origin/data`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userId,
        ...data,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to save origin data: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Partial update of origin data (for section-by-section saving)
   */
  updateSection: async (
    userId: string,
    section: string,
    data: Partial<OriginData>
  ): Promise<SaveOriginResponse> => {
    const response = await fetch(`${API_URL}/origin/data`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userId,
        section,
        ...data,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to update origin section: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Delete user's origin data
   */
  deleteOriginData: async (userId: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/origin/data`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete origin data: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get origin summary for soul signature integration
   */
  getSummary: async (userId: string): Promise<OriginSummaryResponse> => {
    const response = await fetch(
      `${API_URL}/origin/summary?userId=${encodeURIComponent(userId)}`,
      {
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch origin summary: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get available core value options
   */
  getValueOptions: async (): Promise<ValueOptionsResponse> => {
    const response = await fetch(`${API_URL}/origin/values/options`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch value options: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Calculate completion percentage from partial data
   */
  calculateCompletion: (data: Partial<OriginData>): number => {
    const totalFields = 15;
    let filledFields = 0;

    // Geographic (4 fields)
    if (data.birthplace_country) filledFields++;
    if (data.current_country) filledFields++;
    if (data.cultural_background && data.cultural_background.length > 0) filledFields++;
    if (data.languages_spoken && data.languages_spoken.length > 0) filledFields++;

    // Education (3 fields)
    if (data.highest_education) filledFields++;
    if (data.field_of_study) filledFields++;
    if (data.learning_style) filledFields++;

    // Career (4 fields)
    if (data.career_stage) filledFields++;
    if (data.industry) filledFields++;
    if (data.years_experience !== undefined && data.years_experience !== null) filledFields++;
    if (data.work_style) filledFields++;

    // Values (2 fields)
    if (data.core_values && data.core_values.length > 0) filledFields++;
    if (data.life_priorities && Object.keys(data.life_priorities).length > 0) filledFields++;

    // Personal (2 fields)
    if (data.defining_experiences) filledFields++;
    if (data.life_motto) filledFields++;

    return Math.round((filledFields / totalFields) * 100);
  },
};

export default originService;
