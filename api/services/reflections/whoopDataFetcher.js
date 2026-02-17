/**
 * Whoop Data Fetcher
 *
 * Extracts and structures Whoop platform data for reflection generation.
 * Includes historical context calculation and summary building.
 */

/**
 * Get Whoop data for reflection
 * Uses rich structure from userContextAggregator
 *
 * @param {Object} context - Aggregated user context
 * @returns {Object} { success, data?, error? }
 */
export function getWhoopData(context) {
  // Check for null/undefined OR explicit disconnected state
  if (!context.whoop) {
    return { success: false, error: 'Whoop not connected' };
  }

  // Handle case where token refresh failed (needsReauth) or connection marked as false
  if (context.whoop.connected === false || context.whoop.needsReauth) {
    return {
      success: false,
      error: context.whoop.needsReauth
        ? 'Whoop connection expired. Please reconnect to see your body stories.'
        : 'Whoop not connected'
    };
  }

  const whoop = context.whoop;

  // Handle both old flat structure and new nested structure from userContextAggregator
  const recoveryScore = whoop.recovery?.score ?? whoop.recovery ?? null;
  const recoveryLabel = whoop.recovery?.label ?? whoop.recoveryLabel ?? 'unknown';
  const strainScore = whoop.strain?.score ?? whoop.strain ?? 0;
  const strainLabel = whoop.strain?.label ?? (strainScore > 15 ? 'high' : strainScore < 8 ? 'low' : 'moderate');
  const hrvCurrent = whoop.hrv?.current ?? whoop.hrv ?? null;
  const hrvTrend = whoop.hrv?.trend ?? whoop.hrvTrend ?? 'stable';
  const rhrCurrent = whoop.rhr?.current ?? null;
  const sleepHours = whoop.sleep?.hours ?? whoop.sleepHours ?? 0;
  const sleepPerformance = whoop.sleep?.performance ?? null;
  const sleepEfficiency = whoop.sleep?.efficiency ?? null;
  const sleepStages = whoop.sleep?.stages ?? null;

  // New vitals from Whoop V2 API
  const spo2 = whoop.vitals?.spo2 ?? null;
  const skinTemp = whoop.vitals?.skinTemp ?? null;
  const respiratoryRate = whoop.sleep?.respiratoryRate ?? null;
  const sleepDisturbances = whoop.sleep?.disturbances ?? null;

  // Calculate stress level based on recovery
  const getStressLevel = (score) => {
    if (score === null || score === undefined) return null;
    if (score >= 67) return 'Low';
    if (score >= 50) return 'Moderate';
    if (score >= 34) return 'High';
    return 'Very High';
  };
  const stressLevel = getStressLevel(recoveryScore);

  // Calculate sleep quality
  const sleepQuality = sleepHours > 7 ? 'good' : sleepHours < 6 ? 'poor' : 'moderate';

  // Calculate recovery trending
  const recoveryTrending = recoveryScore > 66 ? 'up' : recoveryScore < 33 ? 'down' : 'stable';

  // Calculate sleep breakdown (in hours from milliseconds if available)
  const msToHours = (ms) => ms ? Math.round((ms / 3600000) * 10) / 10 : 0;
  const sleepBreakdown = sleepStages ? (() => {
    const deep = msToHours(sleepStages.deep);
    const rem = msToHours(sleepStages.rem);
    const light = msToHours(sleepStages.light);
    const awake = msToHours(sleepStages.awake);
    const stagesTotal = Math.round((deep + rem + light) * 10) / 10;
    return {
      deepSleep: deep,
      remSleep: rem,
      lightSleep: light,
      awakeDuring: awake,
      totalHours: stagesTotal > 0 ? stagesTotal : Math.round(sleepHours * 10) / 10,
      efficiency: sleepEfficiency || 0
    };
  })() : null;

  // Current metrics for visualization
  const currentMetrics = {
    recovery: recoveryScore,
    strain: Math.round(strainScore * 10) / 10,
    sleepPerformance: sleepPerformance,
    hrv: hrvCurrent,
    restingHR: rhrCurrent,
    sleepHours: Math.round(sleepHours * 10) / 10,
    // New vitals from Whoop V2 API
    spo2: spo2,
    skinTemp: skinTemp,
    respiratoryRate: respiratoryRate,
    sleepDisturbances: sleepDisturbances,
    stressLevel: stressLevel
  };

  // Recent trends for display
  const recentTrends = [
    `${recoveryLabel} recovery zone`,
    `${strainLabel} daily strain`,
    `${sleepQuality} sleep quality`,
    `HRV ${hrvTrend}`
  ].filter(t => !t.includes('null') && !t.includes('undefined'));

  // Get 7-day history from context if available
  const history7Day = whoop.history7Day || [];

  // Calculate historical averages and comparisons for AI context
  const historicalContext = calculateHistoricalContext(
    recoveryScore, hrvCurrent, sleepHours, history7Day
  );

  return {
    success: true,
    data: {
      // For reflection prompt
      recoveryLevel: recoveryLabel,
      recoveryTrending: recoveryTrending,
      sleepQuality: sleepQuality,
      strainLevel: strainLabel,
      hrvTrend: hrvTrend,
      sleepHoursCategory: sleepHours > 8 ? 'long' : sleepHours < 6 ? 'short' : 'normal',
      // Historical context for richer AI insights
      historicalContext,
      // For visualization
      currentMetrics,
      sleepBreakdown,
      recentTrends,
      history7Day
    }
  };
}

/**
 * Calculate historical context for richer AI insights
 * Compares current values to 7-day averages
 *
 * @param {number|null} currentRecovery
 * @param {number|null} currentHrv
 * @param {number} currentSleepHours
 * @param {Array} history7Day
 * @returns {Object|null}
 */
export function calculateHistoricalContext(currentRecovery, currentHrv, currentSleepHours, history7Day) {
  if (!history7Day || history7Day.length === 0) {
    return null;
  }

  // Calculate averages from history
  const validRecoveries = history7Day.filter(d => d.recovery != null);
  const validHrvs = history7Day.filter(d => d.hrv != null);

  const avgRecovery = validRecoveries.length > 0
    ? Math.round(validRecoveries.reduce((sum, d) => sum + d.recovery, 0) / validRecoveries.length)
    : null;

  const avgHrv = validHrvs.length > 0
    ? Math.round(validHrvs.reduce((sum, d) => sum + d.hrv, 0) / validHrvs.length)
    : null;

  // Calculate how current compares to average
  const getComparison = (current, avg) => {
    if (current == null || avg == null) return null;
    const diff = current - avg;
    const percentDiff = Math.round((diff / avg) * 100);

    if (Math.abs(percentDiff) <= 5) return 'at your average';
    if (percentDiff > 20) return 'significantly above your average';
    if (percentDiff > 0) return 'above your average';
    if (percentDiff < -20) return 'significantly below your average';
    return 'below your average';
  };

  // Find best and worst days in history
  const bestRecoveryDay = validRecoveries.length > 0
    ? validRecoveries.reduce((best, d) => d.recovery > best.recovery ? d : best)
    : null;
  const worstRecoveryDay = validRecoveries.length > 0
    ? validRecoveries.reduce((worst, d) => d.recovery < worst.recovery ? d : worst)
    : null;

  // Calculate consistency (standard deviation)
  const calculateConsistency = (values) => {
    if (values.length < 3) return 'insufficient data';
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const coeffVar = (stdDev / avg) * 100;

    if (coeffVar < 10) return 'very consistent';
    if (coeffVar < 20) return 'fairly consistent';
    if (coeffVar < 35) return 'variable';
    return 'highly variable';
  };

  return {
    // Averages
    avgRecovery,
    avgHrv,
    // Comparisons
    recoveryVsAvg: getComparison(currentRecovery, avgRecovery),
    hrvVsAvg: getComparison(currentHrv, avgHrv),
    // Best/worst
    bestDay: bestRecoveryDay?.dayName || null,
    worstDay: worstRecoveryDay?.dayName || null,
    // Consistency
    recoveryConsistency: calculateConsistency(validRecoveries.map(d => d.recovery)),
    // Summary for prompt
    summary: buildHistoricalSummary(
      currentRecovery, avgRecovery,
      currentHrv, avgHrv,
      bestRecoveryDay, worstRecoveryDay
    )
  };
}

/**
 * Build a natural language summary of historical patterns
 *
 * @param {number|null} currentRecovery
 * @param {number|null} avgRecovery
 * @param {number|null} currentHrv
 * @param {number|null} avgHrv
 * @param {Object|null} bestDay
 * @param {Object|null} worstDay
 * @returns {string|null}
 */
export function buildHistoricalSummary(currentRecovery, avgRecovery, currentHrv, avgHrv, bestDay, worstDay) {
  const parts = [];

  // Recovery comparison
  if (currentRecovery != null && avgRecovery != null) {
    const recoveryDiff = currentRecovery - avgRecovery;
    if (Math.abs(recoveryDiff) > 10) {
      parts.push(`Today's recovery (${currentRecovery}%) is ${recoveryDiff > 0 ? 'above' : 'below'} your 7-day average of ${avgRecovery}%`);
    } else {
      parts.push(`Today's recovery is close to your 7-day average of ${avgRecovery}%`);
    }
  }

  // HRV comparison
  if (currentHrv != null && avgHrv != null) {
    const hrvDiff = currentHrv - avgHrv;
    if (Math.abs(hrvDiff) > 5) {
      parts.push(`HRV is ${hrvDiff > 0 ? 'elevated' : 'lower'} compared to your average of ${avgHrv}ms`);
    }
  }

  // Best/worst pattern
  if (bestDay && worstDay && bestDay.dayName !== worstDay.dayName) {
    parts.push(`${bestDay.dayName}s tend to be your best recovery days, while ${worstDay.dayName}s are often tougher`);
  }

  return parts.length > 0 ? parts.join('. ') + '.' : null;
}
