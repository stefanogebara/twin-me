/**
 * Mood Assessment Service — Pure Heuristic State Detection
 * ==========================================================
 * Maps health signals + calendar busyness + time of day to an
 * energy level for music selection and proactive skill triggers.
 *
 * Platform-agnostic: accepts a healthSignals object that can come from
 * Whoop (recovery), Oura (readiness), Garmin (body_battery), Fitbit
 * (sleep_score), Strava (activity), or any future health platform.
 *
 * Energy levels: calm | focused | energizing | power
 * Pure function, no LLM, no DB, <1ms.
 */

/**
 * Normalize different health platform signals to a 0-100 "energy readiness" score.
 * Higher = more recovered/ready. Returns null if no signal available.
 *
 * @param {Object} healthSignals - Platform-agnostic health metrics
 * @returns {{ score: number|null, source: string, label: string }}
 */
export function normalizeHealthScore(healthSignals = {}) {
  // Fallback chain: try each health metric in order of reliability
  // Whoop recovery (0-100 direct)
  if (healthSignals.recovery != null) {
    return { score: healthSignals.recovery, source: 'whoop', label: `recovery ${healthSignals.recovery}%` };
  }
  // Oura readiness (0-100 direct)
  if (healthSignals.readiness != null) {
    return { score: healthSignals.readiness, source: 'oura', label: `readiness ${healthSignals.readiness}` };
  }
  // Garmin Body Battery (0-100 direct)
  if (healthSignals.body_battery != null) {
    return { score: healthSignals.body_battery, source: 'garmin', label: `body battery ${healthSignals.body_battery}` };
  }
  // Fitbit sleep score (0-100 direct)
  if (healthSignals.sleep_score != null) {
    return { score: healthSignals.sleep_score, source: 'fitbit', label: `sleep score ${healthSignals.sleep_score}` };
  }
  // Sleep hours → approximate score (7-8h = 75-85, <6h = 40, >8h = 85)
  if (healthSignals.sleep_hours != null) {
    const h = healthSignals.sleep_hours;
    const score = h >= 8 ? 85 : h >= 7 ? 75 : h >= 6 ? 60 : 40;
    return { score, source: 'sleep', label: `${h.toFixed(1)}h sleep` };
  }
  // HRV as rough signal (higher = better recovered, normalize around 50ms baseline)
  if (healthSignals.hrv != null) {
    const score = Math.min(100, Math.max(20, healthSignals.hrv * 1.2));
    return { score: Math.round(score), source: 'hrv', label: `HRV ${healthSignals.hrv}ms` };
  }
  return { score: null, source: 'none', label: 'no health data' };
}

/**
 * Assess the user's current mood/energy state from available signals.
 *
 * @param {Object} params
 * @param {Object} params.healthSignals - Platform-agnostic health metrics
 *   Supported keys: recovery (Whoop), readiness (Oura), body_battery (Garmin),
 *   sleep_score (Fitbit), sleep_hours (any), hrv (any), strain (Whoop),
 *   steps (Garmin/Fitbit), stress (Garmin), activity_score (Oura)
 * @param {number} params.calendarEventCount - Number of events today
 * @param {number} params.currentHour - Current hour 0-23
 * @returns {{ energyLevel: string, reasoning: string, confidence: number, healthSource: string }}
 */
export function assessMood({ healthSignals = {}, calendarEventCount = 0, currentHour = 12 }) {
  // Late night override — always wind down
  if (currentHour >= 22 || currentHour < 6) {
    return {
      energyLevel: 'calm',
      reasoning: 'Late night — time to wind down',
      confidence: 0.9,
      healthSource: 'time',
    };
  }

  // Early morning — gentle start
  if (currentHour >= 6 && currentHour < 8) {
    return {
      energyLevel: 'focused',
      reasoning: 'Early morning — easing into the day',
      confidence: 0.8,
      healthSource: 'time',
    };
  }

  const busy = calendarEventCount >= 3;
  const hasMeetings = calendarEventCount >= 2;

  // Normalize health signals to a single 0-100 score
  const health = normalizeHealthScore(healthSignals);

  if (health.score != null) {
    if (health.score < 50) {
      return {
        energyLevel: 'calm',
        reasoning: `Low ${health.label} — take it easy${busy ? ', even with a packed day' : ''}`,
        confidence: 0.85,
        healthSource: health.source,
      };
    }

    if (health.score <= 70) {
      return {
        energyLevel: 'focused',
        reasoning: `Moderate ${health.label}${hasMeetings ? ' + meetings ahead' : ''} — steady focus mode`,
        confidence: 0.8,
        healthSource: health.source,
      };
    }

    // High score (>70)
    if (busy) {
      return {
        energyLevel: 'energizing',
        reasoning: `Great ${health.label} + busy day — fuel up`,
        confidence: 0.85,
        healthSource: health.source,
      };
    }

    return {
      energyLevel: 'power',
      reasoning: `Excellent ${health.label} + open schedule — go hard`,
      confidence: 0.9,
      healthSource: health.source,
    };
  }

  // No health data — fallback to time + calendar
  const isAfternoon = currentHour >= 12 && currentHour < 17;
  const isEvening = currentHour >= 17;

  if (isEvening) {
    return {
      energyLevel: busy ? 'focused' : 'calm',
      reasoning: `Evening${busy ? ' with events' : ''} — ${busy ? 'staying sharp' : 'winding down'}`,
      confidence: 0.6,
      healthSource: 'none',
    };
  }

  if (isAfternoon) {
    return {
      energyLevel: busy ? 'focused' : 'energizing',
      reasoning: `Afternoon${busy ? ' meetings' : ' free'} — ${busy ? 'stay locked in' : 'energy boost'}`,
      confidence: 0.6,
      healthSource: 'none',
    };
  }

  // Morning (8-12)
  if (busy) {
    return {
      energyLevel: 'focused',
      reasoning: 'Morning with meetings — focus mode',
      confidence: 0.65,
      healthSource: 'none',
    };
  }

  return {
    energyLevel: 'energizing',
    reasoning: 'Free morning — build momentum',
    confidence: 0.6,
    healthSource: 'none',
  };
}
