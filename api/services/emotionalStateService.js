/**
 * Emotional State Service
 * ======================
 * Infers a user's current emotional and cognitive state from behavioral signals.
 * Inspired by cognitive science research on emotional memory and arousal:
 *   - Arousal signals (Whoop HRV, recovery) modulate memory encoding salience
 *   - Cognitive load (calendar density) predicts available attention for depth
 *   - Time-of-day context affects emotional weight of late-night communication
 *
 * No LLM calls — pure signal processing on already-fetched platform data.
 * Called non-blocking alongside twin context fetch.
 *
 * Output shape:
 *   {
 *     valence: 0-1,                  // emotional tone: 0=negative, 0.5=neutral, 1=positive
 *     arousal: 0-1,                  // energy level: 0=exhausted, 1=highly activated
 *     cognitiveLoad: 'low' | 'normal' | 'high',
 *     meetingCount: number,
 *     expressedSentiment: 'positive' | 'negative' | null,  // detected from user message text
 *     guidanceOverride: string|null,  // overrides derived guidance when negative sentiment detected
 *     signals: {             // human-readable signal breakdown for prompt injection
 *       whoop: string|null,
 *       calendar: string|null,
 *       timeContext: string|null,
 *     },
 *     promptBlock: string,   // ready-to-inject [CURRENT STATE] block for twin chat
 *     timestamp: string,
 *   }
 */

/**
 * Compute current emotional state from already-fetched platform context.
 *
 * @param {object} platformData - Output of fetchTwinContext() platform section
 * @param {string|null} [userMessage] - Optional user message text for sentiment detection
 * @param {object} [options]
 * @param {Date} [options.now] - Override for current time (useful in tests)
 * @returns {object} Emotional state vector + prompt block
 */
export function computeEmotionalState(platformData, userMessage = null, options = {}) {
  const now = options.now || new Date();
  const hourOfDay = now.getHours();
  const isLateNight = hourOfDay >= 22 || hourOfDay < 4;
  const isEarlyMorning = hourOfDay >= 4 && hourOfDay < 8;

  // ── Whoop signals ────────────────────────────────────────────────────────
  const whoop = platformData?.whoop || null;
  const recovery = typeof whoop?.recovery === 'number' ? whoop.recovery : null;
  const hrv = typeof whoop?.hrv === 'number' ? whoop.hrv : null;
  const sleepHours = whoop?.sleepHours ? parseFloat(whoop.sleepHours) : null;

  let whoopValenceBoost = 0;   // contribution to valence from Whoop
  let whoopArousalMod = 0;     // contribution to arousal from Whoop
  let whoopSignal = null;

  if (recovery !== null) {
    // Recovery 0-100 → valence contribution
    whoopValenceBoost = recovery >= 70 ? 0.3
      : recovery >= 50 ? 0.15
      : 0.0;

    // Low recovery suppresses energy; high recovery boosts it
    whoopArousalMod = recovery >= 85 ? 0.15
      : recovery >= 70 ? 0.05
      : recovery < 50 ? -0.2
      : 0.0;

    const recoveryLabel = recovery >= 70 ? 'good' : recovery >= 50 ? 'moderate' : 'low';
    const parts = [`Recovery ${recovery}% (${recoveryLabel})`];
    if (hrv) parts.push(`HRV ${hrv}ms`);
    if (sleepHours) parts.push(`slept ${sleepHours.toFixed(1)}h`);
    whoopSignal = parts.join(', ');
  }

  // ── Calendar signals ─────────────────────────────────────────────────────
  const calendar = platformData?.calendar || null;
  const todayEvents = calendar?.todayEvents || [];
  const meetingCount = todayEvents.length;

  let calValenceMod = 0;
  let calArousal = 0;
  let calSignal = null;

  if (meetingCount > 0) {
    // More meetings → higher arousal but lower valence (stress signal)
    calArousal = Math.min(meetingCount / 7, 0.8); // caps at 0.8
    calValenceMod = meetingCount > 6 ? -0.15
      : meetingCount > 4 ? -0.08
      : 0.0;

    calSignal = `${meetingCount} meeting${meetingCount !== 1 ? 's' : ''} today`;
  }

  // ── Time-of-day context ──────────────────────────────────────────────────
  let timeContext = null;
  let timeValenceMod = 0;

  if (isLateNight) {
    timeValenceMod = -0.05; // slight downward mood shift at night
    timeContext = 'late night';
  } else if (isEarlyMorning) {
    timeContext = 'early morning';
  }

  // ── Aggregate valence (0-1) ──────────────────────────────────────────────
  // Base: 0.5 (neutral). Whoop is primary signal, calendar and time are modifiers.
  const rawValence = 0.5
    + whoopValenceBoost
    + calValenceMod
    + timeValenceMod;
  const valence = Math.max(0, Math.min(1, rawValence));

  // ── Aggregate arousal (0-1) ──────────────────────────────────────────────
  // Base: moderate arousal (~0.4). Calendar drives activation, Whoop modulates.
  const rawArousal = 0.4
    + calArousal * 0.5   // calendar arousal weighted 0.5
    + whoopArousalMod;
  const arousal = Math.max(0, Math.min(1, rawArousal));

  // ── Cognitive load ───────────────────────────────────────────────────────
  const cognitiveLoad = (meetingCount > 5 || (recovery !== null && recovery < 50))
    ? 'high'
    : (meetingCount > 2 || (recovery !== null && recovery < 70))
    ? 'normal'
    : 'low';

  // ── Message sentiment detection ──────────────────────────────────────────
  // Quick keyword-based sentiment check on the user's current message.
  // This overrides platform-inferred valence when the user explicitly expresses emotion.
  let expressedSentiment = null;
  let guidanceOverride = null;

  if (userMessage && userMessage.length > 20) {
    const negativeWords = ['stressed', 'tired', 'exhausted', 'anxious', 'overwhelmed', 'frustrated', 'terrible', 'awful', 'horrible', 'burnout', 'burnt out', 'fried', 'disaster', 'hate', 'angry', 'depressed', 'sad', 'worried', 'panic'];
    const positiveWords = ['great', 'amazing', 'excited', 'happy', 'fantastic', 'love', 'excellent', 'perfect', 'wonderful', 'energized', 'motivated', 'proud', 'thrilled'];
    const msg = userMessage.toLowerCase();
    const negCount = negativeWords.filter(w => msg.includes(w)).length;
    const posCount = positiveWords.filter(w => msg.includes(w)).length;

    if (negCount >= 2 || (negCount === 1 && msg.length < 100)) {
      expressedSentiment = 'negative';
      guidanceOverride = 'User has expressed negative emotions directly. Be empathetic and supportive. Do NOT be upbeat or enthusiastic. Acknowledge how they feel first.';
    } else if (posCount >= 2) {
      expressedSentiment = 'positive';
    }
  }

  // ── Build prompt block ───────────────────────────────────────────────────
  const promptBlock = buildCurrentStateBlock({
    valence, arousal, cognitiveLoad, meetingCount,
    recovery, sleepHours, hrv, isLateNight,
    whoopSignal, calSignal, timeContext,
    expressedSentiment, guidanceOverride,
  });

  return {
    valence,
    arousal,
    cognitiveLoad,
    meetingCount,
    expressedSentiment,
    guidanceOverride,
    signals: { whoop: whoopSignal, calendar: calSignal, timeContext },
    promptBlock,
    timestamp: now.toISOString(),
  };
}

/**
 * Compose the [CURRENT STATE] block injected into the twin's system prompt.
 * This tells the twin HOW to respond given current signals — not just what the user did.
 */
function buildCurrentStateBlock(params) {
  const {
    valence, arousal, cognitiveLoad, meetingCount,
    recovery, sleepHours, hrv, isLateNight,
    whoopSignal, calSignal, timeContext,
    expressedSentiment, guidanceOverride,
  } = params;

  // Only inject if we have meaningful signals or expressed sentiment
  const hasSignals = whoopSignal || calSignal || isLateNight || expressedSentiment;
  if (!hasSignals) return '';

  const lines = ['[CURRENT STATE — inferred from behavioral signals]'];

  if (expressedSentiment) {
    lines.push(`Expressed sentiment: ${expressedSentiment} (detected from user message)`);
  }

  if (whoopSignal) {
    const energyLabel = arousal > 0.6 ? 'elevated' : arousal < 0.3 ? 'depleted' : 'moderate';
    lines.push(`Biometrics: ${whoopSignal}`);
    lines.push(`Energy level: ${(arousal * 100).toFixed(0)}% (${energyLabel})`);
  }

  if (calSignal) {
    lines.push(`Schedule: ${calSignal}`);
  }

  if (timeContext) {
    lines.push(`Time: ${timeContext}`);
  }

  // Sentiment override takes priority over inferred guidance
  if (guidanceOverride) {
    lines.push(`→ ${guidanceOverride}`);
  } else {
    const guidance = deriveGuidance({ valence, arousal, cognitiveLoad, meetingCount, recovery, sleepHours, isLateNight });
    if (guidance) {
      lines.push(`→ ${guidance}`);
    }
  }

  return lines.join('\n');
}

/**
 * Derive behavioral guidance for the twin based on inferred state.
 * This is what makes the twin contextually aware — it adapts tone to the moment.
 */
function deriveGuidance({ valence, arousal, cognitiveLoad, meetingCount, recovery, sleepHours, isLateNight }) {
  const parts = [];

  if (isLateNight) {
    parts.push('Late-night messages carry higher emotional weight — be more present and warmer, less analytical.');
  }

  if (cognitiveLoad === 'high') {
    parts.push('High cognitive load detected — keep responses concise and actionable. Acknowledge pressure before analysis.');
  }

  if (recovery !== null && recovery < 50) {
    parts.push('Low biometric recovery — energy may be limited. Avoid overwhelming with information; one key thing at a time.');
  }

  if (sleepHours !== null && sleepHours < 6) {
    parts.push('Short sleep detected — be gentle and supportive in tone.');
  }

  if (valence < 0.35) {
    parts.push('Signals suggest lower mood — lead with acknowledgment before advice. Do not be artificially cheerful.');
  } else if (valence > 0.75) {
    parts.push('Signals suggest positive/energized state — can match their energy with enthusiasm.');
  }

  if (meetingCount > 6) {
    parts.push('Heavy meeting day — if they ask about productivity or energy, acknowledge the schedule pressure.');
  }

  return parts.join(' ');
}

/**
 * Build a natural-language memory snapshot of the current emotional state.
 * Stored as an 'observation' memory so the twin can recall "what today felt like".
 *
 * @param {object} emotionalState - Output of computeEmotionalState()
 * @returns {string|null} Memory content string, or null if insufficient signals
 */
export function buildEmotionalStateMemory(emotionalState) {
  const { signals, cognitiveLoad, recovery, valence } = emotionalState;
  if (!signals.whoop && !signals.calendar) return null;

  const parts = [];

  if (signals.whoop) {
    parts.push(signals.whoop);
  }

  if (signals.calendar) {
    parts.push(signals.calendar);
  }

  const stressLabel = cognitiveLoad === 'high' ? 'physiologically and/or cognitively stressed'
    : cognitiveLoad === 'normal' ? 'moderate pressure day'
    : 'low-pressure day';

  const moodLabel = valence < 0.35 ? 'lower mood signals'
    : valence > 0.65 ? 'positive mood signals'
    : 'neutral mood signals';

  parts.push(`${stressLabel}, ${moodLabel}`);

  return parts.join(' — ');
}
