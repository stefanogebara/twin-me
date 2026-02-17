/**
 * Demo Whoop Data
 * Whoop health/recovery data for demo mode
 */

import {
  randomInRange,
  randomFloat,
  randomFromArray,
  getDayName,
  formatTimeAgo,
} from './demoHelpers';

// Generate 7-day historical Whoop data
export const generate7DayHistory = () => {
  const history = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    history.push({
      date: date.toISOString().split('T')[0],
      dayName: getDayName(i),
      recovery: randomInRange(35, 95),
      strain: randomFloat(5, 18, 1),
      sleepHours: randomFloat(5, 9, 1),
      hrv: randomInRange(25, 85),
    });
  }
  return history;
};

// Dynamic Whoop data with randomization and timestamps
export const getDemoWhoopData = () => {
  const recoveryScore = randomInRange(45, 95);
  const recoveryLabel = recoveryScore >= 80 ? 'Optimal' : recoveryScore >= 65 ? 'Good' : recoveryScore >= 50 ? 'Moderate' : 'Low';

  const strainScore = randomFloat(6, 18, 1);
  const strainLabel = strainScore >= 16 ? 'Very High' : strainScore >= 12 ? 'High' : strainScore >= 8 ? 'Moderate' : 'Light';

  const sleepHours = randomFloat(5.5, 9, 1);
  const sleepQuality = sleepHours >= 8 ? 'Excellent' : sleepHours >= 7 ? 'Good' : sleepHours >= 6 ? 'Fair' : 'Poor';

  const hrvValue = randomInRange(30, 75);
  const restingHR = randomInRange(50, 70);
  const sleepEfficiency = randomInRange(75, 96);
  const remSleep = randomFloat(1.2, 2.5, 1);
  const deepSleep = randomFloat(1.0, 2.2, 1);
  const lightSleep = Number((sleepHours - remSleep - deepSleep).toFixed(1));

  // Generate 7-day history
  const history7Day = generate7DayHistory();
  // Override today's data with current values
  history7Day[6] = {
    ...history7Day[6],
    recovery: recoveryScore,
    strain: strainScore,
    sleepHours: sleepHours,
    hrv: hrvValue,
  };

  return {
    recovery: {
      score: recoveryScore,
      label: recoveryLabel,
      hrv: hrvValue,
      hrvTrend: randomFromArray(['improving', 'stable', 'declining'] as const),
      restingHeartRate: restingHR,
      sleepPerformance: randomInRange(70, 98),
      // New: timestamps
      updatedAt: formatTimeAgo(randomFloat(0.5, 3, 1)),
      hrvUpdatedAt: formatTimeAgo(randomFloat(1, 4, 1)),
    },
    strain: {
      score: strainScore,
      label: strainLabel,
      calories: randomInRange(1800, 3200),
      averageHeartRate: randomInRange(65, 85),
      // New: live tracking indicator
      isLive: true,
    },
    sleep: {
      hours: sleepHours,
      quality: sleepQuality,
      efficiency: sleepEfficiency,
      remSleep: remSleep,
      deepSleep: deepSleep,
      lightSleep: lightSleep > 0 ? lightSleep : 0,
      disturbances: randomInRange(0, 5),
      // New: sleep timestamps
      bedtime: '11:15 PM',
      wakeTime: formatTimeAgo(randomFloat(1, 6, 1)),
    },
    trends: {
      weeklyRecoveryAvg: randomInRange(55, 80),
      weeklyStrainAvg: randomFloat(8, 14, 1),
      weeklySleepAvg: randomFloat(6, 8, 1),
    },
    // New: 7-day historical data for charts
    history7Day: history7Day,
    // New: today's timestamps
    timestamps: {
      recoveryCalculated: formatTimeAgo(randomFloat(0.5, 2, 1)),
      lastHRVReading: formatTimeAgo(randomFloat(1, 5, 1)),
      sleepEnded: formatTimeAgo(randomFloat(2, 8, 1)),
      strainUpdated: 'Live',
    },
  };
};

// Static version for backwards compatibility
export const DEMO_WHOOP_DATA = getDemoWhoopData();
