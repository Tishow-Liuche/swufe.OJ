import express from 'express';
import request from 'supertest';
import { configureRequestBodies } from './request-body-config';

describe('request body limits', () => {
  function app() {
    const server = express();
    configureRequestBodies(server);
    server.use((req, res) => res.json({ length: req.body?.text?.length || 0 }));
    return server;
  }
  it.each(['post', 'patch'] as const)('accepts 1 MiB authoring %s requests', async method => {
    await request(app())[method](method === 'post' ? '/api/problems' : '/api/problems/p1')
      .send({ text: 'x'.repeat(1024 * 1024) }).expect(200, { length: 1024 * 1024 });
  });
  it('rejects authoring over 16 MiB with a readable error', async () => {
    const response = await request(app()).post('/api/problems').send({ text: 'x'.repeat(16 * 1024 * 1024) }).expect(413);
    expect(response.body.message).toContain('16 MiB');
  });
  it.each(['/api/auth/login', '/api/problems/p1/status'])('keeps small limits for %s', async path => {
    await request(app()).post(path).send({ text: 'x'.repeat(110 * 1024) }).expect(413);
  });
  it('preserves malformed JSON status', async () => {
    await request(app()).post('/api/problems').set('Content-Type', 'application/json').send('{bad').expect(400);
  });
  it('accepts exactly 16 MiB including JSON framing', async () => {
    const length = 16 * 1024 * 1024 - Buffer.byteLength(JSON.stringify({ text: '' }));
    await request(app()).patch('/api/problems/p1/').send({ text: 'x'.repeat(length) }).expect(200, { length });
  });
  it('retains the URL-encoded limit even on authoring routes', async () => {
    const response = await request(app()).post('/api/problems').type('form').send({ text: 'x'.repeat(110 * 1024) }).expect(413);
    expect(response.body.message).toContain('100 KiB');
  });
  it('does not consume multipart uploads', async () => {
    await request(app()).post('/api/problems/p1/testdata').attach('file', Buffer.alloc(200000), 'test.zip').expect(200, { length: 0 });
  });
});
