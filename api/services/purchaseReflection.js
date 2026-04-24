/**
 * purchaseReflection
 *
 * Takes a purchase-context snapshot + the user's message and generates a
 * short reflection. Not advice. Not judgment. Mirror + one question.
 *
 * Part of Phase: Financial-Emotional Twin (2026-04-24). The explicit
 * reflection style was chosen on the Renan call — "WHY you spend, not
 * WHAT you spend."
 */
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { createLogger } from './logger.js';

const log = createLogger('PurchaseReflection');

/**
 * Detect Portuguese (Brazilian) vs English from the user's message. We keep
 * this crude on purpose — if ambiguous, prefer PT-BR (Brazil-first market).
 */
function detectLang(text) {
  const t = (text || '').toLowerCase();
  if (/\b(vou|quero|estou|comprar|comprando|pensando|mercado|ifood|r\$)\b/.test(t)) return 'pt-BR';
  if (/\b(i|want|thinking|about\s*to|buy|buying|\$)\b/.test(t)) return 'en';
  return 'pt-BR';
}

/**
 * Compose the context section the LLM will mirror from. Only include what's
 * actually fresh — don't feed 277-hour-old Whoop data into the prompt as if
 * it were current, that makes the reflection hallucinate.
 */
function formatContextForPrompt(ctx) {
  const lines = [];

  if (ctx.biology?.available && !ctx.biology.stale) {
    const { recovery_score, hrv_ms, resting_hr } = ctx.biology;
    const bits = [];
    if (recovery_score != null) bits.push(`recovery ${recovery_score}%`);
    if (hrv_ms != null) bits.push(`HRV ${hrv_ms}ms`);
    if (resting_hr != null) bits.push(`resting HR ${resting_hr}bpm`);
    if (bits.length) lines.push(`Biology (from Whoop, current): ${bits.join(', ')}`);
  } else if (ctx.biology?.available && ctx.biology.stale) {
    lines.push(`Biology: last Whoop reading is ${ctx.biology.age_hours}h old — too stale to trust as current state`);
  } else {
    lines.push(`Biology: no Whoop data available`);
  }

  if (ctx.music?.available && !ctx.music.stale && ctx.music.track_count > 0) {
    const sample = ctx.music.tracks.slice(0, 5).map(t => `${t.track} — ${t.artist}`).join('; ');
    lines.push(`Music last ${ctx.music.window_hours}h (${ctx.music.track_count} tracks): ${sample}`);
  } else if (ctx.music?.available && ctx.music.stale) {
    lines.push(`Music: Spotify sync is ${ctx.music.age_hours}h stale — no current listening signal`);
  } else {
    lines.push(`Music: no Spotify listening in window`);
  }

  if (ctx.schedule?.available && ctx.schedule.events.length > 0) {
    const past = ctx.schedule.events.filter(e => e.relation === 'past');
    const up = ctx.schedule.events.filter(e => e.relation === 'upcoming');
    const parts = [];
    if (past.length) parts.push(`${past.length} meeting${past.length>1?'s':''} in last ${ctx.schedule.window.past_hours}h`);
    if (up.length) parts.push(`${up.length} coming up in next ${ctx.schedule.window.future_hours}h`);
    if (up.length <= 3) {
      const names = up.map(e => e.title).filter(Boolean).slice(0, 3);
      if (names.length) parts.push(`(next: ${names.join(', ')})`);
    }
    lines.push(`Calendar: ${parts.join(', ')}`);
  } else {
    lines.push(`Calendar: clear in window`);
  }

  return lines.join('\n');
}

function systemPrompt(lang) {
  if (lang === 'pt-BR') {
    return `Você é o "twin" de uma pessoa — a versão de IA dela mesma, que conhece seu corpo, humor e padrões. Ela acabou de te avisar que está pensando em comprar algo.

Sua única missão: devolver uma reflexão curta que a ajude a ver o que está acontecendo por dentro dela agora — não para impedir a compra, não para julgar, não para dar conselho.

REGRAS ABSOLUTAS:
- No máximo 3 frases. Nunca mais.
- Uma frase que espelha o estado atual dela usando APENAS dados que eu te der. Se não tiver dado, não invente.
- Uma pergunta aberta que a convide a se observar. A pergunta deve parecer vinda de um amigo próximo, não de um terapeuta.
- Zero conselhos. Zero avisos. Zero "talvez você devesse". Zero "considere se".
- Zero emojis.
- Tom: direto, caloroso, íntimo. Como se fosse alguém que a conhece há anos.
- Português brasileiro coloquial. Pode usar "cê" se soar natural.
- Se o estado dela estiver bom (recovery alto, calendário leve), reconheça isso e faça uma pergunta diferente — não force ansiedade onde não tem.`;
  }

  return `You are this person's "twin" — the AI version of themselves that knows their body, mood, and patterns. They just told you they're thinking about buying something.

Your only job: give back a short reflection that helps them see what's happening inside them right now — not to block the purchase, not to judge, not to give advice.

HARD RULES:
- Max 3 sentences. Never more.
- One sentence mirroring their current state using ONLY the data I give you. If there's no data, don't invent.
- One open question that invites them to notice themselves. Should sound like a close friend, not a therapist.
- Zero advice. Zero warnings. Zero "maybe you should". Zero "consider whether".
- Zero emojis.
- Tone: direct, warm, intimate. Like someone who's known them for years.
- If their state looks good (high recovery, light calendar), acknowledge it and ask a different question — don't force anxiety where there isn't any.`;
}

/**
 * Generate the reflection.
 *
 * @param {object} ctx — output of buildPurchaseContext()
 * @param {string} userMessage — raw WhatsApp text
 * @returns {Promise<{text: string, lang: string, model: string, tokens: number}>}
 */
export async function generatePurchaseReflection(ctx, userMessage) {
  const lang = detectLang(userMessage);
  const contextBlock = formatContextForPrompt(ctx);

  const userPrompt = `What they said:\n"${userMessage}"\n\nTheir state right now:\n${contextBlock}\n\nRespond in ${lang === 'pt-BR' ? 'Brazilian Portuguese' : 'English'}.`;

  const t0 = Date.now();
  const result = await complete({
    tier: TIER_ANALYSIS,
    system: systemPrompt(lang),
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.7,
    maxTokens: 180,
    userId: ctx.user_id,
    serviceName: 'purchase_reflection',
    sensitiveContent: true, // financial + biological state, route to cheapest tier per NemoClaw privacy pattern
  });

  const elapsed_ms = Date.now() - t0;
  const text = (result.content || '').trim();

  log.info('Reflection generated', {
    lang,
    elapsed_ms,
    model: result.model,
    tokens: result.usage?.total_tokens,
    cost: result.cost,
    biology_fresh: ctx.biology?.available && !ctx.biology.stale,
    music_fresh: ctx.music?.available && !ctx.music.stale,
    calendar_count: ctx.schedule?.events?.length || 0,
  });

  return { text, lang, model: result.model, usage: result.usage, cost: result.cost, elapsed_ms };
}

export default generatePurchaseReflection;
