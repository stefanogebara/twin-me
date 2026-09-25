/** A deliberately narrow, read-only scenario. Future dates and multiple prices need clarification. */
export function affordabilityAnswer(message, readAllowance, language = 'en', currency = 'EUR') {
  if (currency !== 'EUR') return null;
  const text = String(message || '').toLowerCase();
  const es = /^\s*[¿]?puedo (gastar|permitirme|pagar)\b/.test(text);
  const pt = /^\s*posso (gastar|pagar)\b/.test(text);
  if (!es && !pt && !/^\s*can i (spend|afford)\b/.test(text)) return null;
  if (!/\b(today|tonight|hoy|hoje)\b|esta noche/.test(text)) return null;
  if (/\b(tomorrow|yesterday|mañana|amanhã|ayer|ontem|week|month|semana|mes|mês|dollars?|usd|gbp|pounds?)\b|[$£]|-\s*\d/.test(text)) return null;
  const numbers = text.match(/\d+(?:[.,]\d+)*/g) || [];
  if (numbers.length !== 1 || !/^\d+(?:[.,]\d{1,2})?$/.test(numbers[0])) return null;
  const currencyAmount = /(?:€|\beur\b)\s*\d|\d\s*(?:€|eur\b|euros?\b)/.test(text);
  if (!currencyAmount) return null;
  const cost = Number(numbers[0].replace(',', '.'));
  if (!Number.isFinite(cost) || cost <= 0) return null;
  const allowance = readAllowance();
  const locale = es ? 'es' : pt ? 'pt-BR' : language;
  const money = n => `${Number(n).toFixed(2).replace('.', ',')} €`;
  const empty = { figures: [], actions: [], receipts: [] };
  if (!Number.isFinite(allowance?.amount)) {
    const missing = locale === 'es' ? 'No puedo comparar ese gasto todavía: falta una estimación de lo disponible hoy.'
      : locale === 'pt-BR' ? 'Ainda não posso comparar esse gasto: falta uma estimativa do disponível hoje.'
        : 'I cannot compare that purchase yet: today’s spending estimate is unavailable.';
    return { ...empty, text: missing };
  }
  const difference = Math.round((cost - allowance.amount) * 100) / 100;
  const above = difference > 0;
  const amount = money(cost); const estimate = money(allowance.amount); const gap = money(Math.abs(difference));
  const result = locale === 'es'
    ? above ? `${amount} supera en ${gap} la estimación de hoy, ${estimate}.`
      : `${amount} está dentro de la estimación de hoy, ${estimate}; quedarían ${gap}. Es una estimación, no una garantía.`
    : locale === 'pt-BR'
      ? above ? `${amount} fica ${gap} acima da estimativa de hoje, ${estimate}.`
        : `${amount} está dentro da estimativa de hoje, ${estimate}; sobrariam ${gap}. É uma estimativa, não uma garantia.`
      : above ? `${amount} is ${gap} above today’s estimate of ${estimate}.`
        : `${amount} is within today’s estimate of ${estimate}, leaving ${gap}. That is an estimate, not a guarantee.`;
  return { ...empty, text: result, figures: [{ kind: 'purchase', cost, allowance: allowance.amount, difference, currency }] };
}
