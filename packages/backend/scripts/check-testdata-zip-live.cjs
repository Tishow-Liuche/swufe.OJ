// Creates only owned disposable fixtures; never modifies an existing user's problem.
if (process.env.ZIP_IMPORT_AUDIT !== '1') throw Error('Explicit ZIP_IMPORT_AUDIT=1 required');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const AdmZip = require('adm-zip');
const bcrypt = require('bcryptjs');
const { randomBytes, randomInt } = require('node:crypto');
const db = new PrismaClient(), problems = [];
const base = process.env.AUDIT_API_BASE || 'http://127.0.0.1:3000';
const nonce = randomBytes(6).toString('hex'), password = randomBytes(24).toString('hex');
let user, token;
function zip(files) {
  const z = new AdmZip();
  for (const [name, content] of Object.entries(files)) z.addFile(name, Buffer.from(content));
  return z.toBuffer();
}
async function upload(id, buffer) {
  const body = new FormData();
  body.append('file', new Blob([buffer], { type: 'application/zip' }), 'testdata.zip');
  const response = await fetch(`${base}/api/problems/${id}/testdata`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body, signal: AbortSignal.timeout(45000) });
  return { status: response.status, data: await response.json() };
}
async function current(id) {
  return db.problemVersion.findFirst({ where: { problemId: id, isCurrent: true }, include: { testCases: { orderBy: { order: 'asc' } } } });
}
(async () => {
  user = await db.user.create({ data: { username: 'zipaudit_' + nonce, email: nonce + '@example.invalid', password: await bcrypt.hash(password, 10), role: 'TEACHER' } });
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user.username, password }), signal: AbortSignal.timeout(15000) });
  assert.equal(login.status, 200, 'Audit teacher login');
  token = (await login.json()).accessToken;
  assert(token, 'Login issued access token');
  for (const mode of ['STANDARD', 'SPJ']) {
    const problem = await db.problem.create({ data: { title: 'Temporary ZIP audit ' + nonce, problemNo: -randomInt(100000000, 999999999), createdById: user.id, status: 'DRAFT', versions: { create: { description: 'Temporary import verification', checker: { create: { type: mode, protocol: 'BOOLEAN_STDOUT', ...(mode === 'SPJ' ? { language: 'python', sourceCode: 'print(True)' } : {}) } } } } } });
    problems.push(problem.id);
    const original = await current(problem.id);
    const input = '0 '.repeat(50000);
    const buffer = zip(mode === 'SPJ' ? { 'abs1.in': input } : { 'abs1.in': input, 'abs1.out': '0\n' });
    const e = new AdmZip(buffer).getEntries().find(e => e.entryName === 'abs1.in');
    assert(e.header.size / e.header.compressedSize > 100);
    const result = await upload(problem.id, buffer);
    assert.equal(result.status, 201, `High-ratio ${mode} upload: ${result.data.message || ''}`);
    let version = await current(problem.id);
    assert.equal(version.testCases.length, 1);
    assert.equal(version.testCases[0].input, input);
    assert.equal(version.testCases[0].expectedOutput, mode === 'SPJ' ? '' : '0\n');
    assert.notEqual(version.id, original.id);
    assert.equal((await db.problemVersion.findUnique({ where: { id: original.id }, include: { testCases: true } })).testCases.length, 0);
    console.log(`PASS ${mode}: >100:1 real ZIP imported through authenticated HTTP, contents intact, previous version retained`);

    for (const [name, offset, value] of [['zero-size', 24, 0], ['false-size', 24, 1], ['bad-crc', 16, 0], ['over-limit', 24, 10 * 1024 * 1024 + 1]]) {
      const bad = Buffer.from(buffer), central = bad.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      bad.writeUInt32LE(value, central + offset);
      assert.equal((await upload(problem.id, bad)).status, 400, name);
      assert.equal((await current(problem.id)).id, version.id, 'Invalid ZIP must not replace current version');
    }
    assert.equal((await upload(problem.id, Buffer.from('PKbroken'))).status, 400);
    console.log(`PASS ${mode}: forged zero/short/oversized headers, CRC corruption and malformed ZIP rejected with HTTP 400`);
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(async () => {
  try {
    for (const id of problems) await db.problem.delete({ where: { id } });
    if (user) await db.user.delete({ where: { id: user.id } });
    console.log('Owned ZIP audit fixtures and sessions removed');
  } finally { await db.$disconnect(); }
});
