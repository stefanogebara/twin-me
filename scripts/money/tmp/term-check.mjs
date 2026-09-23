import 'dotenv/config';
import { termWeeks } from '../../../api/services/money/calendar.js';
import { listFacts } from '../../../api/services/money/store.js';
const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const facts = await listFacts(USER, { includeInternal: true });
const meta = facts.find((f) => f.kind === 'event_spend_meta');
const days = meta ? (JSON.parse(meta.value).days || {}) : {};
console.log('meta learned_at:', meta ? JSON.parse(meta.value).learned_at : 'none');
console.log('days counted:', Object.keys(days).length);
const term = termWeeks(facts, { now: new Date() });
if (!term) console.log('term: null (nothing would draw)');
else {
  console.log('read', term.read_from, '->', term.read_to);
  for (const w of term.weeks) console.log(w.start, w.known ? String(w.events).padStart(3) : ' --', w.current ? '<- this week' : '');
}
process.exit(0);
