/**
 * What the ledger cannot learn on its own, and how to ask for it.
 * ===============================================================
 * The engine in brain.js learns rhythm, price and place from payments alone. There is a
 * hard edge to that. Read against a real ledger it can see that one name sent 100 EUR six
 * times and once 1750 EUR, and it cannot know that this is a parent and therefore income;
 * it can see 49,25 EUR going to another name and cannot know whether that is a flatmate
 * settling rent or a friend paid back for dinner. Those are not facts hiding in the data.
 * They are facts only the person has.
 *
 * So this module is the question layer, and it holds two kinds.
 *
 * **Opening questions** are asked once, before there is any history, and only where an
 * answer changes a computation:
 *   - where you live and where you study or work, so a payment can be near home, near
 *     campus, or somewhere else, without ever reading a phone's position;
 *   - what leaves every month whatever happens, so the projection carries commitments
 *     instead of discovering them;
 *   - what comes in and roughly when, so a month has two sides;
 *   - what is shared, because a 122,99 EUR supermarket run split three ways is not
 *     122,99 EUR of one person's money;
 *   - what this term is for, so a reading has something to be measured against.
 *
 * **Ledger questions** come later and are never generic. Each one is raised by a specific
 * line the system could not interpret, carries that line as its receipt, and changes a
 * number once answered. A question with no receipt and no consequence is a survey, and a
 * survey is a cost the person pays for nothing.
 *
 * Two rules run through the whole file.
 *
 * 1. **Ask only what the ledger cannot answer.** Every question here is checked against
 *    what is already known and disappears once the data settles it. The system must never
 *    ask which supermarket a person uses when it can see it.
 * 2. **An answer is a claim, not a fact.** Rent stated as 500 EUR on the 1st is checked
 *    against the ledger, and when nothing of that size leaves on that day the system says
 *    so. A number the person typed is not more true than a payment that happened.
 *
 * Pure: definitions and decisions in, questions out. No Supabase, no LLM, no network.
 */

const DAY = 86400000;
/** Below this a monthly charge is a subscription, not a roof. */
export const RENT_FLOOR = 200;
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const euro = (n) => EUR.format(Math.abs(Number(n) || 0));
/** The 1st, not the 1th. */
function ordinal(d) {
  const n = Number(d);
  if (!n) return '';
  if (n % 10 === 1 && n !== 11) return `${n}st`;
  if (n % 10 === 2 && n !== 12) return `${n}nd`;
  if (n % 10 === 3 && n !== 13) return `${n}rd`;
  return `${n}th`;
}

/** Every fact the person can hold about their own money. */
export const FACT_KINDS = Object.freeze([
  'home_area',        // the district or town they live in, never an address
  'home_point',       // where that is on a map, for the ledger's own use; never shown as a fact
  'study_place',      // campus or school, by name
  'work_place',       // employer or office, by name
  'commitment',       // something that leaves every month whatever happens
  'income',           // something that comes in, and roughly when
  'shared_cost',      // a cost split with somebody else
  'person',           // who a name on a transfer actually is
  'merchant_kind',    // what a place is, when no provider could say
  'goal',             // what this term is for
]);

/** How a person is related to the money, which is what changes the reading. */
export const PERSON_ROLES = Object.freeze(['family', 'flatmate', 'friend', 'partner', 'landlord', 'work', 'other']);

/**
 * The opening questions, in the order they earn their place. `needs` names the fact kind an
 * answer produces, `why` is shown to the person because a question that cannot say what it
 * buys should not be asked, and `changes` records which computation the answer feeds.
 */
export const OPENING_QUESTIONS = Object.freeze([
  {
    id: 'home_area',
    kind: 'home_area',
    ask: 'Which part of town do you live in?',
    help: 'The district is enough. This never asks where your phone is, and it is not stored as an address.',
    why: 'It tells your local supermarket apart from one you passed once.',
    changes: 'which shops count as near home',
    input: 'text',
    optional: false,
  },
  {
    id: 'study_place',
    kind: 'study_place',
    ask: 'Where do you study?',
    help: 'The name of the school or campus.',
    why: 'It turns a train ticket into a commute and a cafe into the one by your classroom.',
    changes: 'which payments count as the commute and campus',
    input: 'text',
    optional: true,
  },
  {
    id: 'work_place',
    kind: 'work_place',
    ask: 'And do you work anywhere?',
    help: 'Leave it empty if you do not.',
    why: 'Work spending and study spending are different lives, and the ledger cannot tell them apart on its own.',
    changes: 'which payments count as work',
    input: 'text',
    optional: true,
  },
  {
    id: 'income',
    kind: 'income',
    ask: 'What comes in, and roughly when?',
    help: 'A grant, family, a salary, freelance work. Roughly is fine.',
    why: 'Without it a month only has one side, and every reading sounds like a warning.',
    changes: 'what comes in as well as what goes out',
    input: 'list:source,amount,day',
    optional: false,
  },
  {
    id: 'shared',
    kind: 'shared_cost',
    ask: 'Is anything split with somebody else?',
    help: 'Rent with flatmates, a shared shop, a subscription you pay for the group.',
    why: 'A shop split three ways is not all your money, and counting it as yours makes every total wrong.',
    changes: 'what a payment actually cost you',
    input: 'list:what,share',
    optional: true,
  },
  {
    id: 'goal',
    kind: 'goal',
    ask: 'What is this term for, money-wise?',
    help: 'Saving for something, spending less somewhere, or just seeing it clearly.',
    why: 'A number means nothing without something to measure it against.',
    changes: 'what the readings are measured against',
    input: 'choice:save,cut,see',
    optional: true,
  },
]);

/** The opening questions still worth asking, given what is already known. */
export function openingQuestions(facts = []) {
  const answered = new Set(facts.map((f) => f.kind));
  return OPENING_QUESTIONS.filter((q) => !answered.has(q.kind));
}

function nameOf(t) { return t.merchant_raw || t.merchant_key; }
function isOut(t) { return Number(t.amount) < 0; }
function abs(t) { return Math.abs(Number(t.amount) || 0); }

/**
 * Questions the ledger itself raises, each about a line it could not interpret, each with
 * that line attached. Ordered by how much money the answer would explain, because a
 * person's patience is finite and the biggest unexplained thing deserves it first.
 *
 * `transactions` is the ledger, `facts` what the person has already told us, `places` the
 * merchants that have a kind of place behind them.
 */
export function ledgerQuestions({ transactions = [], facts = [], placeOf = () => null, now = new Date(), limit = 5 } = {}) {
  const known = new Set(facts.filter((f) => f.kind === 'person').map((f) => f.subject));
  const knownKinds = new Set(facts.filter((f) => f.kind === 'merchant_kind').map((f) => f.subject));
  const rows = transactions.filter((t) => t.occurred_at);
  const questions = [];

  /* Money arriving from a person is the largest thing the ledger cannot read. Six transfers
     of 100 EUR from one name is either a parent or a debt being repaid, and the two mean
     opposite things for a forecast. */
  const inflowByName = new Map();
  for (const t of rows) {
    if (isOut(t) || !['transfer', 'bizum'].includes(t.channel)) continue;
    const key = t.merchant_key;
    if (known.has(key)) continue;
    if (!inflowByName.has(key)) inflowByName.set(key, { name: nameOf(t), total: 0, rows: [] });
    const g = inflowByName.get(key);
    g.total += abs(t);
    g.rows.push(t);
  }
  for (const g of inflowByName.values()) {
    /* A friend sending 14 EUR for a shared taxi explains nothing about a month. The floor
       is higher than the outgoing one because incoming money only matters where it could
       be income, and income does not arrive in coffee-sized amounts. */
    if (g.total < 25) continue;
    questions.push({
      id: `person_in:${g.rows[0].merchant_key}`,
      kind: 'person',
      subject: g.rows[0].merchant_key,
      ask: `${g.name} has sent you ${euro(g.total)}${g.rows.length > 1 ? ` across ${g.rows.length} transfers` : ''}. Who is that?`,
      help: 'This decides whether the money counts as something you can expect again.',
      why: 'Money you can expect belongs in the month. Money you cannot does not.',
      changes: 'whether this counts as income',
      input: `choice:${PERSON_ROLES.join(',')}`,
      receipts: g.rows.sort((a, b) => abs(b) - abs(a)).slice(0, 3),
      weight: g.total,
    });
  }

  /* Money going to a person: a flatmate settling rent is a household cost, a friend paid
     back is not spending at all. */
  const outflowByName = new Map();
  for (const t of rows) {
    if (!isOut(t) || !['transfer', 'bizum'].includes(t.channel)) continue;
    const key = t.merchant_key;
    if (known.has(key)) continue;
    if (!outflowByName.has(key)) outflowByName.set(key, { name: nameOf(t), total: 0, rows: [] });
    const g = outflowByName.get(key);
    g.total += abs(t);
    g.rows.push(t);
  }
  for (const g of outflowByName.values()) {
    if (g.total < 20) continue;                       // small settling-up is not worth a question
    questions.push({
      id: `person_out:${g.rows[0].merchant_key}`,
      kind: 'person',
      subject: g.rows[0].merchant_key,
      ask: `You sent ${g.name} ${euro(g.total)} ${g.rows.length === 1 ? 'once' : `${g.rows.length} times`}. Who is that?`,
      help: 'Paying a flatmate back is not the same as spending.',
      why: 'A cost shared with somebody is not the same as a cost you carried.',
      changes: 'whether this counts as spending',
      input: `choice:${PERSON_ROLES.join(',')}`,
      receipts: g.rows.sort((a, b) => abs(b) - abs(a)).slice(0, 3),
      weight: g.total,
    });
  }

  /* A place seen again and again that no provider could name. Asked only after three
     visits, because a one-off nobody remembers is not worth a person's attention. */
  const unplaced = new Map();
  for (const t of rows) {
    if (!isOut(t) || placeOf(t)) continue;
    if (['transfer', 'bizum'].includes(t.channel)) continue;
    if (knownKinds.has(t.merchant_key)) continue;
    if (!unplaced.has(t.merchant_key)) unplaced.set(t.merchant_key, { name: nameOf(t), total: 0, rows: [] });
    const g = unplaced.get(t.merchant_key);
    g.total += abs(t);
    g.rows.push(t);
  }
  for (const g of unplaced.values()) {
    if (g.rows.length < 3) continue;
    questions.push({
      id: `kind:${g.rows[0].merchant_key}`,
      kind: 'merchant_kind',
      subject: g.rows[0].merchant_key,
      ask: `What kind of place is ${g.name}? You have paid there ${g.rows.length} times, ${euro(g.total)} in all.`,
      help: 'Your bank writes these names badly and no map could resolve this one.',
      why: 'Until this has a kind, the money it takes is missing from where your month went.',
      changes: 'where your month went',
      input: 'category',
      receipts: g.rows.sort((a, b) => abs(b) - abs(a)).slice(0, 3),
      weight: g.total,
    });
  }

  /* A charge that came back every month and has stopped: either it was cancelled, which is
     good news the ledger should stop expecting, or it failed, which is bad news nobody saw. */
  const byMerchant = new Map();
  for (const t of rows) {
    if (!isOut(t)) continue;
    if (!byMerchant.has(t.merchant_key)) byMerchant.set(t.merchant_key, []);
    byMerchant.get(t.merchant_key).push(t);
  }
  for (const [key, list] of byMerchant) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
    const gaps = sorted.slice(1).map((t, i) => (new Date(t.occurred_at) - new Date(sorted[i].occurred_at)) / DAY);
    const typical = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const since = (now - new Date(sorted[sorted.length - 1].occurred_at)) / DAY;
    if (!typical || typical < 20 || since < typical * 2) continue;
    questions.push({
      id: `stopped:${key}`,
      kind: 'merchant_kind',
      subject: key,
      ask: `${nameOf(sorted[0])} came every ${Math.round(typical)} days and has not for ${Math.floor(since)}. Did you cancel it?`,
      help: 'If you did, the projection should stop expecting it.',
      why: 'A charge that stopped is either money saved or a payment that failed.',
      changes: 'what the month is expected to end at',
      input: 'choice:cancelled,still active,not sure',
      receipts: sorted.slice(-2).reverse(),
      weight: Math.abs(Number(sorted[sorted.length - 1].amount) || 0) * 3,
    });
  }

  /* Rent is not asked for up front any more: a fixed cost that big announces itself. Something
     over 200 EUR leaving on the same day of the month, month after month, is asked about once,
     with the payments attached, and the answer becomes the commitment the projection carries. */
  const committed = new Set(facts.filter((f) => f.kind === 'commitment').map((f) => f.subject));
  for (const [key, list] of byMerchant) {
    if (committed.has(key) || known.has(key)) continue;
    const big = list.filter((t) => abs(t) >= RENT_FLOOR);
    if (big.length < 2) continue;
    const months = new Set(big.map((t) => t.occurred_at.slice(0, 7)));
    if (months.size < 2) continue;
    const days = big.map((t) => new Date(t.occurred_at).getUTCDate()).sort((a, b) => a - b);
    const day = days[Math.floor(days.length / 2)];
    if (!days.every((d) => Math.abs(d - day) <= 3)) continue;
    const amounts = big.map(abs).sort((a, b) => a - b);
    const amount = amounts[Math.floor(amounts.length / 2)];
    const sorted = [...big].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
    questions.push({
      id: `rent:${key}`,
      kind: 'commitment',
      subject: key,
      subjectLabel: nameOf(sorted[0]),
      ask: `${nameOf(sorted[0])} takes about ${euro(amount)} around the ${ordinal(day)}, ${months.size} months running. Is this your rent?`,
      help: 'Rent or another fixed cost is money the month has already spoken for.',
      why: 'The month can then be projected with what is already spoken for, instead of finding out later.',
      changes: 'what the month is expected to end at',
      input: 'choice:rent,another fixed cost,not fixed',
      receipts: sorted.slice(0, 3),
      amount,
      day,
      weight: amount * 2,
    });
  }

  return questions.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/**
 * A stated commitment against what the ledger actually shows. An answer is a claim; this
 * is the check. Returns `{ fact, status, seen, note }` where status is 'confirmed',
 * 'different' or 'unseen'.
 */
export function checkCommitment(fact, transactions = [], now = new Date()) {
  const amount = Math.abs(Number(fact.amount) || 0);
  if (!amount) return { fact, status: 'unseen', seen: [], note: 'No amount to check against.' };
  const since = now.getTime() - 95 * DAY;
  const near = transactions.filter((t) => Number(t.amount) < 0
    && new Date(t.occurred_at).getTime() >= since
    && Math.abs(abs(t) - amount) <= Math.max(2, amount * 0.15));
  if (!near.length) {
    return {
      fact, status: 'unseen', seen: [],
      note: `Nothing near ${euro(amount)} has left the account in three months. It may be paid from somewhere else.`,
    };
  }
  const onDay = fact.day ? near.filter((t) => Math.abs(new Date(t.occurred_at).getUTCDate() - Number(fact.day)) <= 3) : near;
  if (fact.day && !onDay.length) {
    return {
      fact, status: 'different', seen: near.slice(0, 3),
      note: `Something of about ${euro(amount)} does leave, but not near the ${ordinal(fact.day)}.`,
    };
  }
  return { fact, status: 'confirmed', seen: onDay.slice(0, 3), note: null };
}

/**
 * The person's own context, written for the twin. Short, factual, and explicit about what
 * is a claim rather than a reading, so the twin never states a typed number as an observed one.
 */
export function describeContext(facts = []) {
  if (!facts.length) return '';
  const lines = [];
  const one = (kind) => facts.find((f) => f.kind === kind);
  const many = (kind) => facts.filter((f) => f.kind === kind);

  const home = one('home_area');
  const study = one('study_place');
  const work = one('work_place');
  if (home) lines.push(`Lives in ${home.value}.`);
  if (study) lines.push(`Studies at ${study.value}.`);
  if (work) lines.push(`Works at ${work.value}.`);

  const commitments = many('commitment');
  if (commitments.length) {
    lines.push(`Says these leave every month: ${commitments.map((c) => `${c.subject} ${euro(c.amount)}${c.day ? ` on the ${ordinal(c.day)}` : ''}`).join(', ')}.`);
  }
  const income = many('income');
  if (income.length) {
    lines.push(`Says this comes in: ${income.map((c) => `${c.subject} ${euro(c.amount)}${c.day ? ` around the ${ordinal(c.day)}` : ''}`).join(', ')}.`);
  }
  const shared = many('shared_cost');
  if (shared.length) lines.push(`Splits: ${shared.map((s) => `${s.subject} (${s.value})`).join(', ')}.`);

  const people = many('person');
  if (people.length) lines.push(`People on the statement: ${people.map((p) => `${p.subject_label || p.subject} is ${p.value}`).join(', ')}.`);

  const goal = one('goal');
  if (goal) lines.push(`This term is for: ${goal.value}.`);

  if (!lines.length) return '';
  return ['What this person told me about their own money (their words, not readings):', ...lines.map((l) => `- ${l}`)].join('\n');
}
