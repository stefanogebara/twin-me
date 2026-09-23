/**
 * What a sentence tells the ledger, read by rules (2026-09-21).
 *
 * "150 usd is coming from Vercel this month", "my parents send me 1750 on the 1st", "I
 * subscribed to Netflix, 12,99 a month on the 15th", "I cancelled Spotify": each was kept as
 * a note in the person's words and changed no number. These readers pull out the parts a
 * fact needs (a source or a name, an amount, a currency, a day, a cadence) so the chat can
 * offer the fact itself and the month, the day and the plan move once it is tapped. When a
 * part is missing the reader says which, and the chat asks for it. Pure, en/es/pt.
 */
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const AMOUNT = '(\\d{1,3}(?:[.,]\\d{3})+|\\d+)(?:[.,](\\d{1,2}))?';
const CCY = '(eur|euros?|\\u20ac|usd|dollars?|d[o]lares?|\\$|gbp|pounds?|libras?|brl|reais|r\\$)';
const MONTHLY = /\b(a month|per month|monthly|every month|each month|al mes|por mes|cada mes|mensual\w*|todo mes|todos os meses|por mes|mensal\w*)\b/;
const WEEKLY = /\b(a week|per week|weekly|every week|a la semana|por semana|cada semana|semanal\w*|toda semana)\b/;
const YEARLY = /\b(a year|per year|yearly|annual\w*|every year|al ano|por ano|cada ano|anual\w*|todo ano)\b/;
const ORD = '(?:st|nd|rd|th|o|\\u00ba)?';
const DAY_RE = new RegExp(`\\b(?:on the|on|the|el|dia|no dia|el dia|every)\\s+(\\d{1,2})${ORD}\\b(?!\\s*(?:eur|euros?|usd|\\u20ac|\\$|%))`);

function currencyOf(word) {
  const w = norm(word);
  if (/^(usd|dollars?|dolares?|\$)$/.test(w)) return 'USD';
  if (/^(gbp|pounds?|libras?)$/.test(w)) return 'GBP';
  if (/^(brl|reais|r\$)$/.test(w)) return 'BRL';
  return 'EUR';
}
function amountFrom(m, whole, cents) {
  const n = Number(`${String(whole).replace(/[.,]/g, '')}.${(cents || '00').padEnd(2, '0')}`);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
/** The first amount with its currency, "150 usd", "12,99 EUR", "1750 euros", "$20", or null. */
export function amountIn(text) {
  const t = norm(text);
  const m = t.match(new RegExp(`${AMOUNT}\\s*${CCY}`)) || t.match(new RegExp(`${CCY}\\s*${AMOUNT}`));
  if (!m) {
    const bare = t.match(new RegExp(`\\b${AMOUNT}\\b`));
    return bare ? { amount: amountFrom(bare, bare[1], bare[2]), currency: null } : null;
  }
  const withCcy = /^\d/.test(m[0]) ? { whole: m[1], cents: m[2], ccy: m[3] } : { whole: m[2], cents: m[3], ccy: m[1] };
  return { amount: amountFrom(m, withCcy.whole, withCcy.cents), currency: currencyOf(withCcy.ccy) };
}
export function cadenceIn(text) {
  const t = norm(text);
  if (MONTHLY.test(t)) return 'monthly';
  if (WEEKLY.test(t)) return 'weekly';
  if (YEARLY.test(t)) return 'yearly';
  return null;
}
/* "on the first of every month", "el primero", "no primeiro": the day said as a word (2026-09-23). */
const DAY_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, twentieth: 20, 'twenty-first': 21, 'twenty first': 21, 'twenty-fifth': 25, 'twenty fifth': 25, thirtieth: 30,
  primero: 1, primer: 1, segundo: 2, tercero: 3, tercer: 3, cuarto: 4, quinto: 5, sexto: 6, septimo: 7, octavo: 8, noveno: 9, decimo: 10, quince: 15, veinte: 20,
  primeiro: 1, terceiro: 3, setimo: 7, oitavo: 8, nono: 9,
};
const DAY_WORD_RE = new RegExp(`\\b(?:on the|on|the|el|dia|no dia|el dia|every|cada|todo|todos os|no)\\s+(${Object.keys(DAY_WORDS).sort((a, b) => b.length - a.length).join('|')})\\b`);
export function dayIn(text) {
  const t = norm(text);
  const m = t.match(DAY_RE);
  const d = m ? Number(m[1]) : null;
  if (d && d >= 1 && d <= 31) return d;
  const w = t.match(DAY_WORD_RE);
  return w ? DAY_WORDS[w[1]] : null;
}
const stripNoise = (s) => String(s || '').replace(/\b(the|my|a|an|o|a|os|as|el|la|los|las|do|da|de|del|meu|minha|mi|mis)\b/gi, ' ').replace(/[^\p{L}\p{N} .&'-]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Money coming in: { source, amount, currency, day, once } or null. `once` when the sentence
 * says this month, this week, tomorrow, or a date rather than a cadence.
 */
export function incomeStatement(text) {
  const t = norm(text);
  if (!/\b(coming|comes|come|arrives?|arriving|receive|receiving|get|getting|paid|pays?|send|sends|sending|transfer|income|salary|scholarship|recebo|recebi|vou receber|chega|chegam|entra|entram|me pagam?|me mandan|me manda|me mandam|salario|bolsa|ingreso|cobro|me llega|me llegan|me pagan|me envia|me envian|nomina|beca)\b/.test(t)) return null;
  if (/\b(spent|spend|gastei|gaste|pay for|cancel|subscri|assin)\b/.test(t)) return null;
  const a = amountIn(t);
  if (!a || !a.amount) return null;
  const family = t.match(/\b(?:my|meus?|minha|mis?)\s+(parents?|father|mother|dad|mum|mom|pais|pai|mae|padres?|madre|papa|mama|boss|company|job|work|employer|empresa|trabalho|trabajo|chefe|jefe|estagio|beca|bolsa)\b/u);
  const from = family || t.match(/\b(?:from|de|do|da|por parte de|of)\s+(?:the |my |o |a |os |as |el |la |mi |meu |minha |mis )?([\p{L}][\p{L}\p{N} .&'-]{1,40}?)(?=\s+(?:this|next|on|every|each|the|every|tomorrow|today|esse|este|neste|nesse|no|na|em|dia|todo|cada|el|al|mensal|amanha|manana|hoje|hoy|por)\b|[,.;]|$)/u);
  let source = from ? stripNoise(from[1]) : null;
  if (source && /^(every|each|this|next|that|todo|toda|cada|este|esse|esta|essa|el|la)\b/.test(source)) source = null;
  if (!source) return null;
  const cadence = cadenceIn(t);
  const once = !cadence && /\b(this month|this week|tomorrow|today|next week|este mes|esse mes|neste mes|este mes|esta semana|essa semana|amanha|manana|hoje|hoy|proxima semana|semana que vem|once|one-off|so uma vez|solo una vez)\b/.test(t);
  /* "sometimes", "many times", "it depends": money with no rule to it. The ledger keeps the
     words, never a day (the owner, 2026-09-23: "it's not a rule that he will deposit 100 or
     that he will deposit the same day every month"). */
  const irregular = /\b(sometimes|some times|many times|now and then|depends|it varies|as vezes|muitas vezes|depende|varia|a veces|muchas veces|de vez en cuando|de vez em quando)\b/.test(t);
  return { source: source.charAt(0).toUpperCase() + source.slice(1), amount: a.amount, currency: a.currency || 'EUR', day: dayIn(t), cadence, once, irregular };
}

/** A subscription or standing charge they took on: { name, amount, currency, cadence, day } or null. */
export function subscriptionStatement(text) {
  const t = norm(text);
  if (/\b(cancel|cancelled|canceled|cancelei|cancele|baja|parei|stopped|deixei de pagar)\b/.test(t)) return null;
  const cadence = cadenceIn(t);
  const a = amountIn(t);
  const says = /\b(subscri\w*|assin\w*|suscri\w*|plan[o]?\b|plano|membership|renew\w*|renova\w*|cae[n]? todo|caem todo|caem|cai|se cobra|charge[sd]?|cobra[mn]?|debita\w*|paying for|pago por|pago de|pay for)\b/.test(t);
  if (!cadence || !a || !a.amount || !says) return null;
  const name = t.match(/\b(?:to|the|do|da|de|del|o|a|el|la)\s+(?:plano |plan |assinatura |subscription |suscripcion )?(?:do |de |del |da |of )?([\p{L}][\p{L}\p{N}.'-]{1,30}(?:\s+[\p{L}\p{N}.'-]{1,30}){0,2}?)(?=\s+(?:tambem|tambien|also|por|a|al|every|each|cada|todo|todos|que|e|y|and|is|are|custa|cuesta|costs|cae|caem|cai|se|charge|cobra|renova|renew|,|\.)|[,.;]|$)/u)
    || t.match(/\b(?:subscribed to|assinei|me suscribi a|suscrito a|signed up for|pago|pay)\s+(?:o |a |the |el |la )?([\p{L}][\p{L}\p{N}.'-]{1,30}(?:\s+[\p{L}\p{N}.'-]{1,30}){0,2}?)(?=[,.;]|\s+(?:por|for|a|at|de|by|,)|$)/u);
  const named = name || t.match(/\b(?:for|por|para)\s+(?:the |my |o |a |el |la |meu |minha |mi )?(?:plano |plan |assinatura |subscription |suscripcion )?(?:do |de |del |da |of )?([\p{L}][\p{L}\p{N}.'-]{1,30}(?:\s+[\p{L}\p{N}.'-]{1,30}){0,2}?)(?=\s+(?:plan|plano|subscription|assinatura|suscripcion|every|each|cada|todo|,|\.)|[,.;]|$)/u);
  const nameWord = named ? stripNoise(named[1]).replace(/\s*\b(plan|plano|subscription|assinatura|suscripcion)\b\s*$/i, '').trim() : null;
  if (!nameWord || /^\d/.test(nameWord) || nameWord.length < 2) return null;
  return { name: nameWord.charAt(0).toUpperCase() + nameWord.slice(1), amount: a.amount, currency: a.currency || 'EUR', cadence, day: dayIn(t) };
}

/** A charge they ended: { name } or null. */
export function cancelStatement(text) {
  const t = norm(text);
  const m = t.match(/\b(?:i (?:have )?cancell?ed|i stopped paying(?: for)?|cancell?ed|cancelei|cancele|dei baixa (?:n[oa]|em)|parei de pagar (?:o |a )?|me di de baja de(?: la| el)?|di de baja(?: la| el| a)?|he cancelado(?: el| la)?|cancele(?: el| la)?)\s+(?:my |the |o |a |el |la |mi |meu |minha )?(?:subscription to |assinatura d[oa] |suscripcion (?:a |de )?)?([\p{L}][\p{L}\p{N}.'-]{1,30}(?:\s+[\p{L}\p{N}.'-]{1,30}){0,2}?)(?=[,.;!]|\s+(?:yesterday|today|last|this|ontem|hoje|ayer|hoy|because|porque|so|entao|entonces)|$)/u)
    || t.match(/\b([\p{L}][\p{L}\p{N}.'-]{1,30})\s+(?:is|was|esta|foi|fue|esta|ha sido)\s+(?:now )?(?:cancell?ed|cancelad[oa]|dado de baja|parad[oa])\b/u);
  const name = m ? stripNoise(m[1]) : null;
  if (!name || name.length < 2) return null;
  return { name: name.charAt(0).toUpperCase() + name.slice(1) };
}

/**
 * Who somebody on the statement is: a role word and a name. "she is my landlord", "he is my
 * flatmate", "Maria is a friend", "es mi casero", "e minha mae". { role, name } or null; the
 * name is what they wrote, to be matched against the ledger's own key by the caller. The
 * role comes from the product's list (context.js PERSON_ROLES); the words for each role are
 * here in the three languages the product speaks.
 */
const ROLE_WORDS = [
  ['landlord', /\b(landlord|landlady|casero|casera|arrendador|arrendadora|senhorio|senhoria|proprietari[oa]|dono d[oa] (apartamento|piso|casa)|due[nñ][oa] del piso)\b/],
  ['flatmate', /\b(flatmates?|roommates?|housemates?|compa[nñ]er[oa] de (piso|casa|cuarto)|colega de (apartamento|casa|quarto)|companheir[oa] de (apartamento|casa|quarto))\b/],
  ['partner', /\b(partner|girlfriend|boyfriend|wife|husband|novi[oa]|pareja|esposa|esposo|marido|mujer|namorad[oa]|companheir[oa])\b/],
  ['family', /\b(my |mi |meu |minha |mis |meus |minhas )?(father|mother|dad|mum|mom|parents?|brother|sister|grandmother|grandfather|grandma|grandpa|aunt|uncle|cousin|padre|madre|papa|mama|padres|hermano|hermana|abuel[oa]|ti[oa]|prim[oa]|pai|mae|pais|irm[aã][oa]|av[oôó]|sobrinh[oa])\b/],
  ['work', /\b(boss|employer|manager|company|client|jefe|jefa|empresa|cliente|chefe|patr[aã]o|empregador)\b/],
  ['friend', /\b(friends?|amig[oa]s?|mate|buddy|colega)\b/],
];
export function personStatement(text) {
  const t = norm(text);
  const hit = ROLE_WORDS.find(([, re]) => re.test(t));
  if (!hit) return null;
  /* The name: "X is my landlord", "the transfer to X is ... she is my landlord", "X e minha mae". */
  const said = t.match(/\b(?:to|para|a|from|de|do|da)\s+([\p{L}][\p{L} .'-]{2,60}?)\s+(?:is|was|are|e|eh|es|era|foi|sao)\b/u)
    || t.match(/^([\p{L}][\p{L} .'-]{2,60}?)\s+(?:is|e|eh|es)\s+(?:my|the|a|an|mi|el|la|un|una|meu|minha|o|a|um|uma)\b/u)
    || t.match(/\b(?:is|are|e|eh|es|sao)\s+(?:my|mi|meu|minha)\s+[\p{L}]+\b[, ]+([\p{L}][\p{L} .'-]{2,60}?)(?:[,.]|$)/u);
  const name = said ? stripNoise(said[1]).replace(/^(the|my|a|an|o|a|el|la|meu|minha|mi)\s+/i, '').trim() : null;
  if (!name || /^(transfer|payment|pago|pagamento|transferencia|bizum)\b/i.test(name)) return { role: hit[0], name: null };
  return { role: hit[0], name };
}

/** "I want to keep 300 at the end of the month": the amount they want left, or null. */
export function keepStatement(text) {
  const t = norm(text);
  if (!/\b(keep|save|left over|have left|guardar|quedarme|que me queden?|sobrar|sobre|ficar com|manter|deixar)\b/.test(t)) return null;
  if (!/\b(end of (the )?month|month end|by the end|a final de mes|fin de mes|final del mes|fim do mes|final do mes|no fim|at the end)\b/.test(t)) return null;
  const a = amountIn(t);
  return a && a.amount > 0 ? { amount: a.amount } : null;
}

/** "the 1,68 at Lidl is not mine", "that Cabify wasn't me": the amount and the name words, or null. */
export function notMineStatement(text) {
  const t = norm(text);
  if (!/\b(not mine|isn'?t mine|is not mine|wasn'?t me|was not me|not my payment|not my charge|n[a]o (e|eh|foi) meu|n[a]o fui eu|no es mi[o]|no fue mi[o]|no fui yo)\b/.test(t)) return null;
  const a = amountIn(t);
  const words = t.replace(/\b(the|that|this|those|these|payment|charge|at|in|on|of|from|is|was|not|mine|me|my|isn'?t|wasn'?t|o|a|de|do|da|em|no|na|el|la|en|eur|euros?)\b/g, ' ').replace(/[\d.,]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter((w) => w.length >= 3);
  return { amount: a ? a.amount : null, words };
}

/** "Banamani is a bar", "Torre IE should count as eating out", "X is not education, it is a cafe": the name and the kind words after it. */
export function recategoriseStatement(text) {
  const t = norm(text);
  const m = t.match(/^(?:the\s+)?([\p{L}\p{N}][\p{L}\p{N} .&'-]{1,40}?)\s+(?:is|are|es|e|eh|should count as|should be|counts? as|deberia contar como|cuenta como|deveria contar como|conta como)\b(.*)$/u);
  if (!m) return null;
  const tail = m[2];
  if (!/\b(count|counts|contar|conta|bar|cafe|caf|restaurant|restaurante|supermercado|supermarket|groceries|software|transport|taxi|eating out|comer fora|comida fuera|entertainment|clothing|ropa|roupa|health|pharmacy|farmacia|sport|gym|travel|hotel|bills|kind|tipo)\b/.test(tail)) return null;
  return { name: stripNoise(m[1]).toLowerCase(), tail };
}

/** "forget what I said about Valencia", "esquece o que falei da viagem": the topic words, or null. */
export function forgetStatement(text) {
  const t = norm(text);
  const m = t.match(/^(?:please\s+)?(?:forget|olvida|olvidate|esquece|esqueca|apaga|borra)\b(.*)$/);
  if (!m) return null;
  const words = m[1].replace(/\b(what|that|the|about|i|said|told|you|de|do|da|o|a|que|lo|falei|dije|disse|sobre|of|my|el|la|isso|eso|it)\b/g, ' ').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().split(' ').filter((w) => w.length >= 4);
  return { words };
}
