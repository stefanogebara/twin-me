/**
 * Purpose Learning Service
 *
 * A personalized learning system that learns from THIS USER's actual
 * behavior patterns, not generic rules. The system:
 * - Tracks when users override suggestions and learns from those choices
 * - Considers full calendar day load, not just next event
 * - Analyzes Spotify listening trends over time
 * - Tracks strain patterns over multiple days
 * - Builds personalized weights that improve with each interaction
 *
 * Learning Algorithm:
 * 1. Start with sensible defaults
 * 2. Track every suggestion vs. actual selection
 * 3. When user overrides, learn 2x faster (stronger signal)
 * 4. Discover recurring patterns automatically
 * 5. Increase confidence as more data accumulates
 */

import { supabaseAdmin } from './database.js';
import userContextAggregator from './userContextAggregator.js';

// Available purposes in the system
const PURPOSES = ['focus', 'workout', 'relax', 'party', 'sleep', 'general'];

// Default sensitivities for new users
const DEFAULT_ADJUSTMENTS = {
  recovery_sensitivity: 0.5,
  calendar_priority: 0.5,
  time_of_day_influence: 0.5,
  strain_awareness: 0.5,
  spotify_influence: 0.3
};

// Default context-to-purpose weights (baseline before learning)
const DEFAULT_CONTEXT_WEIGHTS = {
  // Recovery categories
  low_recovery: { relax: 0.7, sleep: 0.3, focus: -0.2, workout: -0.5 },
  medium_recovery: { relax: 0.3, focus: 0.2, general: 0.2 },
  high_recovery: { workout: 0.4, focus: 0.3, party: 0.2 },

  // Time categories
  early_morning: { focus: 0.4, workout: 0.3 },
  morning: { focus: 0.5, workout: 0.3 },
  afternoon: { focus: 0.3, general: 0.3 },
  evening: { relax: 0.4, party: 0.2 },
  late_night: { sleep: 0.6, relax: 0.3 },

  // Calendar states
  busy_day: { focus: 0.5 },
  light_day: { general: 0.3, relax: 0.2 },
  has_meeting_soon: { focus: 0.4 },
  has_workout_soon: { workout: 0.6 },
  has_presentation_soon: { focus: 0.5 },

  // Strain patterns
  high_strain_trend: { relax: 0.5, sleep: 0.2, workout: -0.4 },
  moderate_strain: { general: 0.3 },

  // Spotify mood states
  energetic_mood: { workout: 0.3, party: 0.2 },
  calm_mood: { relax: 0.3, focus: 0.2, sleep: 0.2 },
  focused_mood: { focus: 0.4 }
};

// Learning rate for weight adjustments
const LEARNING_RATE = 0.1;
const OVERRIDE_LEARNING_MULTIPLIER = 2.0;
const MIN_FEEDBACK_FOR_CONFIDENCE = 5;
const PATTERN_DISCOVERY_THRESHOLD = 3;

class PurposeLearningService {
  constructor() {
    this.CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
    this.weightsCache = new Map();
    this.patternsCache = new Map();
  }

  /**
   * Main entry point: Get personalized purpose suggestion
   * Returns suggestion with confidence and reasoning
   */
  async detectOptimalPurpose(userId, providedContext = null) {
    console.log(`🎯 [Purpose Learning] Detecting optimal purpose for user ${userId}`);

    try {
      // Get user context if not provided
      const context = providedContext || await userContextAggregator.aggregateUserContext(userId);

      // Load user's learned weights (or defaults)
      const userWeights = await this.getUserWeights(userId);

      // Load user's discovered patterns
      const patterns = await this.getUserPatterns(userId);

      // Extract features from current context
      const features = this.extractContextFeatures(context);
      console.log(`📊 [Purpose Learning] Extracted features:`, features);

      // Check patterns first - high confidence patterns take priority
      const patternMatch = this.checkPatterns(features, patterns);
      if (patternMatch && patternMatch.confidence >= 0.8) {
        console.log(`✨ [Purpose Learning] Pattern match: ${patternMatch.patternName} -> ${patternMatch.purpose}`);
        return {
          success: true,
          suggestion: patternMatch.purpose,
          confidence: patternMatch.confidence,
          reason: patternMatch.description || `You usually pick ${patternMatch.purpose} in this situation`,
          source: 'learned_pattern',
          patternName: patternMatch.patternName,
          feedbackCount: userWeights.total_feedback_count || 0,
          features
        };
      }

      // Calculate weighted scores for each purpose
      const scores = this.calculatePurposeScores(features, userWeights);
      console.log(`📈 [Purpose Learning] Purpose scores:`, scores);

      // Find the best purpose
      const sortedPurposes = Object.entries(scores)
        .sort(([, a], [, b]) => b - a);

      const [bestPurpose, bestScore] = sortedPurposes[0];
      const [secondPurpose, secondScore] = sortedPurposes[1] || ['general', 0];

      // Calculate confidence based on score difference and feedback count
      const scoreDiff = bestScore - secondScore;
      const feedbackConfidence = Math.min(1, (userWeights.total_feedback_count || 0) / 30);
      const scoreConfidence = Math.min(1, scoreDiff / 0.5);
      const confidence = Math.round((feedbackConfidence * 0.4 + scoreConfidence * 0.6) * 100) / 100;

      // Generate human-readable reason
      const reason = this.generateReason(features, bestPurpose, userWeights);

      return {
        success: true,
        suggestion: bestPurpose,
        confidence: Math.max(0.3, confidence), // Minimum 30% confidence
        reason,
        source: userWeights.total_feedback_count > 0 ? 'personalized' : 'default',
        feedbackCount: userWeights.total_feedback_count || 0,
        alternativeSuggestion: secondPurpose !== bestPurpose ? secondPurpose : null,
        features,
        scores
      };

    } catch (error) {
      console.error(`❌ [Purpose Learning] Error detecting purpose:`, error);
      return {
        success: false,
        suggestion: 'general',
        confidence: 0.3,
        reason: 'Based on current time',
        source: 'fallback',
        error: error.message
      };
    }
  }

  /**
   * Extract context features from aggregated user context
   */
  extractContextFeatures(context) {
    const features = {};
    const now = new Date();
    const hour = now.getHours();

    // Time of day
    features.hour = hour;
    if (hour >= 5 && hour < 8) features.timeCategory = 'early_morning';
    else if (hour >= 8 && hour < 12) features.timeCategory = 'morning';
    else if (hour >= 12 && hour < 17) features.timeCategory = 'afternoon';
    else if (hour >= 17 && hour < 22) features.timeCategory = 'evening';
    else features.timeCategory = 'late_night';

    features.dayOfWeek = now.getDay();
    features.isWeekend = features.dayOfWeek === 0 || features.dayOfWeek === 6;

    // Recovery from Whoop
    const recovery = context.whoop?.recovery?.score ?? context.whoop?.recovery;
    if (recovery !== undefined && recovery !== null) {
      features.recovery = recovery;
      if (recovery < 34) features.recoveryCategory = 'low_recovery';
      else if (recovery < 67) features.recoveryCategory = 'medium_recovery';
      else features.recoveryCategory = 'high_recovery';
    }

    // Strain from Whoop
    const strain = context.whoop?.strain?.score ?? context.whoop?.strain;
    if (strain !== undefined && strain !== null) {
      features.strain = strain;
      if (strain > 14) features.strainLevel = 'high';
      else if (strain > 8) features.strainLevel = 'moderate';
      else features.strainLevel = 'light';
    }

    // Sleep
    const sleepHours = context.whoop?.sleep?.hours ?? context.whoop?.sleepHours;
    if (sleepHours !== undefined) {
      features.sleepHours = sleepHours;
      features.wellRested = sleepHours >= 7;
    }

    // Calendar - analyze full day load
    const events = context.calendar?.events || context.calendar?.upcomingEvents || [];
    const todayEvents = this.filterTodayEvents(events);

    features.eventsToday = todayEvents.length;
    if (todayEvents.length >= 5) features.calendarBusyness = 'busy_day';
    else if (todayEvents.length <= 1) features.calendarBusyness = 'light_day';
    else features.calendarBusyness = 'moderate_day';

    // Next event analysis
    const nextEvent = context.calendar?.nextEvent;
    if (nextEvent) {
      const eventTime = new Date(nextEvent.startTime || nextEvent.start);
      const isToday = this.isEventToday(eventTime);

      if (isToday) {
        const minutesUntil = Math.floor((eventTime.getTime() - now.getTime()) / (1000 * 60));
        if (minutesUntil > 0 && minutesUntil <= 120) {
          features.minutesUntilEvent = minutesUntil;
          features.nextEventType = nextEvent.type || this.classifyEventType(nextEvent.title);

          if (features.nextEventType === 'meeting' || features.nextEventType === 'presentation') {
            features.hasUpcomingMeeting = true;
          }
          if (features.nextEventType === 'workout') {
            features.hasUpcomingWorkout = true;
          }
        }
      }
    }

    // Spotify mood
    if (context.spotify?.currentMood) {
      const energy = context.spotify.currentMood.energy;
      const valence = context.spotify.currentMood.valence;

      features.spotifyEnergy = energy;
      features.spotifyValence = valence;

      if (energy > 0.7) features.spotifyMood = 'energetic_mood';
      else if (energy < 0.4 && valence < 0.4) features.spotifyMood = 'calm_mood';
      else if (energy > 0.5 && valence < 0.5) features.spotifyMood = 'focused_mood';
    }

    return features;
  }

  /**
   * Calculate purpose scores based on features and learned weights
   */
  calculatePurposeScores(features, userWeights) {
    const scores = {};
    PURPOSES.forEach(p => scores[p] = 0);

    const contextWeights = userWeights.context_weights || DEFAULT_CONTEXT_WEIGHTS;
    const adjustments = userWeights.user_adjustments || DEFAULT_ADJUSTMENTS;

    // Apply time of day weights
    if (features.timeCategory && contextWeights[features.timeCategory]) {
      this.applyWeights(scores, contextWeights[features.timeCategory], adjustments.time_of_day_influence);
    }

    // Apply recovery weights (with sensitivity)
    if (features.recoveryCategory && contextWeights[features.recoveryCategory]) {
      this.applyWeights(scores, contextWeights[features.recoveryCategory], adjustments.recovery_sensitivity);
    }

    // Apply calendar weights
    if (features.calendarBusyness && contextWeights[features.calendarBusyness]) {
      this.applyWeights(scores, contextWeights[features.calendarBusyness], adjustments.calendar_priority);
    }

    // Apply upcoming event weights (higher priority)
    if (features.hasUpcomingWorkout && contextWeights.has_workout_soon) {
      this.applyWeights(scores, contextWeights.has_workout_soon, 1.5);
    }
    if (features.hasUpcomingMeeting && contextWeights.has_meeting_soon) {
      this.applyWeights(scores, contextWeights.has_meeting_soon, 1.3);
    }

    // Apply strain trend weights
    if (features.strainLevel === 'high' && contextWeights.high_strain_trend) {
      this.applyWeights(scores, contextWeights.high_strain_trend, adjustments.strain_awareness);
    }

    // Apply Spotify mood weights
    if (features.spotifyMood && contextWeights[features.spotifyMood]) {
      this.applyWeights(scores, contextWeights[features.spotifyMood], adjustments.spotify_influence);
    }

    // Normalize scores to 0-1 range
    const maxScore = Math.max(...Object.values(scores), 0.01);
    const minScore = Math.min(...Object.values(scores), 0);
    Object.keys(scores).forEach(p => {
      scores[p] = (scores[p] - minScore) / (maxScore - minScore + 0.01);
    });

    return scores;
  }

  /**
   * Apply weights to scores with a multiplier
   */
  applyWeights(scores, weights, multiplier = 1) {
    if (!weights) return;
    Object.entries(weights).forEach(([purpose, weight]) => {
      if (scores.hasOwnProperty(purpose)) {
        scores[purpose] += weight * multiplier;
      }
    });
  }

  /**
   * Check for matching learned patterns
   */
  checkPatterns(features, patterns) {
    if (!patterns || patterns.length === 0) return null;

    for (const pattern of patterns) {
      if (!pattern.is_active) continue;

      const conditions = pattern.context_conditions || {};
      let matches = true;

      // Check each condition
      for (const [key, condition] of Object.entries(conditions)) {
        const featureValue = features[key];

        if (typeof condition === 'object' && condition !== null) {
          // Range check
          if (condition.min !== undefined && featureValue < condition.min) matches = false;
          if (condition.max !== undefined && featureValue > condition.max) matches = false;
        } else {
          // Exact match
          if (featureValue !== condition) matches = false;
        }

        if (!matches) break;
      }

      if (matches) {
        return {
          patternName: pattern.pattern_name,
          purpose: pattern.recommended_purpose,
          confidence: pattern.pattern_confidence || 0.5,
          description: pattern.pattern_description
        };
      }
    }

    return null;
  }

  /**
   * Generate human-readable reason for suggestion
   */
  generateReason(features, purpose, userWeights) {
    const reasons = [];
    const feedbackCount = userWeights.total_feedback_count || 0;

    // Recovery-based reasons
    if (features.recovery !== undefined) {
      if (features.recoveryCategory === 'low_recovery') {
        reasons.push(`${features.recovery}% recovery - take it easy`);
      } else if (features.recoveryCategory === 'high_recovery' && purpose === 'workout') {
        reasons.push(`${features.recovery}% recovery - great day for activity`);
      } else if (features.recoveryCategory === 'medium_recovery') {
        reasons.push(`${features.recovery}% recovery`);
      }
    }

    // Calendar-based reasons
    if (features.hasUpcomingWorkout) {
      reasons.push(`workout coming up`);
    } else if (features.hasUpcomingMeeting) {
      reasons.push(`meeting in ${features.minutesUntilEvent} min`);
    } else if (features.calendarBusyness === 'busy_day') {
      reasons.push(`${features.eventsToday} events today`);
    }

    // Time-based reasons
    if (features.timeCategory === 'late_night') {
      reasons.push(`late night`);
    } else if (features.timeCategory === 'early_morning') {
      reasons.push(`early morning`);
    }

    // Personalization indicator
    if (feedbackCount >= 10) {
      reasons.push(`personalized (${feedbackCount} selections)`);
    }

    // Default reason if nothing specific
    if (reasons.length === 0) {
      if (feedbackCount > 0) {
        reasons.push(`based on your preferences`);
      } else {
        reasons.push(`based on current time`);
      }
    }

    return reasons.join(' | ');
  }

  /**
   * Record a purpose selection for learning
   */
  async recordSelection(userId, selectionData) {
    const {
      suggestedPurpose,
      suggestedConfidence,
      selectedPurpose,
      contextSnapshot,
      overrideReason
    } = selectionData;

    const wasOverride = suggestedPurpose !== selectedPurpose;

    console.log(`📝 [Purpose Learning] Recording selection: suggested=${suggestedPurpose}, selected=${selectedPurpose}, override=${wasOverride}`);

    try {
      // Insert feedback record
      const { data: feedback, error } = await supabaseAdmin
        .from('purpose_selection_feedback')
        .insert({
          user_id: userId,
          suggested_purpose: suggestedPurpose,
          suggested_confidence: suggestedConfidence,
          selected_purpose: selectedPurpose,
          was_override: wasOverride,
          context_snapshot: contextSnapshot || {},
          override_reason: overrideReason
        })
        .select()
        .single();

      if (error) throw error;

      // Trigger async learning (don't block the response)
      this.learnFromSelection(userId, {
        suggestedPurpose,
        selectedPurpose,
        wasOverride,
        contextSnapshot
      }).catch(err => {
        console.error(`❌ [Purpose Learning] Async learning error:`, err);
      });

      return { success: true, feedbackId: feedback.id, wasOverride };

    } catch (error) {
      console.error(`❌ [Purpose Learning] Record selection error:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Learn from a selection - update weights incrementally
   */
  async learnFromSelection(userId, feedback) {
    const { suggestedPurpose, selectedPurpose, wasOverride, contextSnapshot } = feedback;

    console.log(`🧠 [Purpose Learning] Learning from selection for user ${userId}`);

    try {
      // Get or create user weights
      let userWeights = await this.getUserWeights(userId, true); // Force refresh

      const contextWeights = userWeights.context_weights || {};
      const learningMultiplier = wasOverride ? OVERRIDE_LEARNING_MULTIPLIER : 1.0;

      // Extract features from context snapshot
      const features = contextSnapshot.features || this.extractContextFeatures(contextSnapshot);

      // Update weights for relevant context features
      const contextKeys = [
        features.timeCategory,
        features.recoveryCategory,
        features.calendarBusyness,
        features.spotifyMood
      ].filter(Boolean);

      for (const contextKey of contextKeys) {
        if (!contextWeights[contextKey]) {
          contextWeights[contextKey] = {};
        }

        // Increase weight for selected purpose
        const currentWeight = contextWeights[contextKey][selectedPurpose] || 0;
        contextWeights[contextKey][selectedPurpose] = currentWeight + (LEARNING_RATE * learningMultiplier);

        // If override, decrease weight for wrongly suggested purpose
        if (wasOverride) {
          const wrongWeight = contextWeights[contextKey][suggestedPurpose] || 0;
          contextWeights[contextKey][suggestedPurpose] = wrongWeight - (LEARNING_RATE * 0.5);
        }
      }

      // Update feedback count and override rate
      const newFeedbackCount = (userWeights.total_feedback_count || 0) + 1;

      // Calculate new override rate
      const { data: overrides } = await supabaseAdmin
        .from('purpose_selection_feedback')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .eq('was_override', true);

      const overrideCount = overrides?.length || 0;
      const overrideRate = newFeedbackCount > 0 ? overrideCount / newFeedbackCount : 0;

      // Calculate confidence level
      const confidenceLevel = Math.min(1, newFeedbackCount / 30);

      // Upsert weights
      const { error } = await supabaseAdmin
        .from('user_purpose_weights')
        .upsert({
          user_id: userId,
          context_weights: contextWeights,
          user_adjustments: userWeights.user_adjustments || DEFAULT_ADJUSTMENTS,
          total_feedback_count: newFeedbackCount,
          override_rate: Math.round(overrideRate * 1000) / 1000,
          confidence_level: Math.round(confidenceLevel * 100) / 100,
          last_learned_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      // Clear cache
      this.weightsCache.delete(userId);

      // Attempt pattern discovery
      await this.discoverPatterns(userId);

      console.log(`✅ [Purpose Learning] Updated weights: feedback_count=${newFeedbackCount}, override_rate=${overrideRate.toFixed(3)}`);

    } catch (error) {
      console.error(`❌ [Purpose Learning] Learning error:`, error);
    }
  }

  /**
   * Discover recurring patterns from user's selection history
   */
  async discoverPatterns(userId) {
    console.log(`🔍 [Purpose Learning] Discovering patterns for user ${userId}`);

    try {
      // Get recent feedback with context
      const { data: recentFeedback, error } = await supabaseAdmin
        .from('purpose_selection_feedback')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error || !recentFeedback || recentFeedback.length < PATTERN_DISCOVERY_THRESHOLD) {
        return;
      }

      // Group by context conditions to find patterns
      const patternCandidates = {};

      for (const fb of recentFeedback) {
        const features = fb.context_snapshot?.features || {};
        const purpose = fb.selected_purpose;

        // Create pattern keys from feature combinations
        const patternKeys = [];

        // Recovery + time patterns
        if (features.recoveryCategory && features.timeCategory) {
          patternKeys.push(`${features.recoveryCategory}_${features.timeCategory}`);
        }

        // Calendar + time patterns
        if (features.calendarBusyness && features.timeCategory) {
          patternKeys.push(`${features.calendarBusyness}_${features.timeCategory}`);
        }

        // Upcoming event patterns
        if (features.hasUpcomingWorkout) {
          patternKeys.push('pre_workout');
        }
        if (features.hasUpcomingMeeting) {
          patternKeys.push('pre_meeting');
        }

        for (const key of patternKeys) {
          if (!patternCandidates[key]) {
            patternCandidates[key] = { counts: {}, total: 0, features };
          }
          patternCandidates[key].counts[purpose] = (patternCandidates[key].counts[purpose] || 0) + 1;
          patternCandidates[key].total++;
        }
      }

      // Find strong patterns (>60% consistency, minimum observations)
      for (const [patternKey, data] of Object.entries(patternCandidates)) {
        if (data.total < PATTERN_DISCOVERY_THRESHOLD) continue;

        const [topPurpose, topCount] = Object.entries(data.counts)
          .sort(([, a], [, b]) => b - a)[0];

        const successRate = topCount / data.total;

        if (successRate >= 0.6) {
          // Create or update pattern
          const contextConditions = this.buildPatternConditions(patternKey, data.features);

          await supabaseAdmin
            .from('purpose_context_patterns')
            .upsert({
              user_id: userId,
              pattern_name: patternKey,
              pattern_description: this.generatePatternDescription(patternKey, topPurpose),
              context_conditions: contextConditions,
              recommended_purpose: topPurpose,
              pattern_confidence: Math.round(successRate * 100) / 100,
              match_count: data.total,
              follow_count: topCount,
              success_rate: Math.round(successRate * 1000) / 1000,
              is_active: true
            }, {
              onConflict: 'user_id,pattern_name'
            });

          console.log(`✨ [Purpose Learning] Pattern discovered: ${patternKey} -> ${topPurpose} (${Math.round(successRate * 100)}%)`);
        }
      }

      // Clear patterns cache
      this.patternsCache.delete(userId);

    } catch (error) {
      console.error(`❌ [Purpose Learning] Pattern discovery error:`, error);
    }
  }

  /**
   * Build context conditions object for a pattern
   */
  buildPatternConditions(patternKey, features) {
    const conditions = {};

    if (patternKey.includes('low_recovery')) {
      conditions.recovery = { min: 0, max: 33 };
    } else if (patternKey.includes('medium_recovery')) {
      conditions.recovery = { min: 34, max: 66 };
    } else if (patternKey.includes('high_recovery')) {
      conditions.recovery = { min: 67, max: 100 };
    }

    if (patternKey.includes('early_morning')) {
      conditions.hour = { min: 5, max: 7 };
    } else if (patternKey.includes('morning')) {
      conditions.hour = { min: 8, max: 11 };
    } else if (patternKey.includes('afternoon')) {
      conditions.hour = { min: 12, max: 16 };
    } else if (patternKey.includes('evening')) {
      conditions.hour = { min: 17, max: 21 };
    } else if (patternKey.includes('late_night')) {
      conditions.hour = { min: 22, max: 4 };
    }

    if (patternKey.includes('busy_day')) {
      conditions.eventsToday = { min: 5 };
    } else if (patternKey.includes('light_day')) {
      conditions.eventsToday = { max: 1 };
    }

    if (patternKey === 'pre_workout') {
      conditions.hasUpcomingWorkout = true;
    }
    if (patternKey === 'pre_meeting') {
      conditions.hasUpcomingMeeting = true;
    }

    return conditions;
  }

  /**
   * Generate human-readable pattern description
   */
  generatePatternDescription(patternKey, purpose) {
    const descriptions = {
      'low_recovery_morning': `When recovery is low in the morning, you pick ${purpose}`,
      'low_recovery_evening': `Low recovery evenings mean ${purpose} time`,
      'high_recovery_morning': `High recovery mornings call for ${purpose}`,
      'busy_day_morning': `Busy mornings mean ${purpose} for you`,
      'light_day_afternoon': `Light afternoons are for ${purpose}`,
      'pre_workout': `Before workouts, you go with ${purpose}`,
      'pre_meeting': `Pre-meeting ritual: ${purpose}`
    };

    return descriptions[patternKey] || `You usually pick ${purpose} in this situation`;
  }

  /**
   * Get user's purpose patterns
   */
  async getUserPatterns(userId) {
    // Check cache
    const cached = this.patternsCache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.patterns;
    }

    try {
      const { data: patterns, error } = await supabaseAdmin
        .from('purpose_context_patterns')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('pattern_confidence', { ascending: false });

      if (error) throw error;

      this.patternsCache.set(userId, {
        timestamp: Date.now(),
        patterns: patterns || []
      });

      return patterns || [];

    } catch (error) {
      console.error(`❌ [Purpose Learning] Get patterns error:`, error);
      return [];
    }
  }

  /**
   * Get user's learned weights
   */
  async getUserWeights(userId, forceRefresh = false) {
    // Check cache
    if (!forceRefresh) {
      const cached = this.weightsCache.get(userId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        return cached.weights;
      }
    }

    try {
      const { data: weights, error } = await supabaseAdmin
        .from('user_purpose_weights')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        throw error;
      }

      const userWeights = weights || {
        context_weights: DEFAULT_CONTEXT_WEIGHTS,
        user_adjustments: DEFAULT_ADJUSTMENTS,
        total_feedback_count: 0,
        override_rate: 0,
        confidence_level: 0.5
      };

      this.weightsCache.set(userId, {
        timestamp: Date.now(),
        weights: userWeights
      });

      return userWeights;

    } catch (error) {
      console.error(`❌ [Purpose Learning] Get weights error:`, error);
      return {
        context_weights: DEFAULT_CONTEXT_WEIGHTS,
        user_adjustments: DEFAULT_ADJUSTMENTS,
        total_feedback_count: 0,
        override_rate: 0,
        confidence_level: 0.5
      };
    }
  }

  /**
   * Get learning stats for a user
   */
  async getLearningStats(userId) {
    try {
      const [weights, patterns, recentFeedback] = await Promise.all([
        this.getUserWeights(userId),
        this.getUserPatterns(userId),
        supabaseAdmin
          .from('purpose_selection_feedback')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10)
      ]);

      return {
        success: true,
        stats: {
          totalFeedback: weights.total_feedback_count || 0,
          overrideRate: weights.override_rate || 0,
          confidenceLevel: weights.confidence_level || 0.5,
          patternsDiscovered: patterns.length,
          lastLearned: weights.last_learned_at
        },
        patterns: patterns.map(p => ({
          name: p.pattern_name,
          description: p.pattern_description,
          purpose: p.recommended_purpose,
          confidence: p.pattern_confidence,
          matchCount: p.match_count
        })),
        recentSelections: (recentFeedback.data || []).map(f => ({
          suggested: f.suggested_purpose,
          selected: f.selected_purpose,
          wasOverride: f.was_override,
          createdAt: f.created_at
        }))
      };

    } catch (error) {
      console.error(`❌ [Purpose Learning] Get stats error:`, error);
      return { success: false, error: error.message };
    }
  }

  // ============= Helper Methods =============

  /**
   * Filter events to only include today's events
   */
  filterTodayEvents(events) {
    const today = new Date();
    return events.filter(event => {
      const eventTime = new Date(event.startTime || event.start_time || event.start);
      return this.isEventToday(eventTime);
    });
  }

  /**
   * Check if a date is today
   */
  isEventToday(date) {
    const today = new Date();
    return date.getFullYear() === today.getFullYear() &&
           date.getMonth() === today.getMonth() &&
           date.getDate() === today.getDate();
  }

  /**
   * Classify event type from title
   */
  classifyEventType(title) {
    if (!title) return 'general';
    const lower = title.toLowerCase();

    if (/meeting|standup|sync|1:1/i.test(lower)) return 'meeting';
    if (/presentation|demo|pitch/i.test(lower)) return 'presentation';
    if (/workout|gym|run|yoga|fitness/i.test(lower)) return 'workout';
    if (/class|lecture|course/i.test(lower)) return 'learning';

    return 'general';
  }

  /**
   * Clear caches for a user
   */
  clearCache(userId) {
    this.weightsCache.delete(userId);
    this.patternsCache.delete(userId);
  }
}

// Export singleton
const purposeLearningService = new PurposeLearningService();
export default purposeLearningService;
