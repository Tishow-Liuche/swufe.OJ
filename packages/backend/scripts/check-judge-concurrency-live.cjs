// Authorized production diagnostic; never rejudges an existing submission.
if (process.env.JUDGE_CONCURRENCY_AUDIT !== '1') throw Error('Explicit JUDGE_CONCURRENCY_AUDIT=1 required');
const { PrismaClient } = require('@prisma/client');
const { Queue, Job } = require('bullmq');
const { randomBytes, randomInt } = require('node:crypto');
const fs = require('node:fs');
const { summarizeWave } = require('./judge-concurrency-metrics.cjs');
const db = new PrismaClient();
const queue = new Queue('judge', { connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD } });
const waves = (process.env.AUDIT_WAVES || '2,4,8').split(',').map(Number);
if (waves.some(n => !Number.isInteger(n) || n < 1 || n > 8) || waves.length > 3) throw Error('Use at most three waves of 1..8');
const nonce = randomBytes(6).toString('hex');
const jobs = [], report = [];
let user, problem, enqueueUncertain = false;
const attemptedJobIds = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const counts = await queue.getJobCounts('active', 'waiting', 'delayed');
  if (await queue.isPaused() || counts.active || counts.waiting || counts.delayed) throw Error('Queue must be idle and unpaused');
  if (!(await queue.getWorkers()).length) throw Error('No live worker');
  const source = await db.submission.findFirst({
    where: { problem: { problemNo: Number(process.env.AUDIT_PROBLEM_NO || 24292) }, status: 'ACCEPTED', problemVersionId: { not: null } },
    orderBy: { createdAt: 'desc' },
    include: { problemVersion: { include: { testCases: { orderBy: { order: 'asc' } }, checker: true } }, problem: true },
  });
  if (!source?.problemVersion?.testCases.length) throw Error('No accepted pinned fixture');
  const v = source.problemVersion;
  user = await db.user.create({ data: { username: 'latencyaudit_' + nonce, email: nonce + '@example.invalid', password: 'disabled-audit-account', role: 'STUDENT' } });
  problem = await db.problem.create({ data: {
    title: 'Isolated concurrency audit ' + nonce, problemNo: -randomInt(100000000, 999999999), status: 'CONTEST_RESERVED', createdById: user.id,
    timeLimit: v.timeLimit ?? source.problem.timeLimit, memoryLimit: v.memoryLimit ?? source.problem.memoryLimit,
    versions: { create: {
      description: 'Temporary private performance fixture', timeLimit: v.timeLimit, memoryLimit: v.memoryLimit,
      checker: v.checker ? { create: { type: v.checker.type, protocol: v.checker.protocol, language: v.checker.language, sourceCode: v.checker.sourceCode } } : undefined,
      testCases: { create: v.testCases.map(({ input, expectedOutput, score, order }) => ({ input, expectedOutput, score, order, isSample: false })) },
    } },
  }, include: { versions: true } });
  for (const size of waves) {
    const submissions = [];
    for (let i = 0; i < size; i++) submissions.push(await db.submission.create({ data: {
      userId: user.id, problemId: problem.id, problemVersionId: problem.versions[0].id,
      language: source.language, sourceCode: source.sourceCode, status: 'QUEUING', judgeTask: { create: {} },
    } }));
    const bulk = submissions.map(s => ({ name: 'local-judge', data: {
      submissionId: s.id, problemId: problem.id, language: s.language, sourceCode: s.sourceCode,
      timeLimit: problem.timeLimit, memoryLimit: problem.memoryLimit,
    }, opts: { attempts: 1, jobId: 'latencyaudit-' + nonce + '-' + s.id } }));
    attemptedJobIds.push(...bulk.map(j => j.opts.jobId));
    // A lost Redis response does not prove enqueue failed; retain fixtures in that case.
    enqueueUncertain = true;
    const batch = await queue.addBulk(bulk);
    enqueueUncertain = false;
    jobs.push(...batch);
    const deadline = Date.now() + 180000;
    while (true) {
      const states = await Promise.all(batch.map(j => j.getState()));
      if (states.every(s => s === 'completed' || s === 'failed')) break;
      if (Date.now() > deadline) throw Error('Audit timed out; retain active fixtures');
      await sleep(500);
    }
    const rows = [];
    for (const j of batch) {
      const fresh = await Job.fromId(queue, j.id);
      const s = await db.submission.findUnique({ where: { id: j.data.submissionId }, include: { _count: { select: { cases: true } }, judgeTask: true } });
      rows.push({ status: s.status, score: s.score, cases: s._count.cases, taskFinished: !!s.judgeTask?.finishedAt,
        queueMs: fresh.processedOn - fresh.timestamp, processingMs: fresh.finishedOn - fresh.processedOn,
        started: fresh.processedOn, finished: fresh.finishedOn, maxCaseCpuMs: s.timeUsed });
    }
    const row = summarizeWave(size, v.testCases.length, rows);
    report.push(row);
    console.log(JSON.stringify(row));
    if (!row.pass) throw Error('Verdict, concurrency or latency acceptance failed');
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(async () => {
  try {
    const states = await Promise.all(jobs.map(j => j.getState()));
    if (enqueueUncertain || states.some(s => !['completed', 'failed', 'unknown'].includes(s))) {
      console.error('Nonterminal audit jobs retained; fixture user ID: ' + user?.id);
      console.error('Attempted owned job IDs: ' + attemptedJobIds.join(','));
      process.exitCode = 1;
    } else {
      for (const j of jobs) if (await j.getState() !== 'unknown') await j.remove();
      if (user) await db.submission.deleteMany({ where: { userId: user.id } });
      if (problem) await db.problem.delete({ where: { id: problem.id } });
      if (user) await db.user.delete({ where: { id: user.id } });
      console.log('Owned audit fixtures cleaned');
    }
    fs.writeFileSync('/tmp/judge-concurrency-report.json', JSON.stringify(report, null, 2));
  } finally { await db.$disconnect(); await queue.close(); }
});
