/**
 * GDPR parser: Android Health Connect (mobile app format).
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

// ---------------------------------------------------------------------------
// Android Health Connect — mobile app format
// Produced by mobile/src/services/healthConnect.ts (HealthConnectData shape).
// 30-day window, 7 data types: steps, heartRate, sleep, workouts, weight,
// spo2, restingHeartRate.
// ---------------------------------------------------------------------------

function parseAndroidHealthConnect(buffer) {
  let data;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('android_health file is not valid JSON');
  }

  if (!data.available) {
    throw new Error('Health Connect is not available on this device or no data was returned');
  }

  const steps         = Array.isArray(data.steps)           ? data.steps           : [];
  const heartRate     = Array.isArray(data.heartRate)        ? data.heartRate       : [];
  const sleep         = Array.isArray(data.sleep)            ? data.sleep           : [];
  const workouts      = Array.isArray(data.workouts)         ? data.workouts        : [];
  const weight        = Array.isArray(data.weight)           ? data.weight          : [];
  const spo2          = Array.isArray(data.spo2)             ? data.spo2            : [];
  const restingHR     = Array.isArray(data.restingHeartRate) ? data.restingHeartRate : [];

  const observations = [];

  // ── Steps ──────────────────────────────────────────────────────────────────
  if (steps.length > 0) {
    const total = steps.reduce((s, d) => s + (d.count || 0), 0);
    const avg   = Math.round(total / steps.length);
    const best  = steps.reduce((b, d) => d.count > (b?.count ?? 0) ? d : b, null);

    const activityLabel = avg >= 10_000
      ? 'highly active (10k+ steps/day)'
      : avg >= 7_500
        ? 'moderately active'
        : avg >= 5_000
          ? 'somewhat active'
          : 'mostly sedentary (under 5k steps/day)';

    observations.push(
      `Averaged ${avg.toLocaleString()} steps/day over the past ${steps.length} days ` +
      `(${activityLabel})`
    );
    if (best && best.count > 0) {
      observations.push(`Best step day: ${best.count.toLocaleString()} steps on ${best.date}`);
    }
  }

  // ── Heart rate ─────────────────────────────────────────────────────────────
  if (heartRate.length > 0) {
    const overallAvg = Math.round(
      heartRate.reduce((s, d) => s + (d.avgBpm || 0), 0) / heartRate.length
    );
    const peakMax = Math.max(...heartRate.map(d => d.maxBpm || 0));

    const hrLabel = overallAvg < 60
      ? 'excellent cardiovascular fitness'
      : overallAvg < 70
        ? 'good heart rate'
        : overallAvg < 80
          ? 'average heart rate'
          : 'elevated average heart rate';

    observations.push(
      `Average heart rate: ${overallAvg} bpm over ${heartRate.length} days (${hrLabel})`
    );
    if (peakMax > 150) {
      observations.push(`Peak heart rate reached ${peakMax} bpm — consistent high-intensity effort`);
    }
  }

  // ── Sleep ──────────────────────────────────────────────────────────────────
  if (sleep.length > 0) {
    const avgDur = (sleep.reduce((s, n) => s + (n.durationHours || 0), 0) / sleep.length).toFixed(1);
    const shortNights = sleep.filter(n => n.durationHours < 6).length;

    observations.push(
      `Sleep average: ${avgDur}h/night across ${sleep.length} tracked sessions`
    );
    if (shortNights > 0) {
      observations.push(
        `${shortNights} of ${sleep.length} nights had under 6 hours of sleep`
      );
    }

    const allStages = sleep.flatMap(n => n.stages || []);
    if (allStages.length > 0) {
      const stageTotals = {};
      for (const s of allStages) {
        stageTotals[s.stage] = (stageTotals[s.stage] || 0) + s.durationMins;
      }
      const deepMins = stageTotals['deep'] || 0;
      const remMins  = stageTotals['rem']  || 0;
      if (deepMins > 0 || remMins > 0) {
        const avgDeep = Math.round(deepMins / sleep.length);
        const avgRem  = Math.round(remMins  / sleep.length);
        observations.push(
          `Sleep quality: avg ${avgDeep} min deep sleep and ${avgRem} min REM per night`
        );
      }
    }
  }

  // ── Workouts ───────────────────────────────────────────────────────────────
  if (workouts.length > 0) {
    const typeCounts = {};
    for (const w of workouts) {
      const t = String(w.exerciseType || 'workout').replace(/_/g, ' ');
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    const topTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, c]) => `${c}x ${t}`)
      .join(', ');

    const totalMins = workouts.reduce((s, w) => s + (w.durationMins || 0), 0);
    const totalCal  = workouts.reduce((s, w) => s + (w.calories || 0), 0);

    observations.push(
      `Completed ${workouts.length} workout${workouts.length !== 1 ? 's' : ''} in 30 days: ${topTypes}` +
      ` — ${totalMins} total minutes`
    );
    if (totalCal > 0) {
      observations.push(`Burned ${totalCal.toLocaleString()} calories across all tracked workouts`);
    }
  }

  // ── Weight ─────────────────────────────────────────────────────────────────
  if (weight.length >= 2) {
    const latest  = weight[weight.length - 1].weightKg;
    const oldest  = weight[0].weightKg;
    const delta   = +(latest - oldest).toFixed(1);
    const trend   = delta > 0.5 ? `up ${delta} kg` : delta < -0.5 ? `down ${Math.abs(delta)} kg` : 'stable';
    observations.push(`Body weight: ${latest} kg (${trend} over ${weight.length} measurements)`);
  } else if (weight.length === 1) {
    observations.push(`Body weight recorded: ${weight[0].weightKg} kg`);
  }

  // ── SpO2 ───────────────────────────────────────────────────────────────────
  if (spo2.length > 0) {
    const avg = (spo2.reduce((s, r) => s + r.percentage, 0) / spo2.length).toFixed(1);
    const low = spo2.filter(r => r.percentage < 95).length;
    observations.push(`Blood oxygen (SpO2): avg ${avg}% across ${spo2.length} readings`);
    if (low > 0) {
      observations.push(`${low} SpO2 readings below 95% — worth monitoring`);
    }
  }

  // ── Resting heart rate ─────────────────────────────────────────────────────
  if (restingHR.length > 0) {
    const avg = Math.round(restingHR.reduce((s, r) => s + r.bpm, 0) / restingHR.length);
    const fitnessLabel = avg < 50
      ? 'athlete-level'
      : avg < 60
        ? 'excellent'
        : avg < 70
          ? 'good'
          : avg < 80
            ? 'average'
            : 'elevated';
    observations.push(`Resting heart rate: ~${avg} bpm (${fitnessLabel}) across ${restingHR.length} measurements`);
  }

  if (observations.length === 0) {
    throw new Error(
      'No usable Health Connect data. Ensure permissions are granted and at least one ' +
      'wearable or health app has synced to Health Connect.'
    );
  }

  return observations;
}

export { parseAndroidHealthConnect };
