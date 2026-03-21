/**
 * Mood Assessment Service — Pure Heuristic State Detection
 * ==========================================================
 * Maps Whoop recovery + calendar busyness + time of day to an
 * energy level for music selection. Pure function, no LLM, no DB, <1ms.
 *
 * Energy levels: calm | focused | energizing | power
 *
 * Used by Music Mood Match skill to pick the right playlist.
 */

/**
 * Assess the user's current mood/energy state from available signals.
 *
 * @param {Object} params
 * @param {number|null} params.recoveryScore - Whoop recovery 0-100 (null if unavailable)
 * @param {number|null} params.sleepHours - Hours slept (null if unavailable)
 * @param {number} params.calendarEventCount - Number of events today
 * @param {number} params.currentHour - Current hour 0-23
 * @returns {{ energyLevel: string, reasoning: string, confidence: number }}
 */
export function assessMood({ recoveryScore = null, sleepHours = null, calendarEventCount = 0, currentHour = 12 }) {
  // Late night override — always wind down
  if (currentHour >= 22 || currentHour < 6) {
    return {
      energyLevel: 'calm',
      reasoning: 'Late night — time to wind down',
      confidence: 0.9,
    };
  }

  // Early morning — gentle start
  if (currentHour >= 6 && currentHour < 8) {
    return {
      energyLevel: 'focused',
      reasoning: 'Early morning — easing into the day',
      confidence: 0.8,
    };
  }

  const busy = calendarEventCount >= 3;
  const hasMeetings = calendarEventCount >= 2;

  // Whoop data available — primary signal
  if (recoveryScore != null) {
    if (recoveryScore < 50) {
      return {
        energyLevel: 'calm',
        reasoning: `Low recovery (${recoveryScore}%) — take it easy${busy ? ', even with a packed day' : ''}`,
        confidence: 0.85,
      };
    }

    if (recoveryScore <= 70) {
      return {
        energyLevel: 'focused',
        reasoning: `Moderate recovery (${recoveryScore}%)${hasMeetings ? ' + meetings ahead' : ''} — steady focus mode`,
        confidence: 0.8,
      };
    }

    // High recovery (>70)
    if (busy) {
      return {
        energyLevel: 'energizing',
        reasoning: `Great recovery (${recoveryScore}%) + busy day — fuel up`,
        confidence: 0.85,
      };
    }

    return {
      energyLevel: 'power',
      reasoning: `Excellent recovery (${recoveryScore}%) + open schedule — go hard`,
      confidence: 0.9,
    };
  }

  // No Whoop data — fallback to time + calendar
  const isAfternoon = currentHour >= 12 && currentHour < 17;
  const isEvening = currentHour >= 17;

  if (isEvening) {
    return {
      energyLevel: busy ? 'focused' : 'calm',
      reasoning: `Evening${busy ? ' with events' : ''} — ${busy ? 'staying sharp' : 'winding down'}`,
      confidence: 0.6,
    };
  }

  if (isAfternoon) {
    return {
      energyLevel: busy ? 'focused' : 'energizing',
      reasoning: `Afternoon${busy ? ' meetings' : ' free'} — ${busy ? 'stay locked in' : 'energy boost'}`,
      confidence: 0.6,
    };
  }

  // Morning (8-12)
  if (busy) {
    return {
      energyLevel: 'focused',
      reasoning: 'Morning with meetings — focus mode',
      confidence: 0.65,
    };
  }

  return {
    energyLevel: 'energizing',
    reasoning: 'Free morning — build momentum',
    confidence: 0.6,
  };
}
