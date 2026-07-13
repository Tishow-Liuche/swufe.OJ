/**
 * OJ Helper v4 — 完全后台，不打开任何标签页
 */
const SERVER = 'http://127.0.0.1:3000';
const UID = 'cmrj7k0hm00006eqfpcjxuwgn';
let pollTimer = null;
let busy = false;

(async function init() {
  const d = await chrome.storage.local.get(['connected']);
  if (d.connected) startPolling();
})();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'reconnect') startPolling();
  if (msg.action === 'disconnect') { if (pollTimer) clearInterval(pollTimer); }
});

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(checkTask, 3000);
}

async function checkTask() {
  if (busy) return;
  try {
    const r = await fetch(`${SERVER}/api/helper/tasks/next?userId=${UID}&deviceId=bg-v4`);
    if (!r.ok) return;
    const t = await r.json();
    if (t && t.taskId && t.platform === 'CODEFORCES') {
      busy = true;
      await handleCF(t);
      busy = false;
    }
  } catch (e) {}
}

async function handleCF(task) {
  const m = task.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
  if (!m) { busy = false; return; }
  const cid = parseInt(m[1]), pidx = m[2];

  try {
    // ===== 第一步：GET 提交页面，获取 CSRF token =====
    const pageResp = await fetch(`https://codeforces.com/problemset/submit/${cid}/${pidx}`, {
      credentials: 'include',
      headers: { 'Accept': 'text/html' },
    });
    const html = await pageResp.text();
    const csrfMatch = html.match(/<meta name="X-Csrf-Token" content="([^"]+)"/);
    if (!csrfMatch) {
      await postResult(task.submissionId, 'REMOTE_ERROR', 0, null, 'CF 登录已过期，请在 codeforces.com 登录后重试');
      busy = false; return;
    }
    const csrf = csrfMatch[1];

    // ===== 第二步：POST 提交代码 =====
    const langMap = { cpp: '73', c: '61', python: '70', java: '60' };
    const pt = langMap[task.language] || '73';
    const ftaa = Array.from({ length: 18 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const formBody = new URLSearchParams({
      csrf_token: csrf, ftaa,
      bfaa: 'f1b3f18c715565b589b7823cda7448ce',
      action: 'submitSolutionFormSubmitted',
      submittedProblemIndex: pidx,
      programTypeId: pt,
      source: task.sourceCode,
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
        redirect: 'manual',
      }
    );

    // ===== 第三步：获取 Submission ID =====
    // 方案A：从重定向头获取
    const location = submitResp.headers.get('Location') || '';
    const sidFromLoc = location.match(/\/status\/(\d+)\/my/);
    if (sidFromLoc) {
      const sid = parseInt(sidFromLoc[1]);
      console.log('[Helper] SID from redirect:', sid);
      await postResult(task.submissionId, 'JUDGING', 0, sid, '已在 CF 提交成功，等待评测');
      await pollCFVerdict(task.submissionId, sid);
      busy = false; return;
    }

    // 方案B：从响应体获取
    const respBody = await submitResp.text();
    const sidFromBody = respBody.match(/data-submission-id="(\d+)"/);
    if (sidFromBody) {
      const sid = parseInt(sidFromBody[1]);
      console.log('[Helper] SID from body:', sid);
      await postResult(task.submissionId, 'JUDGING', 0, sid, '已在 CF 提交成功，等待评测');
      await pollCFVerdict(task.submissionId, sid);
      busy = false; return;
    }

    // 方案C：等 5 秒后对账 API
    console.log('[Helper] No direct SID, reconciling...');
    await postResult(task.submissionId, 'JUDGING', 0, null, '已提交，正在确认 Submission ID');
    await sleep(5000);

    // 查询最新提交记录来对账
    const apiResp = await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=5');
    const apiData = await apiResp.json();
    if (apiData.status === 'OK') {
      const subs = apiData.result;
      const match = subs.find(s =>
        s.problem?.contestId === cid &&
        s.problem?.index === pidx &&
        (new Date().getTime() / 1000 - s.creationTimeSeconds) < 120
      );
      if (match) {
        console.log('[Helper] Reconciled SID:', match.id);
        await postResult(task.submissionId, 'JUDGING', 0, match.id, '已确认提交');
        await pollCFVerdict(task.submissionId, match.id);
        busy = false; return;
      }
    }

    console.log('[Helper] Submit succeeded but no SID found');
    await postResult(task.submissionId, 'JUDGING', 0, null, '已提交，请检查 CF 提交记录');

  } catch (e) {
    console.error('[Helper]', e.message);
    await postResult(task.submissionId, 'REMOTE_ERROR', 0, null, e.message);
  }
  busy = false;
}

// ===== 轮询 CF 评测结果（后台，不弹窗口） =====
async function pollCFVerdict(submissionId, sid) {
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    try {
      const resp = await fetch(`https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10`);
      const data = await resp.json();
      if (data.status !== 'OK') continue;

      const sub = data.result.find(s => s.id === sid);
      if (!sub) continue;

      const verdict = sub.verdict; // null = 评测中, OK, WRONG_ANSWER, etc.
      if (!verdict || verdict === 'TESTING') continue; // 还在评测

      const vMap = {
        OK: 'ACCEPTED', WRONG_ANSWER: 'WRONG_ANSWER', TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED',
        MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED', RUNTIME_ERROR: 'RUNTIME_ERROR',
        COMPILATION_ERROR: 'COMPILE_ERROR', SKIPPED: 'CANCELLED',
      };
      const sv = vMap[verdict] || verdict;

      console.log(`[Helper] Verdict: ${sv} (${sub.timeConsumedMillis}ms)`);
      await postResult(submissionId, sv, sv === 'ACCEPTED' ? 100 : 0, sid, null, sub.timeConsumedMillis || 0, sub.memoryConsumedBytes ? Math.round(sub.memoryConsumedBytes / 1024) : 0);
      return;
    } catch (e) {}
  }
  console.log('[Helper] Polling timeout for', sid);
}

async function postResult(subId, status, score, sid, msg, time, mem) {
  await fetch(`${SERVER}/api/submissions/${subId}/fill-result`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status, score: score || 0,
      remoteSubmissionId: sid ? String(sid) : 'N/A',
      userId: UID,
      compileMessage: msg || null,
      timeUsed: time || 0,
      memoryUsed: mem || 0,
    }),
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
