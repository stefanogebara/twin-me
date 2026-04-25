/**
 * Transaction Nudge Service — Phase 3.4
 * ========================================
 * Closes the emotional-spend loop: when a fresh transaction arrives AND the
 * user is in a high-stress window AND the charge is discretionary + material,
 * fire a push notification within seconds so the user can catch themselves
 * before the next impulse.
 *
 * Trigger flow:
 *   Pluggy/TrueLayer webhook → tx ingested → emotion tagger computed
 *   computed_stress_score per tx → maybeNudgeForTransactions(userId, txIds)
 *   → filter → send push → mark nudged to avoid re-firing.
 *
 * Rate limits:
 *   - At most 1 nudge per user per 6h (no notification fatigue)
 *   - Skip recurring charges (is_recurring=true) — already known habits
 *   - Skip tx older than 15 minutes (if the webhook was delayed, the
 *     user already moved on — don't create a "why'd I get this?" moment)
 *   - Respect quiet hours via sendPushToUser's own gating
 */

import crypto from 'crypto';
import { supabaseAdmin } from '../database.js';
import { sendPushToUser } from '../pushNotificationService.js';
import { buildPurchaseContext } from '../purchaseContextBuilder.js';
import { generatePurchaseReflection } from '../purchaseReflection.js';
import { sendWhatsAppMessage } from '../whatsappService.js';
import { createLogger } from '../logger.js';

const log = createLogger('tx-nudge');

// Mirror of the audit-table writer in whatsapp-twinme-webhook.js. Inlined
// rather than imported because that file owns webhook routing + we want to
// keep the dependency direction one-way (transactions don't depend on
// webhook code). Hash truncated SHA-256 of the merchant message — never
// stores plaintext.
function logTxReflection(userId, outcome, sourceText, props = {}) {
  try {
    const text_hash = sourceText
      ? crypto.createHash('sha256').update(sourceText).digest('hex').slice(0, 32)
      : null;
    supabaseAdmin.from('purchase_reflections').insert({
      user_id: userId,
      outcome,
      lang: props.lang ?? null,
      has_music: props.hasMusic ?? null,
      has_calendar: props.hasCalendar ?? null,
      moment_band: props.moment_band ?? null,
      elapsed_ms: props.elapsed_ms ?? null,
      cost_usd: props.cost ?? null,
      response_length: props.response_length ?? null,
      error_message: props.error ?? null,
      text_hash,
    }).then(({ error }) => {
      if (error) log.warn(`audit row failed: ${error.message}`);
    });
  } catch (_e) {
    // never let audit writes crash the nudge flow
  }
}

const NUDGE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_TX_AGE_MS = 15 * 60 * 1000;
const STRESS_THRESHOLD = 0.6;
const MIN_AMOUNT_BRL = 100;
const DISCRETIONARY_CATEGORIES = new Set([
  'food_delivery',
  'shopping',
  'entertainment',
  'ride_sharing',
  'clothing',
]);

/**
 * Returns null if no nudge should fire, else the chosen row + reason.
 */
function shouldNudge(tx) {
  if (!tx) return null;
  if (tx.is_recurring) return null;
  if (!tx.category || !DISCRETIONARY_CATEGORIES.has(tx.category)) return null;
  const absAmount = Math.abs(Number(tx.amount) || 0);
  if (absAmount < MIN_AMOUNT_BRL) return null;
  const stress = tx.emotional_context?.computed_stress_score;
  if (stress === null || stress === undefined || stress < STRESS_THRESHOLD) return null;
  // Only new tx — webhook may replay old ones on retry
  if (tx.transaction_date) {
    const age = Date.now() - new Date(tx.transaction_date).getTime();
    if (age > MAX_TX_AGE_MS) return null;
  }
  return { stress, amount: absAmount };
}

async function hasRecentNudge(userId) {
  const since = new Date(Date.now() - NUDGE_COOLDOWN_MS).toISOString();
  const { count, error } = await supabaseAdmin
    .from('proactive_insights')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('category', 'stress_nudge')
    .gte('created_at', since);
  if (error) {
    log.warn(`cooldown check failed for ${userId}: ${error.message}`);
    return false;
  }
  return (count || 0) > 0;
}

function formatBRL(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

/**
 * Given a set of transaction ids we just inserted (from pluggyIngestion or
 * trueLayerIngestion), fetch them with their emotional context, pick the
 * highest-stress qualifying one, and fire a push.
 *
 * Idempotent: if anything fails, it's logged and swallowed — we never want a
 * nudge failure to fail the webhook pipeline.
 */
export async function maybeNudgeForTransactions(userId, transactionIds) {
  if (!userId || !Array.isArray(transactionIds) || !transactionIds.length) return;

  try {
    if (await hasRecentNudge(userId)) {
      log.info(`user ${userId} in nudge cooldown; skip`);
      return;
    }

    const { data: rows, error } = await supabaseAdmin
      .from('user_transactions')
      .select(`
        id, amount, currency, merchant_normalized, merchant_raw, category,
        transaction_date, is_recurring,
        emotional_context:transaction_emotional_context (
          computed_stress_score,
          is_stress_shop_candidate
        )
      `)
      .in('id', transactionIds)
      .eq('user_id', userId)
      .lt('amount', 0);

    if (error) {
      log.warn(`fetch tx for nudge failed: ${error.message}`);
      return;
    }

    const candidates = (rows || [])
      .map((r) => ({ row: r, ctx: shouldNudge(r) }))
      .filter((c) => c.ctx !== null)
      .sort((a, b) => (b.ctx.stress - a.ctx.stress) || (b.ctx.amount - a.ctx.amount));

    if (!candidates.length) return;

    const winner = candidates[0];
    const merchant = winner.row.merchant_normalized || winner.row.merchant_raw || 'algo';
    const amount = formatBRL(Math.abs(winner.row.amount));
    const stressPct = Math.round(winner.ctx.stress * 100);

    const title = 'Talvez esperar uma hora?';
    const body = `Você está em stress ${stressPct}% agora e acabou de gastar ${amount} em ${merchant}. Quer conversar antes da próxima?`;

    // Record BEFORE sending — prevents duplicate nudges on webhook retry.
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('proactive_insights')
      .insert({
        user_id: userId,
        insight: `${title} ${body}`,
        category: 'stress_nudge',
        urgency: 'high',
        metadata: {
          title,
          body,
          source_tx_id: winner.row.id,
          stress_score: winner.ctx.stress,
          amount: winner.ctx.amount,
          merchant,
          tx_category: winner.row.category,
        },
      })
      .select('id')
      .single();

    if (insErr) {
      log.warn(`persist nudge insight failed: ${insErr.message}`);
    }

    // Primary path: WhatsApp + LLM reflection
    // Fallback: push notification (when no WhatsApp channel, or if send fails)
    const [{ data: userRow }, { data: channel }] = await Promise.all([
      supabaseAdmin.from('users').select('timezone').eq('id', userId).maybeSingle(),
      supabaseAdmin.from('messaging_channels').select('channel_id, preferences')
        .eq('user_id', userId).eq('channel', 'whatsapp').maybeSingle(),
    ]);

    // Mirror the gates in whatsapp-twinme-webhook.js — same product surface,
    // same controls. Without these, the env kill switch only stops webhook
    // traffic and the per-user opt-out is silently ignored on tx-driven path.
    const purchaseMsg = `${merchant} (${amount})`;
    const purchaseBotEnabledForUser = (channel?.preferences || {}).purchase_bot_enabled !== false;
    const killSwitchOn = process.env.PURCHASE_BOT_ENABLED !== 'true';
    let whatsappSent = false;

    if (channel?.channel_id && killSwitchOn) {
      log.info(`tx nudge user=${userId} skipped — PURCHASE_BOT_ENABLED off`);
      logTxReflection(userId, 'kill_switch', purchaseMsg);
    } else if (channel?.channel_id && !purchaseBotEnabledForUser) {
      log.info(`tx nudge user=${userId} skipped — user opted out`);
      logTxReflection(userId, 'opted_out', purchaseMsg);
    } else if (channel?.channel_id) {
      try {
        const timezone = userRow?.timezone || 'America/Sao_Paulo';
        const ctx = await buildPurchaseContext(userId, { timezone });
        const refl = await generatePurchaseReflection(ctx, purchaseMsg);
        const phone = channel.channel_id.startsWith('+')
          ? channel.channel_id.slice(1)
          : channel.channel_id;
        await sendWhatsAppMessage(phone, refl.text);
        whatsappSent = true;
        log.info(`whatsapp nudge sent user=${userId} stress=${stressPct}% amount=${amount} merchant=${merchant} lang=${refl.lang}`);
        logTxReflection(userId, 'generated', purchaseMsg, {
          lang: refl.lang,
          hasMusic: !!ctx.music?.available && !ctx.music?.stale,
          hasCalendar: !!ctx.schedule?.available && (ctx.schedule.events?.length || 0) > 0,
          moment_band: ctx.moment?.band,
          elapsed_ms: refl.elapsed_ms,
          cost: refl.cost,
          response_length: refl.text?.length || 0,
        });
      } catch (err) {
        log.warn(`whatsapp nudge failed for ${userId}: ${err.message} — falling back to push`);
        logTxReflection(userId, 'failed', purchaseMsg, { error: err.message });
      }
    }

    if (!whatsappSent) {
      try {
        await sendPushToUser(userId, {
          title,
          body,
          notificationType: 'stress_nudge',
          data: { insightId: inserted?.id, txId: winner.row.id, category: winner.row.category },
        });
        log.info(`push nudge sent user=${userId} stress=${stressPct}% amount=${amount} merchant=${merchant}`);
      } catch (err) {
        log.warn(`push send also failed for user ${userId}: ${err.message}`);
      }
    }
  } catch (err) {
    log.error(`maybeNudgeForTransactions crashed: ${err.message}`);
  }
}
