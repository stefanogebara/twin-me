/**
 * What the person asked Ask to make: a figure, or a file.
 * ======================================================
 * Asked to "draw a figure of recurring changes" and to "draw a graph", the chat answered "Ask
 * for the shares figure by kind to see the graph of where your money went this month" and drew
 * nothing; asked to "create an Excel file of my September spending", it answered about reading
 * PDFs (the owner's own thread, 2026-09-23 to 09-25). Whether a figure appeared depended on the
 * model choosing to request one, and the month export had no way out of the chat at all.
 *
 * So the code decides, from the person's words, in English, Spanish and Portuguese:
 *
 *   figureAsk(message, ctx)        the figure a request to draw, show, plot or chart names: by
 *                                  category -> shares, by month -> months, per day -> week,
 *                                  weekdays -> weekdays, subscriptions -> recurring, a place
 *                                  over time -> history, money in and out -> flows when the
 *                                  catalogue has it (else months), nothing named -> shares
 *   withAskedFigure(reply, ...)    that figure under the reply whatever the model wrote, or one
 *                                  sentence saying why the ledger cannot draw it; never an
 *                                  invented one. A sentence telling the person to ask for a
 *                                  figure is cut, the way dropUngrounded cuts a sentence
 *   fileAsk / fileReply            "an Excel", "a spreadsheet", "a CSV", "export" -> the month
 *                                  as a download: sheet.js makes the file, never the model
 *   sheetAction                    the download offer, only for a month the ledger holds
 *
 * The phrases are chat.js's PHRASES (en, es, pt-BR); the figures are chat.js's buildFigure. Both
 * are read at call time, so the two modules may import each other, as next.js does.
 */
import { say, buildFigure, FIGURE_KINDS, kindInMessage, kindWord, receiptsFor, MAX_RECEIPTS, languageOf, withoutChartQuestion } from './chat.js';
import { askedWindows } from './asked.js';
import { monthIn } from './zone.js';
import { financialEvidenceBlocked } from './financialCompleteness.js';

/* Lower case, accents off, curly quotes straight, one space: the shape every rule here reads. */
const flat = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const capFirst = (w) => (w ? w[0].toUpperCase() + w.slice(1) : w);
/* While payments wait for review nothing is drawn or offered: the reply that says so stands. */
const blocked = (ctx) => Boolean(ctx?.forecast?.withheld) || (ctx?.reconciliation !== undefined && financialEvidenceBlocked(ctx.reconciliation));
/* The language the answer is in: the message's own when it has one, as kindAnswer does. */
const replyLanguage = (message, ctx) => {
  const written = ctx?.forceLanguage || languageOf(message);
  return written === 'pt' ? 'pt-BR' : (written || ctx?.language || null);
};

/* ------------------------------------------------------------------ months named */

const MONTH_NAMES = [
  ['january', 'enero', 'janeiro'], ['february', 'febrero', 'fevereiro'], ['march', 'marzo', 'marco'], ['april', 'abril'], ['may', 'mayo', 'maio'], ['june', 'junio', 'junho'],
  ['july', 'julio', 'julho'], ['august', 'agosto'], ['september', 'septiembre', 'setiembre', 'setembro'], ['october', 'octubre', 'outubro'], ['november', 'noviembre', 'novembro'], ['december', 'diciembre', 'dezembro'],
];
const MONTH_SHORT = [['jan', 'ene'], ['feb', 'fev'], ['mar'], ['apr', 'abr'], [], ['jun'], ['jul'], ['aug', 'ago'], ['sep', 'sept', 'set'], ['oct', 'out'], ['nov'], ['dec', 'dic', 'dez']];
/* A name that is also a common word counts only after a preposition: "may" is a verb, "marco"
   a frame, "set" and "out" are English, and every short form is somebody's word. */
const WORDY = new Set(['may', 'marco']);
const AFTER = '(?:in|for|of|from|since|en|de|del|em|do|da|desde|para)\\s+';
const MONTH_RES = MONTH_NAMES.map((names, i) => {
  const plain = names.filter((n) => !WORDY.has(n));
  const guarded = [...names.filter((n) => WORDY.has(n)), ...MONTH_SHORT[i]];
  return new RegExp([plain.length ? `\\b(?:${plain.join('|')})\\b` : null, guarded.length ? `\\b${AFTER}(?:${guarded.join('|')})\\b` : null].filter(Boolean).join('|'));
});
const LAST_MONTH = /\b(last month|previous month|the month before|mes pasado|mes anterior|mes passado)\b/;
const MONTH_LONG = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  'pt-BR': ['janeiro', 'fevereiro', 'mar\u00e7o', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
};

const previousMonth = (key) => { const [y, m] = key.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

/**
 * The months a message names, as YYYY-MM, in the order written. A month with no year is the
 * last one of that name that has begun: in September, "December" is last December. Pure.
 */
export function monthsAsked(message, ctx = {}) {
  const m = flat(message);
  const here = monthIn(ctx.now || new Date());
  const [y, mo] = here.split('-').map(Number);
  const year = Number((m.match(/\b(20\d{2})\b/) || [])[1]) || null;
  const named = MONTH_RES.map((re, i) => ({ i, at: m.search(re) })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at)
    .map(({ i }) => `${year || (i + 1 <= mo ? y : y - 1)}-${String(i + 1).padStart(2, '0')}`);
  if (named.length) return [...new Set(named)];
  return LAST_MONTH.test(m) ? [previousMonth(here)] : [];
}

/** A month key in words: "September", "septiembre de 2025". */
function monthWords(key, language, ctx) {
  const [y, m] = String(key).split('-').map(Number);
  const name = (MONTH_LONG[language] || MONTH_LONG.en)[m - 1] || key;
  if (y === Number(monthIn(ctx?.now || new Date()).slice(0, 4))) return name;
  return language === 'es' || language === 'pt-BR' ? `${name} de ${y}` : `${name} ${y}`;
}

/* ------------------------------------------------------------------ a figure asked for */

/* A figure named as a thing: a graph, a chart, a plot, a diagram. */
const FIGURE_NOUN = /\b(graphs?|charts?|plots?|diagrams?|visuals?|visuali[sz]ations?|infographics?|graficos?|graficas?|diagramas?|visualizacion(?:es)?|visualizacao|visualizacoes)\b/;
/* Asked to draw: the verb alone is the request ("draw my subscriptions", "dibuja", "desenha"). */
const DRAW_VERB = /\b(draw|drawing|sketch|plot|visuali[sz]e|dibuja(?:me|lo|la|los|las)?|dibujar|dibujes|grafica(?:me|lo|la)?|graficar|traza(?:me)?|desenh(?:a|e|ar|em|o)|plot(?:a|e|ar))\b/;
/* "Figure" is a number as often as a picture: only after a verb that makes one. */
const MAKE_FIGURE = /\b(make|create|give|build|generate|show|haz|hazme|crea|creame|dame|genera|muestra|muestrame|faz|faca|cria|crie|gera|gere|mostra|mostre)\b(?:\s+\S+){0,3}\s+(figures?|figuras?)\b/;
/* Asked to show or see how the money splits or moves: "show me my spending by month". */
const SHOW_VERB = /\b(show|display|see|muestra(?:me)?|ensena(?:me)?|ver|mostra(?:r)?|mostre|exibe|exiba)\b/;
const SHAPE = /\b(by (?:months?|days?|weeks?|week ?days?|categor(?:y|ies)|kinds?|types?|sectors?|places?|shops?|merchants?|stores?)|per (?:months?|days?|weeks?|week ?days?|category|kind|type|sector|place|shop|merchant)|each (?:month|day|week)|month by month|day by day|week by week|over time|over the (?:months|weeks|year)|trends?|evolution|breakdown|split|distribution|monthly|daily|weekly|por (?:mes(?:es)?|dias?|semanas?|categorias?|tipos?|sector(?:es)?|setor(?:es)?|lugar(?:es)?|sitios?|tiendas?|comercios?|lojas?)|cada (?:mes|dia|semana)|mes a mes|dia a dia|a lo largo|ao longo|evolucion|evolucao|tendencias?|desglose|distribucion|distribuicao|mensual(?:es)?|mensal|mensais|diari[oa]s?)\b/;
/* "no graph", "sin grafico", "don't draw": refused is not asked. "Draw 50 euros" is money. */
const NO_FIGURE = /\b(no|not|don'?t|do not|without|never|sin|sem|nao|nunca|ni)\b(?:\s+\S+){0,2}\s+(?:graphs?|charts?|plots?|figures?|diagrams?|graficos?|graficas?|figuras?|diagramas?|draw\w*|dibuj\w*|desenh\w*)/;
const DRAW_MONEY = /\bdraw\s+(?:out\s+)?(?:some\s+)?(?:money|cash|\d)/;

/* Which figure, from the words, first rule that fits. */
const KIND_RULES = [
  ['recurring', /\b(recurring|recurrent|subscri\w*|standing (?:charges?|orders?)|direct debits?|comes? back|coming back|fixed (?:costs?|charges?|bills?|expenses?)|suscrip\w*|recurrentes?|cargos? fijos?|gastos? fijos?|domiciliaci\w*|assinaturas?|recorrentes?|cobrancas? fixas|debitos? automaticos?|custos? fixos?|contas? fixas?)\b/],
  ['flows', /\b(in and out|ins? and outs?|money in|came in|comes in|coming in|incomes?|earnings?|earned|salary|received|receive|inflows?|outflows?|cash ?flows?|in vs\.? out|in versus out|ingresos?|entradas? y salidas?|lo que entra|lo que (?:me )?llega|sueldo|salario|nomina|receitas?|entradas? e saidas?|o que entra|entrou|rendimentos?|recebi\w*|recibi\w*)\b/],
  ['weekdays', /\b(week ?days?|days? of the week|which day|what day|dias? de la semana|dias? da semana|que dia|qual dia|cual dia)\b/],
  ['week', /\b(this week|last week|the week|past week|per day|by day|each day|every day|day by day|daily|last (?:seven|7) days|esta semana|la semana|semana pasada|por dias?|cada dia|dia a dia|diari[oa]s?|ultimos (?:siete|sete|7) dias|nesta semana|essa semana|semana passada|da semana)\b/],
  ['months', /\b(by months?|per month|each month|every month|monthly|month by month|over time|over the months|months|trends?|evolution|history|historic\w*|por mes(?:es)?|cada mes|mensual(?:es)?|mes a mes|a lo largo|evolucion|tendencias?|historial|meses|mensal|mensais|todo mes|todos os meses|ao longo|evolucao)\b/],
  ['band', /\b(forecast|projection|projected|likely|end of the month|month end|prevision|proyeccion|final de mes|fin de mes|fin del mes|previsao|projecao|fim do mes)\b/],
];
const BY_PLACE = /\b(by (?:places?|shops?|stores?|merchants?)|per (?:place|shop|store|merchant)|places|shops|stores|merchants|por (?:lugar(?:es)?|sitios?|tiendas?|comercios?|lojas?|estabelecimentos?)|lugares|tiendas|comercios|lojas)\b/;
const BY_KIND = /\b(categor\w*|kinds?|sectors?|types?|breakdown|split|where (?:the |my )?money (?:went|goes|go)|where (?:it|i) (?:went|spent)|sector(?:es)?|tipos?|desglose|setor(?:es)?|onde|donde|en que)\b/;

/** Whether the words ask for something drawn. Pure. */
export function asksToDraw(message) {
  const m = flat(message);
  if (!m || NO_FIGURE.test(m) || DRAW_MONEY.test(m)) return false;
  return FIGURE_NOUN.test(m) || DRAW_VERB.test(m) || MAKE_FIGURE.test(m) || (SHOW_VERB.test(m) && SHAPE.test(m));
}

/** A place of the ledger the words name, by its key or its shown name; the longest wins. */
function placeIn(m, ctx) {
  const names = new Map();
  for (const k of ctx?.placeByKey?.keys() || []) names.set(flat(k), k);
  for (const p of ctx?.places || []) if (p?.merchant_key && p.name) names.set(flat(p.name), p.merchant_key);
  const hit = [...names.keys()].filter((n) => n.length >= 4 && new RegExp(`\\b${escape(n)}\\b`).test(m)).sort((a, b) => b.length - a.length)[0];
  return hit ? names.get(hit) : null;
}

function figureFrom(raw, ctx) {
  const m = flat(raw);
  const month = monthsAsked(raw, ctx)[0];
  const at = month ? { month } : {};
  const rule = (KIND_RULES.find(([, re]) => re.test(m)) || [])[0] || null;
  const kind = kindInMessage(raw);
  if (rule === 'recurring') return { kind: 'recurring', specific: true };
  if (rule === 'flows') return { kind: FIGURE_KINDS.includes('flows') ? 'flows' : 'months', specific: true };
  if (rule === 'weekdays') return { kind: 'weekdays', specific: true };
  /* a named stretch ("the 8th to the 14th", "last weekend") is the week figure over it */
  if (rule === 'week' || askedWindows(raw, ctx?.now || new Date()).length) return { kind: 'week', specific: true };
  const place = placeIn(m, ctx);
  if (place) return { kind: 'history', merchant: place, specific: true };
  /* one kind month by month is not a figure the catalogue has: said, never swapped for another */
  if (rule === 'months') return kind ? { kind: 'months', category: kind, refuse: 'kind-by-month', specific: true } : { kind: 'months', specific: true };
  if (rule === 'band') return { kind: 'band', specific: true };
  if (kind) return { kind: 'shares', by: 'merchant', category: kind, ...at, specific: true };
  if (BY_PLACE.test(m)) return { kind: 'shares', by: 'merchant', ...at, specific: true };
  if (BY_KIND.test(m) || month) return { kind: 'shares', ...at, specific: true };
  return { kind: 'shares', specific: false };
}

/**
 * The figure the words ask for: { kind, month?, by?, category?, merchant?, specific }, with
 * `refuse` when it is one the ledger does not draw; null when nothing is asked to be drawn.
 * A short follow-up ("show me a graph of that") takes its subject from the question before,
 * which the chat carries in ctx.asked. Pure.
 */
export function figureAsk(message, ctx = {}) {
  if (!asksToDraw(message)) return null;
  const own = figureFrom(message, ctx);
  if (own.specific || !ctx.asked || flat(ctx.asked) === flat(message)) return own;
  const before = figureFrom(ctx.asked, ctx);
  return before.specific ? before : own;
}

/** Why the figure asked for cannot be drawn, in one plain sentence. */
function whyNot(ask, ctx, L) {
  if (ask.refuse === 'kind-by-month') return say(L, 'The ledger does not draw one kind month by month yet.');
  if (ask.kind === 'months') return say(L, 'A graph by month needs at least two months in the ledger.');
  if (ask.kind === 'shares') {
    const month = monthWords((ask.month || ctx.forecast?.month || monthIn(ctx.now || new Date())).slice(0, 7), L, ctx);
    return ask.category
      ? say(L, 'Nothing on {kind} in {month} for the ledger to draw.', { kind: kindWord(L, ask.category), month })
      : say(L, 'Nothing was spent in {month} for the ledger to draw.', { month });
  }
  if (ask.kind === 'weekdays') return say(L, 'The ledger needs more payments before it can draw the days of the week.');
  if (ask.kind === 'recurring') return say(L, 'Nothing comes back regularly yet. The ledger needs to see a charge at least twice to call it that.');
  if (ask.kind === 'band') return say(L, 'The ledger has no likely range for this month yet, so there is nothing to draw.');
  if (ask.kind === 'week') return say(L, 'Nothing was spent on those days for the ledger to draw.');
  if (ask.kind === 'history') {
    const key = String(ask.merchant || '').toLowerCase();
    const name = ctx.placeByKey?.get(ask.merchant)?.name || ask.merchant;
    const seen = (ctx.transactions || []).some((t) => Number(t.amount) < 0 && String(t.merchant_key || '').toLowerCase() === key);
    return say(L, seen ? '{name} has fewer than three payments in the ledger, too few to draw over time.' : 'The ledger has no payment at {name} to draw.', { name });
  }
  return say(L, 'The ledger cannot draw that from what it holds.');
}

/* The sentence the code added about a figure it could not draw, kept beside the reply so the
   stream can send it after words already on the screen; never serialised. */
const NOTES = new WeakMap();
/** The why-sentence withAskedFigure added to this reply, or null. */
export const figureNote = (reply) => (reply && NOTES.get(reply)) || null;

/**
 * The reply with the figure the person asked for, whatever the model wrote: drawn first when
 * the ledger can draw it and it is not there already, or one sentence saying why it cannot. A
 * sentence telling the person to ask for a figure is cut from the words either way. A request
 * that named nothing is answered by any figure already drawn.
 */
export function withAskedFigure(reply, message, ctx) {
  if (!reply || blocked(ctx)) return reply;
  const text = withoutFigureAsks(reply.text);
  const ask = figureAsk(message, ctx);
  if (!ask) return text === reply.text ? reply : { ...reply, text: text || reply.text };
  const L = replyLanguage(message, ctx);
  const figures = [...(reply.figures || [])];
  let receipts = reply.receipts || [];
  let note = null;
  const built = ask.refuse ? null : buildFigure(ask, ctx);
  if (built) {
    const drawn = figures.some((f) => f && f.kind === built.figure.kind && f.title === built.figure.title);
    if (!drawn && (ask.specific || !figures.length)) {
      figures.unshift(built.figure);
      figures.splice(2);
      const seen = new Set(receipts.map((r) => r.id));
      receipts = [...receipts, ...receiptsFor([built], ctx).filter((r) => !seen.has(r.id))].slice(0, MAX_RECEIPTS);
    }
  } else if (ask.refuse || !figures.some((f) => f && f.kind === ask.kind)) {
    note = whyNot(ask, ctx, L);
  }
  let words = figures.length ? withoutChartQuestion(text, true) : text;
  /* One of each sentence, and the reason once: the model is told why a figure cannot be drawn,
     and repeated it word for word before the code added it too (2026-09-26). */
  const once = new Set();
  words = String(words || '').split(SENTENCES)
    .filter((p) => !strayBeside(p, figures.length > 0))
    .filter((p) => { const k = flat(p); if (!k || once.has(k)) return false; once.add(k); return true; })
    .join(' ').trim();
  if (note && flat(words).includes(flat(note))) note = null;
  if (note) words = [words, note].filter(Boolean).join(' ');
  if (!String(words).trim()) words = figures.length ? say(L, 'Drawn from your own payments.') : reply.text;
  const out = { ...reply, text: words, figures, receipts };
  if (note) NOTES.set(out, note);
  return out;
}

/**
 * One line under the model's instructions naming the figure the code will draw, or saying it
 * cannot, so the words agree with what is under them. Empty when no figure is asked for.
 */
export function figureHint(message, ctx) {
  if (blocked(ctx)) return '';
  const ask = figureAsk(message, ctx);
  if (!ask) return '';
  const built = ask.refuse ? null : buildFigure(ask, ctx);
  if (built) {
    const title = String(built.figure.title || ask.kind).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return `\n\nThe person asked for a figure, and the code draws it under your answer whatever you write: "${title}" (${ask.kind}). Say in one or two sentences what it shows, with the figures from the lines above. Never tell them to ask for a figure or a chart, and never say it cannot be drawn.`;
  }
  return `\n\nThe person asked for a figure the ledger cannot draw: ${whyNot(ask, ctx, 'en')} The code says so under your answer: do not mention a figure, a graph or a chart; answer the rest from the lines above, in one or two sentences.`;
}

/* ------------------------------------------------------------------ the model telling them to ask */

const ASK_FOR = /\b(ask(?: me)? for|ask(?: me)? to (?:draw|show|see)|you can ask|just ask|try asking|request (?:a|the)|pide(?:me|lo|la)?|pidas|pidelo|pidela|puedes pedir(?:me)?|si (?:me )?pides|solicita(?:r|me)?|peca|pede|podes pedir|pode pedir|se (?:voce )?pedir|solicite)\b/;
const FIG_WORD = /\b(figures?|graphs?|charts?|plots?|diagrams?|visuals?|figuras?|graficos?|graficas?|diagramas?)\b/;
const OFFER = /\b(want|would you like|like to see|shall i|should i|do you want|quieres|te gustaria|quiere|quer|gostaria|deseja|desea)\b/;
const DENY = /\b(cannot|can'?t|can not|unable to|not able to|no puedo|no puede|no se puede|nao posso|nao pode|nao consigo|nao da)\b/;
const MAKING = /\b(draw|make|create|show|plot|produce|generate|dibujar|hacer|crear|mostrar|generar|desenhar|fazer|criar|gerar)\b/;
const OPENS = /^(?:ask|you can|you could|you may|if you|would you|want|do you|shall i|should i|just ask|try|i can|i cannot|i can't|pide|pideme|puedes|podrias|si quieres|si me|quieres|te gustaria|no puedo|peca|pode|podes|se quiser|se voce|quer|gostaria|nao posso|nao consigo)\b/;
const SENTENCES = /(?<=[.!?])(?<!\b[A-Z]\.)\s+(?=[A-Z0-9\u00bf\u00a1\u00c0-\u024f"'(])/;

/**
 * A sentence that tells the person to ask for a figure, offers one as a question, or says a
 * figure cannot be drawn. The code draws what was asked, so each is wrong. Pure.
 */
export function asksForFigure(sentence) {
  const s = flat(sentence);
  if (!FIG_WORD.test(s)) return false;
  if (ASK_FOR.test(s)) return true;
  if (/\?\s*$/.test(s) && OFFER.test(s)) return true;
  return DENY.test(s) && MAKING.test(s);
}

/** The words without those sentences; the rest stands as written. Pure. */
export function withoutFigureAsks(text) {
  const all = String(text || '');
  const parts = all.split(SENTENCES);
  const kept = parts.filter((p) => !asksForFigure(p));
  return kept.length === parts.length ? all : kept.join(' ').trim();
}

/** Whether a sentence still being written could turn out to be one, so the stream holds it. Pure. */
export function mayAskForFigure(partial) {
  const s = flat(partial);
  return Boolean(s) && (OPENS.test(s) || ASK_FOR.test(s) || FIG_WORD.test(s));
}

/* A figure the code draws answers the request, so a question the model asked instead ("What
   would you like the graph to show? For example, by month?") answers nothing; and a figure
   the code cannot draw is never presented ("Here is your spending per month."), 2026-09-26. */
const PRESENTS = /^(here(?:'s| is| are)|below (?:is|are)|aqui (?:esta|estan|tienes|va|van|estao|vai|vao)|segue|seguem|eis)\b/;

/** Whether a sentence contradicts what the code does with the figure asked for: drawn or not. Pure. */
export function strayBeside(sentence, drawing) {
  const s = String(sentence || '').trim();
  return drawing ? /\?\s*$/.test(s) : PRESENTS.test(flat(s));
}

/** What the code does with the figure the words ask for: 'draw', 'refuse', or null when none is asked. */
export function figurePlan(message, ctx) {
  if (blocked(ctx)) return null;
  const ask = figureAsk(message, ctx);
  if (!ask) return null;
  return !ask.refuse && buildFigure(ask, ctx) ? 'draw' : 'refuse';
}

/* ------------------------------------------------------------------ a file asked for */

const FILE_STRONG = /\b(excel|xlsx|xls|spreadsheets?|spread sheets?|csv|hojas? de calculo|hoja excel|planillas?|planilhas?)\b/;
const FILE_WEAK = /\b(files?|sheets?|documents?|downloads?|exports?|pdfs?|archivos?|ficheros?|documentos?|descargas?|arquivos?|exportacion|exportacao)\b/;
const FILE_VERB = /\b(create|make|generate|build|export|download|give me|send me|get me|prepare|save|can i (?:get|have|download)|could i (?:get|have)|crea(?:me|r)?|haz(?:me)?|hacer(?:me)?|genera(?:me|r)?|exporta(?:me|r)?|descarga(?:me|r)?|dame|damelo|mandame|enviame|prepara(?:me)?|cria(?:r)?|crie|faz|faca|fazer|gera(?:r)?|gere|exporte|baixa(?:r)?|baixe|me da|me de|me manda|me envia)\b/;
const WANT_FILE = /\b(i want|i need|i'd like|i would like|quiero|necesito|quisiera|me gustaria|quero|preciso|gostaria)\b(?:\s+\S+){0,3}\s+(?:files?|sheets?|documents?|downloads?|exports?|pdfs?|archivos?|ficheros?|documentos?|arquivos?)\b/;
/* Reading a file is the other direction: "can you read my excel", "I sent a csv". */
const READING = /\b(read|reads|reading|upload(?:s|ed|ing)?|import(?:s|ed|ing)?|attach(?:es|ed|ing)?|sent you|send you|i sent|i've sent|i have sent|open (?:it|this|my)|lee|leer|lees|leerlo|leerla|subir|sube|subi|subido|importar|adjunt\w*|te mande|te envie|ler|leia|lendo|enviei|mandei|anex\w*|carreg\w*)\b/;
/* Not the month as a file: the app to download, a place filed under a kind, a sheet they keep. */
const NOT_THE_MONTH = /\b(app|apk|application|aplicacion|aplicativo)\b|\bfile\s+(?:\S+\s+){0,3}(?:under|as)\b|\b(i have|i keep|i use|i made|i built|tengo|uso|tenho|mantengo|mantenho)\b(?:\s+\S+){0,5}\s+(?:excel|spreadsheets?|sheets?|csv|hojas?|planillas?|planilhas?)\b/;

/** The months a request for a file names, this month when it names none; null when no file is asked for. Pure. */
export function fileAsk(message, ctx = {}) {
  const m = flat(message);
  if (!m || READING.test(m) || NOT_THE_MONTH.test(m)) return null;
  if (!(FILE_STRONG.test(m) || (FILE_WEAK.test(m) && FILE_VERB.test(m)) || WANT_FILE.test(m))) return null;
  const months = monthsAsked(message, ctx);
  return { months: (months.length ? months : [monthIn(ctx.now || new Date())]).slice(0, 3) };
}

/**
 * The download offer for one month: only a well-formed month in which the person's own ledger
 * holds a payment. The label is computed, whoever proposed the offer.
 */
export function sheetAction(action, ctx) {
  const month = typeof action?.month === 'string' ? action.month : '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  if (!(ctx?.transactions || []).some((t) => t?.occurred_at && monthIn(t.occurred_at) === month)) return null;
  return { kind: 'sheet', month, label: say(ctx.language, 'Download {month} as a spreadsheet', { month: monthWords(month, ctx.language, ctx) }) };
}

/**
 * "Create an Excel file of my September spending": the month offered as a download, computed,
 * with no model (the model answered this one about reading PDFs). A month the ledger holds
 * nothing of is said so, and nothing is offered.
 */
export function fileReply(message, ctx) {
  const asked = fileAsk(message, ctx);
  if (!asked) return null;
  const L = replyLanguage(message, ctx);
  const offers = asked.months.map((month) => sheetAction({ kind: 'sheet', month }, { ...ctx, language: L })).filter(Boolean);
  const text = !offers.length
    ? say(L, 'The ledger holds nothing for {month} to put in a spreadsheet.', { month: monthWords(asked.months[0], L, ctx) })
    : offers.length === 1
      ? say(L, '{month} as a spreadsheet: a row for every payment, and the totals by kind on a second sheet.', { month: capFirst(monthWords(offers[0].month, L, ctx)) })
      : say(L, 'Each month as its own spreadsheet: a row for every payment, and the totals by kind on a second sheet.');
  return { text, figures: [], actions: offers, receipts: [] };
}
