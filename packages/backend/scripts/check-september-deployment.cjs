// Run inside the deployed backend container. Creates only temporary test users
// and one empty campus contest; removes its exact IDs in finally.
const assert = require('node:assert/strict');
const { randomBytes, randomInt } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const ids = [], contests = [];
const nonce = randomBytes(6).toString('hex');
const password = randomBytes(24).toString('base64url') + 'Aa9';
const base = process.env.SMOKE_API_URL || 'http://127.0.0.1:3000';
async function api(path, { token, method = 'GET', body, status = 200 } = {}) {
  const r = await fetch(base + '/api' + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await r.json();
  assert.equal(r.status, status, path + ': ' + JSON.stringify(json));
  return json;
}
(async () => {
  try {
    const hashed = await bcrypt.hash(password, 12);
    for (const role of ['TEACHER', 'STUDENT']) {
      const user = await db.user.create({ data: { username: 'smoke_' + nonce + '_' + role.toLowerCase(),
        email: 'smoke-' + nonce + '-' + role.toLowerCase() + '@example.invalid', password: hashed, role } });
      ids.push(user.id);
    }
    const teacher = await db.user.findUnique({ where: { id: ids[0] } });
    const student = await db.user.findUnique({ where: { id: ids[1] } });
    const tt = (await api('/auth/login', { method: 'POST', body: { username: teacher.username, password } })).accessToken;
    const st = (await api('/auth/login', { method: 'POST', body: { username: student.username, password } })).accessToken;
    const c = await api('/teacher/contests', { token: tt, method: 'POST', status: 201, body: {
      title: '[自动验收临时赛] ' + nonce, visibility: 'CAMPUS_PRIVATE', mode: 'ACM', problemIds: [],
      startTime: new Date(Date.now() + 3600000).toISOString(), endTime: new Date(Date.now() + 7200000).toISOString(),
    } }); contests.push(c.id);
    const studentId = String(randomInt(90000000, 99999999));
    const teacherId = String(Number(studentId) - 1);
    const teacherProfile = await api('/user/profile', { token: tt, method: 'PATCH', body: { studentId: teacherId } });
    assert.equal(teacherProfile.studentId, teacherId); assert.equal(teacherProfile.role, 'TEACHER');
    await api('/user/profile', { token: st, method: 'PATCH', status: 400, body: { studentId: teacherId } });
    const failed = await api('/contests/' + c.id + '/register', { token: st, method: 'POST', status: 400, body: { studentId, realName: '验收同学' } });
    assert.match(failed.message, /绑定学号/);
    await api('/user/profile', { token: st, method: 'PATCH', body: { studentId, gender: 'FEMALE' } });
    const settings = await api('/user/settings', { token: st });
    assert.equal(settings.profile.studentId, studentId); assert.equal(settings.profile.gender, 'FEMALE');
    await api('/contests/' + c.id + '/register', { token: st, method: 'POST', status: 201, body: { studentId, realName: '验收同学' } });
    const board = await api('/contests/' + c.id + '/standings', { token: st });
    assert.equal(board.rows.find(x => x.userId === student.id).user.nickname, studentId + '_验收同学');
    const list = await api('/problems?pageSize=100');
    assert(list.items.every((p, i, arr) => i === 0 || p.problemNo > arr[i - 1].problemNo));
    const sms = await api('/auth/password-recovery'); assert.equal(sms.enabled, false);
    await api('/auth/password-recovery/code', { method: 'POST', status: 503, body: { phone: '13800138000' } });
    console.log('PASS: deployed login, campus creation, ID binding gate, profile gender, registration, identity standings, problem order, SMS disabled');
  } finally {
    if (contests.length) await db.contest.deleteMany({ where: { id: { in: contests } } });
    if (ids.length) await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
    console.log('Temporary smoke records removed.');
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
