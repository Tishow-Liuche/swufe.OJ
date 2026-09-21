// Synthetic records only. Run inside backend with its configured PostgreSQL.
const { PrismaClient } = require('@prisma/client');
const assert = require('node:assert/strict');
const { LuoguTaskLeaseService } = require(process.env.LUOGU_SERVICE_PATH || '../dist/src/luogu/luogu-task-lease.service');
const admin = new PrismaClient();
const schema = 'luogu_verdict_test_' + Date.now();
const url = new URL(process.env.DATABASE_URL); url.searchParams.set('schema', schema);
const db = new PrismaClient({ datasources: { db: { url: url.href } } });
let created = false;
async function seed(id, rid) {
  await db.submission.create({ data: { id, problemId: 'synthetic', userId: 'synthetic', language: 'cpp', sourceCode: '// synthetic', status: 'JUDGING' } });
  await db.remoteSubmissionTask.create({ data: { submissionId: id, userId: 'synthetic', platformCode: 'LUOGU', externalAccountId: 'synthetic', remoteProblemId: 'P1001', language: 'cpp', sourceCode: '// synthetic', nonce: 'token', leaseNonce: 'lease', status: 'PROCESSING', remoteSubmissionId: rid, expiresAt: new Date(Date.now() + 60000) } });
  await db.remoteJudgeJob.create({ data: { submissionId: id, platform: 'LUOGU', remoteProblemId: 'P1001', remoteSubmissionId: rid } });
}
(async () => {
  assert(/^luogu_verdict_test_\d+$/.test(schema));
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
  for (const name of ['Submission', 'SubmissionCase', 'RemoteSubmissionTask', 'RemoteJudgeJob']) {
    await db.$executeRawUnsafe(`CREATE TABLE "${name}" (LIKE public."${name}" INCLUDING DEFAULTS INCLUDING INDEXES)`);
  }
  const service = new LuoguTaskLeaseService(db);
  await seed('failure', '123');
  const ac = { remoteSubmissionId: '123', status: 'ACCEPTED', rawStatus: '评测状态\nAccepted\n测试点状态\nAC' };
  for (const data of [
    { ...ac, rawStatus: '评测状态\nWaiting\nAC' },
    { ...ac, rawStatus: '评测状态\nUnaccepted\nAC WA' },
    { ...ac, remoteSubmissionId: '456' },
    { ...ac, rawStatus: 'AC' },
  ]) {
    await assert.rejects(service.reportResult('failure', 'token', 'lease', data));
    assert.equal((await db.submission.findUnique({ where: { id: 'failure' } })).status, 'JUDGING');
  }
  const wa = { ...ac, status: 'WRONG_ANSWER', score: 0, timeUsed: 40, memoryUsed: 872, rawStatus: '评测状态\nUnaccepted\n测试点状态\nAC WA' };
  await service.reportResult('failure', 'token', 'lease', wa);
  const row = await db.submission.findUnique({ where: { id: 'failure' } });
  assert.equal(row.status, 'WRONG_ANSWER'); assert.equal(row.score, 0);
  assert.equal(row.timeUsed, 40); assert.equal(row.memoryUsed, 872);
  assert.equal((await db.submissionCase.findFirst({ where: { submissionId: 'failure' } })).status, 'WRONG_ANSWER');
  await assert.rejects(service.reportResult('failure', 'token', 'lease', ac));
  await seed('race', '456');
  const outcomes = await Promise.allSettled([
    service.reportResult('race', 'token', 'lease', { ...ac, remoteSubmissionId: '456' }),
    service.reportResult('race', 'token', 'lease', { ...wa, remoteSubmissionId: '456' }),
  ]);
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal(await db.submissionCase.count({ where: { submissionId: 'race' } }), 1);
  await seed('rollback', '789');
  await db.submission.update({ where: { id: 'rollback' }, data: { status: 'REMOTE_ERROR' } });
  await assert.rejects(service.reportResult('rollback', 'token', 'lease', { ...ac, remoteSubmissionId: '789' }));
  assert.equal((await db.remoteSubmissionTask.findUnique({ where: { submissionId: 'rollback' } })).status, 'PROCESSING');
  await seed('binding', null);
  const bound = await Promise.allSettled(['111', '222'].map(rid => service.reportRemoteId('binding', 'token', 'lease', rid)));
  assert.equal(bound.filter(o => o.status === 'fulfilled').length, 1);
  const task = await db.remoteSubmissionTask.findUnique({ where: { submissionId: 'binding' } });
  assert.equal((await db.remoteJudgeJob.findUnique({ where: { submissionId: 'binding' } })).remoteSubmissionId, task.remoteSubmissionId);
  console.log('PASS isolated PostgreSQL: contradictory AC rejected, WA + metrics persisted, terminal protection, concurrent result/binding CAS, transaction rollback');
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(async () => {
  await db.$disconnect();
  if (created && /^luogu_verdict_test_\d+$/.test(schema)) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.$disconnect();
});
