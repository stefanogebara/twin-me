/**
 * Origin Questions Service
 *
 * Provides question definitions and options for the Origin Universe -
 * hands-on data that users provide manually to complement platform data.
 * This captures context that digital platforms can't reveal: where you're from,
 * your education, career stage, and core values.
 */

// ============================================================================
// QUESTION CATEGORIES
// ============================================================================

export const ORIGIN_CATEGORIES = {
  GEOGRAPHIC: 'geographic',
  EDUCATION: 'education',
  CAREER: 'career',
  VALUES: 'values'
};

// ============================================================================
// GEOGRAPHIC QUESTIONS
// ============================================================================

const GEOGRAPHIC_QUESTIONS = [
  {
    id: 'birthplace_country',
    type: 'select',
    label: 'Where were you born?',
    placeholder: 'Select country',
    field: 'birthplace_country',
    required: false,
    description: 'Your geographic origin helps understand your cultural roots'
  },
  {
    id: 'birthplace_city',
    type: 'text',
    label: 'City/Town',
    placeholder: 'Enter city or town',
    field: 'birthplace_city',
    required: false
  },
  {
    id: 'current_country',
    type: 'select',
    label: 'Where do you live now?',
    placeholder: 'Select country',
    field: 'current_country',
    required: false,
    description: 'Your current location shapes your daily experiences'
  },
  {
    id: 'current_city',
    type: 'text',
    label: 'Current City',
    placeholder: 'Enter current city',
    field: 'current_city',
    required: false
  },
  {
    id: 'cultural_background',
    type: 'multi_select',
    label: 'Cultural influences in your life',
    placeholder: 'Select all that apply',
    field: 'cultural_background',
    required: false,
    description: 'The cultures that have shaped who you are',
    maxSelections: 5
  },
  {
    id: 'languages_spoken',
    type: 'multi_select',
    label: 'Languages you speak',
    placeholder: 'Select languages',
    field: 'languages_spoken',
    required: false,
    maxSelections: 10
  }
];

// ============================================================================
// EDUCATION QUESTIONS
// ============================================================================

const EDUCATION_QUESTIONS = [
  {
    id: 'highest_education',
    type: 'select',
    label: 'Highest level of education',
    placeholder: 'Select level',
    field: 'highest_education',
    required: false,
    options: [
      { value: 'high_school', label: 'High School / Secondary' },
      { value: 'some_college', label: 'Some College / University' },
      { value: 'associates', label: "Associate's Degree" },
      { value: 'bachelors', label: "Bachelor's Degree" },
      { value: 'masters', label: "Master's Degree" },
      { value: 'doctorate', label: 'Doctorate (PhD, EdD)' },
      { value: 'professional', label: 'Professional Degree (MD, JD, MBA)' },
      { value: 'other', label: 'Other / Self-taught' }
    ]
  },
  {
    id: 'field_of_study',
    type: 'text',
    label: 'Field of study',
    placeholder: 'e.g., Computer Science, Psychology, Business',
    field: 'field_of_study',
    required: false,
    description: 'Your primary area of academic focus'
  },
  {
    id: 'learning_style',
    type: 'select',
    label: 'How do you learn best?',
    placeholder: 'Select learning style',
    field: 'learning_style',
    required: false,
    description: 'Understanding your learning style helps personalize insights',
    options: [
      { value: 'visual', label: 'Visual - diagrams, videos, images' },
      { value: 'auditory', label: 'Auditory - lectures, discussions, podcasts' },
      { value: 'reading_writing', label: 'Reading/Writing - articles, notes, books' },
      { value: 'kinesthetic', label: 'Kinesthetic - hands-on, practice, doing' },
      { value: 'mixed', label: 'Mixed - depends on the subject' }
    ]
  }
];

// ============================================================================
// CAREER QUESTIONS
// ============================================================================

const CAREER_QUESTIONS = [
  {
    id: 'career_stage',
    type: 'select',
    label: 'Where are you in your career?',
    placeholder: 'Select career stage',
    field: 'career_stage',
    required: false,
    options: [
      { value: 'student', label: 'Student / In Training' },
      { value: 'early_career', label: 'Early Career (0-3 years)' },
      { value: 'mid_career', label: 'Mid Career (4-10 years)' },
      { value: 'senior', label: 'Senior / Expert (10+ years)' },
      { value: 'executive', label: 'Executive / Leadership' },
      { value: 'entrepreneur', label: 'Entrepreneur / Founder' },
      { value: 'transitioning', label: 'Career Transitioning' },
      { value: 'retired', label: 'Retired / Semi-retired' }
    ]
  },
  {
    id: 'industry',
    type: 'text',
    label: 'Industry or field',
    placeholder: 'e.g., Technology, Healthcare, Finance, Education',
    field: 'industry',
    required: false
  },
  {
    id: 'years_experience',
    type: 'number',
    label: 'Years of professional experience',
    placeholder: 'Enter number of years',
    field: 'years_experience',
    required: false,
    min: 0,
    max: 60
  },
  {
    id: 'work_style',
    type: 'select',
    label: 'How do you work?',
    placeholder: 'Select work style',
    field: 'work_style',
    required: false,
    options: [
      { value: 'remote', label: 'Fully Remote' },
      { value: 'hybrid', label: 'Hybrid (mix of office and remote)' },
      { value: 'office', label: 'Office / On-site' },
      { value: 'field', label: 'Field / Travel-based' },
      { value: 'flexible', label: 'Flexible / Varies' }
    ]
  },
  {
    id: 'career_goals',
    type: 'textarea',
    label: 'Career goals or aspirations',
    placeholder: 'What are you working toward professionally?',
    field: 'career_goals',
    required: false,
    maxLength: 500
  }
];

// ============================================================================
// VALUES QUESTIONS
// ============================================================================

const VALUES_QUESTIONS = [
  {
    id: 'core_values',
    type: 'multi_select',
    label: 'Your core values (select up to 5)',
    placeholder: 'Select what matters most to you',
    field: 'core_values',
    required: false,
    description: 'The principles that guide your decisions and actions',
    maxSelections: 5,
    options: [
      { value: 'integrity', label: 'Integrity' },
      { value: 'creativity', label: 'Creativity' },
      { value: 'family', label: 'Family' },
      { value: 'growth', label: 'Growth' },
      { value: 'freedom', label: 'Freedom' },
      { value: 'adventure', label: 'Adventure' },
      { value: 'security', label: 'Security' },
      { value: 'compassion', label: 'Compassion' },
      { value: 'excellence', label: 'Excellence' },
      { value: 'authenticity', label: 'Authenticity' },
      { value: 'balance', label: 'Balance' },
      { value: 'community', label: 'Community' },
      { value: 'knowledge', label: 'Knowledge' },
      { value: 'health', label: 'Health' },
      { value: 'loyalty', label: 'Loyalty' },
      { value: 'innovation', label: 'Innovation' },
      { value: 'justice', label: 'Justice' },
      { value: 'spirituality', label: 'Spirituality' },
      { value: 'success', label: 'Success' },
      { value: 'independence', label: 'Independence' }
    ]
  },
  {
    id: 'life_priorities',
    type: 'ranking',
    label: 'Rank your life priorities (drag to reorder)',
    field: 'life_priorities',
    required: false,
    description: 'How would you prioritize these aspects of life?',
    items: [
      { value: 'career', label: 'Career & Professional Growth' },
      { value: 'family', label: 'Family & Relationships' },
      { value: 'health', label: 'Health & Wellness' },
      { value: 'learning', label: 'Learning & Personal Development' },
      { value: 'adventure', label: 'Adventure & Experiences' }
    ]
  },
  {
    id: 'life_motto',
    type: 'text',
    label: 'Your life motto or guiding principle',
    placeholder: 'A phrase that guides your life (optional)',
    field: 'life_motto',
    required: false,
    maxLength: 200,
    description: 'What words do you live by?'
  },
  {
    id: 'defining_experiences',
    type: 'textarea',
    label: 'Defining experiences that shaped you',
    placeholder: 'Share experiences that significantly shaped who you are today (optional)',
    field: 'defining_experiences',
    required: false,
    maxLength: 1000,
    description: 'The moments that made you who you are'
  }
];

// ============================================================================
// COUNTRY OPTIONS (Common ones - can be expanded)
// ============================================================================

const COUNTRY_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'BR', label: 'Brazil' },
  { value: 'MX', label: 'Mexico' },
  { value: 'AR', label: 'Argentina' },
  { value: 'JP', label: 'Japan' },
  { value: 'KR', label: 'South Korea' },
  { value: 'CN', label: 'China' },
  { value: 'IN', label: 'India' },
  { value: 'IL', label: 'Israel' },
  { value: 'SG', label: 'Singapore' },
  { value: 'SE', label: 'Sweden' },
  { value: 'NO', label: 'Norway' },
  { value: 'DK', label: 'Denmark' },
  { value: 'FI', label: 'Finland' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'AT', label: 'Austria' },
  { value: 'BE', label: 'Belgium' },
  { value: 'PT', label: 'Portugal' },
  { value: 'PL', label: 'Poland' },
  { value: 'IE', label: 'Ireland' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'other', label: 'Other' }
].sort((a, b) => a.label.localeCompare(b.label));

// ============================================================================
// LANGUAGE OPTIONS
// ============================================================================

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ru', label: 'Russian' },
  { value: 'zh', label: 'Chinese (Mandarin)' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'he', label: 'Hebrew' },
  { value: 'sv', label: 'Swedish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'da', label: 'Danish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'pl', label: 'Polish' },
  { value: 'tr', label: 'Turkish' },
  { value: 'other', label: 'Other' }
].sort((a, b) => a.label.localeCompare(b.label));

// ============================================================================
// CULTURAL BACKGROUND OPTIONS
// ============================================================================

const CULTURAL_OPTIONS = [
  { value: 'american', label: 'American' },
  { value: 'british', label: 'British' },
  { value: 'latin_american', label: 'Latin American' },
  { value: 'western_european', label: 'Western European' },
  { value: 'eastern_european', label: 'Eastern European' },
  { value: 'nordic', label: 'Nordic/Scandinavian' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'middle_eastern', label: 'Middle Eastern' },
  { value: 'south_asian', label: 'South Asian' },
  { value: 'east_asian', label: 'East Asian' },
  { value: 'southeast_asian', label: 'Southeast Asian' },
  { value: 'african', label: 'African' },
  { value: 'australian', label: 'Australian/Oceanian' },
  { value: 'jewish', label: 'Jewish' },
  { value: 'indigenous', label: 'Indigenous' },
  { value: 'multicultural', label: 'Multicultural / Mixed' },
  { value: 'other', label: 'Other' }
];

// ============================================================================
// SERVICE EXPORTS
// ============================================================================

export const originQuestionsService = {
  /**
   * Get all origin questions organized by section
   */
  getQuestions() {
    return {
      geographic: {
        title: 'Where You Come From',
        description: 'Your geographic and cultural roots',
        icon: 'MapPin',
        questions: GEOGRAPHIC_QUESTIONS.map(q => ({
          ...q,
          options: q.id === 'birthplace_country' || q.id === 'current_country'
            ? COUNTRY_OPTIONS
            : q.id === 'languages_spoken'
              ? LANGUAGE_OPTIONS
              : q.id === 'cultural_background'
                ? CULTURAL_OPTIONS
                : q.options
        }))
      },
      education: {
        title: 'Education & Learning',
        description: 'Your academic background and how you learn',
        icon: 'GraduationCap',
        questions: EDUCATION_QUESTIONS
      },
      career: {
        title: 'Career & Work',
        description: 'Your professional journey and aspirations',
        icon: 'Briefcase',
        questions: CAREER_QUESTIONS
      },
      values: {
        title: 'Values & Priorities',
        description: 'What matters most to you',
        icon: 'Heart',
        questions: VALUES_QUESTIONS
      }
    };
  },

  /**
   * Get just the core value options
   */
  getValueOptions() {
    return VALUES_QUESTIONS.find(q => q.id === 'core_values')?.options || [];
  },

  /**
   * Get country options for dropdowns
   */
  getCountryOptions() {
    return COUNTRY_OPTIONS;
  },

  /**
   * Get language options for dropdowns
   */
  getLanguageOptions() {
    return LANGUAGE_OPTIONS;
  },

  /**
   * Get cultural background options
   */
  getCulturalOptions() {
    return CULTURAL_OPTIONS;
  },

  /**
   * Validate origin data before saving
   */
  validateOriginData(data) {
    const errors = [];

    // Validate core_values (max 5)
    if (data.core_values && data.core_values.length > 5) {
      errors.push('Maximum 5 core values allowed');
    }

    // Validate years_experience (reasonable range)
    if (data.years_experience !== undefined) {
      const years = parseInt(data.years_experience);
      if (isNaN(years) || years < 0 || years > 60) {
        errors.push('Years of experience must be between 0 and 60');
      }
    }

    // Validate text length limits
    if (data.career_goals && data.career_goals.length > 500) {
      errors.push('Career goals must be 500 characters or less');
    }

    if (data.life_motto && data.life_motto.length > 200) {
      errors.push('Life motto must be 200 characters or less');
    }

    if (data.defining_experiences && data.defining_experiences.length > 1000) {
      errors.push('Defining experiences must be 1000 characters or less');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Calculate completion percentage based on filled fields
   */
  calculateCompletion(data) {
    const fieldWeights = {
      // Geographic (25%)
      birthplace_country: 6,
      current_country: 6,
      cultural_background: 7,
      languages_spoken: 6,

      // Education (20%)
      highest_education: 8,
      field_of_study: 6,
      learning_style: 6,

      // Career (30%)
      career_stage: 8,
      industry: 6,
      years_experience: 6,
      work_style: 5,
      career_goals: 5,

      // Values (25%)
      core_values: 10,
      life_priorities: 8,
      life_motto: 4,
      defining_experiences: 3
    };

    let totalWeight = 0;
    let filledWeight = 0;

    for (const [field, weight] of Object.entries(fieldWeights)) {
      totalWeight += weight;
      const value = data[field];

      if (value !== null && value !== undefined) {
        if (Array.isArray(value) && value.length > 0) {
          filledWeight += weight;
        } else if (typeof value === 'object' && Object.keys(value).length > 0) {
          filledWeight += weight;
        } else if (typeof value === 'string' && value.trim().length > 0) {
          filledWeight += weight;
        } else if (typeof value === 'number') {
          filledWeight += weight;
        }
      }
    }

    return Math.round((filledWeight / totalWeight) * 100);
  }
};

export default originQuestionsService;
