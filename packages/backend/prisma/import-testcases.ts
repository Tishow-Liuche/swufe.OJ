import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as zlib from 'zlib';
import * as readline from 'readline';

const p = new PrismaClient();

async function main() {
  const gzPath = '../../luogu_full.ndjson.gz';

  // 1. 批量加载已有测试用例的版本 ID（一次查询）
  const existingCases = await p.problemTestCase.groupBy({
    by: ['problemVersionId'],
  });
  const hasCases = new Set(existingCases.map(e => e.problemVersionId));
  console.log(`${hasCases.size} versions already have test cases`);

  // 2. 批量加载 PID → versionId 映射（一次查询）
  const problems = await p.problem.findMany({
    where: { source: 'EXTERNAL' },
    select: {
      id: true, title: true,
      versions: { where: { isCurrent: true }, select: { id: true }, take: 1 },
      sourceInfo: { select: { remoteProblemId: true } },
    },
  });
  const pidToVersionId = new Map<string, string>();
  let skippable = 0;
  for (const prob of problems) {
    const pid = prob.sourceInfo?.remoteProblemId;
    const ver = prob.versions[0];
    if (!pid || !ver) continue;
    pidToVersionId.set(pid, ver.id);
    if (hasCases.has(ver.id)) skippable++;
  }
  console.log(`${pidToVersionId.size} Luogu problems mapped, ${skippable} already have test cases`);

  // 3. 流式读取 NDJSON，只处理缺少测试用例的题目
  const fileStream = fs.createReadStream(gzPath);
  const gunzip = zlib.createGunzip();
  const rl = readline.createInterface({ input: fileStream.pipe(gunzip) });

  let lineNum = 0, created = 0, noSample = 0, totalCases = 0;
  const batch: any[] = [];

  async function flushBatch() {
    if (batch.length === 0) return;
    await p.problemTestCase.createMany({ data: batch });
    totalCases += batch.length;
    batch.length = 0;
  }

  for await (const line of rl) {
    lineNum++;
    try {
      const obj = JSON.parse(line);
      if (!obj.samples || obj.samples.length === 0) { noSample++; continue; }

      const versionId = pidToVersionId.get(obj.pid);
      if (!versionId || hasCases.has(versionId)) continue;

      const samples: Array<[string, string]> = obj.samples;
      const total = samples.length;
      for (let i = 0; i < total; i++) {
        const score = i === total - 1
          ? 100 - Math.floor(100 / total) * (total - 1)
          : Math.floor(100 / total);
        batch.push({
          problemVersionId: versionId,
          input: samples[i][0],
          expectedOutput: samples[i][1],
          score,
          order: i + 1,
          isSample: true,
        });
      }
      hasCases.add(versionId);
      created++;

      if (batch.length >= 500) await flushBatch();
      if (created % 3000 === 0) console.log(`  ${created} problems seeded, ${totalCases} test cases...`);
    } catch { /* skip malformed lines */ }
  }
  await flushBatch();

  console.log(`\n✅ Done! ${created} new problems with test cases (${totalCases} cases total)`);
  console.log(`${noSample} had no samples, ${lineNum - created - noSample} already covered`);

  const final = await p.problemTestCase.groupBy({ by: ['problemVersionId'] });
  console.log(`Database: ${final.length} problems have test cases`);
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
