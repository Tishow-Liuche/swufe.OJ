const fs = require('fs'),
  https = require('https');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
let cookie = '';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function get(url, depth = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.headers['set-cookie'])
            cookie = res.headers['set-cookie']
              .map((s) => s.split(';')[0])
              .join('; ');
          if (
            res.statusCode === 302 &&
            depth < 2 &&
            res.headers.location &&
            new URL(res.headers.location, url).origin === new URL(url).origin
          )
            return get(new URL(res.headers.location, url).href, depth + 1).then(
              resolve,
              reject,
            );
          resolve({ status: res.statusCode, body });
        });
      },
    );
    req.setTimeout(20000, () => req.destroy(Error('timeout')));
    req.on('error', reject);
  });
}
(async () => {
  const all = await db.problemSource.findMany({
    where: { platform: 'CODEFORCES' },
    select: {
      remoteProblemId: true,
      problemId: true,
      problem: {
        select: {
          difficulty: true,
          timeLimit: true,
          memoryLimit: true,
          versions: {
            where: { isCurrent: true },
            select: { id: true, description: true },
          },
        },
      },
    },
  });
  const missing = all.filter(
    (s) =>
      !s.problem.versions[0]?.description ||
      /^CF problem |^来自 CODEFORCES/.test(s.problem.versions[0]?.description),
  );
  const file = '/tmp/cf-missing-statements-20260921.json';
  const out = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : {
        startedAt: new Date().toISOString(),
        inventory: missing,
        items: [],
        unavailable: [],
      };
  const done = new Set(
    [...out.items, ...out.unavailable].map((x) => x.remoteProblemId),
  );
  console.log(JSON.stringify({ missing: missing.length, resume: done.size }));
  for (const s of missing) {
    if (done.has(s.remoteProblemId)) continue;
    await pause(1000);
    const url = 'https://www.luogu.com.cn/problem/CF' + s.remoteProblemId;
    let r;
    try {
      r = await get(url);
    } catch (e) {
      out.unavailable.push({
        remoteProblemId: s.remoteProblemId,
        url,
        error: e.message,
      });
      fs.writeFileSync(file, JSON.stringify(out));
      continue;
    }
    if ([403, 429].includes(r.status))
      throw Error('Source access stopped: HTTP ' + r.status);
    const m = r.body.match(
      /<script id="lentille-context"[^>]*>([\s\S]*?)<\/script>/,
    );
    let p;
    try {
      p = m ? JSON.parse(m[1]).data?.problem : null;
    } catch {}
    if (
      r.status === 200 &&
      p?.pid === 'CF' + s.remoteProblemId &&
      p.content?.description
    ) {
      out.items.push({
        remoteProblemId: s.remoteProblemId,
        url,
        fetchedAt: new Date().toISOString(),
        pid: p.pid,
        name: p.name,
        content: p.content,
        samples: p.samples,
        limits: p.limits,
        vjudge: p.vjudge,
      });
    } else
      out.unavailable.push({
        remoteProblemId: s.remoteProblemId,
        url,
        status: r.status,
        error: 'No verified original statement',
      });
    out.updatedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(out));
    const n = out.items.length + out.unavailable.length;
    if (n % 25 === 0 || n === missing.length)
      console.log(
        JSON.stringify({
          processed: n,
          collected: out.items.length,
          unavailable: out.unavailable.length,
          total: missing.length,
        }),
      );
  }
  console.log(
    JSON.stringify({
      done: true,
      collected: out.items.length,
      unavailable: out.unavailable,
    }),
  );
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
