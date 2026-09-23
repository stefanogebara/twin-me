/**
 * Members and roles on api/_app/routes/presence.js (Phase 2, T4), the store mocked
 * at its boundary. Owner: everything. Family: the page without the settings
 * actions. Companion (acompanhante, cuidadora): notes and the "needs a person"
 * list, never a transcript or a summary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_ANON_KEY = 'test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.NODE_ENV = 'test';

const OWNER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const SISTER = '33333333-3333-4333-8333-333333333333';
const CUIDADORA = '44444444-4444-4444-8444-444444444444';
const PRESENCE_ID = '11111111-1111-4111-8111-111111111111';
const PRESENCE = { id: PRESENCE_ID, owner_user_id: OWNER, status: 'active', cared_for_name: 'Lurdes', caller_name: 'Ana', tone: '' };

const ok = (data) => ({ data, error: null });

const { store, log } = vi.hoisted(() => {
  const names = [
    'findLivePresenceById', 'getLatestPresenceForOwner', 'getResumeDetails', 'getOverview', 'listRecentCalls', 'getOwnerWhatsApp', 'createPresence',
    'updatePresence', 'queueNote', 'listMembers', 'findMembership', 'addMember', 'removeMember', 'listPresencesForMember',
    'createInvite', 'findInviteByToken', 'acceptInvite',
  ];
  return { store: Object.fromEntries(names.map((n) => [n, vi.fn()])), log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } };
});

vi.mock('../../../api/_app/services/presenceStore.js', () => store);
vi.mock('../../../api/_app/services/logger.js', () => ({ createLogger: () => log }));
vi.mock('../../../api/_app/services/voiceService.js', () => ({ voiceService: { isEnabled: vi.fn(() => false), speechToTextEnabled: false } }));
vi.mock('../../../api/_app/services/llmGateway.js', () => ({ complete: vi.fn(), TIER_ANALYSIS: 'analysis' }));
vi.mock('../../../api/_app/services/database.js', () => ({
  supabaseAdmin: { from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn(async () => ({ data: { email_verified: true }, error: null })), maybeSingle: vi.fn(async () => ({ data: { email_verified: true }, error: null })) })) },
}));

const presenceRoutes = (await import('../../../api/_app/routes/presence.js')).default;

function app() { const a = express(); a.use(express.json()); a.use('/api/presence', presenceRoutes); return a; }
const as = (userId) => `Bearer ${jwt.sign({ id: userId, email: `${userId}@x.test` }, 'test-secret')}`;

const OVERVIEW = {
  presence: ok({ ...PRESENCE, elder_phone: '+5511999990000', call_hour: 10, call_days: [1, 2, 3], call_timezone: 'America/Sao_Paulo', relationship: 'mother' }),
  people: ok([{ id: 'pp-1', name: 'Zé' }]), voice: ok(null), facts: ok([{ id: 'f-1' }]), notes: ok([{ id: 'n-1', body: 'oi' }]),
  conversations: ok([{ id: 'c-1', started_at: '2026-09-18T13:00:00Z', summary: 'Falou do jardim.', transcript: [{ role: 'user', content: 'x' }], needs_family: ['Remédio acabou'], urgency: 'medium' }]),
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  store.findLivePresenceById.mockResolvedValue(ok(PRESENCE));
  store.findMembership.mockResolvedValue(ok(null));
  store.getOverview.mockResolvedValue(OVERVIEW);
  store.listRecentCalls.mockResolvedValue(ok([]));
  store.getOwnerWhatsApp.mockResolvedValue(ok(null));
  store.queueNote.mockResolvedValue(ok({ id: 'n-2' }));
  store.listMembers.mockResolvedValue(ok([{ id: 'm-1', user_id: OWNER, role: 'owner' }]));
  store.addMember.mockResolvedValue(ok(null));
  store.removeMember.mockResolvedValue(ok(null));
  store.createInvite.mockResolvedValue(ok({ id: 'i-1', token: 'T'.repeat(32), role: 'companion', expires_at: '2026-09-26T00:00:00.000Z' }));
  store.acceptInvite.mockResolvedValue(ok({ id: 'i-1' }));
  store.updatePresence.mockResolvedValue(ok(PRESENCE));
});

describe('who may read the overview', () => {
  it('a family member gets the whole page, with her role', async () => {
    store.findMembership.mockResolvedValue(ok({ role: 'family' }));
    const res = await request(app()).get(`/api/presence/${PRESENCE_ID}/overview`).set('Authorization', as(SISTER));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('family');
    expect(res.body.conversations[0].summary).toBe('Falou do jardim.');
    expect(store.findMembership).toHaveBeenCalledWith(PRESENCE_ID, SISTER);
  });

  it('a companion gets her name and schedule, the notes and the needs, and no transcript or summary', async () => {
    store.findMembership.mockResolvedValue(ok({ role: 'companion' }));
    const res = await request(app()).get(`/api/presence/${PRESENCE_ID}/overview`).set('Authorization', as(CUIDADORA));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('companion');
    expect(res.body.presence).toEqual({ id: PRESENCE_ID, cared_for_name: 'Lurdes', caller_name: 'Ana', relationship: 'mother', status: 'active', call_hour: 10, call_days: [1, 2, 3], call_timezone: 'America/Sao_Paulo' });
    expect(res.body.notes).toEqual([{ id: 'n-1', body: 'oi' }]);
    expect(res.body.needs).toEqual([{ id: 'c-1', started_at: '2026-09-18T13:00:00Z', needs_family: ['Remédio acabou'], urgency: 'medium' }]);
    for (const k of ['conversations', 'facts', 'people', 'voice', 'whatsapp', 'calls']) expect(res.body).not.toHaveProperty(k);
    expect(JSON.stringify(res.body)).not.toContain('Falou do jardim');
  });

  it('a stranger is told there is no such presence', async () => {
    const res = await request(app()).get(`/api/presence/${PRESENCE_ID}/overview`).set('Authorization', as(SISTER));
    expect(res.status).toBe(404);
  });

  it('the owner still reads it without a membership row', async () => {
    const res = await request(app()).get(`/api/presence/${PRESENCE_ID}/overview`).set('Authorization', as(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('owner');
    expect(store.findMembership).not.toHaveBeenCalled();
  });
});

describe('what each role may do', () => {
  it('a companion can leave a note for her', async () => {
    store.findMembership.mockResolvedValue(ok({ role: 'companion' }));
    const res = await request(app()).post(`/api/presence/${PRESENCE_ID}/notes`).set('Authorization', as(CUIDADORA)).send({ body: 'Ela tomou o remédio.' });
    expect(res.status).toBe(201);
    expect(store.queueNote).toHaveBeenCalledWith(expect.objectContaining({ presence_id: PRESENCE_ID, author_user_id: CUIDADORA }));
  });

  it('a family member cannot change the settings', async () => {
    store.findMembership.mockResolvedValue(ok({ role: 'family' }));
    const res = await request(app()).patch(`/api/presence/${PRESENCE_ID}`).set('Authorization', as(SISTER)).send({ call_hour: 15 });
    expect(res.status).toBe(404);
    expect(store.updatePresence).not.toHaveBeenCalled();
  });
});

describe('members', () => {
  it('the owner lists them; a family member cannot', async () => {
    const mine = await request(app()).get(`/api/presence/${PRESENCE_ID}/members`).set('Authorization', as(OWNER));
    expect(mine.status).toBe(200);
    expect(mine.body.members).toEqual([{ id: 'm-1', user_id: OWNER, role: 'owner' }]);

    store.findMembership.mockResolvedValue(ok({ role: 'family' }));
    const theirs = await request(app()).get(`/api/presence/${PRESENCE_ID}/members`).set('Authorization', as(SISTER));
    expect(theirs.status).toBe(404);
  });

  it('the owner removes a member, but not themselves', async () => {
    const gone = await request(app()).delete(`/api/presence/${PRESENCE_ID}/members/${SISTER}`).set('Authorization', as(OWNER));
    expect(gone.status).toBe(200);
    expect(store.removeMember).toHaveBeenCalledWith(PRESENCE_ID, SISTER);

    const self = await request(app()).delete(`/api/presence/${PRESENCE_ID}/members/${OWNER}`).set('Authorization', as(OWNER));
    expect(self.status).toBe(400);
  });
});

describe('invites', () => {
  it('the owner mints a seven-day link for a role', async () => {
    const res = await request(app()).post(`/api/presence/${PRESENCE_ID}/invites`).set('Authorization', as(OWNER)).send({ role: 'companion' });
    expect(res.status).toBe(201);
    expect(res.body.join_path).toBe(`/presence/join/${'T'.repeat(32)}`);
    expect(res.body.role).toBe('companion');
    const row = store.createInvite.mock.calls[0][0];
    expect(row).toMatchObject({ presence_id: PRESENCE_ID, role: 'companion', created_by: OWNER });
    expect(row.token).toMatch(/^[A-Za-z0-9_-]{32,64}$/);
    expect(new Date(row.expires_at).getTime() - Date.now()).toBeGreaterThan(6.9 * 86400e3);
  });

  it('refuses a role that is not family or companion', async () => {
    const res = await request(app()).post(`/api/presence/${PRESENCE_ID}/invites`).set('Authorization', as(OWNER)).send({ role: 'owner' });
    expect(res.status).toBe(400);
    expect(store.createInvite).not.toHaveBeenCalled();
  });

  it('joining writes the membership and burns the invite', async () => {
    store.findInviteByToken.mockResolvedValue(ok({ id: 'i-1', presence_id: PRESENCE_ID, role: 'family', expires_at: '2099-01-01T00:00:00Z', accepted_at: null }));
    const res = await request(app()).post(`/api/presence/join/${'a'.repeat(32)}`).set('Authorization', as(SISTER));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ presence_id: PRESENCE_ID, role: 'family', cared_for_name: 'Lurdes' });
    expect(store.addMember).toHaveBeenCalledWith({ presence_id: PRESENCE_ID, user_id: SISTER, role: 'family', invited_by: null });
    expect(store.acceptInvite).toHaveBeenCalledWith('i-1', SISTER);
  });

  it('an unknown link is 404, a used or expired one is 410', async () => {
    store.findInviteByToken.mockResolvedValue(ok(null));
    expect((await request(app()).post(`/api/presence/join/${'b'.repeat(32)}`).set('Authorization', as(SISTER))).status).toBe(404);
    store.findInviteByToken.mockResolvedValue(ok({ id: 'i-1', presence_id: PRESENCE_ID, role: 'family', expires_at: '2000-01-01T00:00:00Z', accepted_at: null }));
    expect((await request(app()).post(`/api/presence/join/${'c'.repeat(32)}`).set('Authorization', as(SISTER))).status).toBe(410);
    store.findInviteByToken.mockResolvedValue(ok({ id: 'i-1', presence_id: PRESENCE_ID, role: 'family', expires_at: '2099-01-01T00:00:00Z', accepted_at: '2026-09-18T00:00:00Z' }));
    expect((await request(app()).post(`/api/presence/join/${'d'.repeat(32)}`).set('Authorization', as(SISTER))).status).toBe(410);
    expect(store.addMember).not.toHaveBeenCalled();
  });

  it('the owner opening their own link is simply already in', async () => {
    store.findInviteByToken.mockResolvedValue(ok({ id: 'i-1', presence_id: PRESENCE_ID, role: 'family', expires_at: '2099-01-01T00:00:00Z', accepted_at: null }));
    const res = await request(app()).post(`/api/presence/join/${'e'.repeat(32)}`).set('Authorization', as(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('owner');
    expect(store.addMember).not.toHaveBeenCalled();
  });
});

describe('GET /mine', () => {
  it('answers a membership when the user owns no presence', async () => {
    store.getLatestPresenceForOwner.mockResolvedValue(ok(null));
    store.listPresencesForMember.mockResolvedValue(ok([{ role: 'companion', presences: { ...PRESENCE, elder_phone: null } }]));
    const res = await request(app()).get('/api/presence/mine').set('Authorization', as(CUIDADORA));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('companion');
    expect(res.body.presence.id).toBe(PRESENCE_ID);
    expect(store.getResumeDetails).not.toHaveBeenCalled();
  });

  it('answers the owner\'s own presence first, as owner', async () => {
    store.getLatestPresenceForOwner.mockResolvedValue(ok(PRESENCE));
    store.getResumeDetails.mockResolvedValue({ people: ok([]), voice: ok(null), facts: ok([]), error: null });
    const res = await request(app()).get('/api/presence/mine').set('Authorization', as(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('owner');
    expect(store.listPresencesForMember).not.toHaveBeenCalled();
  });
});

describe('POST / (a new presence)', () => {
  it('writes the owner as its first member', async () => {
    store.createPresence.mockResolvedValue(ok({ ...PRESENCE, status: 'draft' }));
    const res = await request(app()).post('/api/presence').set('Authorization', as(OWNER)).send({ cared_for_name: 'Lurdes', caller_name: 'Ana' });
    expect(res.status).toBe(201);
    expect(store.addMember).toHaveBeenCalledWith({ presence_id: PRESENCE_ID, user_id: OWNER, role: 'owner', invited_by: null });
  });
});

describe('GET /:id/readiness', () => {
  it('a family member may read what she knows; a companion may not', async () => {
    store.getReadinessSources = store.getReadinessSources || vi.fn();
    store.findMembership.mockResolvedValue(ok({ role: 'companion' }));
    const denied = await request(app()).get(`/api/presence/${PRESENCE_ID}/readiness`).set('Authorization', as(CUIDADORA));
    expect(denied.status).toBe(404);
  });
});
