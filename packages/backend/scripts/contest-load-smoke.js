#!/usr/bin/env node

const baseUrl = process.env.OJ_BASE_URL || 'http://127.0.0.1:3000';
const token = process.env.OJ_AUTH_TOKEN || '';
const contestId = process.argv[2] || process.env.CONTEST_ID;
const problemId = process.argv[3] || process.env.PROBLEM_ID;
const rounds = Number(process.env.CONTEST_SMOKE_ROUNDS || 40);
const concurrency = Number(process.env.CONTEST_SMOKE_CONCURRENCY || 8);

if (!contestId) {
  console.error('Usage: npm run contest:smoke -- <contestId> [problemId]');
  process.exit(1);
}

const endpoints = [
  { name: 'standings', path: `/api/contests/${contestId}/standings`, p95Limit: 500 },
  { name: 'submissions', path: `/api/contests/${contestId}/submissions`, p95Limit: 800 },
  ...(problemId ? [{ name: 'problem', path: `/api/contests/${contestId}/problems/${problemId}`, p95Limit: 800 }] : []),
];

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] || 0;
}

async function timedGet(path) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const elapsed = performance.now() - started;
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  await response.arrayBuffer();
  return elapsed;
}

async function runEndpoint(endpoint) {
  const latencies = [];
  let next = 0;
  async function worker() {
    while (next < rounds) {
      next += 1;
      latencies.push(await timedGet(endpoint.path));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  console.log(`${endpoint.name} p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms samples=${latencies.length}`);
  if (p95 > endpoint.p95Limit) {
    throw new Error(`${endpoint.name} p95 ${p95.toFixed(0)}ms exceeds ${endpoint.p95Limit}ms`);
  }
}

(async () => {
  for (const endpoint of endpoints) {
    await runEndpoint(endpoint);
  }
  console.log('Contest smoke passed');
})().catch((error) => {
  console.error(`Contest smoke failed: ${error.message}`);
  process.exit(1);
});
