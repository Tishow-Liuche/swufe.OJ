/**
 * OJ Remote Submit Helper v2 — 使用浏览器会话提交到 Codeforces/洛谷
 */

const SERVER = 'http://127.0.0.1:3000';
const PLATFORMS = {
  CODEFORCES: { origin: 'https://codeforces.com' },
  LUOGU: { origin: 'https://www.luogu.com.cn' },
};

let ws = null;
let userId = '';
let deviceId = '';
let currentTask = null;

// ============ 初始化 ============
chrome.storage.local.get(['userId', 'deviceId', 'deviceName'], (data) => {
  if (data.userId && data.deviceId) {
    userId = data.userId;
    deviceId = data.deviceId;
    connectWS();
  }
});

// ============ WebSocket ============
function connectWS() {
  if (ws) ws.close();
  ws = new WebSocket(`${SERVER.replace('http', 'ws')}/helper?userId=${userId}&deviceId=${deviceId}`);

  ws.onopen = () => {
    console.log('[Helper] WS connected');
    ws.send(JSON.stringify({ type: 'helper.register', data: { userId, deviceId } }));
    ws.send(JSON.stringify({ type: 'helper.nextTask', data: { userId, deviceId } }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.taskId || (msg.type && msg.type.includes('task'))) {
        handleTask(msg);
      }
    } catch (e) {
      console.error('[Helper] Parse error:', e);
    }
  };

  ws.onclose = () => { console.log('[Helper] WS closed, retry 5s'); setTimeout(connectWS, 5000); };
  ws.onerror = () => {};
}

// ============ 任务执行 ============
async function handleTask(task) {
  if (currentTask) return;
  currentTask = task;
  console.log('[Helper] Task:', task.taskId, task.platform, task.remoteProblemId);

  if (task.platform === 'CODEFORCES') {
    await executeCF(task);
  } else {
    reportFailure(task, 'PLATFORM_UNSUPPORTED', '不支持的平台: ' + task.platform);
  }
  currentTask = null;
}

async function executeCF(task) {
  const pid = task.remoteProblemId; // e.g. "4A" or "158A"
  const match = pid.match(/^(\d+)([A-Z]\d?)$/);
  if (!match) return reportFailure(task, 'INVALID_PID', 'CF 题号格式错误: ' + pid);
  const contestId = parseInt(match[1]);
  const problemIndex = match[2];

  // 打开 CF 提交页面
  const submitUrl = `https://codeforces.com/problemset/submit/${contestId}/${problemIndex}`;
  console.log('[Helper] Opening CF submit:', submitUrl);

  try {
    const tab = await chrome.tabs.create({ url: submitUrl, active: false });
    await sleep(4000); // 等页面加载

    // 注入脚本：从页面获取 CSRF，执行提交
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (args) => {
        const { contestId, problemIndex, sourceCode, lang } = args;
        const langMap = { cpp: '73', c: '61', python: '70', java: '60' };
        const programTypeId = langMap[lang] || '73';

        // 获取 CSRF
        const csrfMeta = document.querySelector('meta[name="X-Csrf-Token"]');
        if (!csrfMeta) return { error: 'CF 登录已过期，请刷新 Codeforces 页面' };
        const csrf = csrfMeta.getAttribute('content');

        // 通过 XHR 提交（复用浏览器 cookie）
        return new Promise((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `/problemset/submit/${contestId}/${problemIndex}?csrf_token=${encodeURIComponent(csrf)}`);
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

          const ftaa = 'a'.repeat(18);
          const body = new URLSearchParams({
            csrf_token: csrf, ftaa,
            bfaa: 'f1b3f18c715565b589b7823cda7448ce',
            action: 'submitSolutionFormSubmitted',
            submittedProblemIndex: problemIndex,
            programTypeId,
            source: sourceCode,
            tabSize: '4',
            sourceFile: '',
            _tta: '594',
          });

          xhr.onload = () => {
            // 提交后重定向到 /problemset/status/XXXXX/my
            const finalUrl = xhr.responseURL || window.location.href;
            const sidMatch = finalUrl.match(/\/status\/(\d+)\/my/);
            if (sidMatch) {
              resolve({ submissionId: parseInt(sidMatch[1]), url: finalUrl });
            } else {
              // 等 2 秒后从当前 URL 提取
              setTimeout(() => {
                const url2 = window.location.href;
                const m2 = url2.match(/\/status\/(\d+)\/my/);
                if (m2) resolve({ submissionId: parseInt(m2[1]), url: url2 });
                else resolve({ error: '无法获取 CF Submission ID，请查看页面' });
              }, 2500);
            }
          };
          xhr.onerror = () => resolve({ error: 'CF 提交请求失败' });
          xhr.send(body.toString());
        });
      },
      args: [{ contestId, problemIndex, sourceCode: task.sourceCode, lang: task.language }],
    });

    const result = results[0]?.result;
    if (result?.submissionId) {
      console.log('[Helper] CF submitted:', result.submissionId);
      reportReceipt(task, result.submissionId);
      // 5 秒后查询结果
      setTimeout(() => queryCFResult(task, tab), 5000);
    } else {
      reportFailure(task, 'REMOTE_SUBMISSION_FAILED', result?.error || '未知错误');
    }
  } catch (e) {
    reportFailure(task, 'NETWORK_ERROR', e.message);
  }
}

// ============ 查询 CF 评测结果 ============
async function queryCFResult(task, tab) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async (args) => {
      const xhr = new XMLHttpRequest();
      return new Promise((resolve) => {
        xhr.open('GET', `/api/user.status?handle=__me__&from=1&count=10`);
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.status === 'OK') {
              const match = data.result.find(s => s.id === args.submissionId);
              resolve(match ? {
                verdict: match.verdict || 'TESTING',
                time: match.timeConsumedMillis || 0,
                memory: match.memoryConsumedBytes || 0,
              } : null);
            } else {
              resolve(null);
            }
          } catch { resolve(null); }
        };
        xhr.onerror = () => resolve(null);
        xhr.send();
      });
    },
    args: [{ submissionId: result.submissionId }],
  });

  const cfResult = results[0]?.result;
  if (cfResult && cfResult.verdict !== 'TESTING') {
    // 通过 HTTP API 更新结果
    fetch(`${SERVER}/api/submissions/${task.submissionId}/fill-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: mapCFVerdict(cfResult.verdict),
        score: cfResult.verdict === 'OK' ? 100 : 0,
        timeUsed: cfResult.time,
        memoryUsed: cfResult.memory ? Math.round(cfResult.memory / 1024) : 0,
        remoteSubmissionId: String(args.submissionId),
      }),
    });
  }

  try { chrome.tabs.remove(tab.id); } catch (e) {}
}

// ============ 报告 ============
function reportReceipt(task, submissionId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'helper.receipt',
    data: { taskId: task.taskId, userId, remoteSubmissionId: String(submissionId), remoteUsername: '', submittedAt: new Date().toISOString() },
  }));
}

function reportFailure(task, code, message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'helper.failure',
    data: { taskId: task.taskId, userId, failureCode: code, failureMessage: message },
  }));
}

function mapCFVerdict(v) {
  const m = { OK: 'ACCEPTED', WRONG_ANSWER: 'WRONG_ANSWER', TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED',
    MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED', RUNTIME_ERROR: 'RUNTIME_ERROR', COMPILATION_ERROR: 'COMPILE_ERROR',
    SKIPPED: 'CANCELLED', TESTING: 'JUDGING' };
  return m[v] || 'UNKNOWN';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
