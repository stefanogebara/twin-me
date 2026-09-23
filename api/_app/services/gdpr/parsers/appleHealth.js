/**
 * GDPR parser: Apple Health.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { safeAdmZip } from '../zipSafety.js';

// ---------------------------------------------------------------------------
// Apple Health parser
// Accepts:
//   export.zip  — standard Apple Health export (ZIP containing apple_health_export/export.xml)
//   export.xml  — raw XML file if the user manually extracted it
// ---------------------------------------------------------------------------

/** Extract a named XML attribute value from a tag string (double-quoted only). */
function extractAppleAttr(tag, name) {
  const re = new RegExp(`\\b${name}="([^"]*)"`, 'i');
  const m = tag.match(re);
  return m ? m[1] : null;
}

/**
 * Parse an Apple Health date string ("2024-01-15 08:00:00 +0000") into a Date.
 * Returns null if parsing fails.
 */
function parseAppleDate(str) {
  if (!str) return null;
  try {
    // Convert "YYYY-MM-DD HH:MM:SS +HHMM" to ISO 8601 for the Date constructor
    const iso = str.replace(
      /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{4})$/,
      '$1T$2$3'
    );
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Local calendar-day key ("YYYY-MM-DD") for an Apple Health record. The raw
 * HealthKit startDate string ("YYYY-MM-DD HH:MM:SS ±HHMM") is already in the
 * user's local time, so slice it directly; fall back to the absolute Date's UTC
 * day only when the raw string is malformed. (audit: keying on
 * date.toISOString() put late-evening local records on the next UTC day,
 * corrupting daily step/energy totals and the step streak for non-UTC users.)
 * Exported for testing.
 */
export function appleDayKey(startStr, date) {
  if (typeof startStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(startStr)) {
    return startStr.substring(0, 10);
  }
  return date ? date.toISOString().substring(0, 10) : '';
}

/** Format a month/year string for observation text, e.g. "Jan 2024". */
function fmtAppleMonth(d) {
  return `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
}

function parseAppleHealth(buffer) {
  // ── Step 1: extract XML string from ZIP or raw XML buffer ─────────────────
  let xmlStr;

  try {
    const zip = safeAdmZip(buffer);
    const entry = zip.getEntries().find(e =>
      !e.isDirectory && /export\.xml$/i.test(e.entryName)
    );
    if (!entry) throw new Error('export.xml not found inside ZIP');
    xmlStr = entry.getData().toString('utf8');
  } catch (zipErr) {
    // Not a valid ZIP — try raw XML
    const raw = buffer.toString('utf8').trimStart();
    if (raw.startsWith('<?xml') || raw.startsWith('<HealthData') || raw.startsWith('<Health')) {
      xmlStr = raw;
    } else {
      throw new Error(
        `Apple Health import: not a valid ZIP and not recognized XML. ` +
        `Expected export.zip (from iPhone Health app → share) or export.xml. (${zipErr.message})`
      );
    }
  }

  // ── Step 2: scan XML for <Record .../>  and <Workout .../> tags ───────────
  // We use String.prototype.matchAll with global regex — safe for large files
  // and avoids needing a full XML parser.

  const MAX_XML_BYTES = 100 * 1024 * 1024; // 100 MB
  if (xmlStr.length > MAX_XML_BYTES) {
    throw new Error('Apple Health XML too large');
  }

  const MAX_INDIVIDUAL_OBS = 100;

  const dailySteps      = {};  // 'YYYY-MM-DD' -> cumulative step count
  const hrSamples       = [];  // { value: number, date: Date }
  const restingHrSamples = []; // { value: number, date: Date }
  const hrvSamples      = [];  // { value: number (ms), date: Date }
  const dailyActiveEnergy = {}; // 'YYYY-MM-DD' -> cumulative kcal
  const sleepSessions   = [];  // { minutes: number, date: Date }
  const workouts        = [];  // { type: string, durationMin: number, date: Date }
  const weightSamples   = [];  // { kg: number, date: Date }
  // Athletic fitness + mental health metrics — already present in the export
  // since iOS 14 / 16 respectively, but were being silently skipped until
  // the 2026-04-20 audit flagged them.
  const vo2Samples      = [];  // { value: number (ml/(kg·min)), date: Date }
  const mindfulnessSessions = []; // { minutes: number, date: Date }

  // Match all self-closing <Record .../> tags
  const recordMatches = xmlStr.matchAll(/<Record\b([^>]*?)\/>/gs);
  for (const m of recordMatches) {
    const attrs    = m[1];
    const type     = extractAppleAttr(attrs, 'type') || '';
    const valueStr = extractAppleAttr(attrs, 'value') || '';
    const startStr = extractAppleAttr(attrs, 'startDate');
    const endStr   = extractAppleAttr(attrs, 'endDate');
    const date     = parseAppleDate(startStr);

    if (type === 'HKQuantityTypeIdentifierStepCount') {
      const steps = parseFloat(valueStr);
      if (!isNaN(steps) && date) {
        const dayKey = appleDayKey(startStr, date);
        dailySteps[dayKey] = (dailySteps[dayKey] || 0) + steps;
      }

    } else if (type === 'HKQuantityTypeIdentifierHeartRate') {
      const hr = parseFloat(valueStr);
      if (!isNaN(hr) && hr > 20 && hr < 300 && date) {
        hrSamples.push({ value: hr, date });
      }

    } else if (type === 'HKQuantityTypeIdentifierRestingHeartRate') {
      const rhr = parseFloat(valueStr);
      if (!isNaN(rhr) && rhr > 20 && rhr < 200 && date) {
        restingHrSamples.push({ value: rhr, date });
      }

    } else if (type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN') {
      const hrv = parseFloat(valueStr);
      if (!isNaN(hrv) && hrv > 0 && hrv < 300 && date) {
        hrvSamples.push({ value: hrv, date });
      }

    } else if (type === 'HKQuantityTypeIdentifierActiveEnergyBurned') {
      const kcal = parseFloat(valueStr);
      if (!isNaN(kcal) && kcal > 0 && date) {
        const dayKey = appleDayKey(startStr, date);
        dailyActiveEnergy[dayKey] = (dailyActiveEnergy[dayKey] || 0) + kcal;
      }

    } else if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      // Only count actual sleep phases, not "InBed" (which over-inflates duration)
      if (valueStr.includes('Asleep') || valueStr === 'HKCategoryValueSleepAnalysisAsleep') {
        const start = parseAppleDate(startStr);
        const end   = parseAppleDate(endStr);
        if (start && end) {
          const minutes = (end.getTime() - start.getTime()) / 60_000;
          if (minutes > 20 && minutes < 900) {
            sleepSessions.push({ minutes, date: start });
          }
        }
      }

    } else if (type === 'HKQuantityTypeIdentifierBodyMass') {
      const unit = extractAppleAttr(attrs, 'unit') || 'kg';
      let kg = parseFloat(valueStr);
      if (!isNaN(kg) && date) {
        if (unit.toLowerCase() === 'lb') kg *= 0.453592;
        if (kg > 20 && kg < 500) weightSamples.push({ kg, date });
      }

    } else if (type === 'HKQuantityTypeIdentifierVO2Max') {
      // ml/(kg·min) — Apple Watch estimates maximal aerobic capacity from HR
      // during outdoor walks/runs. Typical range 15 (poor) to 60+ (elite).
      const vo2 = parseFloat(valueStr);
      if (!isNaN(vo2) && vo2 > 5 && vo2 < 100 && date) {
        vo2Samples.push({ value: vo2, date });
      }

    } else if (type === 'HKCategoryTypeIdentifierMindfulSession') {
      // Meditation/breath sessions logged by the Mindfulness app or 3rd-party
      // apps (Calm, Headspace, etc.). Only duration signal matters here.
      const start = parseAppleDate(startStr);
      const end   = parseAppleDate(endStr);
      if (start && end) {
        const minutes = (end.getTime() - start.getTime()) / 60_000;
        if (minutes > 0.2 && minutes < 180) {
          mindfulnessSessions.push({ minutes, date: start, dayKey: appleDayKey(startStr, start) });
        }
      }
    }
  }

  // Match all self-closing <Workout .../> tags
  const workoutMatches = xmlStr.matchAll(/<Workout\b([^>]*?)\/>/gs);
  for (const m of workoutMatches) {
    const attrs         = m[1];
    const activityType  = extractAppleAttr(attrs, 'workoutActivityType') || '';
    const durationStr   = extractAppleAttr(attrs, 'duration') || '';
    const durationUnit  = (extractAppleAttr(attrs, 'durationUnit') || 'min').toLowerCase();
    const startStr      = extractAppleAttr(attrs, 'startDate');
    const date          = parseAppleDate(startStr);

    let durationMin = parseFloat(durationStr);
    if (!isNaN(durationMin) && date) {
      if (durationUnit.includes('hour')) durationMin *= 60;
      else if (durationUnit.includes('sec')) durationMin /= 60;

      if (durationMin > 1 && durationMin < 600) {
        // Humanize: "HKWorkoutActivityTypeRunning" -> "Running"
        const typeName = activityType
          .replace(/^HKWorkoutActivityType/, '')
          .replace(/([A-Z])/g, ' $1')
          .trim() || 'Workout';
        workouts.push({ type: typeName, durationMin: Math.round(durationMin), date });
      }
    }
  }

  // ── Step 3: build summary observations ────────────────────────────────────
  const summaryObs = [];

  // Steps
  const stepDays = Object.keys(dailySteps);
  if (stepDays.length > 0) {
    const stepValues = stepDays.map(d => dailySteps[d]);
    const totalSteps = stepValues.reduce((a, b) => a + b, 0);
    const avgSteps   = Math.round(totalSteps / stepDays.length);
    const bestDay    = stepDays.reduce((best, d) => dailySteps[d] > dailySteps[best] ? d : best, stepDays[0]);
    const bestSteps  = Math.round(dailySteps[bestDay]);

    // Longest streak of days with >= 7,500 steps
    const sortedDays = [...stepDays].sort();
    let maxStreak = 0;
    let curStreak = 0;
    for (const d of sortedDays) {
      if (dailySteps[d] >= 7500) {
        curStreak++;
        if (curStreak > maxStreak) maxStreak = curStreak;
      } else {
        curStreak = 0;
      }
    }

    summaryObs.push(
      `Apple Health steps: ${stepDays.length} days tracked, avg ${avgSteps.toLocaleString()} steps/day, ` +
      `${totalSteps.toLocaleString()} total. Best day: ${bestSteps.toLocaleString()} steps (${bestDay})`
    );

    const activityLabel = avgSteps >= 10_000
      ? 'highly active (10k+ steps/day average)'
      : avgSteps >= 7_500
        ? 'moderately active (7,500–10,000 steps/day)'
        : avgSteps >= 5_000
          ? 'somewhat active (5,000–7,500 steps/day)'
          : 'mostly sedentary (under 5,000 steps/day)';
    summaryObs.push(`Physical activity level from Apple Health: ${activityLabel}`);

    if (maxStreak >= 3) {
      summaryObs.push(`Longest walking streak in Apple Health: ${maxStreak} consecutive days hitting 7,500+ steps`);
    }
  }

  // Heart rate
  if (hrSamples.length >= 10) {
    const hrValues = hrSamples.map(s => s.value);
    const avgHr    = Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length);
    const minHr    = Math.round(Math.min(...hrValues));
    const maxHr    = Math.round(Math.max(...hrValues));

    // Estimate resting HR from the lowest 10% of samples
    const sortedHr  = [...hrValues].sort((a, b) => a - b);
    const restSlice = sortedHr.slice(0, Math.max(1, Math.floor(sortedHr.length * 0.10)));
    const restingHr = Math.round(restSlice.reduce((a, b) => a + b, 0) / restSlice.length);

    summaryObs.push(
      `Apple Health heart rate: estimated resting ~${restingHr} bpm, avg ${avgHr} bpm, ` +
      `range ${minHr}–${maxHr} bpm (${hrSamples.length.toLocaleString()} samples)`
    );

    const fitnessLabel = restingHr < 50
      ? 'athlete-level resting heart rate'
      : restingHr < 60
        ? 'excellent resting heart rate (strong cardiovascular fitness)'
        : restingHr < 70
          ? 'good resting heart rate'
          : restingHr < 80
            ? 'average resting heart rate'
            : 'elevated resting heart rate';
    summaryObs.push(`Cardiovascular fitness signal from Apple Health: ${fitnessLabel} (~${restingHr} bpm resting)`);
  }

  // Resting Heart Rate (Apple Watch native metric — more accurate than estimation from HR samples)
  if (restingHrSamples.length >= 5) {
    const rhrValues = restingHrSamples.map(s => s.value);
    const avgRhr = Math.round(rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length);
    const sorted = [...rhrValues].sort((a, b) => a - b);
    const recentRhr = restingHrSamples
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 7)
      .map(s => s.value);
    const recentAvg = recentRhr.length > 0
      ? Math.round(recentRhr.reduce((a, b) => a + b, 0) / recentRhr.length)
      : avgRhr;

    summaryObs.push(
      `Apple Health resting heart rate: ${avgRhr} bpm average across ${restingHrSamples.length} readings, ` +
      `recent 7-day avg ${recentAvg} bpm, range ${Math.round(sorted[0])}–${Math.round(sorted[sorted.length - 1])} bpm`
    );

    // Trend detection: compare first vs last third
    if (restingHrSamples.length >= 15) {
      const chronological = [...restingHrSamples].sort((a, b) => a.date.getTime() - b.date.getTime());
      const thirdLen = Math.floor(chronological.length / 3);
      const earlyAvg = Math.round(chronological.slice(0, thirdLen).reduce((a, s) => a + s.value, 0) / thirdLen);
      const lateAvg = Math.round(chronological.slice(-thirdLen).reduce((a, s) => a + s.value, 0) / thirdLen);
      const diff = lateAvg - earlyAvg;
      if (Math.abs(diff) >= 3) {
        const trend = diff < 0 ? 'trending down (improving)' : 'trending up';
        summaryObs.push(`Resting heart rate trend from Apple Health: ${trend} (${earlyAvg} → ${lateAvg} bpm)`);
      }
    }
  }

  // HRV (Heart Rate Variability SDNN)
  if (hrvSamples.length >= 5) {
    const hrvValues = hrvSamples.map(s => s.value);
    const avgHrv = Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length);
    const sorted = [...hrvValues].sort((a, b) => a - b);
    const recentHrv = hrvSamples
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 7)
      .map(s => s.value);
    const recentAvg = recentHrv.length > 0
      ? Math.round(recentHrv.reduce((a, b) => a + b, 0) / recentHrv.length)
      : avgHrv;

    summaryObs.push(
      `Apple Health HRV (SDNN): ${avgHrv}ms average across ${hrvSamples.length} readings, ` +
      `recent 7-day avg ${recentAvg}ms, range ${Math.round(sorted[0])}–${Math.round(sorted[sorted.length - 1])}ms`
    );

    // HRV quality label
    const hrvLabel = avgHrv >= 100
      ? 'excellent HRV (strong autonomic resilience)'
      : avgHrv >= 60
        ? 'good HRV (healthy stress recovery)'
        : avgHrv >= 40
          ? 'moderate HRV (adequate recovery capacity)'
          : 'low HRV (may indicate elevated stress or low fitness)';
    summaryObs.push(`Autonomic nervous system signal from Apple Health: ${hrvLabel} (avg ${avgHrv}ms)`);
  }

  // Active Energy Burned
  const energyDays = Object.keys(dailyActiveEnergy);
  if (energyDays.length >= 3) {
    const energyValues = energyDays.map(d => dailyActiveEnergy[d]);
    const totalKcal = Math.round(energyValues.reduce((a, b) => a + b, 0));
    const avgKcal = Math.round(totalKcal / energyDays.length);
    const bestDay = energyDays.reduce((best, d) => dailyActiveEnergy[d] > dailyActiveEnergy[best] ? d : best, energyDays[0]);
    const bestKcal = Math.round(dailyActiveEnergy[bestDay]);

    summaryObs.push(
      `Apple Health active energy: avg ${avgKcal.toLocaleString()} kcal/day across ${energyDays.length} days, ` +
      `${totalKcal.toLocaleString()} kcal total. Most active day: ${bestKcal.toLocaleString()} kcal (${bestDay})`
    );

    const energyLabel = avgKcal >= 800
      ? 'very high daily energy expenditure (intense training or very active lifestyle)'
      : avgKcal >= 500
        ? 'high daily energy expenditure (regularly active)'
        : avgKcal >= 300
          ? 'moderate daily energy expenditure'
          : 'low daily active energy (mostly sedentary)';
    summaryObs.push(`Energy expenditure pattern from Apple Health: ${energyLabel}`);
  }

  // Sleep
  if (sleepSessions.length >= 3) {
    const sleepMins    = sleepSessions.map(s => s.minutes);
    const avgSleepMin  = Math.round(sleepMins.reduce((a, b) => a + b, 0) / sleepMins.length);
    const avgSleepHr   = (avgSleepMin / 60).toFixed(1);
    const shortNights  = sleepSessions.filter(s => s.minutes < 360).length;
    const longNights   = sleepSessions.filter(s => s.minutes >= 480).length;

    summaryObs.push(
      `Apple Health sleep: avg ${avgSleepHr}h/night over ${sleepSessions.length} tracked nights`
    );

    if (shortNights > sleepSessions.length * 0.3) {
      summaryObs.push(
        `Frequent sleep deprivation in Apple Health: ${shortNights} nights under 6 hours ` +
        `(${Math.round((shortNights / sleepSessions.length) * 100)}% of tracked nights)`
      );
    } else if (longNights > sleepSessions.length * 0.5) {
      summaryObs.push(`Consistent good sleep from Apple Health: ${longNights} nights with 8+ hours tracked`);
    }
  }

  // Workouts
  if (workouts.length > 0) {
    const typeCounts   = {};
    const typeDurations = {};
    for (const w of workouts) {
      typeCounts[w.type]    = (typeCounts[w.type] || 0) + 1;
      typeDurations[w.type] = (typeDurations[w.type] || 0) + w.durationMin;
    }

    const topTypes   = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const avgDurMin  = Math.round(workouts.reduce((a, w) => a + w.durationMin, 0) / workouts.length);
    const typeList   = topTypes.map(([t, c]) => `${t} (${c}x)`).join(', ');

    summaryObs.push(
      `Apple Health workouts: ${workouts.length} sessions recorded, avg ${avgDurMin} min each. ` +
      `Top activities: ${typeList}`
    );

    // Estimate weekly frequency from date range
    if (workouts.length >= 4) {
      const wDates = workouts.map(w => w.date).filter(Boolean).sort((a, b) => a.getTime() - b.getTime());
      if (wDates.length >= 2) {
        const spanWeeks = Math.max(1, (wDates[wDates.length - 1].getTime() - wDates[0].getTime()) / (7 * 24 * 3_600_000));
        const perWeek   = (workouts.length / spanWeeks).toFixed(1);
        summaryObs.push(`Workout frequency from Apple Health: ~${perWeek} sessions per week`);
      }
    }
  }

  // Body weight trend
  if (weightSamples.length >= 3) {
    const wSorted  = [...weightSamples].sort((a, b) => a.date.getTime() - b.date.getTime());
    const firstKg  = wSorted[0].kg;
    const lastKg   = wSorted[wSorted.length - 1].kg;
    const avgKg    = (wSorted.reduce((a, s) => a + s.kg, 0) / wSorted.length).toFixed(1);
    const deltaKg  = (lastKg - firstKg).toFixed(1);
    const deltaLbs = (Math.abs(lastKg - firstKg) * 2.205).toFixed(1);
    const trend    = lastKg > firstKg + 0.5
      ? `gained ${deltaKg}kg (${deltaLbs}lbs)`
      : lastKg < firstKg - 0.5
        ? `lost ${Math.abs(parseFloat(deltaKg))}kg (${deltaLbs}lbs)`
        : 'maintained stable weight';

    summaryObs.push(
      `Apple Health body weight: avg ${avgKg}kg across ${weightSamples.length} measurements — ${trend} over the tracked period`
    );
  }

  // VO2max — athletic fitness level.
  //   < 25  poor, 25-35 below average, 35-45 average, 45-55 above average, > 55 excellent/elite
  if (vo2Samples.length > 0) {
    const sorted = [...vo2Samples].sort((a, b) => a.date - b.date);
    const last = sorted[sorted.length - 1].value;
    const avg = sorted.reduce((a, s) => a + s.value, 0) / sorted.length;
    let bracket;
    if (last < 30) bracket = 'low';
    else if (last < 40) bracket = 'below average';
    else if (last < 50) bracket = 'above average';
    else if (last < 60) bracket = 'athletic';
    else bracket = 'elite';
    summaryObs.push(
      `Apple Health VO2max: latest ${last.toFixed(1)} ml/(kg·min) (${bracket}), avg ${avg.toFixed(1)} across ${vo2Samples.length} Apple Watch readings — aerobic fitness indicator`
    );
  }

  // Mindfulness — mental-health practice signal.
  if (mindfulnessSessions.length > 0) {
    const totalMin = mindfulnessSessions.reduce((a, s) => a + s.minutes, 0);
    const days = new Set(mindfulnessSessions.map(s => s.dayKey)).size;
    const avgSessionMin = totalMin / mindfulnessSessions.length;
    const descriptor = days >= 100 ? 'sustained meditation practice'
      : days >= 30 ? 'regular mindfulness habit'
      : days >= 7 ? 'mindfulness practice in progress'
      : 'occasional mindfulness sessions';
    summaryObs.push(
      `Apple Health mindfulness: ${mindfulnessSessions.length} sessions across ${days} days, ${Math.round(totalMin)} total minutes — ${descriptor} (avg ${avgSessionMin.toFixed(1)} min/session)`
    );
  }

  // ── Step 4: individual workout entries (most recent, up to MAX_INDIVIDUAL_OBS) ─
  const individualObs = workouts
    .filter(w => w.durationMin >= 20)
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, MAX_INDIVIDUAL_OBS)
    .map(w => {
      const monthYear = w.date ? fmtAppleMonth(w.date) : '';
      return monthYear
        ? `Workout: ${w.type}, ${w.durationMin} min (${monthYear})`
        : `Workout: ${w.type}, ${w.durationMin} min`;
    });

  if (summaryObs.length === 0 && individualObs.length === 0) {
    throw new Error(
      'No health records found in the Apple Health export. ' +
      'Make sure to export from iPhone Health app (profile icon → Export All Health Data) and upload the full export.zip.'
    );
  }

  return [...summaryObs, ...individualObs];
}

export { parseAppleHealth };
