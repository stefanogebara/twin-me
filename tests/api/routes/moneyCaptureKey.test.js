/**
 * The phone's key (2026-09-26). POST /api/api-keys left with the twin and answered 410, so no new
 * phone could be set up: the key is made at POST /money/capture-key now, and /api/api-keys answers
 * POST again, in its old shape, for the Android builds already installed. A key that cannot be
 * checked answers 503, not 401: old Android builds count anything under 500 as delivered.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import request from 'supertest';

const owner = '00000000-0000-4000-8000-000000000001';
const KEY = /^twm_[A-Za-z0-9_-]{32}$/;
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const db = vi.hoisted(() => ({ keys: [], inserts: [], failInsert: null, failRead: null }));
vi.mock('../../../api/_app/middleware/auth.js', () => ({ authenticateUser: (req, _res, next) => { req.user = { id: '00000000-0000-4000-8000-000000000001' }; next(); } }));
vi.mock('../../../api/_app/services/database.js', () => {
  /* api_keys as an array: an insert adds a row, a read by key_hash finds one. Every other table
     reads empty. A query records its calls and runs when awaited, as supabase-js does. */
  const run = (table, calls) => {
    const call = (name) => calls.find((c) => c[0] === name);
    if (table !== 'api_keys' || call('update')) return { data: null, error: null };
    if (call('insert')) {
      if (db.failInsert) return { data: null, error: { message: db.failInsert } };
      db.inserts.push(call('insert')[1]);
      const row = { id: `key-${db.keys.length + 1}`, created_at: '2026-09-26T08:00:00.000Z', ...call('insert')[1] };
      db.keys.push(row);
      return { data: { id: row.id, name: row.name, created_at: row.created_at }, error: null };
    }
    if (db.failRead) return { data: null, error: { message: db.failRead } };
    return { data: db.keys.find((k) => k.key_hash === call('eq')[2]) || null, error: null };
  };
  const from = (table) => {
    const calls = [];
    const query = new Proxy({}, { get: (_target, name) => (name === 'then'
      ? (ok, fail) => Promise.resolve().then(() => run(table, calls)).then(ok, fail)
      : (...args) => { calls.push([name, ...args]); return query; }) });
    return query;
  };
  return { supabaseAdmin: { from, rpc: async () => ({ data: null, error: null }) }, serverDb: {} };
});
vi.mock('../../../api/_app/services/money/store.js', async (original) => {
  const real = await original();
  return { ...real, createCaptureKey: vi.fn(real.createCaptureKey), userForCaptureKey: vi.fn(real.userForCaptureKey) };
});
import { createCaptureKey, userForCaptureKey } from '../../../api/_app/services/money/store.js';
import { parkedPath } from '../../../api/_app/middleware/legacyTwin.js';
import { mounts } from '../../../scripts/ci/reach.mjs';
import router from '../../../api/_app/routes/money.js';
const app = express(); app.use(express.json()); app.use('/money', router);
/* The old address, mounted the way server.js mounts it; imported when asked for, so the rest of
   this file reports on its own while the route does not exist. */
const legacyApp = async () => {
  const { default: legacy } = await import('../../../api/_app/routes/capture-key-legacy.js');
  const a = express(); a.use(express.json()); a.use('/api/api-keys', legacy);
  return a;
};

beforeEach(() => {
  vi.clearAllMocks();
  db.keys.length = 0; db.inserts.length = 0; db.failInsert = null; db.failRead = null;
});

describe('POST /money/capture-key', () => {
  it('makes a key for the signed-in person, in the format phones already hold; a forged owner is ignored', async () => {
    const r = await request(app).post('/money/capture-key').send({ name: '  Phone capture (Shortcut)  ', userId: 'someone-else', user_id: 'someone-else' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: { key: expect.stringMatching(KEY) } });
    expect(createCaptureKey).toHaveBeenCalledWith(owner, 'Phone capture (Shortcut)');
    expect(db.inserts).toEqual([{ user_id: owner, key_hash: sha256(r.body.data.key), name: 'Phone capture (Shortcut)', is_active: true }]);
  });

  it('names a key made without a name for what it is for', async () => {
    const r = await request(app).post('/money/capture-key').send({});
    expect(r.status).toBe(200);
    expect(db.inserts[0].name).toBe('Phone capture');
  });

  it('refuses a name longer than 80 characters, naming the field', async () => {
    const r = await request(app).post('/money/capture-key').send({ name: 'a'.repeat(81) });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, error: 'Invalid request', field: 'name' });
    expect(db.inserts).toEqual([]);
  });

  it('hands out no key when it could not be saved', async () => {
    db.failInsert = 'connection reset';
    const r = await request(app).post('/money/capture-key').send({ name: 'Phone capture (Shortcut)' });
    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
    expect(JSON.stringify(r.body)).not.toMatch(/twm_/);
  });
});

describe('POST /api/api-keys, for the Android builds already installed', () => {
  it('lets the address through the parked-twin gate again', () => {
    expect(parkedPath('/api/api-keys')).toBe(false);
    expect(parkedPath('/api/twin')).toBe(true);
  });

  it('is mounted in server.js on the small legacy router', () => {
    const server = fs.readFileSync(new URL('../../../api/_app/server.js', import.meta.url), 'utf8');
    expect(mounts(server).filter((m) => m.path === '/api/api-keys').map((m) => m.file)).toEqual(['api/_app/routes/capture-key-legacy.js']);
  });

  it('answers the old shape (key at the top, with id, name, created_at, warning) from the same service', async () => {
    const r = await request(await legacyApp()).post('/api/api-keys').send({ name: 'Phone capture (Android)', user_id: 'someone-else' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, key: expect.stringMatching(KEY), id: 'key-1', name: 'Phone capture (Android)', created_at: '2026-09-26T08:00:00.000Z', warning: expect.any(String) });
    expect(createCaptureKey).toHaveBeenCalledWith(owner, 'Phone capture (Android)');
    expect(db.inserts).toEqual([{ user_id: owner, key_hash: sha256(r.body.key), name: 'Phone capture (Android)', is_active: true }]);
  });

  it('answers 500 with no key when the key could not be saved', async () => {
    db.failInsert = 'connection reset';
    const r = await request(await legacyApp()).post('/api/api-keys').send({ name: 'Phone capture (Android)' });
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ success: false, error: 'Failed to create API key' });
  });

  it('serves nothing but POST', async () => {
    const legacy = await legacyApp();
    expect((await request(legacy).get('/api/api-keys')).status).toBe(404);
    expect((await request(legacy).delete('/api/api-keys/key-1')).status).toBe(404);
  });
});

describe('createCaptureKey (store)', () => {
  it('stores the SHA-256 of the key and never the key itself', async () => {
    const made = await createCaptureKey(owner, 'Phone capture (Android)');
    expect(made.key).toMatch(KEY);
    expect(Object.keys(db.inserts[0]).sort()).toEqual(['is_active', 'key_hash', 'name', 'user_id']);
    expect(db.inserts[0].key_hash).toBe(sha256(made.key));
    expect(JSON.stringify(db.inserts)).not.toContain(made.key.slice(4));
  });

  it('makes a different key every time', async () => {
    const [a, b] = [await createCaptureKey(owner), await createCaptureKey(owner)];
    expect(a.key).not.toBe(b.key);
  });

  it('throws when the insert fails', async () => {
    db.failInsert = 'duplicate key value violates unique constraint';
    await expect(createCaptureKey(owner, 'Phone capture (Android)')).rejects.toThrow();
  });
});

describe('a payment sent with a key', () => {
  const send = (key) => request(app).post('/money/capture').set('X-TwinMe-Key', key).send({});

  it('is refused (401) when no active key has that hash: none, revoked or expired', async () => {
    db.keys.push({ id: 'old', user_id: owner, key_hash: sha256('twm_revoked'), is_active: false, expires_at: null });
    db.keys.push({ id: 'late', user_id: owner, key_hash: sha256('twm_expired'), is_active: true, expires_at: '2026-01-01T00:00:00.000Z' });
    for (const key of ['twm_unknown', 'twm_revoked', 'twm_expired']) {
      const r = await send(key);
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ success: false, error: 'Invalid capture key' });
    }
  });

  it('is asked to try again (503) when the key cannot be checked, so the phone sends it again', async () => {
    db.failRead = 'connection reset';
    await expect(userForCaptureKey(sha256('twm_anything'))).rejects.toThrow();
    const r = await send('twm_anything');
    expect(r.status).toBe(503);
    expect(r.headers['retry-after']).toBe('60');
    expect(r.body).toEqual({ success: false, error: 'Try again in a moment.' });
  });

  it('passes with a key made here, and reaches the handler as its owner', async () => {
    const made = await request(app).post('/money/capture-key').send({ name: 'Phone capture (Shortcut)' });
    const r = await send(made.body.data.key);
    expect(userForCaptureKey).toHaveBeenCalledWith(sha256(made.body.data.key));
    /* The handler's own answer to an empty body: authentication let it through. */
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/^Send text/);
  });
});
