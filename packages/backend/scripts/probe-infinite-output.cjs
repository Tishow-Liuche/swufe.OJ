// Bounded diagnostic only: no database access or historical rejudging.
const base = process.env.GO_JUDGE_URL || 'http://127.0.0.1:5050';
(async () => {
  const response = await fetch(`${base}/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ cmd: [{
      args: ['/usr/bin/python3', 'main.py'], env: ['PATH=/usr/bin:/bin'],
      files: [{ content: '' }, { name: 'stdout', max: 4 * 1024 * 1024 }, { name: 'stderr', max: 10240 }],
      cpuLimit: 1000000000, clockLimit: 3000000000, memoryLimit: 256 * 1024 * 1024, procLimit: 50,
      copyIn: { 'main.py': { content: 'import sys\nwhile True: sys.stdout.write("x"*4096)\n' } },
      copyOut: ['stderr'], copyOutCached: ['stdout'],
    }] }),
  });
  if (!response.ok) throw new Error(`Sandbox HTTP ${response.status}`);
  const results = await response.json();
  console.log(JSON.stringify(results.map(result => ({ ...result,
    files: Object.fromEntries(Object.entries(result.files || {}).map(([key, value]) => [key, value.slice(0, 500)])),
  })), null, 2));
  for (const result of results) for (const id of Object.values(result.fileIds || {})) {
    await fetch(`${base}/file/${encodeURIComponent(id)}`, { method: 'DELETE', signal: AbortSignal.timeout(5000) });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
