// Integration test uses an owned temporary schema, never public problem rows.
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const {
  buildPlan,
  applyPlan,
  inventory,
  hash,
} = require('./cf-statement-repair.cjs');
const admin = new PrismaClient(),
  schema = 'cf_statement_test_' + Date.now(),
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-statement-test-'));
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('schema', schema);
const db = new PrismaClient({ datasources: { db: { url: url.href } } });
let created = false;
(async () => {
  assert(/^cf_statement_test_\d+$/.test(schema));
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  created = true;
  await db.$executeRawUnsafe(
    'CREATE TABLE "Problem" (id text PRIMARY KEY,title text,difficulty text,"timeLimit" integer,"memoryLimit" integer,"updatedAt" timestamp DEFAULT NOW())',
  );
  await db.$executeRawUnsafe(
    'CREATE TABLE "ProblemSource" (id text PRIMARY KEY,"problemId" text UNIQUE,platform text,"remoteProblemId" text,"capabilityJson" jsonb)',
  );
  await db.$executeRawUnsafe(
    'CREATE TABLE "ProblemVersion" (id text PRIMARY KEY,"problemId" text,"isCurrent" boolean,description text,"inputFormat" text,"outputFormat" text,"sampleInput" text,"sampleOutput" text,hint text,"dataRange" text,"timeLimit" integer,"memoryLimit" integer)',
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "Problem" VALUES ('p','Keep title','POINT_4',1000000,256,NOW())`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "ProblemSource" VALUES ('s','p','CODEFORCES','4A','{"keep":true,"difficultyEvidence":{"rating":2000}}')`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "ProblemVersion" (id,"problemId","isCurrent",description,"timeLimit","memoryLimit") VALUES ('v','p',true,'CF problem 4A: stub',1000000,256)`,
  );
  const items = [
    {
      remoteProblemId: '4A',
      pid: 'CF4A',
      url: 'https://www.luogu.com.cn/problem/CF4A',
      fetchedAt: new Date().toISOString(),
      vjudge: {
        id: '4A',
        link: 'https://codeforces.com/problemset/problem/4/A',
      },
      content: {
        locale: 'en',
        description: 'Split the watermelon $w$.',
        formatI: 'Read w.',
        formatO: 'Print YES.',
      },
      samples: [['8', 'YES']],
      limits: { time: [1000], memory: [64000] },
    },
  ];
  const before = await inventory(db),
    plan = buildPlan(before, items),
    manifest = { version: 1, items, plan, planHash: hash(plan) };
  assert.equal(plan.length, 1);
  await db.$executeRawUnsafe(
    `UPDATE "ProblemVersion" SET description='Author changed statement' WHERE id='v'`,
  );
  await assert.rejects(
    applyPlan(db, manifest, path.join(dir, 'drift.json')),
    /changed|tampered/,
  );
  assert(!fs.existsSync(path.join(dir, 'drift.json')));
  await db.$executeRawUnsafe(
    `UPDATE "ProblemVersion" SET description='CF problem 4A: stub' WHERE id='v'`,
  );
  const collision = path.join(dir, 'exists.json');
  fs.writeFileSync(collision, 'keep');
  await assert.rejects(applyPlan(db, manifest, collision), /EEXIST/);
  assert.equal(
    (await inventory(db))[0].versions[0].description,
    'CF problem 4A: stub',
  );
  const racingDb = new Proxy(db, {
    get(target, key) {
      if (key === '$transaction')
        return async (...args) => {
          await db.$executeRawUnsafe(
            `UPDATE "ProblemSource" SET "capabilityJson"='{"keep":true,"difficultyEvidence":{"rating":2100}}' WHERE id='s'`,
          );
          return target.$transaction(...args);
        };
      return target[key];
    },
  });
  await assert.rejects(
    applyPlan(racingDb, manifest, path.join(dir, 'race.json')),
    /Concurrent/,
  );
  assert.equal(
    (await inventory(db))[0].versions[0].description,
    'CF problem 4A: stub',
  );
  await db.$executeRawUnsafe(
    `UPDATE "ProblemSource" SET "capabilityJson"='{"keep":true,"difficultyEvidence":{"rating":2000}}' WHERE id='s'`,
  );
  const backup = path.join(dir, 'backup.json');
  assert.equal(await applyPlan(db, manifest, backup), 1);
  assert.equal(
    JSON.parse(fs.readFileSync(backup)).rows[0].versions[0].description,
    'CF problem 4A: stub',
  );
  const after = await inventory(db);
  assert.equal(after[0].difficulty, 'POINT_4');
  assert.equal(after[0].title, 'Keep title');
  assert.equal(after[0].timeLimit, 1000);
  assert.equal(after[0].memoryLimit, 64);
  assert.equal(buildPlan(after, items).length, 0);
  assert.equal(after[0].versions[0].timeLimit, 1000);
  assert.equal(after[0].versions[0].memoryLimit, 64);
  const source = await db.problemSource.findUnique({
    where: { id: 's' },
    select: { capabilityJson: true },
  });
  assert.equal(source.capabilityJson.keep, true);
  assert.equal(source.capabilityJson.difficultyEvidence.rating, 2000);
  assert.equal(
    source.capabilityJson.statementEvidence.provider,
    'LUOGU_CF_ORIGINAL_MIRROR',
  );
  console.log(
    'PASS real PostgreSQL: backup, drift rejection, preserved difficulty/title/source metadata, statement/limits update, idempotency',
  );
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    if (created && /^cf_statement_test_\d+$/.test(schema))
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
    if (
      path.dirname(dir) === os.tmpdir() &&
      path.basename(dir).startsWith('cf-statement-test-')
    )
      fs.rmSync(dir, { recursive: true });
  });
