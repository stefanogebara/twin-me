/**
 * presenceStore is the only Presence file that talks to Supabase. The routes
 * rely on it returning the raw { data, error, count } response untouched (they
 * branch on `error` themselves), and on the dashboard/readiness reads being
 * dispatched in parallel. These tests pin the query shapes the routes had
 * before the move, so a refactor of the store cannot silently change a table,
 * filter, count option or error path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * One entry per supabaseAdmin.from(table) or .rpc(fn, args): the table (or
 * `rpc:<fn>`) and every builder call in order.
 */
const calls = [];
/** Canned response for an awaited chain; tests override per case. */
let respond = () => ({ data: null, error: null });

/**
 * Chainable Supabase recorder: every builder method records itself and returns
 * the chain; awaiting the chain resolves respond(entry).
 */
function makeChain(table, ops = []) {
  const entry = { table, ops };
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
  supabaseAdmin: {
    from: (table) => makeChain(table),
    rpc: (fn, args) => makeChain(`rpc:${fn}`, [['rpc', fn, args]]),
  },
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
      expect(Object.keys(result)).toEqual(['presence', 'people', 'voice', 'facts', 'notes', 'conversations', 'error']);
    });
  });

  describe('getCallBriefSources (Promise.all read for the elder call brief)', () => {
    it('reads the five brief sources in parallel with the filters the brief needs', async () => {
      const pending = store.getCallBriefSources(PRESENCE_ID);
      expect(calls.map((c) => c.table)).toEqual([
        'presence_people',
        'presence_facts',
        'presence_notes',
        'presence_voice',
        'presence_conversations',
      ]);
      const result = await pending;

      const [people, facts, notes, voice, conversations] = calls;
      expect(people.ops).toEqual([
        ['select', 'name, relation, called_by'],
        ['eq', 'presence_id', PRESENCE_ID],
        ['eq', 'status', 'active'],
        ['order', 'created_at'],
      ]);
      expect(facts.ops).toEqual([
        ['select', 'kind, question, answer, confidence, expires_at'],
        ['eq', 'presence_id', PRESENCE_ID],
        ['eq', 'status', 'active'],
        ['or', expect.stringMatching(/^expires_at\.is\.null,expires_at\.gt\.\d{4}-\d{2}-\d{2}T/)],
        ['order', 'created_at'],
      ]);
      expect(notes.ops).toEqual([
        ['select', 'id, body'],
        ['eq', 'presence_id', PRESENCE_ID],
        ['eq', 'status', 'queued'],
        ['order', 'created_at'],
        ['limit', 5],
      ]);
      expect(voice.ops).toEqual([
        ['select', 'status, elevenlabs_voice_id'],
        ['eq', 'presence_id', PRESENCE_ID],
        ['maybeSingle'],
      ]);
      expect(conversations.ops).toEqual([
        ['select', 'started_at, summary'],
        ['eq', 'presence_id', PRESENCE_ID],
        ['eq', 'status', 'summarized'],
        ['neq', 'summary', ''],
        ['order', 'started_at', { ascending: false }],
        ['limit', 3],
      ]);
      expect(Object.keys(result)).toEqual(['people', 'facts', 'notes', 'voice', 'conversations', 'error']);
    });
  });

  describe('parallel reads report the first failed query as `error`', () => {
    const reads = [
      ['getReadinessSources', 'presence_facts'],
      ['getResumeDetails', 'presence_voice'],
      ['getOverview', 'presences'],
      ['getElderHome', 'presence_conversations'],
      ['getCallBriefSources', 'presence_notes'],
    ];

    it.each(reads)('%s sets error when its %s query fails', async (read, failingTable) => {
      const error = { message: 'canceling statement due to statement timeout' };
      respond = (entry) => (entry.table === failingTable ? { data: null, error } : { data: [], error: null });

      const result = await store[read](PRESENCE_ID);

      expect(result.error).toBe(error);
    });

    it.each(reads)('%s leaves error null when every query succeeds', async (read) => {
      const result = await store[read](PRESENCE_ID);

      expect(result.error).toBeNull();
    });
  });

  describe('replaceActivePeople (presence_replace_people, one transaction)', () => {
    it('sends the whole new map to the RPC and touches no table directly', async () => {
      const people = [{ name: 'Teresa', relation: 'sister', called_by: 'Tete' }];
      const saved = [{ id: 'p-1', ...people[0] }];
      respond = () => ({ data: saved, error: null });

      const result = await store.replaceActivePeople(PRESENCE_ID, people);

      expect(calls).toEqual([
        { table: 'rpc:presence_replace_people', ops: [['rpc', 'presence_replace_people', { p_presence_id: PRESENCE_ID, p_people: people }]] },
      ]);
      expect(result).toEqual({ data: saved, error: null });
    });

    it('passes a failed replacement through', async () => {
      const error = { message: 'new row violates check constraint' };
      respond = () => ({ data: null, error });

      await expect(store.replaceActivePeople(PRESENCE_ID, [])).resolves.toEqual({ data: null, error });
    });
  });

  describe('saveFact (presence_save_fact, serialized per kind and question)', () => {
    it('saves through the RPC and returns the single fact row', async () => {
      const fact = { id: 'f-1', kind: 'anchor', question: 'A place that matters to her', answer: 'Ubatuba' };
      respond = () => ({ data: fact, error: null });

      const result = await store.saveFact(PRESENCE_ID, {
        kind: 'anchor', question: 'A place that matters to her', answer: 'Ubatuba', source: 'family_onboarding',
      });

      expect(calls).toEqual([
        {
          table: 'rpc:presence_save_fact',
          ops: [
            ['rpc', 'presence_save_fact', {
              p_presence_id: PRESENCE_ID,
              p_kind: 'anchor',
              p_question: 'A place that matters to her',
              p_answer: 'Ubatuba',
              p_source: 'family_onboarding',
            }],
            ['single'],
          ],
        },
      ]);
      expect(result).toEqual({ data: fact, error: null });
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

    it('addFacts inserts and returns only each row\'s created_at', async () => {
      const rows = [{ presence_id: PRESENCE_ID, kind: 'biography', question: 'q', answer: 'a' }];
      respond = () => ({ data: [{ created_at: '2026-09-11T10:00:00.000001+00:00' }], error: null });

      const result = await store.addFacts(rows);

      expect(calls[0].table).toBe('presence_facts');
      expect(calls[0].ops).toEqual([['insert', rows], ['select', 'created_at']]);
      expect(result.data).toEqual([{ created_at: '2026-09-11T10:00:00.000001+00:00' }]);
    });

    it('addFacts surfaces the insert error', async () => {
      const error = { message: 'violates check constraint' };
      respond = () => ({ data: null, error });

      const result = await store.addFacts([]);

      expect(result.error).toBe(error);
    });
  });

  describe('supersedeFamilyIntroduction', () => {
    it('retires only active introductions written before the given time', async () => {
      await store.supersedeFamilyIntroduction(PRESENCE_ID, '2026-09-11T10:00:00.000001+00:00');

      expect(calls[0].table).toBe('presence_facts');
      expect(calls[0].ops).toEqual([
        ['update', { status: 'superseded', updated_at: expect.any(String) }],
        ['eq', 'presence_id', PRESENCE_ID],
        ['eq', 'kind', 'biography'],
        ['eq', 'question', 'Family introduction'],
        ['eq', 'status', 'active'],
        ['lt', 'created_at', '2026-09-11T10:00:00.000001+00:00'],
      ]);
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
