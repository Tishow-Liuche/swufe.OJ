// Run only against an isolated fixture schema and Redis. Never interrupt a real DB.
const assert = require('node:assert/strict');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { Queue, Worker } = require('bullmq');
const { JudgeProcessor } = require('../dist/src/submission/judge.processor');
assert.equal(process.env.ALLOW_ISOLATED_FAILURE_PROBE, '1');
const origin = new URL(process.env.DATABASE_URL);
assert.match(origin.searchParams.get('schema') || '', /^(pressure|resilience)_/);
assert.equal(process.env.REDIS_HOST, 'oj-pressure-redis');
const control = new PrismaClient();
const sockets = new Set();
let connected = false;
const proxy = net.createServer(socket => {
  if (!connected) return socket.destroy();
  const upstream = net.connect(Number(origin.port || 5432), origin.hostname);
  for (const stream of [socket, upstream]) {
    sockets.add(stream);
    stream.on('error', () => { socket.destroy(); upstream.destroy(); });
    stream.on('close', () => sockets.delete(stream));
  }
  socket.pipe(upstream).pipe(socket);
});
let db, queue, worker, restore;
const id = 'resilience-' + randomUUID();
(async () => {
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const proxied = new URL(origin); proxied.hostname = '127.0.0.1'; proxied.port = String(proxy.address().port);
  proxied.searchParams.set('connect_timeout', '1'); proxied.searchParams.set('pool_timeout', '1');
  db = new PrismaClient({ datasources: { db: { url: proxied.toString() } } });
  await control.submission.create({ data: { id, userId: 'pressure-u0', problemId: 'pressure-p0', problemVersionId: 'pressure-v0', sourceCode: 'probe', language: 'cpp', status: 'QUEUING' } });
  await control.judgeTask.create({ data: { submissionId: id } });
  const judge = { compile: async () => ({ success: true }), run: async () => ({ status: 'ACCEPTED', timeUsed: 1, memoryUsed: 1, output: '3' }), deleteFile: async () => {} };
  const processor = new JudgeProcessor(db, judge, { recordSubmissionResult: async () => {} });
  const connection = { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT), maxRetriesPerRequest: null };
  const name = 'reliability-' + randomUUID();
  queue = new Queue(name, { connection });
  let executions = 0;
  const started = Date.now();
  worker = new Worker(name, async (job, token) => {
    executions++;
    try { return await processor.process(job, token); }
    catch (error) { console.log(JSON.stringify({ errorType: error.name, code: error.code, errorCode: error.errorCode, meta: error.meta })); throw error; }
  }, { connection, concurrency: 1 });
  worker.on('error', error => console.error('Worker error:', error.message));
  const job = await queue.add('probe', { submissionId: id, problemId: 'pressure-p0', language: 'cpp', sourceCode: 'probe', timeLimit: 1000, memoryLimit: 256 }, { attempts: 1 });
  restore = setTimeout(() => { connected = true; console.log('Database proxy restored after 45 seconds'); }, 45_000);
  let delayedSeen = false;
  while (Date.now() - started < 110_000) {
    const state = await job.getState();
    const submission = await control.submission.findUnique({ where: { id } });
    assert.notEqual(submission.status, 'SYSTEM_ERROR', 'Transient outage must not become a contestant result');
    // One Redis snapshot: separate state/count reads race with promotion to active.
    const counts = await queue.getJobCounts('active', 'delayed');
    if (counts.delayed) { delayedSeen = true; assert.equal(counts.active, 0, 'Delayed recovery must free worker slot'); }
    if (state === 'failed') throw new Error('Job exhausted ordinary retries instead of recovering');
    if (state === 'completed') {
      assert.equal(submission.status, 'ACCEPTED'); assert.ok(delayedSeen); assert.ok(executions >= 3);
      assert.equal(await control.submissionCase.count({ where: { submissionId: id } }), 1);
      console.log(JSON.stringify({ result: 'PASS', outageSeconds: 45, executions, elapsedMs: Date.now() - started, status: submission.status, ordinaryAttempts: 1 }));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for database recovery');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  clearTimeout(restore);
  connected = true;
  if (worker) await worker.close();
  if (queue) { await queue.obliterate({ force: true }); await queue.close(); }
  if (db) await db.$disconnect();
  for (const socket of sockets) socket.destroy();
  proxy.close();
  await control.submissionCase.deleteMany({ where: { submissionId: id } });
  await control.judgeTask.deleteMany({ where: { submissionId: id } });
  await control.submission.deleteMany({ where: { id } });
  await control.$disconnect();
});
