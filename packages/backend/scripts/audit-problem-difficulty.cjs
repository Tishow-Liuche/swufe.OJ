/* npm run build; node scripts/audit-problem-difficulty.cjs dry-run catalog.json manifest.json
 * Review manifest, then: node scripts/audit-problem-difficulty.cjs apply manifest.json backup.json
 * No fetching or writes in dry-run. Never edits statements, tests, IDs or authored difficulty.
 */
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { buildDifficultyAudit } = require(process.env.DIFFICULTY_AUDIT_LIB || '../dist/src/problem/difficulty-audit');
const db = new PrismaClient();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const select = { id: true, difficulty: true, sourceInfo: { select: { id: true, platform: true, remoteProblemId: true } } };
const inventory = () => db.problem.findMany({ select, orderBy: { id: 'asc' } });
function summary(rows) {
  const counts = {};
  for (const row of rows) { const key = `${row.platform}:${row.result}`; counts[key] = (counts[key] || 0) + 1; }
  return counts;
}
async function main() {
  const [mode, input, output] = process.argv.slice(2);
  if (!['dry-run', 'apply'].includes(mode) || !input || !output) throw Error('Usage: dry-run catalog manifest | apply manifest backup');
  if (mode === 'dry-run') {
    const catalog = JSON.parse(fs.readFileSync(input, 'utf8'));
    if (!catalog.verifiedAt || !catalog.sources) throw Error('Catalog requires timestamp and source URLs');
    const bank = await inventory();
    const rows = buildDifficultyAudit(bank, catalog);
    const manifest = { version: 1, createdAt: new Date().toISOString(), catalogHash: hash(catalog), inventoryHash: hash(bank), catalog, rows, summary: summary(rows) };
    fs.writeFileSync(output, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ mode, total: rows.length, summary: manifest.summary, unresolved: rows.filter(r => r.result === 'UNRESOLVED').map(r => ({ platform: r.platform, id: r.remoteProblemId })) }));
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(input, 'utf8'));
  if (manifest.version !== 1 || hash(manifest.catalog) !== manifest.catalogHash) throw Error('Invalid/tampered manifest catalog');
  const bank = await inventory();
  if (hash(bank) !== manifest.inventoryHash) throw Error('Database changed since dry-run; generate and review a new manifest');
  const rows = buildDifficultyAudit(bank, manifest.catalog);
  if (hash(rows) !== hash(manifest.rows)) throw Error('Manifest rows differ from independently rebuilt plan');
  if (rows.some(row => row.result === 'UNRESOLVED')) throw Error('Unresolved upstream evidence: no changes permitted until every problem is audited');
  const verified = rows.filter(r => r.result === 'MATCH' || r.result === 'CHANGE');
  const oldSources = await db.problemSource.findMany({ where: { id: { in: verified.map(r => r.sourceId) } }, select: { id: true, capabilityJson: true } });
  fs.writeFileSync(output, JSON.stringify({ savedAt: new Date().toISOString(), inventory: bank, sources: oldSources, manifestHash: hash(manifest) }), { flag: 'wx', mode: 0o600 });
  let changed = 0;
  for (let start = 0; start < verified.length; start += 100) {
    const batch = verified.slice(start, start + 100);
    const payload = JSON.stringify(batch.map(r => ({ id: r.problemId, sourceId: r.sourceId, platform: r.platform, remoteProblemId: r.remoteProblemId, before: r.before, after: r.after, evidence: { provider: r.evidence, rawDifficulty: r.rawDifficulty, checkedAt: manifest.catalog.verifiedAt, catalogHash: manifest.catalogHash } })));
    await db.$transaction(async tx => {
      // Lock and recheck old values, including identity, within the same transaction.
      const locked = await tx.$queryRawUnsafe(`SELECT p.id FROM "Problem" p JOIN "ProblemSource" s ON s."problemId"=p.id JOIN jsonb_to_recordset($1::jsonb) AS x(id text,"sourceId" text,platform text,"remoteProblemId" text,"before" text) ON p.id=x.id AND s.id=x."sourceId" AND s.platform=x.platform AND s."remoteProblemId"=x."remoteProblemId" WHERE p.difficulty IS NOT DISTINCT FROM x."before" FOR UPDATE OF p,s`, payload);
      if (locked.length !== batch.length) throw Error('Concurrent difficulty/source edit detected; stopped safely');
      const n = await tx.$executeRawUnsafe(`UPDATE "Problem" p SET difficulty=x."after","updatedAt"=NOW() FROM jsonb_to_recordset($1::jsonb) AS x(id text,"after" text) WHERE p.id=x.id AND p.difficulty IS DISTINCT FROM x."after"`, payload);
      if (n !== batch.filter(r => r.result === 'CHANGE').length) throw Error('Unexpected update count');
      await tx.$executeRawUnsafe(`UPDATE "ProblemSource" s SET "capabilityJson"=COALESCE(s."capabilityJson",'{}'::jsonb)||jsonb_build_object('difficultyEvidence',x.evidence) FROM jsonb_to_recordset($1::jsonb) AS x("sourceId" text,evidence jsonb) WHERE s.id=x."sourceId"`, payload);
      changed += n;
    }, { timeout: 15000 });
    if (start % 2000 === 0) console.log(JSON.stringify({ verified: Math.min(start + 100, verified.length), changed }));
  }
  const after = buildDifficultyAudit(await inventory(), manifest.catalog);
  if (after.some(r => r.result === 'CHANGE')) throw Error('Post-apply verification found remaining differences');
  console.log(JSON.stringify({ mode, changed, total: after.length, remainingDifferences: 0, summary: summary(after) }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
