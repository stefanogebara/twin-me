/**
 * Enrichment Service
 * Frontend API client for profile enrichment (Perplexity Sonar API integration)
 * Part of the enrichment-first onboarding flow - discovers public info about users
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

export interface EnrichmentData {
  id?: string;
  email: string;
  discovered_name: string | null;
  discovered_company: string | null;
  discovered_title: string | null;
  discovered_location: string | null;
  discovered_linkedin_url: string | null;
  discovered_twitter_url: string | null;
  discovered_github_url: string | null;
  discovered_bio: string | null;
  discovered_summary: string | null;  // Detailed narrative biography
  // Career data fields
  career_timeline: string | null;     // Full career history with roles/dates
  education: string | null;           // Educational background
  achievements: string | null;        // Notable achievements, projects, awards
  skills: string | null;              // Technical and professional skills
  source?: string;                    // Data source (scrapin+web, web, etc.)
  user_confirmed?: boolean;
  confirmed_data?: ConfirmedData | null;
  corrections?: Corrections | null;
  enriched_at?: string;
  confirmed_at?: string;
  // Resume data
  resume_data?: ResumeData | null;
}

export interface ResumeData {
  personal: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    nationality?: string;
    languages?: string[];
    linkedin_url?: string;
    github_url?: string;
    website?: string;
    summary?: string;
  };
  experience: Array<{
    title: string;
    company: string;
    location?: string;
    start_date?: string;
    end_date?: string;
    description?: string;
    highlights?: string[];
  }>;
  education: Array<{
    degree?: string;
    field?: string;
    institution: string;
    location?: string;
    start_date?: string;
    end_date?: string;
    gpa?: string;
    honors?: string;
    activities?: string[];
  }>;
  skills: {
    technical?: string[];
    tools?: string[];
    soft_skills?: string[];
    other?: string[];
  };
  certifications?: Array<{
    name: string;
    issuer?: string;
    date?: string;
    expiry?: string;
  }>;
  projects?: Array<{
    name: string;
    description?: string;
    technologies?: string[];
    url?: string;
  }>;
}

export interface ResumeUploadResponse {
  success: boolean;
  message?: string;
  data?: {
    personal?: ResumeData['personal'];
    experience?: ResumeData['experience'];
    education?: ResumeData['education'];
    skills?: ResumeData['skills'];
    certifications?: ResumeData['certifications'];
    projects?: ResumeData['projects'];
    languages?: string[];
    summary?: {
      name?: string;
      current_role?: string;
      current_company?: string;
      education_summary?: string;
      location?: string;
      experience_count?: number;
      skills_count?: number;
    };
  };
  error?: string;
  details?: string;
}

export interface ConfirmedData {
  name?: string;
  company?: string;
  title?: string;
  location?: string;
  linkedin_url?: string;
  twitter_url?: string;
  github_url?: string;
  bio?: string;
}

export interface Corrections {
  name?: string;
  company?: string;
  title?: string;
  location?: string;
  linkedin_url?: string;
  twitter_url?: string;
  github_url?: string;
  bio?: string;
}

export interface EnrichmentStatus {
  status: 'not_started' | 'pending_confirmation' | 'confirmed';
  hasEnrichment: boolean;
  isConfirmed: boolean;
  enrichedAt?: string;
  confirmedAt?: string;
  hasCompany?: boolean;
  hasTitle?: boolean;
}

// ============================================================================
// API RESPONSES
// ============================================================================

interface SearchResponse {
  success: boolean;
  message?: string;
  data: EnrichmentData | null;
  hasResults: boolean;
}

interface ResultsResponse {
  success: boolean;
  message?: string;
  data: EnrichmentData | null;
  hasResults: boolean;
}

interface ConfirmResponse {
  success: boolean;
  message?: string;
  data: {
    id: string;
    user_confirmed: boolean;
    confirmed_at: string;
    confirmed_data: ConfirmedData;
    corrections: Corrections | null;
  };
}

interface StatusResponse {
  success: boolean;
  status: 'not_started' | 'pending_confirmation' | 'confirmed';
  hasEnrichment: boolean;
  isConfirmed: boolean;
  enrichedAt?: string;
  confirmedAt?: string;
  hasCompany?: boolean;
  hasTitle?: boolean;
  error?: string;
}

interface SkipResponse {
  success: boolean;
  message?: string;
  skipped: boolean;
}

// ============================================================================
// ENRICHMENT SERVICE
// ============================================================================

export const enrichmentService = {
  /**
   * Trigger enrichment search for a user
   * This calls Perplexity Sonar API to find public information
   */
  search: async (userId: string, email: string, name?: string): Promise<SearchResponse> => {
    const response = await fetch(`${API_URL}/enrichment/search`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userId,
        email,
        name,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to perform enrichment search: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get enrichment results for a user
   */
  getResults: async (userId: string): Promise<ResultsResponse> => {
    const response = await fetch(`${API_URL}/enrichment/results/${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch enrichment results: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Confirm or correct discovered data
   */
  confirm: async (
    userId: string,
    confirmedData: ConfirmedData,
    corrections?: Corrections
  ): Promise<ConfirmResponse> => {
    const response = await fetch(`${API_URL}/enrichment/confirm`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userId,
        confirmedData,
        corrections,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to confirm enrichment: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get enrichment status for a user
   */
  getStatus: async (userId: string): Promise<StatusResponse> => {
    const response = await fetch(`${API_URL}/enrichment/status/${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch enrichment status: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Enrich from a provided LinkedIn URL
   */
  enrichFromLinkedIn: async (userId: string, linkedinUrl: string, name?: string): Promise<SearchResponse> => {
    const response = await fetch(`${API_URL}/enrichment/from-linkedin`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userId,
        linkedinUrl,
        name,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to enrich from LinkedIn: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Skip the enrichment step
   */
  skip: async (userId: string): Promise<SkipResponse> => {
    const response = await fetch(`${API_URL}/enrichment/skip`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to skip enrichment: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Upload and parse a resume file
   */
  uploadResume: async (userId: string, file: File, name?: string): Promise<ResumeUploadResponse> => {
    const formData = new FormData();
    formData.append('resume', file);
    formData.append('userId', userId);
    if (name) {
      formData.append('name', name);
    }

    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}/resume/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to upload resume: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Parse resume from pasted text
   */
  parseResumeText: async (userId: string, text: string, name?: string): Promise<ResumeUploadResponse> => {
    const response = await fetch(`${API_URL}/resume/parse-text`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userId,
        text,
        name,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to parse resume text: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get parsed resume data for a user
   */
  getResumeData: async (userId: string): Promise<{ success: boolean; hasResume: boolean; data: ResumeData | null }> => {
    const response = await fetch(`${API_URL}/resume/data/${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to get resume data: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Check if enrichment has meaningful results
   */
  hasResults: (data: EnrichmentData | null): boolean => {
    if (!data) return false;
    return !!(
      data.discovered_company ||
      data.discovered_title ||
      data.discovered_linkedin_url
    );
  },

  /**
   * Build confirmed data from enrichment data and user edits
   */
  buildConfirmedData: (
    original: EnrichmentData,
    edits: Partial<ConfirmedData>
  ): { confirmedData: ConfirmedData; corrections: Corrections | null } => {
    const confirmedData: ConfirmedData = {
      name: edits.name ?? original.discovered_name ?? undefined,
      company: edits.company ?? original.discovered_company ?? undefined,
      title: edits.title ?? original.discovered_title ?? undefined,
      location: edits.location ?? original.discovered_location ?? undefined,
      linkedin_url: edits.linkedin_url ?? original.discovered_linkedin_url ?? undefined,
      twitter_url: edits.twitter_url ?? original.discovered_twitter_url ?? undefined,
      github_url: edits.github_url ?? original.discovered_github_url ?? undefined,
      bio: edits.bio ?? original.discovered_bio ?? undefined,
    };

    // Track corrections (fields that were changed by user)
    const corrections: Corrections = {};
    let hasCorrections = false;

    if (edits.name && edits.name !== original.discovered_name) {
      corrections.name = edits.name;
      hasCorrections = true;
    }
    if (edits.company && edits.company !== original.discovered_company) {
      corrections.company = edits.company;
      hasCorrections = true;
    }
    if (edits.title && edits.title !== original.discovered_title) {
      corrections.title = edits.title;
      hasCorrections = true;
    }
    if (edits.location && edits.location !== original.discovered_location) {
      corrections.location = edits.location;
      hasCorrections = true;
    }
    if (edits.linkedin_url && edits.linkedin_url !== original.discovered_linkedin_url) {
      corrections.linkedin_url = edits.linkedin_url;
      hasCorrections = true;
    }
    if (edits.twitter_url && edits.twitter_url !== original.discovered_twitter_url) {
      corrections.twitter_url = edits.twitter_url;
      hasCorrections = true;
    }
    if (edits.github_url && edits.github_url !== original.discovered_github_url) {
      corrections.github_url = edits.github_url;
      hasCorrections = true;
    }
    if (edits.bio && edits.bio !== original.discovered_bio) {
      corrections.bio = edits.bio;
      hasCorrections = true;
    }

    return {
      confirmedData,
      corrections: hasCorrections ? corrections : null,
    };
  },
};

export default enrichmentService;
