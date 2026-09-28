// Isolated fault injection: discard successful HTTP refresh responses, including cookies.
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
assert.equal(process.env.ALLOW_ISOLATED_FAILURE_PROBE, '1');
assert.match(new URL(process.env.DATABASE_URL).searchParams.get('schema') || '', /^(pressure|resilience)_/);
const db = new PrismaClient();
const hash = value => createHash('sha256').update(value).digest('hex');
const base = 'http://127.0.0.1:3000';
let dropped = 0;
const proxy = http.createServer((req, res) => {
  const upstream = http.request(base + '/api/auth/refresh', { method: 'POST', headers: req.headers }, response => {
    response.resume();
    response.on('end', () => {
      if (response.statusCode === 200) dropped++;
      res.destroy(); // Simulate losing both Set-Cookie and body after the DB commit.
    });
  });
  upstream.on('error', () => res.destroy());
  req.pipe(upstream);
});
async function call(path, cookie, attempt, url = base) {
  const response = await fetch(url + path, { method: 'POST', headers: { Cookie: cookie, ...(attempt ? { 'X-Refresh-Attempt': attempt } : {}) }, signal: AbortSignal.timeout(30000) });
  return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], body: await response.json() };
}
(async () => {
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const users = Array.from({ length: 103 }, (_, i) => {
    const token = randomBytes(32).toString('hex');
    return { userId: 'pressure-u' + i, token, cookie: 'oj_refresh=' + token, attempt: randomBytes(32).toString('hex') };
  });
  await db.userSession.createMany({ data: users.map(u => ({ userId: u.userId, refreshTokenHash: hash(u.token), expiresAt: new Date(Date.now() + 3600000) })) });
  const proxyBase = 'http://127.0.0.1:' + proxy.address().port;
  await Promise.all(users.slice(0, 100).map(async u => {
    await assert.rejects(call('/api/auth/refresh', u.cookie, u.attempt, proxyBase));
  }));
  assert.equal(dropped, 100, 'All original rotations must succeed before responses are discarded');
  const times = [];
  await Promise.all(users.slice(0, 100).map(async u => {
    const started = Date.now();
    const recovered = await call('/api/auth/refresh', u.cookie, u.attempt);
    assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
    const profile = await fetch(base + '/api/auth/me', { headers: { Authorization: 'Bearer ' + recovered.body.accessToken } });
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).id, u.userId);
    times.push(Date.now() - started);
  }));
  times.sort((a,b) => a-b);
  console.log(JSON.stringify({ test: '100 same-IP dropped refresh responses', recovered: 100, p95Ms: times[95], maxMs: times[99] }));
  const revoked = users[100];
  assert.equal((await call('/api/auth/refresh', revoked.cookie, revoked.attempt)).status, 200);
  assert.equal((await call('/api/auth/logout', revoked.cookie, revoked.attempt)).status, 200);
  assert.equal((await call('/api/auth/refresh', revoked.cookie, revoked.attempt)).status, 401);
  const expired = users[101];
  const issued = await call('/api/auth/refresh', expired.cookie, expired.attempt);
  assert.equal(issued.status, 200);
  await db.userSession.update({ where: { refreshTokenHash: hash(issued.cookie.split('=')[1]) }, data: { createdAt: new Date(Date.now() - 301000) } });
  assert.equal((await call('/api/auth/refresh', expired.cookie, expired.attempt)).status, 401);
  const wrong = users[102];
  assert.equal((await call('/api/auth/refresh', wrong.cookie, wrong.attempt)).status, 200);
  assert.equal((await call('/api/auth/refresh', wrong.cookie, randomBytes(32).toString('hex'))).status, 401);
  assert.equal((await call('/api/auth/refresh', wrong.cookie)).status, 401);
  console.log('PASS revoked/expired/wrong-key/no-key recovery rejected');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  proxy.closeAllConnections(); proxy.close();
  await db.userSession.deleteMany({ where: { userId: { startsWith: 'pressure-u' } } });
  await db.$disconnect();
});
