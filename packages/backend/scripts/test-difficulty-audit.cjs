// Integration test against an owned temporary PostgreSQL schema. Never touches public data.
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const db = new PrismaClient();
const schema = `difficulty_audit_test_${Date.now()}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'difficulty-audit-test-'));
const url = new URL(process.env.DATABASE_URL); url.searchParams.set('schema', schema);
let created = false;
function run(...args) {
  return spawnSync(process.execPath, [path.join(__dirname, 'audit-problem-difficulty.cjs'), ...args], { env: { ...process.env, DATABASE_URL: url.href }, encoding: 'utf8', timeout: 30000 });
}
(async () => {
  assert(/^difficulty_audit_test_\d+$/.test(schema));
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
  await db.$executeRawUnsafe(`CREATE TABLE "${schema}"."Problem" (id text PRIMARY KEY, difficulty text, "updatedAt" timestamp DEFAULT NOW())`);
  await db.$executeRawUnsafe(`CREATE TABLE "${schema}"."ProblemSource" (id text PRIMARY KEY, "problemId" text UNIQUE REFERENCES "${schema}"."Problem"(id), platform text, "remoteProblemId" text, "capabilityJson" jsonb)`);
  await db.$executeRawUnsafe(`INSERT INTO "${schema}"."Problem"(id,difficulty) VALUES ('cf','POINT_0'),('qoj','POINT_1'),('local','POINT_5'),('unknown','POINT_2')`);
  await db.$executeRawUnsafe(`INSERT INTO "${schema}"."ProblemSource" VALUES ('scf','cf','CODEFORCES','1A','{"keep":true}'),('sq','qoj','QOJ','1',NULL),('su','unknown','LUOGU','P404',NULL)`);
  const catalog = path.join(dir, 'catalog.json'), manifest = path.join(dir, 'manifest.json'), backup = path.join(dir, 'backup.json');
  fs.writeFileSync(catalog, JSON.stringify({ verifiedAt: new Date().toISOString(), sources: ['https://codeforces.com/api/problemset.problems'], codeforces: [{ contestId: 1, index: 'A', rating: 2000 }], luogu: [] }));
  const partial = path.join(dir, 'partial.json');
  assert.equal(run('dry-run', catalog, partial).status, 0);
  const rejectedPartial = run('apply', partial, backup); assert.notEqual(rejectedPartial.status, 0); assert.match(rejectedPartial.stderr, /Unresolved/); assert(!fs.existsSync(backup));
  const completeCatalog = JSON.parse(fs.readFileSync(catalog)); completeCatalog.luogu.push({ pid: 'P404', difficulty: 4 }); fs.writeFileSync(catalog, JSON.stringify(completeCatalog));
  const dry = run('dry-run', catalog, manifest); assert.equal(dry.status, 0, dry.stderr);
  assert.equal(JSON.parse(fs.readFileSync(manifest)).rows.filter(r => r.result === 'CHANGE').length, 2);
  await db.$executeRawUnsafe(`UPDATE "${schema}"."Problem" SET difficulty='POINT_3' WHERE id='cf'`);
  const drift = run('apply', manifest, backup); assert.notEqual(drift.status, 0); assert.match(drift.stderr, /Database changed/); assert(!fs.existsSync(backup));
  await db.$executeRawUnsafe(`UPDATE "${schema}"."Problem" SET difficulty='POINT_0' WHERE id='cf'`);
  const applied = run('apply', manifest, backup); assert.equal(applied.status, 0, applied.stderr);
  const rows = await db.$queryRawUnsafe(`SELECT id,difficulty FROM "${schema}"."Problem" ORDER BY id`);
  assert.deepEqual(rows, [{ id: 'cf', difficulty: 'POINT_4' }, { id: 'local', difficulty: 'POINT_5' }, { id: 'qoj', difficulty: null }, { id: 'unknown', difficulty: 'POINT_2' }]);
  const [source] = await db.$queryRawUnsafe(`SELECT "capabilityJson" FROM "${schema}"."ProblemSource" WHERE id='scf'`);
  assert.equal(source.capabilityJson.keep, true); assert.equal(source.capabilityJson.difficultyEvidence.rawDifficulty, 2000);
  assert(fs.existsSync(backup));
  const repeatedPath = path.join(dir, 'repeated.json'); const repeated = run('dry-run', catalog, repeatedPath); assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(fs.readFileSync(repeatedPath)).rows.filter(r => r.result === 'CHANGE').length, 0);
  console.log('PASS PostgreSQL CLI integration: dry-run, backup, drift rejection, nullable update, metadata preservation, authored/unresolved preservation, zero-difference repeat');
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(async () => {
  if (created && /^difficulty_audit_test_\d+$/.test(schema)) await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  // Only this process's mkdtemp directory is eligible for cleanup.
  if (path.dirname(dir) === os.tmpdir() && path.basename(dir).startsWith('difficulty-audit-test-')) fs.rmSync(dir, { recursive: true });
  await db.$disconnect();
});
