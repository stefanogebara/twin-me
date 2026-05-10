/**
 * Twin Prompt Assembly
 * ====================
 * Builds the layered system prompt the twin sends to the chat-tier model.
 * The base prompt comes from buildTwinSystemPrompt() — this layer stacks
 * the dynamic, context-dependent blocks on top (anti-emoji, persona,
 * personality calibration, voice examples, oracle, financial coach,
 * neurotransmitter mode, emotional state, nudge history).
 *
 * Also runs neurotransmitterMode + emotionalState (needed downstream).
 *
 * Extracted from POST /api/chat/message during the 2026-05-09 monolith trim
 * (audit ARCH-1).
 */

import { buildTwinSystemPrompt } from './twinSystemPromptBuilder.js';
import { buildPersonaBlock } from './personaBlockBuilder.js';
import { buildPersonalityPrompt } from './personalityPromptBuilder.js';
import { formatOracleBlock } from './finetuning/personalityOracle.js';
import { detectConversationMode, buildNeurotransmitterPromptBlock } from './neurotransmitterService.js';
import { computeEmotionalState, buildEmotionalStateMemory } from './emotionalStateService.js';
import { CHAT_TIER_LIGHT } from './chatRouter.js';
import { createLogger } from './logger.js';

const log = createLogger('TwinPromptAssembly');

const ANTI_EMOJI_RULE = '\nCRITICAL STYLE RULE: NEVER use emojis in your responses. No emoji characters whatsoever. Use plain text, markdown bold, and line breaks for structure instead.';

function buildVoiceBlock(voiceExamples) {
  if (!voiceExamples || voiceExamples.length === 0) return null;
  const samples = voiceExamples
    .filter(m => typeof m === 'string' && m.length >= 15)
    .slice(0, 8)
    .map(m => (m.length > 500 ? m.slice(0, 500).replace(/\s\S*$/, '') + '…' : m));
  if (samples.length === 0) return null;
  return [
    '=== HOW I LITERALLY TALK (verbatim samples — mirror this cadence, word choice, rhythm, and punctuation, not abstract rules) ===',
    'These are real messages I have sent. Your replies should read like they came from the same person who wrote these:',
    '',
    ...samples.map(m => `> ${m}`),
    '',
    'Priority: match the register, sentence length, and lexical choices in these samples above any stylistic instructions elsewhere in this prompt.',
  ].join('\n');
}

function buildNudgeBlock(nudgeHistory) {
  if (!nudgeHistory || nudgeHistory.length === 0) return null;
  const lines = nudgeHistory.map(n => {
    const action = n.nudge_action ? ` (suggested: "${n.nudge_action}")` : '';
    const outcome = n.nudge_followed === true ? '✓ followed through'
      : n.nudge_followed === false ? '✗ didn\'t follow through'
      : '? unknown';
    return `- ${n.insight.substring(0, 150)}${action} → ${outcome}`;
  }).join('\n');
  return `[PAST NUDGES — what you suggested before and whether they followed through]\n${lines}\nUse this to calibrate future suggestions: lean into what works, avoid repeating ignored patterns.`;
}

async function maybeAppendFinancialBlock(systemPrompt, userId, message) {
  try {
    const { buildFinancialCoachContext } = await import('./transactions/financialChatContext.js');
    const financialBlock = await buildFinancialCoachContext(userId, message);
    if (financialBlock) {
      systemPrompt.push({ type: 'text', text: `\n${financialBlock}` });
      log.info('Financial Coach context injected', { chars: financialBlock.length });
    }
  } catch (err) {
    log.warn('Financial Coach injection failed (non-fatal)', { error: err.message });
  }
}

function persistEmotionalSnapshot(userId, emotionalState) {
  const stateMemory = buildEmotionalStateMemory(emotionalState);
  if (!stateMemory) return;
  import('./memoryStreamService.js').then(({ addMemory }) => {
    addMemory(userId, stateMemory, 'observation', { source: 'emotional_state' }, { skipImportance: true, importanceScore: 6 })
      .catch(err => log.warn('Failed to store emotional state memory', { error: err?.message }));
  });
}

export async function assembleTwinSystemPrompt({
  twinContext,
  featureFlags,
  userLocation,
  coreBlockText,
  personalityProfile,
  soulLayers,
  oracleDraft,
  routingTier,
  message,
  userId,
  useNeurotransmitterModes,
  useEmotionalState,
  useEmbodiedFeedback,
}) {
  const {
    soulSignature, platformData, twinSummary, proactiveInsights,
    departmentProposals, writingProfile, voiceExamples, nudgeHistory,
  } = twinContext;

  const wikiPagesForPrompt = featureFlags.llm_wiki === true ? twinContext.wikiPages : null;

  const systemPrompt = buildTwinSystemPrompt(
    soulSignature, platformData, twinSummary, proactiveInsights,
    userLocation, coreBlockText, departmentProposals, wikiPagesForPrompt,
  );

  systemPrompt.push({ type: 'text', text: ANTI_EMOJI_RULE });

  const personaBlock = buildPersonaBlock({ soulSignature, twinSummary, writingProfile, platformData });
  if (personaBlock) {
    systemPrompt.splice(1, 0, { type: 'text', text: `\n${personaBlock}` });
    log.debug('Persona block built', { chars: personaBlock.length });
  }

  const personalityPromptBlock = buildPersonalityPrompt(personalityProfile, soulLayers);
  log.info('Chat personality state', {
    hasCalibration: !!personalityPromptBlock,
    hasProfile: !!personalityProfile,
    profileConfidence: personalityProfile?.confidence?.toFixed(2) ?? null,
    hasSoulLayers: !!soulLayers,
    soulLayerSource: soulLayers?._source ?? null,
  });
  if (personalityPromptBlock) {
    systemPrompt.push({ type: 'text', text: `\n${personalityPromptBlock}` });
  }

  const voiceBlock = buildVoiceBlock(voiceExamples);
  if (voiceBlock) {
    systemPrompt.push({ type: 'text', text: `\n${voiceBlock}` });
  }

  const skipOracle = routingTier === CHAT_TIER_LIGHT;
  const oracleBlock = skipOracle ? null : formatOracleBlock(oracleDraft);
  if (oracleBlock) {
    systemPrompt.push({ type: 'text', text: `\n${oracleBlock}` });
  }

  await maybeAppendFinancialBlock(systemPrompt, userId, message);

  let neurotransmitterMode = { mode: 'default', confidence: 0, matchedKeywords: [] };
  if (useNeurotransmitterModes) {
    neurotransmitterMode = detectConversationMode(message);
    if (neurotransmitterMode.mode !== 'default') {
      const ntBlock = buildNeurotransmitterPromptBlock(neurotransmitterMode.mode);
      if (ntBlock) {
        systemPrompt.push({ type: 'text', text: `\n${ntBlock}` });
      }
    }
  }

  const emotionalState = useEmotionalState
    ? computeEmotionalState(platformData, message)
    : { promptBlock: null };
  if (useEmotionalState && emotionalState.promptBlock) {
    persistEmotionalSnapshot(userId, emotionalState);
  }

  if (useEmbodiedFeedback) {
    const nudgeBlock = buildNudgeBlock(nudgeHistory);
    if (nudgeBlock) {
      systemPrompt.push({ type: 'text', text: `\n${nudgeBlock}` });
    }
  }

  return { systemPrompt, neurotransmitterMode, emotionalState };
}
