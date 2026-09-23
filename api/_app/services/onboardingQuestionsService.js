/**
 * Onboarding Questions Service
 *
 * 16personalities-style questions that help the AI learn about the user
 * before any platform data is available. These preferences are used to
 * improve music recommendations, ritual suggestions, and personalization.
 */

// Question categories that map to recommendation factors
export const QUESTION_CATEGORIES = {
  ENERGY_PREFERENCE: 'energy_preference',      // How user prefers to feel
  FOCUS_STYLE: 'focus_style',                  // How user concentrates
  STRESS_RESPONSE: 'stress_response',          // How user handles stress
  SOCIAL_BATTERY: 'social_battery',            // Introvert vs extrovert
  MUSIC_DISCOVERY: 'music_discovery',          // New vs familiar music
  PRODUCTIVITY_RHYTHM: 'productivity_rhythm',  // Morning vs night person
  EMOTIONAL_PROCESSING: 'emotional_processing' // How user processes emotions
};

// The actual questions - designed to be quick but insightful
// Icons are Lucide icon names - rendered in the frontend
export const ONBOARDING_QUESTIONS = [
  // Energy & Mood Questions
  {
    id: 'morning_energy',
    category: QUESTION_CATEGORIES.PRODUCTIVITY_RHYTHM,
    question: "How do you typically feel in the morning?",
    options: [
      { value: 'early_bird', label: 'Ready to conquer the world', icon: 'Sunrise', score: { energy: 0.8, morning_person: true } },
      { value: 'slow_starter', label: 'Need coffee and quiet time first', icon: 'Coffee', score: { energy: 0.4, morning_person: false } },
      { value: 'varies', label: 'Depends on how well I slept', icon: 'Moon', score: { energy: 0.5, morning_person: null } },
      { value: 'night_owl', label: 'Mornings are my enemy', icon: 'MoonStar', score: { energy: 0.3, morning_person: false } }
    ],
    impacts: ['morning_music_energy', 'wake_up_routine']
  },
  {
    id: 'peak_productivity',
    category: QUESTION_CATEGORIES.PRODUCTIVITY_RHYTHM,
    question: "When do you feel most productive?",
    options: [
      { value: 'early_morning', label: 'Early morning (6-9 AM)', icon: 'Sunrise', score: { peak_hours: 'morning', energy_pattern: 'decreasing' } },
      { value: 'late_morning', label: 'Late morning (9 AM-12 PM)', icon: 'Sun', score: { peak_hours: 'late_morning', energy_pattern: 'bell_curve' } },
      { value: 'afternoon', label: 'Afternoon (12-5 PM)', icon: 'SunDim', score: { peak_hours: 'afternoon', energy_pattern: 'slow_start' } },
      { value: 'evening', label: 'Evening/Night (after 6 PM)', icon: 'Moon', score: { peak_hours: 'evening', energy_pattern: 'increasing' } }
    ],
    impacts: ['focus_session_timing', 'ritual_scheduling']
  },

  // Focus & Concentration Questions
  {
    id: 'focus_music',
    category: QUESTION_CATEGORIES.FOCUS_STYLE,
    question: "When you need to focus, what helps most?",
    options: [
      { value: 'silence', label: 'Complete silence', icon: 'VolumeX', score: { focus_instrumentalness: 1.0, focus_energy: 0.1 } },
      { value: 'ambient', label: 'Ambient sounds or lo-fi beats', icon: 'Headphones', score: { focus_instrumentalness: 0.8, focus_energy: 0.3 } },
      { value: 'familiar_music', label: 'Music I know by heart', icon: 'Disc3', score: { focus_instrumentalness: 0.3, focus_energy: 0.5, prefers_familiar: true } },
      { value: 'any_music', label: 'Any music with a good vibe', icon: 'Music', score: { focus_instrumentalness: 0.4, focus_energy: 0.6, prefers_familiar: false } }
    ],
    impacts: ['focus_music_selection', 'study_playlists']
  },
  {
    id: 'distraction_handling',
    category: QUESTION_CATEGORIES.FOCUS_STYLE,
    question: "How easily do you get distracted?",
    options: [
      { value: 'very_focused', label: 'I can tune out almost anything', icon: 'Target', score: { distraction_resistance: 0.9, needs_calm_music: false } },
      { value: 'moderate', label: 'Depends on the task', icon: 'Scale', score: { distraction_resistance: 0.5, needs_calm_music: null } },
      { value: 'easily_distracted', label: 'Pretty easily - I need the right environment', icon: 'Sparkles', score: { distraction_resistance: 0.3, needs_calm_music: true } },
      { value: 'adhd_style', label: 'Very easily - background noise actually helps me', icon: 'Brain', score: { distraction_resistance: 0.2, needs_calm_music: false, needs_stimulation: true } }
    ],
    impacts: ['music_complexity', 'tempo_preferences']
  },

  // Stress & Emotional Questions
  {
    id: 'stress_response',
    category: QUESTION_CATEGORIES.STRESS_RESPONSE,
    question: "When you're stressed, what do you instinctively reach for?",
    options: [
      { value: 'calming', label: 'Something calming - tea, meditation, quiet', icon: 'Leaf', score: { stress_coping: 'calm', stress_music_energy: 0.2 } },
      { value: 'energetic', label: 'Something energizing - workout, loud music', icon: 'Dumbbell', score: { stress_coping: 'active', stress_music_energy: 0.8 } },
      { value: 'distraction', label: 'Distraction - games, shows, scrolling', icon: 'Smartphone', score: { stress_coping: 'distract', stress_music_energy: 0.5 } },
      { value: 'social', label: 'Connection - calling a friend, going out', icon: 'Users', score: { stress_coping: 'social', stress_music_energy: 0.6 } }
    ],
    impacts: ['low_recovery_music', 'stress_relief_recommendations']
  },
  {
    id: 'emotional_music',
    category: QUESTION_CATEGORIES.EMOTIONAL_PROCESSING,
    question: "Do you use music to match or change your mood?",
    options: [
      { value: 'match', label: 'Match it - sad music when sad feels right', icon: 'CloudRain', score: { music_emotional_strategy: 'match', valence_matching: true } },
      { value: 'change', label: 'Change it - upbeat music to lift my spirits', icon: 'Rainbow', score: { music_emotional_strategy: 'change', valence_matching: false } },
      { value: 'both', label: 'Both - depends on the situation', icon: 'Layers', score: { music_emotional_strategy: 'adaptive', valence_matching: null } },
      { value: 'independent', label: 'Music doesn\'t affect my mood much', icon: 'Minus', score: { music_emotional_strategy: 'neutral', valence_matching: null, music_impact: 'low' } }
    ],
    impacts: ['mood_based_recommendations', 'recovery_music_strategy']
  },

  // Social & Energy Questions
  {
    id: 'social_battery',
    category: QUESTION_CATEGORIES.SOCIAL_BATTERY,
    question: "After a long day of meetings or social events, you feel...",
    options: [
      { value: 'energized', label: 'Energized and ready for more', icon: 'Zap', score: { introversion: 0.2, post_social_energy: 0.8 } },
      { value: 'satisfied', label: 'Satisfied but ready for quiet time', icon: 'Smile', score: { introversion: 0.5, post_social_energy: 0.5 } },
      { value: 'drained', label: 'Drained - need serious alone time', icon: 'BatteryLow', score: { introversion: 0.8, post_social_energy: 0.2 } },
      { value: 'depends', label: 'Depends who I was with', icon: 'HelpCircle', score: { introversion: 0.5, post_social_energy: null } }
    ],
    impacts: ['post_event_music', 'recharge_recommendations']
  },

  // Music Discovery Questions
  {
    id: 'music_discovery',
    category: QUESTION_CATEGORIES.MUSIC_DISCOVERY,
    question: "How do you feel about discovering new music?",
    options: [
      { value: 'love_new', label: 'Love it - always hunting for new tracks', icon: 'Search', score: { novelty_seeking: 0.9, playlist_diversity: 0.8 } },
      { value: 'occasional', label: 'Occasionally - but I have my favorites', icon: 'Disc3', score: { novelty_seeking: 0.5, playlist_diversity: 0.5 } },
      { value: 'comfort', label: 'Prefer comfort - I stick to what I know', icon: 'Home', score: { novelty_seeking: 0.2, playlist_diversity: 0.3 } },
      { value: 'curated', label: 'Only if someone curates it for me', icon: 'Gift', score: { novelty_seeking: 0.4, playlist_diversity: 0.4, wants_curation: true } }
    ],
    impacts: ['recommendation_variety', 'new_vs_familiar_ratio']
  },
  {
    id: 'workout_music',
    category: QUESTION_CATEGORIES.ENERGY_PREFERENCE,
    question: "What gets you through a tough workout?",
    options: [
      { value: 'high_energy', label: 'Aggressive, high-energy music', icon: 'Flame', score: { workout_energy: 0.9, workout_tempo: 140 } },
      { value: 'steady_beat', label: 'Steady beat I can sync to', icon: 'Activity', score: { workout_energy: 0.7, workout_tempo: 120, prefers_rhythm: true } },
      { value: 'podcasts', label: 'Podcasts or audiobooks', icon: 'Mic', score: { workout_energy: 0.3, workout_tempo: null, prefers_spoken: true } },
      { value: 'no_preference', label: 'I don\'t really work out', icon: 'Armchair', score: { workout_energy: null, workout_tempo: null } }
    ],
    impacts: ['workout_playlists', 'exercise_recommendations']
  },

  // Pre-event Preparation
  {
    id: 'pre_event_ritual',
    category: QUESTION_CATEGORIES.STRESS_RESPONSE,
    question: "Before an important meeting or event, you...",
    options: [
      { value: 'pump_up', label: 'Pump yourself up with energy', icon: 'Rocket', score: { pre_event_strategy: 'energize', pre_event_energy: 0.8 } },
      { value: 'calm_focus', label: 'Find calm focus and center yourself', icon: 'Wind', score: { pre_event_strategy: 'calm', pre_event_energy: 0.3 } },
      { value: 'review', label: 'Review and prepare more', icon: 'ClipboardList', score: { pre_event_strategy: 'prepare', pre_event_energy: 0.5 } },
      { value: 'distract', label: 'Distract yourself until it\'s time', icon: 'Gamepad2', score: { pre_event_strategy: 'distract', pre_event_energy: 0.4 } }
    ],
    impacts: ['pre_event_music', 'ritual_preparation']
  }
];

/**
 * Calculate user preferences from questionnaire answers
 */
export function calculatePreferencesFromAnswers(answers) {
  const preferences = {
    // Energy preferences
    morning_person: null,
    peak_hours: 'afternoon',
    energy_pattern: 'bell_curve',
    base_energy_preference: 0.5,

    // Music preferences
    focus_instrumentalness: 0.5,
    focus_energy: 0.4,
    prefers_familiar: null,
    novelty_seeking: 0.5,
    playlist_diversity: 0.5,

    // Emotional preferences
    music_emotional_strategy: 'adaptive',
    valence_matching: null,
    stress_coping: 'calm',
    stress_music_energy: 0.4,

    // Social preferences
    introversion: 0.5,
    post_social_energy: 0.5,

    // Activity preferences
    workout_energy: 0.7,
    workout_tempo: 130,
    pre_event_strategy: 'energize',
    pre_event_energy: 0.6,

    // Focus preferences
    distraction_resistance: 0.5,
    needs_calm_music: null,
    needs_stimulation: false,

    // Metadata
    completedAt: new Date().toISOString(),
    version: 1
  };

  // Process each answer and merge scores
  for (const [questionId, selectedValue] of Object.entries(answers)) {
    const question = ONBOARDING_QUESTIONS.find(q => q.id === questionId);
    if (!question) continue;

    const selectedOption = question.options.find(o => o.value === selectedValue);
    if (!selectedOption || !selectedOption.score) continue;

    // Merge the scores into preferences
    for (const [key, value] of Object.entries(selectedOption.score)) {
      if (value !== null && value !== undefined) {
        preferences[key] = value;
      }
    }
  }

  return preferences;
}

/**
 * Apply user preferences to music recommendation parameters
 */
export function applyPreferencesToMusicParams(preferences, context) {
  const adjustments = {
    energy: { adjustment: 0, reason: [] },
    valence: { adjustment: 0, reason: [] },
    tempo: { adjustment: 0, reason: [] },
    instrumentalness: { adjustment: 0, reason: [] }
  };

  // Time of day adjustments based on user's peak hours
  const hour = new Date().getHours();
  if (preferences.peak_hours) {
    const isPeakTime = isUserPeakTime(hour, preferences.peak_hours);
    if (isPeakTime) {
      adjustments.energy.adjustment += 0.1;
      adjustments.energy.reason.push('Peak productivity time');
    } else if (preferences.energy_pattern === 'decreasing' && hour > 14) {
      adjustments.energy.adjustment -= 0.15;
      adjustments.energy.reason.push('Energy typically decreases in afternoon');
    }
  }

  // Morning person adjustments
  if (preferences.morning_person === false && hour < 10) {
    adjustments.energy.adjustment -= 0.1;
    adjustments.tempo.adjustment -= 10;
    adjustments.energy.reason.push('Not a morning person - gentler start');
  }

  // Introversion adjustments after meetings
  if (context.calendar?.recentMeetings > 2 && preferences.introversion > 0.6) {
    adjustments.energy.adjustment -= 0.15;
    adjustments.valence.adjustment -= 0.1;
    adjustments.energy.reason.push('Introvert after multiple meetings - need recharge');
  }

  // Stress coping style
  if (context.whoop?.recovery < 50) {
    if (preferences.stress_coping === 'active') {
      // User prefers to work through stress with energy
      adjustments.energy.adjustment += 0.1;
      adjustments.energy.reason.push('Active stress coper - maintains energy');
    } else if (preferences.stress_coping === 'calm') {
      adjustments.energy.adjustment -= 0.15;
      adjustments.energy.reason.push('Calm stress coper - needs restorative music');
    }
  }

  // Music emotional strategy
  if (preferences.music_emotional_strategy === 'change' && context.mood === 'low') {
    adjustments.valence.adjustment += 0.2;
    adjustments.valence.reason.push('User prefers mood-lifting music');
  }

  // Pre-event preferences
  if (context.purpose === 'pre-event') {
    if (preferences.pre_event_strategy === 'energize') {
      adjustments.energy.adjustment += 0.15;
      adjustments.energy.reason.push('User pumps up before events');
    } else if (preferences.pre_event_strategy === 'calm') {
      adjustments.energy.adjustment -= 0.1;
      adjustments.energy.reason.push('User prefers calm focus before events');
    }
  }

  // Focus preferences
  if (context.purpose === 'focus') {
    adjustments.instrumentalness.adjustment = preferences.focus_instrumentalness - 0.5;
    adjustments.energy.adjustment = (preferences.focus_energy - 0.5) * 0.5;

    if (preferences.needs_stimulation) {
      adjustments.energy.adjustment += 0.1;
      adjustments.energy.reason.push('User needs stimulation to focus');
    }
  }

  // Workout preferences
  if (context.purpose === 'workout' && preferences.workout_energy !== null) {
    adjustments.energy.adjustment = (preferences.workout_energy - 0.7) * 0.3;
    if (preferences.workout_tempo) {
      adjustments.tempo.adjustment = (preferences.workout_tempo - 130) * 0.5;
    }
  }

  return adjustments;
}

/**
 * Check if current time is user's peak productivity time
 */
function isUserPeakTime(hour, peakHours) {
  const peakRanges = {
    morning: [6, 9],
    late_morning: [9, 12],
    afternoon: [12, 17],
    evening: [18, 23]
  };

  const range = peakRanges[peakHours];
  if (!range) return false;

  return hour >= range[0] && hour < range[1];
}

/**
 * Generate personalized explanation based on preferences
 */
export function generatePreferenceExplanation(preferences, context) {
  const parts = [];

  if (preferences.morning_person === true && new Date().getHours() < 10) {
    parts.push("Since you're a morning person, I'm matching your natural energy.");
  } else if (preferences.morning_person === false && new Date().getHours() < 10) {
    parts.push("Knowing you're not a morning person, I've kept things gentle.");
  }

  if (preferences.music_emotional_strategy === 'change') {
    parts.push("I'm focusing on mood-lifting tracks since you prefer music that shifts your state.");
  } else if (preferences.music_emotional_strategy === 'match') {
    parts.push("I'm matching the music to how you might be feeling right now.");
  }

  if (preferences.pre_event_strategy === 'calm' && context.purpose === 'pre-event') {
    parts.push("Before your event, I've chosen calming tracks to help you center yourself.");
  }

  if (preferences.introversion > 0.7 && context.calendar?.recentMeetings > 2) {
    parts.push("After those meetings, here's some restorative music to recharge your social battery.");
  }

  return parts.join(' ');
}

export default {
  QUESTION_CATEGORIES,
  ONBOARDING_QUESTIONS,
  calculatePreferencesFromAnswers,
  applyPreferencesToMusicParams,
  generatePreferenceExplanation
};
