import { describe, expect, it } from 'vitest';
import express from 'express';
import multer from 'multer';
import request from 'supertest';

describe('multipart upload process safety', () => {
  it('rejects truncated/malformed bodies and remains available for the next request', async () => {
    const app = express();
    app.post('/upload', multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024, files: 1, parts: 3 } }).single('file'), (_req,res)=>res.json({ok:true}));
    app.get('/health',(_req,res)=>res.json({ok:true}));
    app.use((_error,_req,res,_next)=>res.status(400).json({ok:false}));
    for (const body of ['--bound\r\nContent-Disposition: form-data; name="file"; filename="x.csv"\r\n\r\nabc', '--bound\r\ninvalid header\r\n\r\nabc\r\n--bound--']) {
      const response = await request(app).post('/upload').set('Content-Type','multipart/form-data; boundary=bound').send(body);
      expect(response.status).toBe(400);
      expect((await request(app).get('/health')).status).toBe(200);
    }
  });
});
