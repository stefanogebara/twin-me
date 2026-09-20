/**
 * The chat's scenarios: what a person actually types, and what the ledger owes each one.
 * ======================================================================================
 * Shared by the offline test (routing and rules, no model) and the live runner
 * (scripts/money/chat-eval.mjs, the real model against a real ledger). Every scenario says
 * what kind of message it is, whether the ledger may answer it without the model, which
 * figures it may draw, which offers it should make, and how long it may be. New failures
 * seen in production become scenarios here first.
 *
 *   kind      ask | statement | correction | smalltalk | ambiguous
 *   route     short   answered by shortCircuit without the model
 *             model   goes to the model
 *   figures   { only: [...kinds] } the figure kinds allowed (empty list = none)
 *             { some: [...kinds] } at least one of these
 *   actions   { some: [...kinds] } at least one of these offers; { none: true } no offer
 *   mention   regexes the text must match (case-insensitive)
 *   avoid     regexes the text must not match
 *   maxSentences
 */
export const SCENARIOS = [
  /* asks the ledger answers itself */
  { id: 'recurring-ask', kind: 'ask', message: 'What comes back every month?', route: 'short', figures: { only: ['recurring'] }, actions: { none: true }, maxSentences: 2 },
  { id: 'months-ask', kind: 'ask', message: 'How does this month compare?', route: 'short', figures: { only: ['months'] }, actions: { none: true }, maxSentences: 2 },
  { id: 'subs-one-word', kind: 'ask', message: 'subscriptions', route: 'short', figures: { only: ['recurring'] }, actions: { none: true }, maxSentences: 2 },

  /* asks that need the model */
  { id: 'today-ask', kind: 'ask', message: 'What can I spend today?', route: 'model', figures: { only: ['band', 'history'] }, actions: { none: true }, mention: [/\d+,\d{2}/], maxSentences: 4 },
  { id: 'week-ask', kind: 'ask', message: 'What changed this week?', route: 'model', figures: { only: ['weekdays', 'history', 'shares', 'months'] }, actions: { none: true }, maxSentences: 4 },
  { id: 'where-ask', kind: 'ask', message: 'Where did the money go?', route: 'model', figures: { some: ['shares'] }, actions: { none: true }, maxSentences: 4 },
  { id: 'still-ask', kind: 'ask', message: 'What is still to come?', route: 'model', figures: { only: ['recurring', 'band'] }, actions: { none: true }, maxSentences: 4 },
  { id: 'taxis-august', kind: 'ask', message: 'How much did I spend on taxis in August?', route: 'model', figures: { only: ['shares', 'history'] }, actions: { none: true }, mention: [/\d+,\d{2}|nothing|no taxi|cannot tell/i], maxSentences: 4 },
  { id: 'biggest', kind: 'ask', message: 'What was my biggest payment this month?', route: 'model', figures: { only: [] }, actions: { none: true }, mention: [/\d+,\d{2}/], maxSentences: 3 },
  { id: 'more-than-usual', kind: 'ask', message: 'Am I spending more than usual?', route: 'model', figures: { only: ['months', 'weekdays', 'history', 'band'] }, actions: { none: true }, maxSentences: 4 },
  { id: 'spanish-food', kind: 'ask', message: 'cuanto gaste en comida este mes?', route: 'model', figures: { only: ['shares', 'history'] }, actions: { none: true }, mention: [/\d+,\d{2}|nada|cannot|no /i], maxSentences: 4 },
  { id: 'balance', kind: 'ask', message: 'How much is in my account?', route: 'model', figures: { only: [] }, actions: { none: true }, maxSentences: 3 },
  { id: 'chart-categories', kind: 'ask', message: 'Give me a chart of my spending by category', route: 'model', figures: { some: ['shares'] }, actions: { none: true }, maxSentences: 3 },
  { id: 'show-months', kind: 'ask', message: 'show me the months side by side', route: 'short', figures: { only: ['months'] }, actions: { none: true }, maxSentences: 2 },
  { id: 'follow-up-last-month', kind: 'ask', message: 'and last month?', history: [{ role: 'user', text: 'Where did the money go?' }, { role: 'twin', text: 'Most of September went on groceries and eating out.' }], route: 'model', figures: { only: ['shares', 'months'] }, actions: { none: true }, maxSentences: 4 },

  /* stretches of time a person names: the totals are in the context, computed (2026-09-20) */
  { id: 'last-night', kind: 'ask', message: 'How much did I spend last night?', route: 'model', figures: { only: ['history', 'weekdays', 'week'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|nothing|nada|não gast|no gast/i], avoid: [/(has|holds|have|is) no total|cannot add|can't add|não tem (o|um) total|no tiene (el|un) total/i], maxSentences: 3 },
  { id: 'yesterday-total', kind: 'ask', message: 'How much money did I spend yesterday in total?', route: 'model', figures: { only: ['history', 'weekdays', 'week'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|nothing|nada/i], avoid: [/(has|holds|have|is) no total|cannot add|can't add|não tem (o|um) total|no tiene (el|un) total/i], maxSentences: 3 },
  { id: 'this-week-total', kind: 'ask', message: 'What have I spent this week so far?', route: 'model', figures: { only: ['history', 'weekdays', 'week'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|nothing|nada/i], avoid: [/(has|holds|have|is) no total|cannot add|não tem (o|um) total|no tiene (el|un) total/i], maxSentences: 3 },
  { id: 'last-week-vs', kind: 'ask', message: 'Did I spend more this week or last week?', route: 'model', figures: { only: ['history', 'weekdays', 'week'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)/], maxSentences: 4 },
  { id: 'by-day', kind: 'ask', message: 'Show me what I spent each day this week', route: 'model', figures: { some: ['week'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)/], maxSentences: 4 },
  { id: 'biggest-yesterday', kind: 'ask', message: 'What was my biggest payment yesterday?', route: 'model', figures: { only: ['history'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|nothing|nada/i], maxSentences: 3 },

  /* a stretch with a kind of place or a place in it (round 2, 2026-09-20) */
  { id: 'food-yesterday', kind: 'ask', message: 'How much did I spend on food yesterday?', route: 'model', figures: { only: ['history', 'week', 'shares'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|nothing|nada/i], avoid: [/(has|holds|have|is) no total|cannot add|não tem (o|um) total|no tiene (el|un) total/i], maxSentences: 3 },
  { id: 'coffee-week', kind: 'ask', message: 'How much on coffee this week?', route: 'model', figures: { only: ['history', 'week', 'shares'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|nothing|nada|n[ãa]o (tem|houve|há)|no (coffee|hay|hubo)|sem caf|sin caf/i], maxSentences: 3 },
  { id: 'place-week', kind: 'ask', message: 'Where did I spend the most this week?', route: 'model', figures: { only: ['history', 'week', 'shares'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)/], maxSentences: 3 },
  { id: 'graph-week', kind: 'ask', message: 'Give me a graph of what I spent each day this week', route: 'model', figures: { some: ['week'] }, actions: { none: true }, maxSentences: 3 },
  { id: 'transport-last-week', kind: 'ask', message: 'What did transport cost me last week?', route: 'model', figures: { only: ['history', 'week', 'shares'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|nothing|nada|no transport|sem transporte|sin transporte/i], maxSentences: 3 },
  { id: 'afford-tonight', kind: 'ask', message: 'Can I afford 60 euros tonight?', route: 'model', figures: { only: ['band', 'history', 'week'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)/], maxSentences: 4 },

  /* round 5 (2026-09-20): the questions a person asks over a month */
  { id: 'left-this-month', kind: 'ask', message: 'How much do I have left this month?', route: 'model', figures: { only: ['band', 'months', 'history', 'week'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)/], maxSentences: 4 },
  { id: 'rent-due', kind: 'ask', message: 'When is my rent due and how much is it?', route: 'model', figures: { only: ['recurring', 'band'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|rent|aluguel|alquiler|não (sabe|vejo)|no (sabe|veo)|does not know/i], maxSentences: 4 },
  { id: 'glovo-month', kind: 'ask', message: 'How many times did I order Glovo this month and how much was it?', route: 'model', figures: { only: ['history', 'shares'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|glovo/i], avoid: [/(has|holds|have|is) no total|não tem (o|um) total|no tiene (el|un) total/i], maxSentences: 4 },
  { id: 'on-track', kind: 'ask', message: 'Am I on track this month?', route: 'model', figures: { only: ['band', 'months', 'history', 'week'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)/], maxSentences: 4 },
  { id: 'groceries-vs-august', kind: 'ask', message: 'Did I spend more on groceries this month than in August?', route: 'model', figures: { only: ['shares', 'months', 'history', 'week'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)/], maxSentences: 4 },
  { id: 'follow-up-why', kind: 'ask', message: 'why?', route: 'model', figures: { only: ['band', 'months', 'shares', 'history', 'week', 'weekdays'] }, actions: { none: true }, history: [{ role: 'user', text: 'Am I spending more than usual?' }, { role: 'twin', text: 'This month is at 1504,86 € so far, against 582,87 € in August.' }], maxSentences: 4 },
  { id: 'english-on-portuguese', kind: 'ask', message: 'What is my biggest kind of place this month?', route: 'model', figures: { only: ['shares', 'history', 'week'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)/], maxSentences: 3 },

  /* round 6 (2026-09-20): the stretches a person names */
  { id: 'on-saturday', kind: 'ask', message: 'How much did I spend on Saturday?', route: 'model', figures: { only: ['shares', 'week', 'weekdays', 'history'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|nothing|nada/i, /s[aá]bado|saturday/i], maxSentences: 3 },
  { id: 'on-the-15th', kind: 'ask', message: 'What did I spend on the 15th?', route: 'model', figures: { only: ['shares', 'week', 'history'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|nothing|nada/i], maxSentences: 4 },
  { id: 'between-dates', kind: 'ask', message: 'How much did I spend between the 8th and the 14th?', route: 'model', figures: { only: ['shares', 'week', 'history'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)/], avoid: [/(has|holds|have|is) no total|não tem (o|um) total|no tiene (el|un) total/i], maxSentences: 3 },
  { id: 'since-first', kind: 'ask', message: 'How much have I spent since the 1st?', route: 'model', figures: { only: ['band', 'shares', 'months', 'history'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)/], maxSentences: 3 },
  { id: 'weekend-vs-weekend', kind: 'ask', message: 'This weekend versus last weekend?', route: 'model', figures: { only: ['shares', 'week', 'weekdays', 'history'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)[\s\S]*\d+,\d{2}\s?(EUR|€)/], maxSentences: 4 },
  { id: 'avg-week', kind: 'ask', message: 'How much do I spend per week on average?', route: 'model', figures: { only: ['shares', 'week', 'weekdays', 'months', 'history'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)/, /average|m[eé]dia|promedio|semanas|weeks/i], maxSentences: 4 },
  { id: 'friday-night', kind: 'ask', message: 'How much did I spend last Friday night?', route: 'model', figures: { only: ['shares', 'week', 'weekdays', 'history'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|nothing|nada/i], avoid: [/unknown|desconhecid|desconocid/i], maxSentences: 3 },
  { id: 'mercadona-none', kind: 'ask', message: 'What did I buy at Mercadona this week?', route: 'model', figures: { only: ['shares', 'week', 'history'] }, actions: { none: true }, mention: [/mercadona/i], avoid: [/(parece|looks like|seems|seems to be|é um|es un|is a) (ser )?(um |un |a )?mercadona/i], maxSentences: 3 },

  /* round 7 (2026-09-20): people, and a graph of a named stretch */
  { id: 'bizum-month', kind: 'ask', message: 'How much did I send by Bizum this month and to whom?', route: 'model', figures: { only: ['shares', 'history'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)/], avoid: [/(has|holds|have|is) no (single )?total|não tem (o|um) total|no tiene (el|un) total/i], maxSentences: 4 },
  { id: 'who-sent-me', kind: 'ask', message: 'Who sent me money this month?', route: 'model', figures: { only: ['shares', 'history'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|nobody|ningu[eé]m|nadie/i], maxSentences: 4 },
  { id: 'graph-range', kind: 'ask', message: 'Give me a graph of what I spent between the 8th and the 14th', route: 'model', figures: { some: ['week'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)/], avoid: [/\?\s*$/], maxSentences: 3 },
  { id: 'weekend-by-day', kind: 'ask', message: 'Show me last weekend day by day', route: 'model', figures: { some: ['week'] }, actions: { none: true }, mention: [/\d+,\d{2}\s?(EUR|€)|nothing|nada/i], maxSentences: 3 },

  /* statements: the person is teaching, not asking */
  { id: 'maria-dolores', kind: 'statement', message: 'maria dolores is the woman who gets me the real madrid tickets for 50 euros per person, so many times see if money comes back from 50 euro transfers or 200 euro to me as friends sometimes buy from me or my friends pay their ticket to me as i do the bridging w maria dolores.', route: 'model', figures: { only: [] }, actions: { some: ['person', 'remember'] }, mention: [/maria dolores/i], avoid: [/charges? comes? back every month/i, /subscription/i], maxSentences: 4 },
  { id: 'landlord', kind: 'statement', message: 'The 200 euro transfer to Maria Dolores Tomas Obon is my rent, she is my landlord.', route: 'model', figures: { only: [] }, actions: { some: ['person'] }, mention: [/rent|landlord|aluguel|alquiler|propriet|casero/i], maxSentences: 4 },
  { id: 'flatmate-spotify', kind: 'statement', message: 'Spotify is my flatmate\'s, it comes back every month but it is not mine.', route: 'model', figures: { only: [] }, actions: { some: ['not_me', 'remember', 'person', 'recategorise'] }, avoid: [/charges? comes? back every month, \d/i], maxSentences: 4 },
  { id: 'keep-300', kind: 'statement', message: 'I want to have 300 euros left at the end of the month.', route: 'model', figures: { only: ['band'] }, actions: { some: ['remember', 'answer'] }, maxSentences: 4 },
  { id: 'trip-valencia', kind: 'statement', message: 'I am going to Valencia next weekend with Ana.', route: 'model', figures: { only: [] }, actions: { some: ['remember'] }, mention: [/val[eê]ncia/i], maxSentences: 4 },
  { id: 'parents-income', kind: 'statement', message: 'My parents send me 1750 on the first of every month.', route: 'model', figures: { only: [] }, actions: { some: ['remember', 'answer', 'person'], optional: true }, maxSentences: 4 },
  { id: 'gift-corte-ingles', kind: 'statement', message: 'El Corte Ingles was a gift for my sister, not something for me.', route: 'model', figures: { only: [] }, actions: { some: ['remember', 'recategorise', 'not_me'] }, maxSentences: 4 },

  /* corrections */
  { id: 'not-mine-flatmate', kind: 'correction', message: 'The LIDL MAD MERCAD payment is not mine, my flatmate used my card', route: 'model', figures: { only: [] }, actions: { some: ['not_me'] }, maxSentences: 3 },
  { id: 'not-a-subscription', kind: 'correction', message: 'That is wrong, Higgsfield is not a subscription, I paid it once.', route: 'model', figures: { only: [] }, actions: { some: ['not_me', 'remember', 'recategorise'] }, avoid: [/you are right that it is a subscription/i], maxSentences: 4 },
  { id: 'savings-transfer', kind: 'correction', message: 'Do not count the transfer to my savings account as spending.', route: 'model', figures: { only: [] }, actions: { some: ['remember', 'person', 'not_me'], optional: true }, maxSentences: 4 },

  /* small talk and the ambiguous */
  { id: 'hi', kind: 'smalltalk', message: 'hi', route: 'short', figures: { only: [] }, actions: { none: true }, avoid: [/\d+,\d{2}/], maxSentences: 2 },
  { id: 'thanks', kind: 'smalltalk', message: 'thanks!', route: 'short', figures: { only: [] }, actions: { none: true }, maxSentences: 2 },
  { id: 'who-are-you', kind: 'smalltalk', message: 'who are you?', route: 'model', figures: { only: [] }, actions: { none: true }, avoid: [/language model|openai|anthropic|deepseek/i], maxSentences: 3 },
  { id: 'ok', kind: 'ambiguous', message: 'ok', route: 'short', figures: { only: [] }, actions: { none: true }, avoid: [/\d+,\d{2}/], maxSentences: 2 },
  { id: 'food-q', kind: 'ambiguous', message: 'food?', route: 'model', figures: { only: ['shares', 'history'] }, actions: { none: true }, maxSentences: 4 },
];

/** Sentences in a reply, the way a person counts them. */
export function sentenceCount(text) {
  /* "Maria D. 200,00 EUR" is a name with an initial, not a sentence end. */
  return String(text || '').split(/(?<=[.!?])(?<!\b[A-Z]\.)\s+(?=[A-Z0-9\u00c0-\u024f"'(])/).map((s) => s.trim()).filter(Boolean).length;
}
/** Amounts written in a reply, as numbers: "12,50" -> 12.5, "1.011,02" -> 1011.02. */
export function amountsInText(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})\b/g)) out.push(Number(`${m[1].replace(/\./g, '')}.${m[2]}`));
  return out;
}
