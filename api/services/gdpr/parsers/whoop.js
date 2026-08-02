/**
 * GDPR parser: Whoop.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

import { parseCsvRows } from '../shared.js';
import { safeAdmZip } from '../zipSafety.js';

// ---------------------------------------------------------------------------
// Whoop data export parser
// ---------------------------------------------------------------------------
// Whoop exports a ZIP containing CSV files:
//   physiological_cycles.csv — daily recovery/HRV/RHR
//   sleeps.csv               — nightly sleep data
//   workouts.csv             — workout strain/HR data
// ---------------------------------------------------------------------------

function parseWhoop(buffer) {
  let zip;
  try {
    zip = safeAdmZip(buffer);
  } catch {
    throw new Error('Whoop export must be a ZIP file downloaded from the Whoop app');
  }

  const observations = [];

  // ── Helper: find entry ignoring path prefix ─────────────────────────────
  const findEntry = (name) => zip.getEntries().find(e =>
    e.entryName.toLowerCase().endsWith(name.toLowerCase())
  );

  // ── Physiological cycles (recovery / HRV / RHR) ─────────────────────────
  const cyclesEntry = findEntry('physiological_cycles.csv');
  if (cyclesEntry) {
    const rows = parseCsvRows(cyclesEntry.getData().toString('utf8'));
    if (rows.length > 0) {
      // Whoop has shipped more than one spelling of these columns. Current
      // exports use 'Heart rate variability (ms)' and 'Resting heart rate (bpm)';
      // older ones used 'HRV (ms)' and 'Resting heart rate'. Reading only the
      // legacy names made every lookup undefined on a current export, so the HRV
      // and resting-heart-rate observations were silently dropped — the export
      // still imported, just without those two signals. Try each alias in order.
      const numericColumn = (aliases) => {
        const header = aliases.find(a => rows.some(r => r[a] !== undefined && r[a] !== ''));
        if (!header) return [];
        return rows.map(r => parseFloat(r[header])).filter(v => !isNaN(v));
      };

      const scores = numericColumn(['Recovery score %']);
      const hrvValues = numericColumn(['Heart rate variability (ms)', 'HRV (ms)']);
      const rhrValues = numericColumn(['Resting heart rate (bpm)', 'Resting heart rate']);

      if (scores.length > 0) {
        const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(0);
        const low = scores.filter(s => s < 34).length;
        const high = scores.filter(s => s >= 67).length;
        observations.push(`Whoop recovery average: ${avg}% over ${scores.length} days (${high} green days, ${low} red days)`);
        if (low > scores.length * 0.4) {
          observations.push(`Frequent low recovery on Whoop — ${low} of ${scores.length} days in the red zone (<34%)`);
        }
        if (high > scores.length * 0.5) {
          observations.push(`Consistently high Whoop recovery — ${high} of ${scores.length} days in the green zone (≥67%)`);
        }
      }

      if (hrvValues.length > 0) {
        const avgHrv = (hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length).toFixed(1);
        observations.push(`Average HRV: ${avgHrv}ms across ${hrvValues.length} nights on Whoop`);
      }

      if (rhrValues.length > 0) {
        const avgRhr = (rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length).toFixed(1);
        observations.push(`Average resting heart rate: ${avgRhr} bpm (Whoop data, ${rhrValues.length} days)`);
      }

      // Strain trend (Day Strain column)
      const strainValues = numericColumn(['Day Strain']);
      if (strainValues.length > 0) {
        const avgStrain = (strainValues.reduce((a, b) => a + b, 0) / strainValues.length).toFixed(1);
        observations.push(`Average daily strain on Whoop: ${avgStrain}/21 across ${strainValues.length} days`);
      }
    }
  }

  // ── Sleep data ────────────────────────────────────────────────────────────
  const sleepsEntry = findEntry('sleeps.csv');
  if (sleepsEntry) {
    const rows = parseCsvRows(sleepsEntry.getData().toString('utf8'))
      .filter(r => r['Nap'] === '0' || r['Nap'] === 'FALSE' || r['Nap'] === 'false' || !r['Nap']); // main sleeps only

    if (rows.length > 0) {
      const durations = rows.map(r => parseFloat(r['Asleep duration (min)'])).filter(v => !isNaN(v) && v > 60);
      const efficiencies = rows.map(r => parseFloat(r['Sleep efficiency %'])).filter(v => !isNaN(v));

      if (durations.length > 0) {
        const avgHrs = (durations.reduce((a, b) => a + b, 0) / durations.length / 60).toFixed(1);
        const under7 = durations.filter(d => d < 420).length;
        observations.push(`Average sleep duration: ${avgHrs}h (Whoop, ${durations.length} nights tracked)`);
        if (under7 > durations.length * 0.4) {
          observations.push(`Frequently under-sleeping on Whoop — ${under7} of ${durations.length} nights below 7 hours`);
        }
      }

      if (efficiencies.length > 0) {
        const avgEff = (efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length).toFixed(0);
        observations.push(`Average sleep efficiency: ${avgEff}% (Whoop, ${efficiencies.length} nights)`);
      }
    }
  }

  // ── Workout data ──────────────────────────────────────────────────────────
  const workoutsEntry = findEntry('workouts.csv');
  if (workoutsEntry) {
    const rows = parseCsvRows(workoutsEntry.getData().toString('utf8'));

    if (rows.length > 0) {
      // Sport frequency
      const sportCounts = {};
      for (const r of rows) {
        const sport = r['Sport'] || 'Unknown';
        sportCounts[sport] = (sportCounts[sport] || 0) + 1;
      }
      const topSports = Object.entries(sportCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (topSports.length > 0) {
        const sportList = topSports.map(([s, n]) => `${s} (${n}x)`).join(', ');
        observations.push(`Top Whoop workouts: ${sportList} across ${rows.length} total sessions`);
      }

      // Average strain
      const strains = rows.map(r => parseFloat(r['Strain'])).filter(v => !isNaN(v) && v > 0);
      if (strains.length > 0) {
        const avgStr = (strains.reduce((a, b) => a + b, 0) / strains.length).toFixed(1);
        observations.push(`Average workout strain: ${avgStr}/21 on Whoop across ${strains.length} sessions`);
      }

      // Average HR
      const hrs = rows.map(r => parseFloat(r['Average heart rate (bpm)'])).filter(v => !isNaN(v) && v > 0);
      if (hrs.length > 0) {
        const avgHr = (hrs.reduce((a, b) => a + b, 0) / hrs.length).toFixed(0);
        observations.push(`Average workout heart rate: ${avgHr} bpm (Whoop, ${hrs.length} sessions)`);
      }
    }
  }

  if (observations.length === 0) {
    throw new Error(
      'No Whoop data found in ZIP. Expected physiological_cycles.csv, sleeps.csv, or workouts.csv. ' +
      'Export your data from the Whoop app: Profile → Settings → Account → Privacy → Request Data.'
    );
  }

  return observations;
}

export { parseWhoop };
