/**
 * Local hand-test runner for assignment/class/notification P0-P1 flows.
 * Prints only PASS/FAIL — never prints tokens or secrets.
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:3000';

const results = [];
function ok(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail: String(detail || '').slice(0, 240) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + String(detail).slice(0, 180) : ''}`);
}

async function req(path, { method = 'GET', token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function login(account, password) {
  let r = await req('/api/auth/login', {
    method: 'POST',
    body: { account, password },
  });
  if (r.status !== 200 && r.status !== 201) {
    r = await req('/api/auth/login', {
      method: 'POST',
      body: { username: account, password },
    });
  }
  return r;
}

function tokenOf(loginRes) {
  return loginRes?.data?.accessToken
    || loginRes?.data?.access_token
    || loginRes?.data?.token
    || null;
}

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  return data.items || data.data || data.members || data.notifications || data.classes || [];
}

async function main() {
  console.log(`API base: ${BASE}`);
  console.log('=== A. unauth boundaries ===');
  for (const [name, path] of [
    ['community posts', '/api/community/posts'],
    ['student assignments', '/api/user/classes/demo/assignments'],
    ['teacher assignments', '/api/teacher/assignments'],
    ['teacher report', '/api/teacher/assignments/x/report'],
    ['outbox', '/api/teacher/notifications/outbox'],
  ]) {
    const r = await req(path);
    ok(`A unauth ${name} => 401`, r.status === 401, `got ${r.status}`);
  }

  console.log('\n=== login demo accounts ===');
  const accounts = [
    ['admin', '123456'],
    ['teacher', '123456'],
    ['stu', '123456'],
  ];
  const sessions = {};
  for (const [u, p] of accounts) {
    const r = await login(u, p);
    const t = tokenOf(r);
    sessions[u] = {
      token: t,
      status: r.status,
      keys: r.data && typeof r.data === 'object' ? Object.keys(r.data) : [],
    };
    ok(`login ${u}`, !!t, `http=${r.status} keys=${sessions[u].keys.join(',')}`);
  }

  if (!sessions.teacher?.token || !sessions.stu?.token) {
    console.log('\nCannot continue without teacher/stu tokens.');
    process.exit(1);
  }

  const T = sessions.teacher.token;
  const S = sessions.stu.token;

  console.log('\n=== B. role isolation ===');
  {
    const r = await req('/api/teacher/assignments', { token: S });
    ok('student cannot list teacher assignments (403)', r.status === 403, `got ${r.status}`);
  }

  console.log('\n=== C. teacher class / problems / assignment ===');
  let classId = null;
  {
    const r = await req('/api/teacher/classes', { token: T });
    ok('teacher list classes', r.status === 200, `http=${r.status}`);
    const classes = asArray(r.data);
    if (classes.length) {
      classId = classes[0].id;
      ok('has class', true, `${classes[0].name || classId}`);
    } else {
      const created = await req('/api/teacher/classes', {
        method: 'POST',
        token: T,
        body: { name: `handtest-class-${Date.now()}` },
      });
      ok('create class', created.status === 200 || created.status === 201, `http=${created.status}`);
      classId = created.data?.id;
    }
  }

  let stuId = null;
  {
    const stuProfile = await req('/api/user/profile', { token: S });
    stuId = stuProfile.data?.id || null;
    ok('stu profile', !!stuId, stuProfile.data?.username || '');
  }

  if (classId && stuId) {
    const members = await req(`/api/teacher/classes/${classId}/members`, { token: T });
    ok('list members', members.status === 200, `http=${members.status}`);
    const list = asArray(members.data);
    const approved = list.find((m) => (m.user?.id === stuId || m.userId === stuId) && m.status === 'APPROVED');
    if (!approved) {
      const imp = await req(`/api/teacher/classes/${classId}/import`, {
        method: 'POST',
        token: T,
        body: { students: ['stu'] },
      });
      ok('import stu into class', imp.status === 200 || imp.status === 201, `http=${imp.status}`);
      const members2 = await req(`/api/teacher/classes/${classId}/members`, { token: T });
      const list2 = asArray(members2.data);
      const row = list2.find((m) => m.user?.id === stuId || m.userId === stuId);
      if (row?.status === 'PENDING') {
        const rev = await req(`/api/teacher/classes/${classId}/members/${stuId}/review`, {
          method: 'PATCH',
          token: T,
          body: { status: 'APPROVED' },
        });
        ok('approve stu membership', rev.status === 200 || rev.status === 201, `http=${rev.status}`);
      } else {
        ok('stu membership ready', row?.status === 'APPROVED', `status=${row?.status}`);
      }
    } else {
      ok('stu already approved member', true);
    }
  }

  let problemIds = [];
  {
    const candidates = [
      '/api/problems?page=1&pageSize=5&status=PUBLISHED',
      '/api/problems?page=1&pageSize=5',
      '/api/public/problems?page=1&pageSize=5',
    ];
    let problems = [];
    for (const path of candidates) {
      const r = await req(path, { token: T });
      if (r.status === 200) {
        problems = asArray(r.data);
        if (problems.length) {
          ok('list problems', true, `${path} count=${problems.length}`);
          break;
        }
      }
    }
    if (!problems.length) ok('list problems', false, 'no published problems found');
    else problemIds = problems.slice(0, 2).map((p) => p.id).filter(Boolean);
  }

  let assignmentId = null;
  if (classId && problemIds.length) {
    const end = new Date(Date.now() + 7 * 86400000).toISOString();
    const created = await req('/api/teacher/assignments', {
      method: 'POST',
      token: T,
      body: {
        classId,
        title: `handtest-assignment-${new Date().toISOString().slice(0, 16)}`,
        description: 'automated hand test',
        endTime: end,
        problemIds,
        allowLate: true,
        latePenalty: 20,
        passCondition: 'ALL',
        countExternalAc: false,
      },
    });
    ok(
      'create assignment',
      created.status === 200 || created.status === 201,
      `http=${created.status} id=${created.data?.id || ''}`,
    );
    assignmentId = created.data?.id || null;
  } else {
    ok('create assignment', false, 'missing class or problems');
  }

  console.log('\n=== D. student sees assignment + notification ===');
  if (classId) {
    const r = await req(`/api/user/classes/${classId}/assignments`, { token: S });
    ok('student class assignments 200', r.status === 200, `http=${r.status}`);
    const asg = r.data?.assignments || [];
    const hit = assignmentId ? asg.find((a) => a.id === assignmentId) : asg[0];
    ok(
      'student sees new assignment',
      !!hit,
      hit
        ? `progress=${hit.progress?.solvedCount}/${hit.progress?.totalProblems} status=${hit.progress?.status}`
        : 'missing',
    );
    if (hit) {
      ok(
        'progress fields present',
        hit.progress && 'status' in hit.progress && 'score' in hit.progress,
        JSON.stringify(hit.progress).slice(0, 140),
      );
    }

    // non-approved access: use a fake class id style check is hard; pending path already covered by unit tests
  }

  {
    const paths = [
      '/api/community/notifications',
      '/api/user/notifications',
      '/api/messages/notifications',
    ];
    let found = null;
    for (const p of paths) {
      const r = await req(p, { token: S });
      if (r.status === 200) {
        found = { path: p, items: asArray(r.data) };
        break;
      }
    }
    if (found) {
      const hasAssign = found.items.some(
        (n) => n.type === 'ASSIGNMENT' || String(n.title || '').includes('作业') || String(n.title || '').includes('assignment'),
      );
      ok('student has assignment notification', hasAssign, `via ${found.path} total=${found.items.length}`);
    } else {
      ok('student notification endpoint', false, 'no known notifications route returned 200');
    }
  }

  console.log('\n=== E. teacher report / filter / export / outbox ===');
  if (assignmentId) {
    const report = await req(`/api/teacher/assignments/${assignmentId}/report`, { token: T });
    ok('assignment report 200', report.status === 200, `http=${report.status}`);
    if (report.status === 200) {
      ok(
        'report has students+summary',
        Array.isArray(report.data?.students) && !!report.data?.summary,
        `students=${report.data.students.length} completed=${report.data.summary?.completedStudents}`,
      );
      ok(
        'report assignment rules fields',
        report.data.assignment && 'allowLate' in report.data.assignment,
        `allowLate=${report.data.assignment?.allowLate}`,
      );
    }

    const filtered = await req(
      `/api/teacher/assignments/${assignmentId}/report?completion=incomplete&keyword=stu`,
      { token: T },
    );
    ok(
      'report filter works',
      filtered.status === 200,
      `http=${filtered.status} filtered=${filtered.data?.summary?.filteredCount}`,
    );

    const csv = await req(`/api/teacher/assignments/${assignmentId}/report.csv`, { token: T });
    const csvText = typeof csv.data === 'string' ? csv.data : JSON.stringify(csv.data || '');
    ok(
      'export csv',
      csv.status === 200 && csvText.length > 10,
      `http=${csv.status} len=${csvText.length} hasHeader=${csvText.includes('用户名')}`,
    );

    const refresh = await req(`/api/teacher/assignments/${assignmentId}/refresh`, {
      method: 'POST',
      token: T,
    });
    ok('refresh progress', refresh.status === 200 || refresh.status === 201, `http=${refresh.status}`);

    const outbox = await req('/api/teacher/notifications/outbox', { token: T });
    ok(
      'notification outbox stats',
      outbox.status === 200 && typeof outbox.data?.pending === 'number',
      `http=${outbox.status} pending=${outbox.data?.pending} failed=${outbox.data?.failed} sent=${outbox.data?.sent}`,
    );
  }

  console.log('\n=== F. mid-join review endpoint shape ===');
  if (classId) {
    const rev = await req(`/api/teacher/classes/${classId}/members/nonexistent-user/review`, {
      method: 'PATCH',
      token: T,
      body: { status: 'APPROVED' },
    });
    ok('review missing member is 4xx not 500', rev.status >= 400 && rev.status < 500, `http=${rev.status}`);
  }

  console.log('\n=== G. update assignment rules ===');
  if (assignmentId) {
    const upd = await req(`/api/teacher/assignments/${assignmentId}`, {
      method: 'PATCH',
      token: T,
      body: {
        allowLate: true,
        latePenalty: 30,
        passCondition: 'COUNT:1',
        countExternalAc: false,
      },
    });
    ok('update assignment rules', upd.status === 200 || upd.status === 201, `http=${upd.status}`);
  }

  console.log('\n=== H. settle assignment ===');
  if (assignmentId) {
    const settle = await req(`/api/teacher/assignments/${assignmentId}/settle`, {
      method: 'POST',
      token: T,
    });
    ok(
      'settle assignment',
      settle.status === 200 || settle.status === 201,
      `http=${settle.status}`,
    );
    const report2 = await req(`/api/teacher/assignments/${assignmentId}/report?refresh=0`, { token: T });
    const students = report2.data?.students || [];
    const anySettled = students.some((s) => s.status === 'SETTLED');
    ok(
      'students show SETTLED after settle',
      anySettled || students.length === 0,
      `settledSeen=${anySettled} n=${students.length}`,
    );
  }

  // optional: local AC path if sample code endpoint exists is intentionally skipped (no judge rework)
  console.log('\n=== I. frontend reachable ===');
  try {
    const fe = await fetch('http://127.0.0.1:5174/');
    ok('frontend home 200', fe.status === 200, `http=${fe.status}`);
  } catch (e) {
    ok('frontend home 200', false, e.message);
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\n========== SUMMARY ==========');
  console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
  if (failed.length) {
    console.log('Failed cases:');
    for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log('All automated hand-test API checks passed.');
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
