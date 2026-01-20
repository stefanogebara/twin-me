/**
 * Cross-Platform Inference Service
 *
 * Analyzes patterns across multiple platforms (Whoop, Spotify, Calendar)
 * to make intelligent inferences about life events and behaviors.
 *
 * Key Capabilities:
 * - Detect social/party nights from biometric + music patterns
 * - Identify stress periods from calendar + health data
 * - Recognize recovery days and travel periods
 * - Learn from user feedback to improve accuracy
 *
 * Philosophy: Correlation vs Causation
 * - We detect patterns but present them as observations, not facts
 * - Multiple data points increase confidence
 * - User can confirm/deny inferences to improve learning
 */

import { supabaseAdmin } from './database.js';

class CrossPlatformInferenceService {
  constructor() {
    // Confidence thresholds
    this.CONFIDENCE_THRESHOLD = 0.6; // Minimum confidence to show inference
    this.HIGH_CONFIDENCE = 0.85;     // High confidence threshold

    // Pattern weights for inference scoring
    this.weights = {
      nightOut: {
        lowRecovery: 0.25,          // Recovery < 34%
        lowHRV: 0.2,                // HRV significantly below baseline
        elevatedHR: 0.15,           // Resting HR above baseline
        lateSleep: 0.15,            // Sleep start after midnight
        shortSleep: 0.1,            // Sleep < 6 hours
        lateNightMusic: 0.1,        // Music listening after 10pm
        partyGenres: 0.05           // Party/dance/electronic genres
      },
      stressPeriod: {
        denseMeetings: 0.25,        // Many meetings in a day
        lowRecoveryMultiDay: 0.25,  // Low recovery for 2+ days
        anxiousMusicMood: 0.15,     // Sad/melancholic music patterns
        irregularSleep: 0.15,       // Sleep timing variance
        highStrain: 0.2             // High strain scores
      },
      recoveryDay: {
        noMeetings: 0.2,            // Empty calendar
        goodSleep: 0.25,            // Sleep > 7 hours
        calmMusic: 0.15,            // Low energy, acoustic music
        lowStrain: 0.2,             // Low strain score
        goodRecovery: 0.2           // Recovery > 67%
      },
      travel: {
        flightEvent: 0.3,           // Calendar shows flight/travel
        differentSleepTime: 0.25,   // Sleep time shifted significantly
        recoveryDisruption: 0.2,    // Recovery pattern disruption
        locationChange: 0.25        // If we detect location change
      }
    };
  }

  /**
   * Main inference method - analyzes cross-platform data
   */
  async inferBehavioralPatterns(userId, data) {
    console.log(`🔍 [CrossPlatform] Analyzing patterns for user ${userId}`);

    const { whoop, spotify, calendar } = data;
    const inferences = [];

    // Get user's baselines for comparison
    const baselines = await this.getUserBaselines(userId);

    // Run all inference detectors
    const nightOutInference = this.detectNightOut(whoop, spotify, calendar, baselines);
    const stressInference = this.detectStressPeriod(whoop, spotify, calendar, baselines);
    const recoveryInference = this.detectRecoveryDay(whoop, spotify, calendar, baselines);
    const travelInference = this.detectTravel(whoop, spotify, calendar, baselines);

    if (nightOutInference.confidence >= this.CONFIDENCE_THRESHOLD) {
      inferences.push(nightOutInference);
    }
    if (stressInference.confidence >= this.CONFIDENCE_THRESHOLD) {
      inferences.push(stressInference);
    }
    if (recoveryInference.confidence >= this.CONFIDENCE_THRESHOLD) {
      inferences.push(recoveryInference);
    }
    if (travelInference.confidence >= this.CONFIDENCE_THRESHOLD) {
      inferences.push(travelInference);
    }

    console.log(`📊 [CrossPlatform] Found ${inferences.length} behavioral patterns`);

    return inferences;
  }

  /**
   * Detect social night out / party pattern
   */
  detectNightOut(whoop, spotify, calendar, baselines) {
    const signals = {
      matched: [],
      unmatched: []
    };
    let score = 0;
    const weights = this.weights.nightOut;

    // 1. Low recovery (red zone)
    if (whoop?.recovery?.score < 34) {
      score += weights.lowRecovery;
      signals.matched.push({
        signal: 'lowRecovery',
        value: whoop.recovery.score,
        description: `Recovery is ${whoop.recovery.score}% (very low)`,
        weight: weights.lowRecovery
      });
    }

    // 2. Low HRV compared to baseline
    const hrvBaseline = baselines?.hrv || 50;
    if (whoop?.hrv && whoop.hrv < hrvBaseline * 0.7) {
      score += weights.lowHRV;
      signals.matched.push({
        signal: 'lowHRV',
        value: whoop.hrv,
        baseline: hrvBaseline,
        description: `HRV is ${Math.round(whoop.hrv)}ms (30%+ below your usual ${Math.round(hrvBaseline)}ms)`,
        weight: weights.lowHRV
      });
    }

    // 3. Elevated resting heart rate
    const rhrBaseline = baselines?.rhr || 60;
    if (whoop?.rhr && whoop.rhr > rhrBaseline * 1.15) {
      score += weights.elevatedHR;
      signals.matched.push({
        signal: 'elevatedHR',
        value: whoop.rhr,
        baseline: rhrBaseline,
        description: `Resting HR is ${whoop.rhr}bpm (elevated from your usual ${rhrBaseline}bpm)`,
        weight: weights.elevatedHR
      });
    }

    // 4. Late sleep start (after midnight)
    if (whoop?.sleep?.startTime) {
      const sleepHour = new Date(whoop.sleep.startTime).getHours();
      if (sleepHour >= 0 && sleepHour < 5) { // Midnight to 5am
        score += weights.lateSleep;
        signals.matched.push({
          signal: 'lateSleep',
          value: sleepHour,
          description: `Went to bed at ${sleepHour}:00am (much later than usual)`,
          weight: weights.lateSleep
        });
      }
    }

    // 5. Short sleep duration
    if (whoop?.sleep?.hours && whoop.sleep.hours < 6) {
      score += weights.shortSleep;
      signals.matched.push({
        signal: 'shortSleep',
        value: whoop.sleep.hours,
        description: `Only ${whoop.sleep.hours.toFixed(1)} hours of sleep`,
        weight: weights.shortSleep
      });
    }

    // 6. Late night music listening
    if (spotify?.recentListening) {
      const lateNightTracks = spotify.recentListening.filter(track => {
        const hour = new Date(track.playedAt).getHours();
        return hour >= 22 || hour < 4; // 10pm to 4am
      });
      if (lateNightTracks.length >= 3) {
        score += weights.lateNightMusic;
        signals.matched.push({
          signal: 'lateNightMusic',
          value: lateNightTracks.length,
          description: `${lateNightTracks.length} tracks played late at night`,
          weight: weights.lateNightMusic
        });
      }
    }

    // 7. Party/dance genres in recent listening
    if (spotify?.topGenres) {
      const partyGenres = ['dance', 'edm', 'electronic', 'house', 'party', 'hip hop', 'club'];
      const hasPartyGenres = spotify.topGenres.some(g =>
        partyGenres.some(pg => g.toLowerCase().includes(pg))
      );
      if (hasPartyGenres) {
        score += weights.partyGenres;
        signals.matched.push({
          signal: 'partyGenres',
          value: spotify.topGenres.filter(g =>
            partyGenres.some(pg => g.toLowerCase().includes(pg))
          ),
          description: 'Recent music includes party/dance genres',
          weight: weights.partyGenres
        });
      }
    }

    // 8. Calendar shows social event in the evening
    if (calendar?.events) {
      const socialKeywords = ['party', 'dinner', 'drinks', 'happy hour', 'birthday', 'celebration', 'concert', 'show', 'club'];
      const eveningSocialEvent = calendar.events.find(event => {
        const title = (event.title || event.summary || '').toLowerCase();
        const startHour = new Date(event.start_time || event.start?.dateTime).getHours();
        return startHour >= 18 && socialKeywords.some(kw => title.includes(kw));
      });
      if (eveningSocialEvent) {
        score += 0.15; // Bonus for calendar confirmation
        signals.matched.push({
          signal: 'socialEvent',
          value: eveningSocialEvent.title,
          description: `Calendar shows "${eveningSocialEvent.title}"`,
          weight: 0.15
        });
      }
    }

    const confidence = Math.min(score, 1.0);

    return {
      type: 'night_out',
      label: 'Social Night Out',
      confidence,
      isHighConfidence: confidence >= this.HIGH_CONFIDENCE,
      signals,
      summary: this.buildNightOutSummary(signals.matched, confidence),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Detect stress/overwork period
   */
  detectStressPeriod(whoop, spotify, calendar, baselines) {
    const signals = { matched: [], unmatched: [] };
    let score = 0;
    const weights = this.weights.stressPeriod;

    // 1. Dense meeting schedule (5+ meetings in a day)
    if (calendar?.events) {
      const today = new Date().toDateString();
      const todayMeetings = calendar.events.filter(e => {
        const eventDate = new Date(e.start_time || e.start?.dateTime).toDateString();
        return eventDate === today && (e.attendees?.length > 0 || e.type === 'meeting');
      });
      if (todayMeetings.length >= 5) {
        score += weights.denseMeetings;
        signals.matched.push({
          signal: 'denseMeetings',
          value: todayMeetings.length,
          description: `${todayMeetings.length} meetings today - very packed schedule`,
          weight: weights.denseMeetings
        });
      }
    }

    // 2. Consistently low recovery (would need historical data)
    if (whoop?.recovery?.score && whoop.recovery.score < 50) {
      score += weights.lowRecoveryMultiDay * 0.5; // Partial score without history
      signals.matched.push({
        signal: 'lowRecovery',
        value: whoop.recovery.score,
        description: `Recovery at ${whoop.recovery.score}% indicates accumulated stress`,
        weight: weights.lowRecoveryMultiDay * 0.5
      });
    }

    // 3. High strain
    if (whoop?.strain?.score && whoop.strain.score >= 14) {
      score += weights.highStrain;
      signals.matched.push({
        signal: 'highStrain',
        value: whoop.strain.score,
        description: `High strain of ${whoop.strain.score.toFixed(1)} (above optimal)`,
        weight: weights.highStrain
      });
    }

    // 4. Anxious/melancholic music patterns
    if (spotify?.audioFeatures?.averageValence < 0.3) {
      score += weights.anxiousMusicMood;
      signals.matched.push({
        signal: 'lowValenceMusic',
        value: spotify.audioFeatures.averageValence,
        description: 'Music listening trends toward sad/melancholic',
        weight: weights.anxiousMusicMood
      });
    }

    const confidence = Math.min(score, 1.0);

    return {
      type: 'stress_period',
      label: 'High Stress Period',
      confidence,
      isHighConfidence: confidence >= this.HIGH_CONFIDENCE,
      signals,
      summary: this.buildStressSummary(signals.matched, confidence),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Detect recovery/rest day
   */
  detectRecoveryDay(whoop, spotify, calendar, baselines) {
    const signals = { matched: [], unmatched: [] };
    let score = 0;
    const weights = this.weights.recoveryDay;

    // 1. Empty or light calendar
    if (calendar?.events) {
      const today = new Date().toDateString();
      const todayMeetings = calendar.events.filter(e => {
        const eventDate = new Date(e.start_time || e.start?.dateTime).toDateString();
        return eventDate === today;
      });
      if (todayMeetings.length <= 2) {
        score += weights.noMeetings;
        signals.matched.push({
          signal: 'lightSchedule',
          value: todayMeetings.length,
          description: `Only ${todayMeetings.length} events today - light schedule`,
          weight: weights.noMeetings
        });
      }
    }

    // 2. Good sleep
    if (whoop?.sleep?.hours && whoop.sleep.hours >= 7) {
      score += weights.goodSleep;
      signals.matched.push({
        signal: 'goodSleep',
        value: whoop.sleep.hours,
        description: `Got ${whoop.sleep.hours.toFixed(1)} hours of quality sleep`,
        weight: weights.goodSleep
      });
    }

    // 3. Good recovery score
    if (whoop?.recovery?.score >= 67) {
      score += weights.goodRecovery;
      signals.matched.push({
        signal: 'goodRecovery',
        value: whoop.recovery.score,
        description: `Recovery is ${whoop.recovery.score}% (green zone)`,
        weight: weights.goodRecovery
      });
    }

    // 4. Low strain
    if (whoop?.strain?.score && whoop.strain.score < 8) {
      score += weights.lowStrain;
      signals.matched.push({
        signal: 'lowStrain',
        value: whoop.strain.score,
        description: `Low strain of ${whoop.strain.score.toFixed(1)} - taking it easy`,
        weight: weights.lowStrain
      });
    }

    // 5. Calm/relaxing music
    if (spotify?.audioFeatures?.averageEnergy < 0.4) {
      score += weights.calmMusic;
      signals.matched.push({
        signal: 'calmMusic',
        value: spotify.audioFeatures.averageEnergy,
        description: 'Listening to calm, relaxing music',
        weight: weights.calmMusic
      });
    }

    const confidence = Math.min(score, 1.0);

    return {
      type: 'recovery_day',
      label: 'Recovery Day',
      confidence,
      isHighConfidence: confidence >= this.HIGH_CONFIDENCE,
      signals,
      summary: this.buildRecoverySummary(signals.matched, confidence),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Detect travel/timezone change
   */
  detectTravel(whoop, spotify, calendar, baselines) {
    const signals = { matched: [], unmatched: [] };
    let score = 0;
    const weights = this.weights.travel;

    // 1. Flight/travel in calendar
    if (calendar?.events) {
      const travelKeywords = ['flight', 'fly', 'airport', 'travel', 'trip', 'hotel', 'departure', 'arrival'];
      const travelEvent = calendar.events.find(e => {
        const title = (e.title || e.summary || '').toLowerCase();
        return travelKeywords.some(kw => title.includes(kw));
      });
      if (travelEvent) {
        score += weights.flightEvent;
        signals.matched.push({
          signal: 'travelEvent',
          value: travelEvent.title,
          description: `Calendar shows travel: "${travelEvent.title}"`,
          weight: weights.flightEvent
        });
      }
    }

    // 2. Significantly different sleep time (2+ hours shift)
    if (whoop?.sleep?.startTime && baselines?.sleepTime) {
      const currentSleepHour = new Date(whoop.sleep.startTime).getHours();
      const baselineSleepHour = baselines.sleepTime;
      const hourDiff = Math.abs(currentSleepHour - baselineSleepHour);
      if (hourDiff >= 2) {
        score += weights.differentSleepTime;
        signals.matched.push({
          signal: 'sleepTimeShift',
          value: hourDiff,
          description: `Sleep time shifted by ${hourDiff} hours from usual`,
          weight: weights.differentSleepTime
        });
      }
    }

    // 3. Recovery disruption pattern (low despite good sleep)
    if (whoop?.sleep?.hours >= 7 && whoop?.recovery?.score < 50) {
      score += weights.recoveryDisruption;
      signals.matched.push({
        signal: 'recoveryDisruption',
        value: { sleep: whoop.sleep.hours, recovery: whoop.recovery.score },
        description: 'Good sleep but low recovery - possible timezone/environment change',
        weight: weights.recoveryDisruption
      });
    }

    const confidence = Math.min(score, 1.0);

    return {
      type: 'travel',
      label: 'Travel/Timezone Change',
      confidence,
      isHighConfidence: confidence >= this.HIGH_CONFIDENCE,
      signals,
      summary: this.buildTravelSummary(signals.matched, confidence),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Build human-readable summary for night out inference
   */
  buildNightOutSummary(matchedSignals, confidence) {
    if (confidence < this.CONFIDENCE_THRESHOLD) {
      return null;
    }

    const signalDescriptions = matchedSignals.map(s => s.description);

    if (confidence >= this.HIGH_CONFIDENCE) {
      return `Your body is showing clear signs of a social night out. ${signalDescriptions.slice(0, 3).join('. ')}. Consider taking it easy today and prioritizing hydration and rest.`;
    }

    return `Based on your data, you may have had a late night or social event. ${signalDescriptions[0]}. Listen to your body and adjust your plans accordingly.`;
  }

  /**
   * Build human-readable summary for stress inference
   */
  buildStressSummary(matchedSignals, confidence) {
    if (confidence < this.CONFIDENCE_THRESHOLD) {
      return null;
    }

    const signalDescriptions = matchedSignals.map(s => s.description);

    if (confidence >= this.HIGH_CONFIDENCE) {
      return `Multiple indicators suggest you're in a high-stress period. ${signalDescriptions.slice(0, 3).join('. ')}. Consider scheduling breaks and protecting your recovery time.`;
    }

    return `Your schedule and biometrics suggest elevated stress. ${signalDescriptions[0]}. Pay attention to your rest and recovery.`;
  }

  /**
   * Build human-readable summary for recovery day inference
   */
  buildRecoverySummary(matchedSignals, confidence) {
    if (confidence < this.CONFIDENCE_THRESHOLD) {
      return null;
    }

    const signalDescriptions = matchedSignals.map(s => s.description);

    if (confidence >= this.HIGH_CONFIDENCE) {
      return `Great recovery day! ${signalDescriptions.slice(0, 3).join('. ')}. Your body is well-rested and ready for activity.`;
    }

    return `Looks like a good day for recovery. ${signalDescriptions[0]}.`;
  }

  /**
   * Build human-readable summary for travel inference
   */
  buildTravelSummary(matchedSignals, confidence) {
    if (confidence < this.CONFIDENCE_THRESHOLD) {
      return null;
    }

    const signalDescriptions = matchedSignals.map(s => s.description);

    if (confidence >= this.HIGH_CONFIDENCE) {
      return `Travel detected! ${signalDescriptions.slice(0, 3).join('. ')}. Allow extra time for your body to adjust to the new environment.`;
    }

    return `Possible travel or routine change. ${signalDescriptions[0]}. Give yourself grace as your body adjusts.`;
  }

  /**
   * Get user's baselines from historical data
   */
  async getUserBaselines(userId) {
    try {
      // Try to get from stored baselines
      const { data: baselines } = await supabaseAdmin
        .from('user_baselines')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (baselines) {
        return {
          hrv: baselines.avg_hrv,
          rhr: baselines.avg_rhr,
          sleepHours: baselines.avg_sleep_hours,
          sleepTime: baselines.typical_sleep_hour,
          recovery: baselines.avg_recovery
        };
      }

      // Return defaults if no baselines stored
      return {
        hrv: 50,
        rhr: 60,
        sleepHours: 7,
        sleepTime: 23, // 11pm
        recovery: 60
      };
    } catch {
      return {
        hrv: 50,
        rhr: 60,
        sleepHours: 7,
        sleepTime: 23,
        recovery: 60
      };
    }
  }

  /**
   * Store inference for learning/feedback
   */
  async storeInference(userId, inference) {
    try {
      const { data, error } = await supabaseAdmin
        .from('behavioral_inferences')
        .insert({
          user_id: userId,
          inference_type: inference.type,
          confidence: inference.confidence,
          signals: inference.signals,
          summary: inference.summary,
          is_confirmed: null, // User hasn't confirmed yet
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('[CrossPlatform] Failed to store inference:', error.message);
        return null;
      }

      return data;
    } catch (err) {
      console.error('[CrossPlatform] Error storing inference:', err.message);
      return null;
    }
  }

  /**
   * Record user feedback on inference (for learning)
   */
  async recordFeedback(inferenceId, isCorrect, actualEvent = null) {
    try {
      const { error } = await supabaseAdmin
        .from('behavioral_inferences')
        .update({
          is_confirmed: isCorrect,
          actual_event: actualEvent,
          feedback_at: new Date().toISOString()
        })
        .eq('id', inferenceId);

      if (error) {
        console.error('[CrossPlatform] Failed to record feedback:', error.message);
        return false;
      }

      console.log(`✅ [CrossPlatform] Feedback recorded: inference ${inferenceId} was ${isCorrect ? 'correct' : 'incorrect'}`);
      return true;
    } catch (err) {
      console.error('[CrossPlatform] Error recording feedback:', err.message);
      return false;
    }
  }

  /**
   * Format inferences for display in reflections
   */
  formatForReflection(inferences) {
    if (!inferences || inferences.length === 0) {
      return null;
    }

    // Filter to high-confidence inferences
    const significantInferences = inferences.filter(i => i.confidence >= this.CONFIDENCE_THRESHOLD);

    if (significantInferences.length === 0) {
      return null;
    }

    return {
      hasInferences: true,
      count: significantInferences.length,
      primary: significantInferences[0], // Most confident
      all: significantInferences,
      summaries: significantInferences.map(i => i.summary).filter(Boolean)
    };
  }
}

// Export singleton instance
export const crossPlatformInferenceService = new CrossPlatformInferenceService();
export default crossPlatformInferenceService;
