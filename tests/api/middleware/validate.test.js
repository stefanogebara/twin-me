/** validate(): a bad request is a 400 that names the field; a good one reaches the handler with the checked value. */
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { validate, z } from '../../../api/_app/middleware/validate.js';

const app = express(); app.use(express.json());
app.post('/things/:id', validate({ params: z.object({ id: z.string().uuid() }), body: z.object({ amount: z.number().positive(), note: z.string().max(5).optional() }).passthrough(), query: z.object({ dry: z.enum(['1']).optional() }) }), (req, res) => res.json({ ok: true, body: req.body, id: req.params.id, dry: req.query.dry }));

describe('validate', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  it('names the first bad field and says why', async () => {
    const r = await request(app).post(`/things/${id}`).send({ amount: -1 });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, error: 'Invalid request', field: 'amount' });
    expect(typeof r.body.message).toBe('string');
    expect((await request(app).post('/things/not-a-uuid').send({ amount: 1 })).body.field).toBe('id');
    expect((await request(app).post(`/things/${id}?dry=2`).send({ amount: 1 })).body.field).toBe('dry');
    expect((await request(app).post(`/things/${id}`).send({ amount: 1, note: 'too long' })).body.field).toBe('note');
  });
  it('lets a good request through with the checked values, unknown keys kept', async () => {
    const r = await request(app).post(`/things/${id}?dry=1`).send({ amount: 2, extra: 'kept' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, body: { amount: 2, extra: 'kept' }, id, dry: '1' });
  });
  it('refuses a part it does not know at wiring time', () => {
    expect(() => validate({ headers: z.object({}) })).toThrow('unknown part');
  });
});
