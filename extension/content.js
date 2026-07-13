/**
 * Content script — 在 OJ 页面轮询 CF 任务，用隐藏 iframe 后台提交
 */
const S = 'http://127.0.0.1:3000';
const U = 'cmrj7k0hm00006eqfpcjxuwgn';
const done = new Set();
let busy = false;

setInterval(async () => {
  if (busy) return;
  try {
    const r = await fetch(`${S}/api/helper/tasks/next?userId=${U}&deviceId=inline`);
    if (!r.ok) return;
    const t = await r.json();
    if (t && t.taskId && t.platform === 'CODEFORCES' && !done.has(t.taskId)) {
      done.add(t.taskId);
      busy = true;
      await execute(t);
      busy = false;
    }
  } catch (e) {}
}, 5000);

async function execute(t) {
  const m = t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
  if (!m) { busy = false; return; }
  const cid = parseInt(m[1]), pidx = m[2];
  console.log('[Content] Executing CF submit:', t.remoteProblemId, t.submissionId);

  try {
    // Step 1: GET submit page for CSRF
    const pageResp = await fetch(`https://codeforces.com/problemset/submit/${cid}/${pidx}`, {
      credentials: 'include',
      headers: { 'Accept': 'text/html,application/xhtml+xml' }
    });
    const html = await pageResp.text();
    const csrf = (html.match(/<meta name="X-Csrf-Token" content="([^"]+)"/) || [])[1];
    if (!csrf) {
      post(t.submissionId, 'REMOTE_ERROR', 0, null, 'CF 登录已过期，请在 codeforces.com 登录');
      return;
    }
    console.log('[Content] CSRF:', csrf.substring(0, 20) + '...');

    // Step 2: POST submit
    const LANG = { cpp: '73', c: '61', python: '70', java: '60' };
    const pt = LANG[t.language] || '73';
    const ftaa = Array.from({ length: 18 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const formBody = new URLSearchParams({
      csrf_token: csrf, ftaa,
      bfaa: 'f1b3f18c715565b589b7823cda7448ce',
      action: 'submitSolutionFormSubmitted',
      submittedProblemIndex: pidx,
      programTypeId: pt,
      source: t.sourceCode,
      tabSize: '4',
      sourceFile: '',
      _tta: '594',
    });

    const submitResp = await fetch(
      `https://codeforces.com/problemset/submit/${cid}/${pidx}?csrf_token=${encodeURIComponent(csrf)}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://codeforces.com',
          'Referer': `https://codeforces.com/problemset/submit/${cid}/${pidx}`,
        },
        body: formBody.toString(),
        redirect: 'follow',
      }
    );

    const finalUrl = submitResp.url || submitResp.headers.get('location') || '';
    console.log('[Content] Final URL:', finalUrl.substring(0, 100));
    const sidMatch = finalUrl.match(/\/status\/(\d+)\/my/);
    if (sidMatch) {
      const sid = parseInt(sidMatch[1]);
      console.log('[Content] CF submitted! SID:', sid);
      post(t.submissionId, 'JUDGING', 0, sid, 'CF 已提交');

      // Poll verdict
      for (let i = 0; i < 20; i++) {
        await sleep(2500);
        try {
          const apiResp = await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10');
          const apiData = await apiResp.json();
          if (apiData.status !== 'OK') continue;
          const sub = (apiData.result || []).find(s => s.id === sid);
          if (sub && sub.verdict && sub.verdict !== 'TESTING') {
            const vMap = { OK: 'ACCEPTED', WRONG_ANSWER: 'WRONG_ANSWER', TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED', MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED', RUNTIME_ERROR: 'RUNTIME_ERROR', COMPILATION_ERROR: 'COMPILE_ERROR' };
            const sv = vMap[sub.verdict] || sub.verdict;
            console.log('[Content] Verdict:', sv, sub.timeConsumedMillis + 'ms');
            post(t.submissionId, sv, sv === 'ACCEPTED' ? 100 : 0, sid, null, sub.timeConsumedMillis || 0, (sub.memoryConsumedBytes || 0) / 1024 | 0);
            return;
          }
        } catch (e) { /* network */ }
      }
      console.log('[Content] Verdict poll timeout');
    } else {
      // Try reconciling from API
      console.log('[Content] No direct SID, reconciling via API...');
      await sleep(3000);
      const apiResp = await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=5');
      const apiData = await apiResp.json();
      if (apiData.status === 'OK') {
        const recent = apiData.result || [];
        const match = recent.find(s =>
          s.problem?.contestId === cid &&
          s.problem?.index === pidx &&
          (Date.now() / 1000 - s.creationTimeSeconds) < 60
        );
        if (match) {
          console.log('[Content] Reconciled SID:', match.id);
          const vMap = { OK: 'ACCEPTED', WRONG_ANSWER: 'WRONG_ANSWER', TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED', MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED', RUNTIME_ERROR: 'RUNTIME_ERROR', COMPILATION_ERROR: 'COMPILE_ERROR' };
          const sv = match.verdict && match.verdict !== 'TESTING' ? (vMap[match.verdict] || match.verdict) : 'JUDGING';
          post(t.submissionId, sv, sv === 'ACCEPTED' ? 100 : 0, match.id, null, match.timeConsumedMillis || 0, (match.memoryConsumedBytes || 0) / 1024 | 0);
          return;
        }
      }
      post(t.submissionId, 'REMOTE_ERROR', 0, null, '提交成功但无法获取 Submission ID');
    }
  } catch (e) {
    console.error('[Content] Error:', e.message);
    post(t.submissionId, 'REMOTE_ERROR', 0, null, e.message);
  }
}

async function post(sid, status, score, cfid, msg, time, mem) {
  try {
    await fetch(`${S}/api/submissions/${sid}/fill-result`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, score: score || 0, remoteSubmissionId: cfid ? String(cfid) : 'N/A', userId: U, compileMessage: msg || null, timeUsed: time || 0, memoryUsed: mem || 0 })
    });
  } catch (e) { console.error('[Content] post error:', e.message); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
