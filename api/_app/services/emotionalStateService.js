/**
 * Emotional State Service — Detect and contextualize user emotional state
 *
 * Analyzes platform data signals (e.g., music mood, sleep quality, HRV)
 * combined with message sentiment to compute an emotional state vector.
 *
 * Feature-flagged via `emotional_state` (default: enabled).
 * Pure computation — no DB writes, no LLM calls.
 */

const EMOTION_KEYWORDS = {
  joy: ['happy', 'excited', 'great', 'amazing', 'wonderful', 'love', 'fantastic', 'celebrate'],
  sadness: ['sad', 'down', 'depressed', 'unhappy', 'lonely', 'miss', 'crying', 'lost'],
  anxiety: ['anxious', 'worried', 'stressed', 'nervous', 'overwhelmed', 'panic', 'afraid'],
  anger: ['angry', 'frustrated', 'annoyed', 'furious', 'irritated', 'mad'],
  calm: ['calm', 'peaceful', 'relaxed', 'serene', 'content', 'balanced', 'centered'],
  energy: ['energized', 'motivated', 'pumped', 'driven', 'focused', 'productive'],
};

/**
 * Compute emotional state from platform data signals and message content.
 *
 * @param {object} platformData - Recent platform observations (Whoop recovery, Spotify mood, etc.)
 * @param {string} message - Current user message
 * @returns {{ primaryEmotion: string, confidence: number, signals: object, promptBlock: string|null }}
 */
export function computeEmotionalState(platformData, message) {
  const lower = (message || '').toLowerCase();
  const emotionScores = {};

  // Score from message keywords
  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    const matches = keywords.filter(kw => lower.includes(kw)).length;
    emotionScores[emotion] = matches;
  }

  // Find dominant emotion
  let primaryEmotion = 'neutral';
  let maxScore = 0;
  for (const [emotion, score] of Object.entries(emotionScores)) {
    if (score > maxScore) {
      primaryEmotion = emotion;
      maxScore = score;
    }
  }

  // Platform signals (Whoop recovery, Spotify valence, etc.)
  const signals = {};
  if (platformData?.whoop?.recovery) {
    signals.recovery = platformData.whoop.recovery;
    if (platformData.whoop.recovery < 33) {
      emotionScores.sadness = (emotionScores.sadness || 0) + 1;
    } else if (platformData.whoop.recovery > 66) {
      emotionScores.energy = (emotionScores.energy || 0) + 1;
    }
  }

  if (platformData?.spotify?.valence !== undefined) {
    signals.musicMood = platformData.spotify.valence > 0.6 ? 'upbeat' : platformData.spotify.valence < 0.3 ? 'melancholic' : 'balanced';
  }

  const confidence = maxScore >= 2 ? Math.min(1, maxScore / 4) : 0;

  // Only generate a prompt block if we have confident emotional signal
  let promptBlock = null;
  if (confidence >= 0.25) {
    promptBlock = `[Emotional context: The user appears to be feeling ${primaryEmotion}. Respond with appropriate emotional attunement.]`;
  }

  return { primaryEmotion, confidence, signals, promptBlock };
}

/**
 * Build a memory-formatted string from emotional state for injection into context.
 *
 * @param {{ primaryEmotion: string, confidence: number, signals: object }} emotionalState
 * @returns {string|null} Formatted emotional state memory or null
 */
export function buildEmotionalStateMemory(emotionalState) {
  if (!emotionalState || emotionalState.confidence < 0.25) {
    return null;
  }

  const parts = [`Current emotional state: ${emotionalState.primaryEmotion}`];

  if (emotionalState.signals?.recovery) {
    parts.push(`Whoop recovery: ${emotionalState.signals.recovery}%`);
  }
  if (emotionalState.signals?.musicMood) {
    parts.push(`Recent music mood: ${emotionalState.signals.musicMood}`);
  }

  return parts.join('. ') + '.';
}
