/**
 * presenceStore is the only Presence file that talks to Supabase. The routes
 * rely on it returning the raw { data, error, count } response untouched (they
 * branch on `error` themselves), and on the dashboard/readiness reads being
 * dispatched in parallel. These tests pin the query shapes the routes had
 * before the move, so a refactor of the store cannot silently change a table,
 * filter, count option or error path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** One entry per supabaseAdmin.from(table): the table and every builder call in order. */
const calls = [];
/** Canned response for an awaited chain; tests override per case. */
let respond = () => ({ data: null, error: null });

/**
 * Chainable Supabase recorder: every builder method records itself and returns
 * the chain; awaiting the chain resolves respond(entry).
 */
function makeChain(table) {
  const entry = { table, ops: [] };
  calls.push(entry);
  const chain = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          const promise = Promise.resolve(respond(entry));
          return promise.then.bind(promise);
        }
        return (...args) => {
          entry.ops.push([prop, ...args]);
          return chain;
        };
      },
    },
  );
  return chain;
}

vi.mock('../../api/services/database.js', () => ({
  supabaseAdmin: { from: (table) => makeChain(table) },
}));

const store = await import('../../api/services/presenceStore.js');

const PRESENCE_ID = '11111111-1111-4111-8111-111111111111';

describe('presenceStore', () => {
  beforeEach(() => {
    calls.length = 0;
    respond = () => ({ data: null, error: null });
  });

  describe('findLivePresenceById (the ownership lookup)', () => {
    it('reads the live presence by id with the ownership columns', async () => {
      const row = { id: PRESENCE_ID, owner_user_id: 'user-1', status: 'draft' };
      respond = () => ({ data: row, error: null });

      const result = await store.findLivePresenceById(PRESENCE_ID);

      expect(calls).toHaveLength(1);
      expect(calls[0].table).toBe('presences');
      expect(calls[0].ops).toEqual([
        ['select', 'id, owner_user_id, status, cared_for_name, caller_name, tone'],
        ['eq', 'id', PRESENCE_ID],
        ['neq', 'status', 'deleted'],
        ['maybeSingle'],
      ]);
      expect(result).toEqual({ data: row, error: null });
    });

    it('passes a query error through instead of throwing', async () => {
      const error = { message: 'connection reset' };
      respond = () => ({ data: null, error });

      await expect(store.findLivePresenceById(PRESENCE_ID)).resolves.toEqual({ data: null, error });
    });
  });

  describe('getReadinessSources (Promise.all read)', () => {
    it('dispatches all five queries before any resolves', () => {
      const pending = store.getReadinessSources(PRESENCE_ID);
      // Every .from() ran synchronously inside the Promise.all array literal.
      expect(calls.map((c) => c.table)).toEqual([
        'presence_people',
        'presence_facts',
        'presence_notes',
        'presence_conversations',
        'presence_voice',
      ]);
      return pending;
    });

    it('keeps the count/head options and filters, and maps each response by name', async () => {
      respond = (entry) => {
        if (entry.table === 'presence_people') return { data: null, count: 3, error: null };
        if (entry.table === 'presence_facts') return { data: [{ kind: 'anchor', confidence: 'committed' }], error: null };
        if (entry.table === 'presence_notes') return { data: null, count: 1, error: null };
        if (entry.table === 'presence_conversations') return { data: null, count: 0, error: null };
        return { data: { status: 'queued' }, error: null };
      };

      const result = await store.getReadinessSources(PRESENCE_ID);

      const [people, facts, notes, conversations, voice] = calls;
      expect(people.ops).toEqual([
        ['select', 'id', { count: 'exact', head: true }],
        ['eq', 'presence_id', PRESENCE_ID],
        ['eq', 'status', 'active'],
      ]);
      expect(facts.ops).toEqual([
        ['select', 'kind, confidence'],
        ['eq', 'presence_id', PRESENCE_ID],
        ['eq', 'status', 'active'],
      ]);
      expect(notes.ops).toEqual([
        ['select', 'id', { count: 'exact', head: true }],
        ['eq', 'presence_id', PRESENCE_ID],
        ['eq', 'status', 'queued'],
      ]);
      expect(conversations.ops).toEqual([
        ['select', 'id', { count: 'exact', head: true }],
        ['eq', 'presence_id', PRESENCE_ID],
      ]);
      expect(voice.ops).toEqual([
        ['select', 'status'],
        ['eq', 'presence_id', PRESENCE_ID],
        ['maybeSingle'],
      ]);

      expect(result.people.count).toBe(3);
      expect(result.facts.data).toEqual([{ kind: 'anchor', confidence: 'committed' }]);
      expect(result.notes.count).toBe(1);
      expect(result.conversations.count).toBe(0);
      expect(result.voice.data).toEqual({ status: 'queued' });
    });
  });

  describe('getOverview (Promise.all read)', () => {
    it('reads the six dashboard sources in parallel with their limits and ordering', async () => {
      const pending = store.getOverview(PRESENCE_ID);
      expect(calls.map((c) => c.table)).toEqual([
        'presences',
        'presence_people',
        'presence_voice',
        'presence_facts',
        'presence_notes',
        'presence_conversations',
      ]);
      const result = await pending;

      expect(calls[0].ops).toEqual([['select', '*'], ['eq', 'id', PRESENCE_ID], ['single']]);
      expect(calls[4].ops).toEqual([
        ['select', 'id, body, status, created_at, delivered_at'],
        ['eq', 'presence_id', PRESENCE_ID],
        ['order', 'created_at', { ascending: false }],
        ['limit', 20],
      ]);
      expect(calls[5].ops).toEqual([
        ['select', 'id, started_at, ended_at, turn_count, duration_seconds, summary, needs_family, status'],
        ['eq', 'presence_id', PRESENCE_ID],
        ['order', 'started_at', { ascending: false }],
        ['limit', 10],
      ]);
      expect(Object.keys(result)).toEqual(['presence', 'people', 'voice', 'facts', 'notes', 'conversations']);
    });
  });

  describe('inserts', () => {
    it('recordConsent appends to presence_consents and returns the selected row', async () => {
      const row = { presence_id: PRESENCE_ID, user_id: 'user-1', kind: 'own_voice', text_version: 'v1' };
      const saved = { id: 'c-1', kind: 'own_voice', accepted_at: '2026-09-11T00:00:00Z' };
      respond = () => ({ data: saved, error: null });

      const result = await store.recordConsent(row);

      expect(calls[0].table).toBe('presence_consents');
      expect(calls[0].ops).toEqual([
        ['insert', row],
        ['select', 'id, kind, accepted_at'],
        ['single'],
      ]);
      expect(result).toEqual({ data: saved, error: null });
    });

    it('addFacts inserts without asking for the rows back and surfaces the error', async () => {
      const rows = [{ presence_id: PRESENCE_ID, kind: 'biography', question: 'q', answer: 'a' }];
      const error = { message: 'violates check constraint' };
      respond = () => ({ data: null, error });

      const result = await store.addFacts(rows);

      expect(calls[0].table).toBe('presence_facts');
      expect(calls[0].ops).toEqual([['insert', rows]]);
      expect(result.error).toBe(error);
    });
  });

  describe('updates', () => {
    it('updatePresence applies the patch by id and returns the updated row', async () => {
      const patch = { tone: 'Calm and practical', updated_at: '2026-09-11T00:00:00.000Z' };
      respond = () => ({ data: { id: PRESENCE_ID, ...patch }, error: null });

      const result = await store.updatePresence(PRESENCE_ID, patch);

      expect(calls[0].table).toBe('presences');
      expect(calls[0].ops).toEqual([
        ['update', patch],
        ['eq', 'id', PRESENCE_ID],
        ['select'],
        ['single'],
      ]);
      expect(result.data).toEqual({ id: PRESENCE_ID, ...patch });
    });

    it('softDeleteActivePeople marks only the active map deleted and passes the error through', async () => {
      const error = { message: 'timeout' };
      respond = () => ({ data: null, error });

      const result = await store.softDeleteActivePeople(PRESENCE_ID);

      expect(calls[0].table).toBe('presence_people');
      expect(calls[0].ops).toEqual([
        ['update', { status: 'deleted', updated_at: expect.any(String) }],
        ['eq', 'presence_id', PRESENCE_ID],
        ['eq', 'status', 'active'],
      ]);
      expect(result.error).toBe(error);
    });

    it('markQueuedNotesDelivered stamps delivered_at on queued notes only', async () => {
      await store.markQueuedNotesDelivered(PRESENCE_ID);

      expect(calls[0].table).toBe('presence_notes');
      expect(calls[0].ops).toEqual([
        ['update', { status: 'delivered', delivered_at: expect.any(String) }],
        ['eq', 'presence_id', PRESENCE_ID],
        ['eq', 'status', 'queued'],
      ]);
    });
  });

  describe('voice consent and upserts', () => {
    it('getLatestVoiceConsent reads the newest own_voice/revoked record', async () => {
      respond = () => ({ data: [{ kind: 'own_voice', accepted_at: '2026-09-10T00:00:00Z' }], error: null });

      const result = await store.getLatestVoiceConsent(PRESENCE_ID);

      expect(calls[0].table).toBe('presence_consents');
      expect(calls[0].ops).toEqual([
        ['select', 'kind, accepted_at'],
        ['eq', 'presence_id', PRESENCE_ID],
        ['in', 'kind', ['own_voice', 'own_voice_revoked']],
        ['order', 'accepted_at', { ascending: false }],
        ['limit', 1],
      ]);
      expect(result.data[0].kind).toBe('own_voice');
    });

    it('recordVoiceStatus upserts on presence_id', async () => {
      const row = { presence_id: PRESENCE_ID, status: 'queued', sample_count: 2, sample_seconds: 40 };

      await store.recordVoiceStatus(row);

      expect(calls[0].table).toBe('presence_voice');
      expect(calls[0].ops).toEqual([
        ['upsert', row, { onConflict: 'presence_id' }],
        ['select', 'status, sample_count, sample_seconds'],
        ['single'],
      ]);
    });
  });

  describe('findPresenceByCallToken (elder channel)', () => {
    it('looks the presence up by call token, excluding deleted ones', async () => {
      await store.findPresenceByCallToken('tok_abcdefghijklmnopqrstuv');

      expect(calls[0].table).toBe('presences');
      expect(calls[0].ops).toEqual([
        ['select', '*'],
        ['eq', 'call_token', 'tok_abcdefghijklmnopqrstuv'],
        ['neq', 'status', 'deleted'],
        ['maybeSingle'],
      ]);
    });
  });
});
