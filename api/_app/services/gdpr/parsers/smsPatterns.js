/**
 * GDPR parser: SMS & Call Patterns.
 * Extracted verbatim from gdprImportService.js (audit A2-M2a god-file split).
 * Pure code motion — only import/export plumbing added.
 */

// ---------------------------------------------------------------------------
// SMS & Call Patterns parser
// ---------------------------------------------------------------------------
//
// Input JSON format (written by the Android SmsStatsModule, see REQUIRES MOBILE REBUILD):
// {
//   "userId": "...",
//   "extractedAt": "...",
//   "smsPatterns": {
//     "sentLast30d":            number,
//     "receivedLast30d":        number,
//     "uniqueContacts":         number,
//     "peakHour":               number,        // 0-23
//     "sendHourHistogram":      number[24],    // count per hour of day
//     "avgResponseTimeMinutes": number | null
//   },
//   "callPatterns": {              // optional — requires READ_CALL_LOG
//     "totalOutgoing30d":    number,
//     "totalIncoming30d":    number,
//     "avgDurationSeconds":  number
//   }
// }
//
// PRIVACY: No message content is ever stored. Contact names are not stored.
// Only aggregate counts, timing histograms, and anonymized patterns.

function parseSmsPatterns(buffer) {
  let data;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('sms_patterns file is not valid JSON');
  }

  const sms   = data.smsPatterns;
  const calls = data.callPatterns || null;

  if (!sms || typeof sms !== 'object') {
    throw new Error('sms_patterns JSON missing "smsPatterns" key');
  }

  const sentLast30d   = typeof sms.sentLast30d   === 'number' ? sms.sentLast30d   : 0;
  const recvLast30d   = typeof sms.receivedLast30d === 'number' ? sms.receivedLast30d : 0;
  const uniqueContacts = typeof sms.uniqueContacts === 'number' ? sms.uniqueContacts : null;
  const peakHour       = typeof sms.peakHour      === 'number' ? sms.peakHour      : null;
  const histogram      = Array.isArray(sms.sendHourHistogram) ? sms.sendHourHistogram : null;
  const avgResponseMin = typeof sms.avgResponseTimeMinutes === 'number'
    ? Math.round(sms.avgResponseTimeMinutes)
    : null;

  const observations = [];

  const fmtHour = (h) => {
    const n = ((h % 24) + 24) % 24;
    return n === 0 ? '12am' : n < 12 ? `${n}am` : n === 12 ? '12pm' : `${n - 12}pm`;
  };

  // ── Volume summary ─────────────────────────────────────────────────────────
  const totalSms = sentLast30d + recvLast30d;
  if (totalSms > 0) {
    const ratio = sentLast30d > 0 && recvLast30d > 0
      ? (sentLast30d / recvLast30d).toFixed(2)
      : null;
    const style = ratio !== null
      ? Number(ratio) > 1.3
        ? 'tends to initiate more than they receive'
        : Number(ratio) < 0.7
          ? 'tends to receive more than they send'
          : 'balanced sender/receiver'
      : '';

    observations.push(
      `Texted ${sentLast30d.toLocaleString()} times and received ${recvLast30d.toLocaleString()} ` +
      `texts in the past month` +
      (style ? ` — ${style}` : '')
    );
  }

  // ── Unique contacts ────────────────────────────────────────────────────────
  if (uniqueContacts !== null && uniqueContacts > 0) {
    const breadthLabel = uniqueContacts >= 50
      ? 'very broad social texter (50+ contacts)'
      : uniqueContacts >= 20
        ? 'active social texter'
        : uniqueContacts >= 10
          ? 'moderately social texter'
          : 'focused texter (tight inner circle)';
    observations.push(
      `Texted ${uniqueContacts} unique contacts in the past month — ${breadthLabel}`
    );
  }

  // ── Timing patterns ────────────────────────────────────────────────────────
  if (peakHour !== null) {
    observations.push(`Peak SMS hour: most texts sent around ${fmtHour(peakHour)}`);
  }

  if (histogram && histogram.length === 24) {
    const total = histogram.reduce((s, c) => s + (c || 0), 0);
    if (total > 0) {
      const morning   = histogram.slice(6, 12).reduce((s, c) => s + (c || 0), 0);
      const afternoon = histogram.slice(12, 18).reduce((s, c) => s + (c || 0), 0);
      const evening   = histogram.slice(18, 22).reduce((s, c) => s + (c || 0), 0);
      const night     = (histogram.slice(22, 24).reduce((s, c) => s + (c || 0), 0)
        + histogram.slice(0, 6).reduce((s, c) => s + (c || 0), 0));
      const pct = (n) => Math.round((n / total) * 100);

      const dominant = [
        ['morning', pct(morning)],
        ['afternoon', pct(afternoon)],
        ['evening', pct(evening)],
        ['late-night', pct(night)],
      ].sort((a, b) => Number(b[1]) - Number(a[1]))[0];

      observations.push(
        `SMS timing: ${pct(morning)}% morning, ${pct(afternoon)}% afternoon, ` +
        `${pct(evening)}% evening, ${pct(night)}% late-night ` +
        `(primarily a ${dominant[0]} texter)`
      );
    }
  }

  // ── Response time ──────────────────────────────────────────────────────────
  if (avgResponseMin !== null && avgResponseMin >= 0) {
    const responseLabel = avgResponseMin <= 5
      ? 'very fast responder'
      : avgResponseMin <= 20
        ? 'quick responder'
        : avgResponseMin <= 60
          ? 'moderate responder'
          : 'slow/async texter';
    observations.push(
      `Average SMS response time: ${avgResponseMin} min (${responseLabel})`
    );
  }

  // ── Call patterns (optional) ───────────────────────────────────────────────
  if (calls && typeof calls === 'object') {
    const outgoing   = typeof calls.totalOutgoing30d  === 'number' ? calls.totalOutgoing30d  : 0;
    const incoming   = typeof calls.totalIncoming30d  === 'number' ? calls.totalIncoming30d  : 0;
    const avgDurSec  = typeof calls.avgDurationSeconds === 'number' ? Math.round(calls.avgDurationSeconds) : null;
    const totalCalls = outgoing + incoming;

    if (totalCalls > 0) {
      const callStyle = outgoing > incoming * 1.3
        ? 'tends to initiate calls'
        : outgoing < incoming * 0.7
          ? 'tends to receive rather than initiate calls'
          : 'balanced caller';

      const avgDurLabel = avgDurSec !== null
        ? avgDurSec >= 300
          ? `avg ${Math.round(avgDurSec / 60)} min/call (long conversations)`
          : avgDurSec >= 60
            ? `avg ${Math.round(avgDurSec / 60)} min/call`
            : `avg ${avgDurSec}s/call (brief check-ins)`
        : '';

      observations.push(
        `Made/received ${totalCalls} phone calls in the past month ` +
        `(${outgoing} out, ${incoming} in — ${callStyle})` +
        (avgDurLabel ? `, ${avgDurLabel}` : '')
      );

      // SMS vs call preference
      if (totalSms > 0) {
        const smsRatio = (totalSms / Math.max(totalCalls, 1)).toFixed(0);
        const prefLabel = Number(smsRatio) >= 5
          ? 'strongly prefers texting over calling'
          : Number(smsRatio) >= 2
            ? 'leans toward texting'
            : 'mixes texting and calling';
        observations.push(
          `Communication style: ${smsRatio} texts per phone call — ${prefLabel}`
        );
      }
    }
  }

  if (observations.length === 0) {
    throw new Error(
      'No SMS pattern data found in the file. ' +
      'Ensure the Android app has READ_SMS permission and has synced at least once.'
    );
  }

  return observations;
}

export { parseSmsPatterns };
