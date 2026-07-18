const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

const prisma = new PrismaClient();
const gzPath = process.env.TEMP + '/luogu-latest.ndjson.gz';
const DIFF_MAP = { 0: 'POINT_0', 1: 'POINT_0', 2: 'POINT_1', 3: 'POINT_1', 4: 'POINT_2', 5: 'POINT_3', 6: 'POINT_4', 7: 'POINT_5', 8: 'POINT_5' };

async function main() {
  let count = 0, updated = 0, skipped = 0, missing = 0;
  const start = Date.now();

  console.log('Reading: ' + gzPath);

  // Preload all problem sources
  const allSources = await prisma.problemSource.findMany({
    where: { platform: 'LUOGU' },
    include: { problem: { include: { versions: { where: { isCurrent: true } } } } },
  });
  const sourceMap = new Map();
  for (const s of allSources) {
    sourceMap.set(s.remoteProblemId, s);
  }
  console.log('Loaded ' + allSources.length + ' problem sources');

  const stream = fs.createReadStream(gzPath).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  // Process in batches
  let batch = [];
  const BATCH_SIZE = 100;

  async function flush() {
    if (batch.length === 0) return;
    for (const u of batch) {
      try {
        await prisma.$executeRawUnsafe(
          'UPDATE "ProblemVersion" SET description = $1, "inputFormat" = $2, "outputFormat" = $3, "sampleInput" = $4, "sampleOutput" = $5, hint = $6 WHERE id = $7',
          u.desc, u.inputFormat, u.outputFormat, u.sampleInput, u.sampleOutput, u.hint, u.verId,
        );
        await prisma.$executeRawUnsafe(
          'UPDATE "Problem" SET "timeLimit" = $1, "memoryLimit" = $2, difficulty = $3, title = $4 WHERE id = $5',
          u.timeLimit, u.memoryLimit, u.diff, u.title, u.probId,
        );
      } catch (e) {
        // skip individual row errors
      }
    }
    updated += batch.length;
    batch = [];
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    let p;
    try { p = JSON.parse(line); } catch { continue; }
    if (!p.pid) continue;

    count++;
    if (count % 1000 === 0) console.log('Progress: ' + count + ' | up=' + updated + ' skip=' + skipped + ' miss=' + missing);

    const source = sourceMap.get(p.pid);
    if (!source) { missing++; continue; }

    const ver = source.problem.versions[0];
    if (!ver) { missing++; continue; }

    // Skip if already has real description (>300 chars)
    if (ver.description && ver.description.length > 300) { skipped++; continue; }

    // Build description
    const parts = [];
    if (p.background) parts.push(p.background);
    if (p.description) parts.push(p.description);
    if (p.inputFormat) parts.push('## Input\n\n' + p.inputFormat);
    if (p.outputFormat) parts.push('## Output\n\n' + p.outputFormat);
    if (p.samples && p.samples.length) {
      parts.push('## Samples');
      p.samples.forEach((s, i) => {
        parts.push('### Sample #' + (i + 1));
        parts.push('```input');
        parts.push((s[0] || '').trim());
        parts.push('```');
        parts.push('```output');
        parts.push((s[1] || '').trim());
        parts.push('```');
      });
    }
    if (p.hint) {
      parts.push('## Hint\n\n' + (Array.isArray(p.hint) ? p.hint.join('\n\n') : String(p.hint)));
    }

    const desc = parts.join('\n\n');
    const sampleInput = (p.samples || []).map(function (s) { return (s[0] || '').trim(); }).join('\n---\n');
    const sampleOutput = (p.samples || []).map(function (s) { return (s[1] || '').trim(); }).join('\n---\n');
    const timeLimit = p.limits && p.limits.time ? p.limits.time[0] : 1000;
    const memoryLimit = p.limits && p.limits.memory ? Math.round(p.limits.memory[0] / 1024) : 256;
    const diff = DIFF_MAP[p.difficulty] || 'POINT_1';
    const tagNames = (p.tags || []).map(function (t) { return typeof t === 'string' ? t : (t && t.name); }).filter(Boolean);

    batch.push({
      verId: ver.id,
      probId: source.problemId,
      desc, sampleInput, sampleOutput,
      inputFormat: p.inputFormat || null,
      outputFormat: p.outputFormat || null,
      hint: (Array.isArray(p.hint) ? p.hint.join('\n\n') : p.hint) || null,
      timeLimit, memoryLimit, diff,
      title: p.pid + ' ' + (p.title || ''),
      tags: tagNames,
    });

    if (batch.length >= BATCH_SIZE) await flush();
  }

  await flush();
  rl.close();
  console.log('\n=== DONE: ' + Math.round((Date.now() - start) / 1000) + 's ===');
  console.log('Total: ' + count + ' | Updated: ' + updated + ' | Skipped: ' + skipped + ' | Missing: ' + missing);
  await prisma.$disconnect();
}

main().catch(function (e) { console.error(e); process.exit(1); });

