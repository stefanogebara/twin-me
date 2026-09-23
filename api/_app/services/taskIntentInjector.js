/**
 * Task Intent Injector
 * ====================
 * Detects task requests ("remind me…", "draft an email to…") and injects
 * an `[AGENTIC CAPABILITY: …]` block into the system prompt so the model
 * acknowledges the capability. Fires the matching side effect:
 *   - REMINDER → parseAndCreateReminder() creates a prospective memory
 *   - DRAFT (email subset) → invokes draft_email_reply tool
 *   - USER_RULE → LLM extracts the rule, saved to user_rules core memory
 *
 * Extracted from POST /api/chat/message during the 2026-05-09 monolith trim
 * (audit ARCH-1).
 */

import { classifyTaskIntent, parseAndCreateReminder } from './taskIntentClassifier.js';
import { createLogger } from './logger.js';

const log = createLogger('TaskIntentInjector');

const TASK_INTENT_THRESHOLD = 0.7;

function appendOrPush(systemPrompt, text) {
  const last = systemPrompt[systemPrompt.length - 1];
  if (last && !last.cache_control) {
    last.text += `\n\n${text}`;
  } else {
    systemPrompt.push({ type: 'text', text });
  }
}

function buildReminderBlock() {
  return '[AGENTIC CAPABILITY: REMINDER]\nThe user is asking you to remember something for later. You HAVE the ability to set reminders and you are doing so right now. Confirm the reminder naturally — mention WHAT you\'ll remember and WHEN you\'ll bring it back up. Be specific about what you understood. Do NOT say "I can\'t set reminders" — you can and are.';
}

function buildStyleGuide(profile) {
  if (!profile) return '';
  const sl = profile.avg_sentence_length;
  const f = profile.formality_score;
  const ttr = profile.vocabulary_richness;
  const sentenceLen = sl ? (sl < 12 ? 'short and punchy' : sl < 20 ? 'medium length' : 'long and detailed') : 'natural';
  const formality = f != null ? (f < 0.3 ? 'very casual/informal' : f < 0.6 ? 'balanced' : 'formal/professional') : 'natural';
  const vocab = ttr ? (ttr < 0.4 ? 'simple and direct' : ttr < 0.6 ? 'moderately varied' : 'rich and expressive') : 'natural';
  const ocean = profile.openness != null
    ? `O=${(profile.openness * 100).toFixed(0)} C=${(profile.conscientiousness * 100).toFixed(0)} E=${(profile.extraversion * 100).toFixed(0)} A=${(profile.agreeableness * 100).toFixed(0)} N=${(profile.neuroticism * 100).toFixed(0)}`
    : 'use personality from core memory';
  return `\nUSER'S WRITING STYLE (match this exactly):
- Sentence length: ${sentenceLen}
- Formality: ${formality}
- Vocabulary: ${vocab}
- OCEAN: ${ocean}`;
}

function buildDraftBlock(personalityProfile) {
  return `[AGENTIC CAPABILITY: SMART DRAFT]
The user is asking you to compose something (email, message, reply, text). You HAVE this capability. Write it EXACTLY in their voice — not generic AI text.${buildStyleGuide(personalityProfile)}

RULES:
- Match their EXACT communication style, not a polished version of it
- If they're casual, be casual. If they're formal, be formal.
- Format the draft clearly (with Subject line if email, greeting, body, sign-off)
- After the draft, briefly note what tone/approach you used and offer to adjust
- Do NOT add disclaimers about being an AI`;
}

function buildUserRuleBlock() {
  return '[AGENTIC CAPABILITY: USER RULE]\nThe user is telling you to remember an explicit rule or preference. Confirm what you understood and that you\'ll always follow it. Be warm and specific about what you\'ll remember.';
}

function buildGenericTaskBlock(taskType) {
  return `[AGENTIC CAPABILITY: ${taskType.toUpperCase()}]\nThe user is requesting an action (${taskType}). You're developing agentic capabilities for this. Acknowledge their request naturally — explain what you understand they want and how you'd approach it. Be helpful and conversational, not robotic. If it's something you can discuss or advise on, do that now.`;
}

function maybeInvokeDraftEmailTool(userId, message) {
  if (!/\b(email|reply to|respond to|mail)\b/i.test(message)) return;
  (async () => {
    try {
      const { executeTool } = await import('./toolRegistry.js');
      const toMatch = message.match(/(?:reply to|respond to|email|write to)\s+(\w+)/i);
      const to = toMatch?.[1] || 'the recipient';
      const result = await executeTool(userId, 'draft_email_reply', { to, context: message });
      if (result?.draft) log.info('Email draft tool invoked', { userId, to });
    } catch (err) {
      log.debug('Email draft tool failed (non-fatal, using prompt injection)', { error: err.message });
    }
  })();
}

function maybeSaveUserRule(userId, message) {
  (async () => {
    try {
      const { complete: llmComplete, TIER_EXTRACTION: tier } = await import('./llmGateway.js');
      const { updateBlock, getBlocks } = await import('./coreMemoryService.js');
      const resp = await llmComplete({
        messages: [{
          role: 'user',
          content: `Extract the core rule or preference from this message. Return ONLY the rule as a short statement (max 80 chars). No quotes, no explanation.\n\nMessage: "${message}"`,
        }],
        tier,
        maxTokens: 60,
        temperature: 0,
        userId,
        purpose: 'extract_user_rule',
      });
      const rule = (resp?.content || resp?.text || '').trim().slice(0, 120);
      if (rule.length < 3) return;
      const blocks = await getBlocks(userId);
      const existing = (blocks.user_rules?.content || '').split('\n').filter(l => l.trim());
      if (existing.length >= 20) return;
      if (existing.some(r => r.toLowerCase() === rule.toLowerCase())) return;
      existing.push(rule);
      await updateBlock(userId, 'user_rules', existing.join('\n'), 'twin');
      log.info('User rule saved from chat', { userId, rule });
    } catch (err) {
      log.warn('Failed to extract user rule', { userId, error: err.message });
    }
  })();
}

export function injectTaskIntentBlocks({ userId, message, systemPrompt, personalityProfile }) {
  const taskIntent = classifyTaskIntent(message);

  if (!taskIntent.isTask || taskIntent.confidence < TASK_INTENT_THRESHOLD) {
    return { ...taskIntent, routed: false };
  }

  log.info('Task intent detected — routing', {
    userId,
    taskType: taskIntent.taskType,
    confidence: taskIntent.confidence,
    message: message.slice(0, 60),
  });

  switch (taskIntent.taskType) {
    case 'remind':
      appendOrPush(systemPrompt, buildReminderBlock());
      parseAndCreateReminder(userId, message).catch(err =>
        log.warn('Reminder creation failed (non-fatal)', { userId, error: err.message })
      );
      break;
    case 'draft':
      maybeInvokeDraftEmailTool(userId, message);
      appendOrPush(systemPrompt, buildDraftBlock(personalityProfile));
      break;
    case 'user_rule':
      appendOrPush(systemPrompt, buildUserRuleBlock());
      maybeSaveUserRule(userId, message);
      break;
    default:
      appendOrPush(systemPrompt, buildGenericTaskBlock(taskIntent.taskType));
      break;
  }

  return { ...taskIntent, routed: true };
}
