/**
 * Pattern Detection Engine
 * Research-backed behavioral pattern detection from Soul Observer data
 *
 * Based on published research:
 * - Keystroke dynamics: 72% F1 score for personality prediction
 * - Mouse patterns: Big Five personality trait correlation
 * - Scroll behavior: Reading comprehension indicators
 * - Focus patterns: Attention span and cognitive load metrics
 */

import { createClient } from '@supabase/supabase-js';

// Lazy initialization to avoid crashes if env vars not loaded yet
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

// Research-backed thresholds
const THRESHOLDS = {
  // Typing patterns (from keystroke dynamics research)
  typing: {
    fastWPM: 60,           // 60+ WPM = confident writer
    slowWPM: 30,           // <30 WPM = deliberate/careful
    lowCorrectionRate: 0.05, // <5% = confident
    highCorrectionRate: 0.15, // >15% = careful/perfectionist
    longPause: 2000,       // >2s pause = deep thinking
  },

  // Mouse patterns (from Big Five correlation research)
  mouse: {
    smoothVariance: 50,    // Low variance = smooth, purposeful
    erraticVariance: 150,  // High variance = exploratory, spontaneous
    fastSpeed: 300,        // px/s - fast = decisive
    slowSpeed: 100,        // px/s - slow = deliberate
    highHesitation: 500,   // ms before click = cautious
  },

  // Scroll patterns (reading comprehension indicators)
  scroll: {
    readingSpeed: 150,     // px/s - slow = deep reading
    skimmingSpeed: 400,    // px/s - fast = skimming
    highBackscroll: 0.2,   // >20% = careful reader
  },

  // Focus & attention (cognitive load indicators)
  focus: {
    deepFocusDuration: 300000,    // 5min+ = deep focus
    shortAttentionSpan: 30000,    // <30s = distracted
    highMultitasking: 0.7,        // Switching score >0.7 = multitasker
    lowMultitasking: 0.3,         // <0.3 = focused
  },

  // Temporal patterns (circadian rhythms)
  temporal: {
    morningProductivity: { start: 6, end: 12 },
    afternoonProductivity: { start: 12, end: 18 },
    eveningProductivity: { start: 18, end: 24 },
    nightProductivity: { start: 0, end: 6 },
  }
};

// Big Five personality trait mappings (from research)
const PERSONALITY_MAPPINGS = {
  // Openness to Experience
  openness: {
    high: ['exploratory_mouse', 'diverse_domains', 'creative_writing', 'long_reading_sessions'],
    low: ['routine_browsing', 'consistent_patterns', 'focused_domains']
  },

  // Conscientiousness
  conscientiousness: {
    high: ['low_corrections', 'organized_navigation', 'deep_focus', 'consistent_schedule'],
    low: ['high_multitasking', 'erratic_patterns', 'impulsive_clicks']
  },

  // Extraversion
  extraversion: {
    high: ['fast_typing', 'quick_decisions', 'high_social_browsing', 'frequent_interactions'],
    low: ['slow_deliberate_typing', 'long_pauses', 'focused_work']
  },

  // Agreeableness
  agreeableness: {
    high: ['careful_reading', 'thoughtful_pauses', 'low_aggression_indicators'],
    low: ['fast_scanning', 'quick_judgments', 'assertive_patterns']
  },

  // Neuroticism (Emotional Stability)
  neuroticism: {
    high: ['high_corrections', 'hesitation_before_clicks', 'erratic_mouse', 'stress_indicators'],
    low: ['smooth_patterns', 'confident_typing', 'consistent_focus']
  }
};

class PatternDetectionEngine {

  /**
   * Analyze session and detect behavioral patterns
   */
  async analyzeSession(sessionId) {
    try {
      console.log(`[Pattern Detection] Analyzing session: ${sessionId}`);

      // Get session events
      const supabase = getSupabaseClient();
      const { data: events, error } = await supabase
        .from('soul_observer_events')
        .select('*')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      if (!events || events.length === 0) {
        console.warn(`[Pattern Detection] No events found for session ${sessionId}`);
        return { patterns: [], insights: [] };
      }

      console.log(`[Pattern Detection] Analyzing ${events.length} events`);

      // Detect patterns from different behavioral dimensions
      const typingPatterns = this.detectTypingPatterns(events);
      const mousePatterns = this.detectMousePatterns(events);
      const scrollPatterns = this.detectScrollPatterns(events);
      const focusPatterns = this.detectFocusPatterns(events);
      const temporalPatterns = this.detectTemporalPatterns(events);

      // Combine all patterns
      const allPatterns = [
        ...typingPatterns,
        ...mousePatterns,
        ...scrollPatterns,
        ...focusPatterns,
        ...temporalPatterns
      ];

      // Infer personality traits from patterns
      const personalityInsights = this.inferPersonalityTraits(allPatterns);

      console.log(`[Pattern Detection] Detected ${allPatterns.length} patterns`);

      return {
        patterns: allPatterns,
        personalityInsights,
        eventCount: events.length
      };

    } catch (error) {
      console.error('[Pattern Detection] Error analyzing session:', error);
      throw error;
    }
  }

  /**
   * Detect typing patterns from keystroke dynamics
   */
  detectTypingPatterns(events) {
    const typingEvents = events.filter(e => e.event_type === 'typing');
    if (typingEvents.length === 0) return [];

    const patterns = [];

    // Calculate aggregate metrics
    const totalChars = typingEvents.reduce((sum, e) => sum + (e.event_data.chars || 0), 0);
    const totalTime = typingEvents.reduce((sum, e) => sum + (e.duration_ms || 0), 0);
    const totalCorrections = typingEvents.reduce((sum, e) => sum + (e.event_data.corrections || 0), 0);
    const totalPauses = typingEvents.filter(e => e.event_data.pauseDuration > THRESHOLDS.typing.longPause).length;

    const wpm = totalTime > 0 ? ((totalChars / 5) / (totalTime / 60000)) : 0;
    const correctionRate = totalChars > 0 ? (totalCorrections / totalChars) : 0;
    const pauseRate = typingEvents.length > 0 ? (totalPauses / typingEvents.length) : 0;

    // Pattern: Writing style
    if (wpm >= THRESHOLDS.typing.fastWPM && correctionRate <= THRESHOLDS.typing.lowCorrectionRate) {
      patterns.push({
        type: 'writing_style',
        name: 'Confident Writer',
        description: 'Fast typing with minimal corrections indicates confident, decisive communication',
        metrics: { wpm, correctionRate, pauseRate },
        confidence: 0.85,
        personalityCorrelations: { extraversion: 0.6, conscientiousness: 0.4 }
      });
    } else if (wpm <= THRESHOLDS.typing.slowWPM && correctionRate >= THRESHOLDS.typing.highCorrectionRate) {
      patterns.push({
        type: 'writing_style',
        name: 'Thoughtful Writer',
        description: 'Deliberate typing with frequent corrections indicates careful, precise communication',
        metrics: { wpm, correctionRate, pauseRate },
        confidence: 0.82,
        personalityCorrelations: { conscientiousness: 0.7, neuroticism: 0.3 }
      });
    } else if (pauseRate > 0.3) {
      patterns.push({
        type: 'writing_style',
        name: 'Reflective Writer',
        description: 'Frequent pauses indicate deep thinking and careful word choice',
        metrics: { wpm, correctionRate, pauseRate },
        confidence: 0.78,
        personalityCorrelations: { openness: 0.5, conscientiousness: 0.5 }
      });
    }

    return patterns;
  }

  /**
   * Detect mouse movement patterns (Big Five correlation)
   */
  detectMousePatterns(events) {
    const mouseEvents = events.filter(e => e.event_type === 'mouse_move' || e.event_type === 'mouse_click');
    if (mouseEvents.length === 0) return [];

    const patterns = [];

    // Calculate movement metrics
    const speeds = mouseEvents.map(e => e.event_data.speed || 0).filter(s => s > 0);
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const variance = this.calculateVariance(speeds);

    const clickEvents = mouseEvents.filter(e => e.event_type === 'mouse_click');
    const hesitations = clickEvents.filter(e => e.event_data.hesitation > THRESHOLDS.mouse.highHesitation).length;
    const hesitationRate = clickEvents.length > 0 ? hesitations / clickEvents.length : 0;

    // Pattern: Decision-making style (from mouse behavior research)
    if (variance < THRESHOLDS.mouse.smoothVariance && avgSpeed > THRESHOLDS.mouse.fastSpeed) {
      patterns.push({
        type: 'decision_making',
        name: 'Decisive Decision Maker',
        description: 'Smooth, fast mouse movements indicate confident, purposeful decisions',
        metrics: { avgSpeed, variance, hesitationRate },
        confidence: 0.80,
        personalityCorrelations: { extraversion: 0.6, conscientiousness: 0.5 }
      });
    } else if (variance > THRESHOLDS.mouse.erraticVariance) {
      patterns.push({
        type: 'decision_making',
        name: 'Exploratory Decision Maker',
        description: 'Erratic mouse movements suggest exploratory, creative thinking',
        metrics: { avgSpeed, variance, hesitationRate },
        confidence: 0.77,
        personalityCorrelations: { openness: 0.7, extraversion: 0.3 }
      });
    } else if (hesitationRate > 0.4) {
      patterns.push({
        type: 'decision_making',
        name: 'Deliberate Decision Maker',
        description: 'Hesitation before clicks indicates careful consideration',
        metrics: { avgSpeed, variance, hesitationRate },
        confidence: 0.83,
        personalityCorrelations: { conscientiousness: 0.7, neuroticism: 0.4 }
      });
    }

    return patterns;
  }

  /**
   * Detect scroll patterns (reading comprehension)
   */
  detectScrollPatterns(events) {
    const scrollEvents = events.filter(e => e.event_type === 'scroll');
    if (scrollEvents.length === 0) return [];

    const patterns = [];

    const speeds = scrollEvents.map(e => e.event_data.speed || 0).filter(s => s > 0);
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;

    const backScrolls = scrollEvents.filter(e => e.event_data.direction === 'up').length;
    const backScrollRate = scrollEvents.length > 0 ? backScrolls / scrollEvents.length : 0;

    // Pattern: Reading style
    if (avgSpeed < THRESHOLDS.scroll.readingSpeed && backScrollRate > THRESHOLDS.scroll.highBackscroll) {
      patterns.push({
        type: 'reading_style',
        name: 'Deep Reader',
        description: 'Slow scrolling with frequent back-tracking indicates deep reading and comprehension',
        metrics: { avgSpeed, backScrollRate },
        confidence: 0.81,
        personalityCorrelations: { openness: 0.6, conscientiousness: 0.5 }
      });
    } else if (avgSpeed > THRESHOLDS.scroll.skimmingSpeed && backScrollRate < 0.1) {
      patterns.push({
        type: 'reading_style',
        name: 'Scanner',
        description: 'Fast scrolling with minimal back-tracking suggests efficient information scanning',
        metrics: { avgSpeed, backScrollRate },
        confidence: 0.75,
        personalityCorrelations: { extraversion: 0.4, conscientiousness: -0.2 }
      });
    } else if (backScrollRate > 0.3) {
      patterns.push({
        type: 'reading_style',
        name: 'Careful Reader',
        description: 'High back-scrolling rate indicates thorough review and verification',
        metrics: { avgSpeed, backScrollRate },
        confidence: 0.79,
        personalityCorrelations: { conscientiousness: 0.7, neuroticism: 0.3 }
      });
    }

    return patterns;
  }

  /**
   * Detect focus and attention patterns
   */
  detectFocusPatterns(events) {
    const focusEvents = events.filter(e => e.event_type === 'focus');
    const tabSwitches = events.filter(e => e.event_type === 'tab_switch');

    const patterns = [];

    if (focusEvents.length === 0) return patterns;

    const focusDurations = focusEvents.map(e => e.duration_ms || 0).filter(d => d > 0);
    const avgFocusDuration = focusDurations.reduce((a, b) => a + b, 0) / focusDurations.length;
    const maxFocusDuration = Math.max(...focusDurations);

    const sessionDuration = events[events.length - 1].timestamp - events[0].timestamp;
    const multitaskingScore = sessionDuration > 0 ? Math.min(tabSwitches.length / (sessionDuration / 60000), 1) : 0;

    // Pattern: Work style
    if (avgFocusDuration > THRESHOLDS.focus.deepFocusDuration && multitaskingScore < THRESHOLDS.focus.lowMultitasking) {
      patterns.push({
        type: 'work_style',
        name: 'Deep Focus Worker',
        description: 'Long focus durations with minimal context switching indicates deep work capability',
        metrics: { avgFocusDuration, maxFocusDuration, multitaskingScore },
        confidence: 0.87,
        personalityCorrelations: { conscientiousness: 0.8, openness: 0.4 }
      });
    } else if (multitaskingScore > THRESHOLDS.focus.highMultitasking) {
      patterns.push({
        type: 'work_style',
        name: 'Multitasker',
        description: 'Frequent context switching suggests multitasking work style',
        metrics: { avgFocusDuration, multitaskingScore },
        confidence: 0.82,
        personalityCorrelations: { extraversion: 0.6, conscientiousness: -0.3 }
      });
    } else if (avgFocusDuration < THRESHOLDS.focus.shortAttentionSpan) {
      patterns.push({
        type: 'attention_pattern',
        name: 'Easily Distracted',
        description: 'Short focus durations indicate distractibility or high cognitive load',
        metrics: { avgFocusDuration, multitaskingScore },
        confidence: 0.76,
        personalityCorrelations: { neuroticism: 0.5, conscientiousness: -0.4 }
      });
    }

    return patterns;
  }

  /**
   * Detect temporal/circadian patterns
   */
  detectTemporalPatterns(events) {
    const patterns = [];

    // Group events by hour of day
    const hourCounts = {};
    events.forEach(event => {
      const hour = new Date(event.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    // Find peak productivity hours
    const hours = Object.keys(hourCounts).map(Number);
    const maxCount = Math.max(...Object.values(hourCounts));
    const peakHours = hours.filter(h => hourCounts[h] === maxCount);

    // Classify productivity pattern
    const morningActivity = hours.filter(h => h >= 6 && h < 12).reduce((sum, h) => sum + hourCounts[h], 0);
    const afternoonActivity = hours.filter(h => h >= 12 && h < 18).reduce((sum, h) => sum + hourCounts[h], 0);
    const eveningActivity = hours.filter(h => h >= 18 && h < 24).reduce((sum, h) => sum + hourCounts[h], 0);
    const nightActivity = hours.filter(h => h >= 0 && h < 6).reduce((sum, h) => sum + hourCounts[h], 0);

    const totalActivity = morningActivity + afternoonActivity + eveningActivity + nightActivity;

    if (morningActivity / totalActivity > 0.4) {
      patterns.push({
        type: 'productivity_rhythm',
        name: 'Morning Person',
        description: 'Peak activity in morning hours indicates morning productivity preference',
        metrics: { peakHours, morningActivity, totalActivity },
        confidence: 0.80,
        personalityCorrelations: { conscientiousness: 0.5 }
      });
    } else if (eveningActivity / totalActivity > 0.4) {
      patterns.push({
        type: 'productivity_rhythm',
        name: 'Evening Person',
        description: 'Peak activity in evening hours indicates evening productivity preference',
        metrics: { peakHours, eveningActivity, totalActivity },
        confidence: 0.80,
        personalityCorrelations: { openness: 0.4 }
      });
    } else if (nightActivity / totalActivity > 0.3) {
      patterns.push({
        type: 'productivity_rhythm',
        name: 'Night Owl',
        description: 'Significant night-time activity suggests night owl chronotype',
        metrics: { peakHours, nightActivity, totalActivity },
        confidence: 0.85,
        personalityCorrelations: { openness: 0.6, conscientiousness: -0.2 }
      });
    }

    return patterns;
  }

  /**
   * Infer Big Five personality traits from detected patterns
   */
  inferPersonalityTraits(patterns) {
    const traits = {
      openness: 0,
      conscientiousness: 0,
      extraversion: 0,
      agreeableness: 0,
      neuroticism: 0
    };

    const counts = { ...traits };

    // Aggregate personality correlations from all patterns
    patterns.forEach(pattern => {
      if (pattern.personalityCorrelations) {
        Object.keys(pattern.personalityCorrelations).forEach(trait => {
          if (traits.hasOwnProperty(trait)) {
            traits[trait] += pattern.personalityCorrelations[trait] * pattern.confidence;
            counts[trait] += pattern.confidence;
          }
        });
      }
    });

    // Normalize scores
    Object.keys(traits).forEach(trait => {
      if (counts[trait] > 0) {
        traits[trait] = traits[trait] / counts[trait];
      }
    });

    return {
      bigFive: traits,
      confidence: patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length,
      patternCount: patterns.length
    };
  }

  /**
   * Store detected patterns in database
   */
  async storePatterns(userId, sessionId, patterns) {
    try {
      const now = new Date().toISOString();

      const patternRecords = patterns.map(pattern => ({
        user_id: userId,
        pattern_type: pattern.type,
        pattern_name: pattern.name,
        pattern_description: pattern.description,
        pattern_metrics: pattern.metrics,
        confidence_score: pattern.confidence,
        sample_size: 1, // This session
        first_detected: now,
        last_confirmed: now,
        detection_frequency: 'new',
        personality_correlation: pattern.personalityCorrelations || {},
        behavioral_indicators: { sessionId },
        contexts: [],
        platforms: []
      }));

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('behavioral_patterns')
        .upsert(patternRecords, {
          onConflict: 'user_id,pattern_type,pattern_name',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        console.error('[Pattern Detection] Error storing patterns:', error);
        throw error;
      }

      console.log(`[Pattern Detection] Stored ${data.length} patterns`);

      return data;

    } catch (error) {
      console.error('[Pattern Detection] Error in storePatterns:', error);
      throw error;
    }
  }

  /**
   * Calculate statistical variance
   */
  calculateVariance(numbers) {
    if (numbers.length === 0) return 0;
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length);
  }
}

export default new PatternDetectionEngine();
