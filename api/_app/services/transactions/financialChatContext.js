/**
 * Financial Coach context for twin chat.
 * =======================================
 * When the user asks a money-related question, this service returns a compact
 * text block that twin-chat.js injects into the system prompt. The block lists
 * the user's last 30 days of transactions with their emotional fingerprints
 * (stress score, HRV, music valence, calendar load at moment of purchase).
 *
 * Keyword detection is intentionally wide — we'd rather over-inject than miss
 * a relevant context. PT-BR + EN terms. Returns null when the message is
 * clearly NOT about money (skips the DB query entirely).
 *
 * Zero LLM, zero embedding cost — pure SQL + text assembly.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('financial-chat-context');

// Money-talk keyword triggers (PT-BR + EN, deliberately broad).
const MONEY_KEYWORDS = [
  // PT-BR
  'dinheiro', 'gasto', 'gastei', 'gasta', 'gastos', 'gastei', 'gastando',
  'compra', 'comprei', 'compras', 'comprando',
  'dívida', 'divida', 'pagar', 'paguei', 'pagamento',
  'extrato', 'fatura', 'cartão', 'cartao', 'débito', 'credito', 'crédito',
  'nubank', 'itaú', 'itau', 'bradesco', 'santander',
  'economiz', 'poupar', 'poupei', 'orçamento', 'orcamento',
  'salário', 'salario', 'renda', 'financeir',
  'impuls', 'stress shop', 'stress-shop',
  'ifood', 'rappi', 'amazon', 'shein', 'mercado livre',
  'r$', 'reais',
  // EN
  'money', 'spend', 'spent', 'spending', 'purchase', 'bought',
  'debt', 'credit card', 'debit',
  'statement', 'bill', 'invoice',
  'budget', 'save', 'savings',
  'salary', 'income', 'financial',
  'impulse', 'stress shop',
];

export function isFinancialMessage(text) {
  if (!text || typeof text !== 'string') return false;
  const lowered = text.toLowerCase();
  return MONEY_KEYWORDS.some((kw) => lowered.includes(kw));
}

function formatBRL(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(n);
}

function shortDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '?';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/**
 * Fetch the last 30 days of transactions with emotional context, format as
 * a chat-friendly text block. Returns null if there are no transactions or
 * the message is not money-related.
 *
 * @param {string} userId
 * @param {string} userMessage  — the user's latest message (used only to short-circuit)
 * @param {object} [opts]
 * @param {number} [opts.limit]  — max transactions to include (default 40)
 * @param {number} [opts.windowDays]  — lookback window (default 30)
 * @returns {Promise<string|null>}
 */
export async function buildFinancialCoachContext(userId, userMessage, opts = {}) {
  if (!isFinancialMessage(userMessage)) return null;
  const { limit = 40, windowDays = 30 } = opts;

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data, error } = await supabaseAdmin
      .from('user_transactions')
      .select(`
        amount, merchant_raw, merchant_normalized, category, transaction_date, account_type,
        emotional_context:transaction_emotional_context (
          recovery_score, hrv_score, calendar_load, music_valence,
          computed_stress_score, is_stress_shop_candidate
        )
      `)
      .eq('user_id', userId)
      .gte('transaction_date', since)
      .order('transaction_date', { ascending: false })
      .limit(limit);

    if (error) {
      log.warn(`fetch failed: ${error.message}`);
      return null;
    }
    if (!data?.length) return null;

    // Totals
    let totalOut = 0;
    let totalIn = 0;
    let stressShopCount = 0;
    let stressShopTotal = 0;
    const categoryTotals = {};

    const lines = [];
    for (const t of data) {
      const ec = Array.isArray(t.emotional_context) ? t.emotional_context[0] : t.emotional_context;
      const abs = Math.abs(t.amount);
      if (t.amount < 0) totalOut += abs;
      else totalIn += t.amount;

      const cat = t.category || 'other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (t.amount < 0 ? abs : 0);

      const stressMark = ec?.is_stress_shop_candidate ? ' [STRESS-SHOP]' : '';
      if (ec?.is_stress_shop_candidate) {
        stressShopCount++;
        if (t.amount < 0) stressShopTotal += abs;
      }

      const contextBits = [];
      if (ec?.recovery_score !== null && ec?.recovery_score !== undefined) {
        contextBits.push(`recovery ${Math.round(ec.recovery_score)}%`);
      }
      if (ec?.hrv_score !== null && ec?.hrv_score !== undefined && ec?.recovery_score === null) {
        contextBits.push(`HRV ${Math.round(ec.hrv_score)}`);
      }
      if (ec?.calendar_load !== null && ec?.calendar_load !== undefined && ec.calendar_load > 0) {
        contextBits.push(`${ec.calendar_load} evento${ec.calendar_load === 1 ? '' : 's'} na agenda`);
      }
      if (ec?.music_valence !== null && ec?.music_valence !== undefined) {
        const mood = ec.music_valence < 0.3 ? 'música triste' : ec.music_valence > 0.6 ? 'música feliz' : 'música neutra';
        contextBits.push(mood);
      }
      if (ec?.computed_stress_score !== null && ec?.computed_stress_score !== undefined) {
        contextBits.push(`stress ${Math.round(ec.computed_stress_score * 100)}%`);
      }
      const ctx = contextBits.length ? ` — ${contextBits.join(', ')}` : '';
      const brand = t.merchant_normalized || t.merchant_raw;
      lines.push(
        `${shortDate(t.transaction_date)} · ${brand} (${cat}) · ${t.amount < 0 ? '−' : '+'}${formatBRL(abs)}${ctx}${stressMark}`,
      );
    }

    const topCategories = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c, t]) => `${c} ${formatBRL(t)}`)
      .join(' · ');

    const header = [
      `=== YOUR RECENT SPENDING (${windowDays}d) ===`,
      `Total gasto: ${formatBRL(totalOut)}${totalIn > 0 ? ` · Entrada: ${formatBRL(totalIn)}` : ''}`,
      `Top categorias: ${topCategories || '(sem categorias)'}`,
      stressShopCount > 0
        ? `Compras sob stress detectadas: ${stressShopCount} (${formatBRL(stressShopTotal)})`
        : 'Nenhuma compra impulsiva sinalizada.',
      '',
      'Quando o usuário perguntar sobre gastos, use esses dados diretamente. Cite datas, valores e o contexto emocional do momento da compra. Seja específico, não genérico. Se identificar padrão entre stress e gasto, mencione.',
      '',
      'Transações (mais recente primeiro):',
    ];

    return [...header, ...lines].join('\n');
  } catch (err) {
    log.warn(`buildFinancialCoachContext crashed: ${err.message}`);
    return null;
  }
}
