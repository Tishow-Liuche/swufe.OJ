const fs = require('node:fs');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const hash = (value) =>
  crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const placeholder = (value) =>
  !String(value || '').trim() || /^CF problem |^来自 CODEFORCES/.test(value);
// Reviewed against official contest.standings?contestId=802 on 2026-09-21:
// this contest renamed flattened indexes into difficulty variants. Do not
// generalize title matching to other contests or erase the current source ID.
const reviewedAliases = {
  '802A1': ['802A', 'Heidi and Library (easy)'],
  '802A2': ['802B', 'Heidi and Library (medium)'],
  '802G1': ['802G', 'Fake News (easy)'],
  '802G3': ['802I', 'Fake News (hard)'],
  '802J1': ['802J', 'Send the Fool Further! (easy)'],
  '802M1': ['802M', "April Fools' Problem (easy)"],
  '802M2': ['802N', "April Fools' Problem (medium)"],
};

function formatMirrorStatement(item) {
  const id = item.remoteProblemId;
  const sourceId = item.sourceRemoteProblemId || id;
  if (sourceId !== id && (reviewedAliases[id]?.[0] !== sourceId || reviewedAliases[id]?.[1] !== item.name)) throw Error('Unverified renamed problem: ' + id);
  const match = /^(\d+)([A-Z]\d*)$/.exec(id || '');
  const sourceMatch = /^(\d+)([A-Z]\d*)$/.exec(sourceId || '');
  if (
    !match || !sourceMatch ||
    item.pid !== 'CF' + sourceId ||
    item.url !== 'https://www.luogu.com.cn/problem/CF' + sourceId ||
    item.vjudge?.id !== sourceId ||
    item.vjudge?.link !==
      `https://codeforces.com/problemset/problem/${sourceMatch[1]}/${sourceMatch[2]}` ||
    !Number.isFinite(Date.parse(item.fetchedAt))
  )
    throw Error('Unverified source identity: ' + id);
  const c = item.content;
  if (
    c?.locale !== 'en' ||
    typeof c.description !== 'string' ||
    !c.description.trim() ||
    placeholder(c.description) ||
    /<html|<script|cf-chl-|Just a moment\.\.\./i.test(c.description)
  )
    throw Error('Invalid original statement: ' + id);
  for (const key of ['background', 'formatI', 'formatO', 'hint']) {
    if (c[key] != null && typeof c[key] !== 'string')
      throw Error('Invalid statement field: ' + key);
  }
  const timeLimit = item.limits?.time?.[0];
  const memoryKb = item.limits?.memory?.[0];
  if (
    !Number.isInteger(timeLimit) ||
    timeLimit <= 0 ||
    timeLimit > 3600000 ||
    !Number.isInteger(memoryKb) ||
    memoryKb <= 0 ||
    memoryKb % 1000 !== 0
  )
    throw Error('Invalid limits: ' + id);
  if (
    !Array.isArray(item.samples) ||
    item.samples.some(
      (s) =>
        !Array.isArray(s) ||
        s.length !== 2 ||
        s.some((v) => typeof v !== 'string'),
    )
  )
    throw Error('Invalid samples: ' + id);
  const memoryLimit = memoryKb / 1000;
  const parts = [
    '## 题目描述',
    ...(c.background ? [c.background] : []),
    c.description,
  ];
  if (c.formatI) parts.push('## 输入格式', c.formatI);
  if (c.formatO) parts.push('## 输出格式', c.formatO);
  // Use a fence longer than any backtick run in sample data.
  if (item.samples.length) parts.push('## 样例');
  item.samples.forEach((sample, i) => {
    parts.push('### 样例 ' + (i + 1));
    sample.forEach((value, j) => {
      const fence = '`'.repeat(
        Math.max(3, ...[...value.matchAll(/`+/g)].map((m) => m[0].length + 1)),
      );
      parts.push(fence + (j ? 'output' : 'input'), value, fence);
    });
  });
  if (c.hint) parts.push('## 提示', c.hint);
  parts.push(
    '## 来源',
    `[Codeforces ${id}](https://codeforces.com/problemset/problem/${match[1]}/${match[2]}) · [题面镜像：洛谷](${item.url})`,
  );
  return {
    remoteProblemId: id,
    timeLimit,
    memoryLimit,
    version: {
      description: parts.join('\n\n'),
      inputFormat: c.formatI || null,
      outputFormat: c.formatO || null,
      sampleInput: item.samples.length
        ? item.samples.map((s) => s[0]).join('\n---\n')
        : null,
      sampleOutput: item.samples.length
        ? item.samples.map((s) => s[1]).join('\n---\n')
        : null,
      hint: c.hint || null,
      dataRange: `Time: ${timeLimit}ms, Memory: ${memoryLimit}MB`,
      timeLimit,
      memoryLimit,
    },
    evidence: {
      provider: 'LUOGU_CF_ORIGINAL_MIRROR',
      url: item.url,
      fetchedAt: item.fetchedAt,
      contentHash: hash(item),
      ...(sourceId !== id ? { reviewedSourceAlias: sourceId, identitySource: 'https://codeforces.com/api/contest.standings?contestId=802' } : {}),
    },
  };
}

function buildPlan(bank, items) {
  const evidence = new Map();
  for (const item of items) {
    const formatted = formatMirrorStatement(item);
    if (evidence.has(formatted.remoteProblemId))
      throw Error('Duplicate statement evidence');
    evidence.set(formatted.remoteProblemId, formatted);
  }
  const plan = [];
  for (const p of bank) {
    const s = p.sourceInfo;
    if (s?.platform !== 'CODEFORCES') continue;
    const f = evidence.get(s.remoteProblemId);
    if (
      !f ||
      p.versions.length !== 1 ||
      !placeholder(p.versions[0].description)
    )
      continue;
    plan.push({
      problemId: p.id,
      sourceId: s.id,
      remoteProblemId: s.remoteProblemId,
      versionId: p.versions[0].id,
      before: p,
      problem: { timeLimit: f.timeLimit, memoryLimit: f.memoryLimit },
      version: f.version,
      evidence: f.evidence,
    });
  }
  return plan;
}

const selection = {
  id: true,
  title: true,
  difficulty: true,
  timeLimit: true,
  memoryLimit: true,
  sourceInfo: {
    select: {
      id: true,
      platform: true,
      remoteProblemId: true,
      capabilityJson: true,
    },
  },
  versions: {
    where: { isCurrent: true },
    select: {
      id: true,
      description: true,
      inputFormat: true,
      outputFormat: true,
      sampleInput: true,
      sampleOutput: true,
      hint: true,
      dataRange: true,
      timeLimit: true,
      memoryLimit: true,
    },
  },
};
async function inventory(db) {
  return db.problem.findMany({
    where: { sourceInfo: { platform: 'CODEFORCES' } },
    select: selection,
    orderBy: { id: 'asc' },
  });
}

async function applyPlan(db, manifest, backupPath) {
  const bank = await inventory(db);
  const plan = buildPlan(bank, manifest.items);
  if (
    manifest.version !== 1 ||
    hash(plan) !== manifest.planHash ||
    hash(plan) !== hash(manifest.plan)
  )
    throw Error(
      'Statement/source changed or manifest tampered; repeat dry-run',
    );
  const sources = await db.problemSource.findMany({
    where: { id: { in: plan.map((p) => p.sourceId) } },
    select: { id: true, capabilityJson: true },
  });
  fs.writeFileSync(
    backupPath,
    JSON.stringify({
      savedAt: new Date().toISOString(),
      rows: plan.map((p) => p.before),
      sources,
      manifestHash: hash(manifest),
    }),
    { flag: 'wx', mode: 0o600 },
  );
  for (let start = 0; start < plan.length; start += 25) {
    await db.$transaction(
      async (tx) => {
        for (const p of plan.slice(start, start + 25)) {
          await tx.$queryRaw`SELECT p.id FROM "Problem" p JOIN "ProblemVersion" v ON v."problemId"=p.id JOIN "ProblemSource" s ON s."problemId"=p.id WHERE p.id=${p.problemId} AND v.id=${p.versionId} AND s.id=${p.sourceId} FOR UPDATE OF p,v,s`;
          const current = await tx.problem.findUnique({
            where: { id: p.problemId },
            select: selection,
          });
          if (hash(current) !== hash(p.before))
            throw Error('Concurrent problem edit detected');
          await tx.problemVersion.update({
            where: { id: p.versionId },
            data: p.version,
            select: { id: true },
          });
          await tx.problem.update({
            where: { id: p.problemId },
            data: p.problem,
            select: { id: true },
          });
          const source = await tx.problemSource.findUnique({
            where: { id: p.sourceId },
            select: { capabilityJson: true },
          });
          await tx.problemSource.update({
            where: { id: p.sourceId },
            data: {
              capabilityJson: {
                ...(source.capabilityJson || {}),
                statementEvidence: p.evidence,
              },
            },
            select: { id: true },
          });
        }
      },
      { timeout: 30000 },
    );
  }
  const after = await inventory(db);
  if (buildPlan(after, manifest.items).length)
    throw Error('Post-apply verification failed');
  const byId = new Map(after.map((p) => [p.id, p]));
  for (const p of plan) {
    const expected = {
      ...p.before,
      ...p.problem,
      versions: [{ ...p.before.versions[0], ...p.version }],
      sourceInfo: {
        ...p.before.sourceInfo,
        capabilityJson: {
          ...(p.before.sourceInfo.capabilityJson || {}),
          statementEvidence: p.evidence,
        },
      },
    };
    if (!isDeepStrictEqual(byId.get(p.problemId), expected))
      throw Error('Post-apply field mismatch: ' + p.remoteProblemId);
  }
  return plan.length;
}

async function main() {
  const [mode, input, output] = process.argv.slice(2);
  if (!['dry-run', 'apply'].includes(mode) || !input || !output)
    throw Error(
      'Usage: dry-run evidence.json manifest.json | apply manifest.json backup.json',
    );
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  try {
    const data = JSON.parse(fs.readFileSync(input, 'utf8'));
    if (mode === 'dry-run') {
      const bank = await inventory(db),
        plan = buildPlan(bank, data.items);
      fs.writeFileSync(
        output,
        JSON.stringify({
          version: 1,
          createdAt: new Date().toISOString(),
          items: data.items,
          plan,
          planHash: hash(plan),
        }),
        { flag: 'wx', mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          mode,
          bank: bank.length,
          evidence: data.items.length,
          changes: plan.length,
          unavailable: data.unavailable || [],
        }),
      );
    } else
      console.log(
        JSON.stringify({ mode, changed: await applyPlan(db, data, output) }),
      );
  } finally {
    await db.$disconnect();
  }
}
module.exports = {
  formatMirrorStatement,
  buildPlan,
  applyPlan,
  inventory,
  hash,
};
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
