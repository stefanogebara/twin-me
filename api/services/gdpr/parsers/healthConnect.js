/**
 * GDPR parser: Android Health Connect (legacy sync format).
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

// ---------------------------------------------------------------------------
// Android Health Connect parser
// ---------------------------------------------------------------------------
//
// Input JSON format (written by the Android HealthConnectModule, see REQUIRES MOBILE REBUILD):
// {
//   "userId": "...",
//   "extractedAt": "...",
//   "healthConnect": {
//     "steps_7d":        [{ date: "YYYY-MM-DD", count: number }],
//     "sleep_7d":        [{ date: "YYYY-MM-DD", durationHours: number, startHour: number }],
//     "workouts":        [{ type: string, durationMin: number, date: "YYYY-MM-DD" }],
//     "avgRestingHR":    number | null,
//     "activeCalories7d": number
//   }
// }
//
// PRIVACY: No raw GPS or heart rate time-series — only daily aggregates / session-level data.

function parseHealthConnect(buffer) {
  let data;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('health_connect file is not valid JSON');
  }

  const hc = data.healthConnect;
  if (!hc || typeof hc !== 'object') {
    throw new Error('health_connect JSON missing "healthConnect" key');
  }

  const steps7d   = Array.isArray(hc.steps_7d)  ? hc.steps_7d  : [];
  const sleep7d   = Array.isArray(hc.sleep_7d)  ? hc.sleep_7d  : [];
  const workouts  = Array.isArray(hc.workouts)  ? hc.workouts  : [];
  const restingHR = typeof hc.avgRestingHR === 'number' && hc.avgRestingHR > 0
    ? Math.round(hc.avgRestingHR)
    : null;
  const activeCalories = typeof hc.activeCalories7d === 'number' ? Math.round(hc.activeCalories7d) : null;

  const observations = [];

  // ── Steps ──────────────────────────────────────────────────────────────────
  if (steps7d.length > 0) {
    const validDays  = steps7d.filter(d => typeof d.count === 'number' && d.count >= 0);
    const total7d    = validDays.reduce((s, d) => s + d.count, 0);
    const avg7d      = validDays.length > 0 ? Math.round(total7d / validDays.length) : 0;
    const bestDay    = validDays.reduce((best, d) => d.count > (best?.count ?? 0) ? d : best, null);

    if (avg7d > 0) {
      const activityLabel = avg7d >= 10_000
        ? 'highly active (10k+ steps/day)'
        : avg7d >= 7_500
          ? 'moderately active (7,500–10,000 steps/day)'
          : avg7d >= 5_000
            ? 'somewhat active (5,000–7,500 steps/day)'
            : 'mostly sedentary (under 5,000 steps/day)';
      observations.push(
        `Averaged ${avg7d.toLocaleString()} steps per day over the past week ` +
        `(${total7d.toLocaleString()} total — ${activityLabel})`
      );
    }

    if (bestDay && bestDay.count > 0) {
      observations.push(
        `Best step day in the past week: ${bestDay.count.toLocaleString()} steps on ${bestDay.date}`
      );
    }
  }

  // ── Sleep ──────────────────────────────────────────────────────────────────
  if (sleep7d.length > 0) {
    const validNights   = sleep7d.filter(d => typeof d.durationHours === 'number' && d.durationHours > 0);
    const avgDurHours   = validNights.length > 0
      ? (validNights.reduce((s, d) => s + d.durationHours, 0) / validNights.length).toFixed(1)
      : null;

    const startHours    = sleep7d
      .filter(d => typeof d.startHour === 'number')
      .map(d => d.startHour);
    const avgStartHour  = startHours.length > 0
      ? Math.round(startHours.reduce((s, h) => s + h, 0) / startHours.length)
      : null;

    const fmtHour = (h) => {
      const norm = ((h % 24) + 24) % 24;
      return norm === 0 ? '12am' : norm < 12 ? `${norm}am` : norm === 12 ? '12pm' : `${norm - 12}pm`;
    };

    if (avgDurHours !== null && avgStartHour !== null) {
      const wakeHour = ((avgStartHour + Math.round(Number(avgDurHours))) % 24);
      observations.push(
        `Sleep schedule: typically falls asleep around ${fmtHour(avgStartHour)}, ` +
        `wakes around ${fmtHour(wakeHour)} ` +
        `(avg ${avgDurHours}h/night over ${validNights.length} tracked nights)`
      );
    } else if (avgDurHours !== null) {
      observations.push(
        `Averaged ${avgDurHours}h of sleep per night over the past week (Health Connect)`
      );
    }

    const shortNights = validNights.filter(d => d.durationHours < 6).length;
    if (shortNights > 0 && validNights.length >= 3) {
      observations.push(
        `${shortNights} of the last ${validNights.length} nights had under 6 hours of sleep`
      );
    }
  }

  // ── Heart rate ─────────────────────────────────────────────────────────────
  if (restingHR !== null) {
    const fitnessLabel = restingHR < 50
      ? 'athlete-level resting heart rate'
      : restingHR < 60
        ? 'excellent resting heart rate (strong cardiovascular fitness)'
        : restingHR < 70
          ? 'good resting heart rate'
          : restingHR < 80
            ? 'average resting heart rate'
            : 'elevated resting heart rate (worth monitoring)';
    observations.push(
      `Resting heart rate from Health Connect: ~${restingHR} bpm (${fitnessLabel})`
    );
  }

  // ── Active calories ────────────────────────────────────────────────────────
  if (activeCalories !== null && activeCalories > 0) {
    const dailyAvgCal = Math.round(activeCalories / 7);
    const burnLabel = dailyAvgCal >= 600
      ? 'high daily energy output'
      : dailyAvgCal >= 350
        ? 'moderate daily activity'
        : 'light daily activity';
    observations.push(
      `Burned ~${activeCalories.toLocaleString()} active calories in the past 7 days ` +
      `(~${dailyAvgCal} cal/day — ${burnLabel})`
    );
  }

  // ── Workouts ───────────────────────────────────────────────────────────────
  if (workouts.length > 0) {
    const typeCounts = {};
    for (const w of workouts) {
      const t = String(w.type || 'Workout').trim();
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    const topTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const typeDesc = topTypes.map(([t, c]) => `${c} ${t.toLowerCase()}${c !== 1 ? 's' : ''}`).join(', ');
    const durWorkouts = workouts.filter(w => typeof w.durationMin === 'number');
    const avgDurMin = durWorkouts.length
      ? Math.round(durWorkouts.reduce((s, w) => s + w.durationMin, 0) / durWorkouts.length)
      : 0;

    observations.push(
      `Completed ${workouts.length} workout${workouts.length !== 1 ? 's' : ''} this week: ${typeDesc}` +
      (avgDurMin > 0 ? ` (avg ${avgDurMin} min each)` : '')
    );
  }

  if (observations.length === 0) {
    throw new Error(
      'No Health Connect data found in the file. ' +
      'Ensure the Android app has Health Connect permissions and has synced at least once.'
    );
  }

  return observations;
}

export { parseHealthConnect };
