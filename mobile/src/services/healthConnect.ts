/**
 * Health Connect Service
 * ======================
 * Collects health data from Android Health Connect (aggregates wearable data
 * from Garmin, Fitbit, Samsung Health, Google Fit, etc.).
 *
 * Data window: 30 days rolling.
 * 7 metrics: steps, heart rate, sleep, workouts, weight, SpO2, resting HR.
 *
 * Shape produced matches parseAndroidHealthConnect() in gdprImportService.js.
 */

import {
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import type { Permission } from 'react-native-health-connect';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthConnectData {
  available: boolean;
  steps: Array<{ date: string; count: number }>;
  heartRate: Array<{ date: string; avgBpm: number; maxBpm: number }>;
  sleep: Array<{
    startTime: string;
    endTime: string;
    durationHours: number;
    stages?: Array<{ stage: string; durationMins: number }>;
  }>;
  workouts: Array<{
    exerciseType: string;
    durationMins: number;
    calories: number;
    startTime: string;
  }>;
  weight: Array<{ date: string; weightKg: number }>;
  spo2: Array<{ date: string; percentage: number }>;
  restingHeartRate: Array<{ date: string; bpm: number }>;
}

const PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'OxygenSaturation' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if Health Connect is installed and available on this device.
 */
export async function isHealthConnectAvailable(): Promise<boolean> {
  try {
    const status = await getSdkStatus();
    return status === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

/**
 * Requests all Health Connect read permissions.
 * Returns true if at least steps + one other metric were granted.
 */
export async function requestHealthPermissions(): Promise<boolean> {
  try {
    const initialized = await initialize();
    if (!initialized) return false;
    const granted = await requestPermission(PERMISSIONS);
    const grantedTypes = new Set(granted.map((p) => (p as Permission).recordType));
    return grantedTypes.has('Steps') && grantedTypes.size >= 2;
  } catch {
    return false;
  }
}

/**
 * Collects 30 days of health data from Health Connect.
 * Returns HealthConnectData — matches parseAndroidHealthConnect() shape.
 */
export async function collectHealthConnectData(): Promise<HealthConnectData> {
  const empty: HealthConnectData = {
    available: false,
    steps: [], heartRate: [], sleep: [], workouts: [], weight: [], spo2: [], restingHeartRate: [],
  };

  try {
    const status = await getSdkStatus();
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) return empty;
    const initialized = await initialize();
    if (!initialized) return empty;
  } catch {
    return empty;
  }

  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: start.toISOString(),
    endTime: now.toISOString(),
  };

  const result: HealthConnectData = {
    available: true,
    steps: [], heartRate: [], sleep: [], workouts: [], weight: [], spo2: [], restingHeartRate: [],
  };

  // Steps — group raw records by day
  try {
    const res = await readRecords('Steps', { timeRangeFilter });
    const dayMap: Record<string, number> = {};
    for (const r of res.records) {
      const day = r.startTime.slice(0, 10);
      dayMap[day] = (dayMap[day] || 0) + (r.count || 0);
    }
    result.steps = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  } catch { /* permission not granted */ }

  // Heart rate — aggregate to daily avg/max
  try {
    const res = await readRecords('HeartRate', { timeRangeFilter });
    const dayMap: Record<string, { sum: number; max: number; count: number }> = {};
    for (const r of res.records) {
      const day = r.startTime.slice(0, 10);
      for (const sample of r.samples ?? []) {
        const bpm = sample.beatsPerMinute;
        if (!bpm) continue;
        if (!dayMap[day]) dayMap[day] = { sum: 0, max: 0, count: 0 };
        dayMap[day].sum += bpm;
        dayMap[day].count += 1;
        if (bpm > dayMap[day].max) dayMap[day].max = bpm;
      }
    }
    result.heartRate = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { sum, count, max }]) => ({ date, avgBpm: Math.round(sum / count), maxBpm: max }));
  } catch { /* permission not granted */ }

  // Sleep sessions with stage breakdown
  try {
    const res = await readRecords('SleepSession', { timeRangeFilter });
    result.sleep = res.records.map((r) => {
      const durationHours = parseFloat(
        ((new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 3_600_000).toFixed(2)
      );
      const stageNames: Record<number, string> = { 1: 'awake', 2: 'sleeping', 3: 'out_of_bed', 4: 'light', 5: 'deep', 6: 'rem' };
      const stages = (r.stages || []).map((s: { startTime: string; endTime: string; stage: number }) => ({
        stage: stageNames[s.stage] || 'unknown',
        durationMins: Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60_000),
      }));
      return { startTime: r.startTime, endTime: r.endTime, durationHours, stages };
    });
  } catch { /* permission not granted */ }

  // Workouts
  try {
    const res = await readRecords('ExerciseSession', { timeRangeFilter });
    result.workouts = res.records.map((r) => {
      const rAny = r as Record<string, unknown> & typeof r;
      const energy = rAny.energy as { inKilocalories?: number } | undefined;
      return {
        exerciseType: String(r.exerciseType || 'workout'),
        durationMins: Math.round(
          (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60_000
        ),
        calories: energy?.inKilocalories ? Math.round(energy.inKilocalories) : 0,
        startTime: r.startTime,
      };
    });
  } catch { /* permission not granted */ }

  // Weight
  try {
    const res = await readRecords('Weight', { timeRangeFilter });
    result.weight = res.records
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((r) => ({ date: r.time.slice(0, 10), weightKg: parseFloat(r.weight.inKilograms.toFixed(1)) }));
  } catch { /* permission not granted */ }

  // SpO2
  try {
    const res = await readRecords('OxygenSaturation', { timeRangeFilter });
    result.spo2 = res.records.map((r) => ({
      date: r.time.slice(0, 10),
      percentage: parseFloat((r.percentage * 100).toFixed(1)),
    }));
  } catch { /* permission not granted */ }

  // Resting heart rate
  try {
    const res = await readRecords('RestingHeartRate', { timeRangeFilter });
    result.restingHeartRate = res.records.map((r) => ({
      date: r.time.slice(0, 10),
      bpm: r.beatsPerMinute,
    }));
  } catch { /* permission not granted */ }

  return result;
}
