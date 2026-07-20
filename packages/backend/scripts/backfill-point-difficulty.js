const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

const prisma = new PrismaClient();

const POINTS = ['POINT_0', 'POINT_1', 'POINT_2', 'POINT_3', 'POINT_4', 'POINT_5'];

function mapCfRatingToPointDifficulty(rating) {
  const value = Number(rating);
  if (!Number.isFinite(value) || value <= 0) return 'POINT_1';
  if (value <= 1000) return 'POINT_0';
  if (value <= 1300) return 'POINT_1';
  if (value <= 1600) return 'POINT_2';
  if (value <= 1900) return 'POINT_3';
  if (value <= 2400) return 'POINT_4';
  return 'POINT_5';
}

function mapLuoguDifficultyToPointDifficulty(difficulty) {
  const value = Number(difficulty);
  if (!Number.isFinite(value)) return 'POINT_1';
  if (value <= 1) return 'POINT_0';
  if (value <= 3) return 'POINT_1';
  if (value <= 4) return 'POINT_2';
  if (value <= 5) return 'POINT_3';
  if (value <= 6) return 'POINT_4';
  return 'POINT_5';
}

function addToGroup(groups, point, problemId) {
  if (!POINTS.includes(point)) throw new Error(`Invalid SWUFE Point difficulty: ${point}`);
  const list = groups.get(point) || [];
  list.push(problemId);
  groups.set(point, list);
}

async function updateGroups(groups, dryRun) {
  const summary = {};
  for (const point of POINTS) {
    const ids = groups.get(point) || [];
    summary[point] = ids.length;
    if (dryRun || ids.length === 0) continue;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await prisma.problem.updateMany({
        where: { id: { in: chunk } },
        data: { difficulty: point },
      });
    }
  }
  return summary;
}

async function backfillCodeforces(dryRun) {
  const cfJsonPath = path.resolve(__dirname, '../../../codeforces-problems.json');
  const raw = JSON.parse(fs.readFileSync(cfJsonPath, 'utf8'));
  const problems = Array.isArray(raw) ? raw : raw.problems || [];
  const byRemoteId = new Map();
  for (const problem of problems) {
    const remoteId = problem.problemId || `${problem.contestId}${problem.index || ''}`;
    if (remoteId) byRemoteId.set(String(remoteId), mapCfRatingToPointDifficulty(problem.rating));
  }

  const sources = await prisma.problemSource.findMany({
    where: { platform: 'CODEFORCES' },
    select: { problemId: true, remoteProblemId: true },
  });

  const groups = new Map();
  let missing = 0;
  for (const source of sources) {
    const point = byRemoteId.get(source.remoteProblemId);
    if (!point) {
      missing++;
      continue;
    }
    addToGroup(groups, point, source.problemId);
  }

  return {
    platform: 'CODEFORCES',
    totalSources: sources.length,
    matched: sources.length - missing,
    missing,
    updatedByPoint: await updateGroups(groups, dryRun),
  };
}

async function readLuoguDifficultyMap() {
  const gzPath = process.env.LUOGU_NDJSON_GZ || path.join(os.tmpdir(), 'luogu-latest.ndjson.gz');
  if (!fs.existsSync(gzPath)) {
    throw new Error(`Luogu source file not found: ${gzPath}`);
  }

  const byPid = new Map();
  const rl = readline.createInterface({
    input: fs.createReadStream(gzPath).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const problem = JSON.parse(line);
    if (!problem.pid) continue;
    byPid.set(String(problem.pid), mapLuoguDifficultyToPointDifficulty(problem.difficulty));
  }

  return byPid;
}

async function backfillLuogu(dryRun) {
  const byPid = await readLuoguDifficultyMap();
  const sources = await prisma.problemSource.findMany({
    where: { platform: 'LUOGU' },
    select: { problemId: true, remoteProblemId: true },
  });

  const groups = new Map();
  let missing = 0;
  for (const source of sources) {
    const point = byPid.get(source.remoteProblemId);
    if (!point) {
      missing++;
      continue;
    }
    addToGroup(groups, point, source.problemId);
  }

  return {
    platform: 'LUOGU',
    totalSources: sources.length,
    matched: sources.length - missing,
    missing,
    updatedByPoint: await updateGroups(groups, dryRun),
  };
}

async function countByPlatform(platform) {
  return prisma.problem.groupBy({
    by: ['difficulty'],
    where: { sourceInfo: { platform } },
    _count: { _all: true },
    orderBy: { difficulty: 'asc' },
  });
}

async function backfillQoj(dryRun) {
  const sources = await prisma.problemSource.findMany({
    where: { platform: 'QOJ' },
    select: { problemId: true },
  });
  if (!dryRun && sources.length > 0) {
    await prisma.problem.updateMany({
      where: { id: { in: sources.map((source) => source.problemId) } },
      data: { difficulty: null },
    });
  }
  return {
    platform: 'QOJ',
    totalSources: sources.length,
    matched: sources.length,
    missing: 0,
    updatedToUnrated: sources.length,
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const before = {
    CODEFORCES: await countByPlatform('CODEFORCES'),
    LUOGU: await countByPlatform('LUOGU'),
    QOJ: await countByPlatform('QOJ'),
  };

  const results = [
    await backfillCodeforces(dryRun),
    await backfillLuogu(dryRun),
    await backfillQoj(dryRun),
  ];

  const after = {
    CODEFORCES: await countByPlatform('CODEFORCES'),
    LUOGU: await countByPlatform('LUOGU'),
    QOJ: await countByPlatform('QOJ'),
  };

  console.log(JSON.stringify({ dryRun, before, results, after }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
