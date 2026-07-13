/**
 * OJ Remote Submit Helper v2.1
 * 自动连接 + Codeforces 提交
 */

const SERVER = 'http://127.0.0.1:3000';
let ws = null;
let userId = '';
let deviceId = '';

// ========== 启动 ==========
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'reconnect') {
    userId = msg.userId || userId;
    deviceId = msg.deviceId || deviceId;
    connectWS();
  }
  if (msg.action === 'disconnect') {
    if (ws) ws.close();
  }
});

chrome.storage.local.get(['userId', 'deviceId', 'connected'], async (data) => {
  if (data.connected && data.userId) {
    userId = data.userId;
    deviceId = data.deviceId || ('ext-' + Date.now().toString(36));
    // 尝试注册设备
    try {
      await fetch(`${SERVER}/api/external/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceName: data.deviceName || 'Chrome-Helper',
          browserName: 'Chrome',
          extensionVersion: '0.2.0',
        }),
      });
    } catch (e) { /* 注册失败也可以连 WebSocket */ }
    connectWS();
  }
});

// ========== WebSocket ==========
function connectWS() {
  if (!userId) return;
  if (ws) ws.close();
  try {
    ws = new WebSocket(`${SERVER.replace('http', 'ws')}/helper?userId=${userId}&deviceId=${deviceId}`);
    ws.onopen = () => {
      console.log('[Helper] Connected');
      ws.send(JSON.stringify({ type: 'helper.register', data: { userId, deviceId } }));
      ws.send(JSON.stringify({ type: 'helper.nextTask', data: { userId, deviceId } }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        console.log('[Helper] Received:', msg);
        if (msg.taskId && msg.platform === 'CODEFORCES') {
          executeCF(msg);
        }
      } catch (err) { console.error('[Helper] Parse err:', err); }
    };
    ws.onclose = () => { console.log('[Helper] Closed, retry in 5s'); setTimeout(connectWS, 5000); };
    ws.onerror = () => {};
  } catch (e) { console.error('[Helper] WS err:', e); }
}

// ========== Codeforces 提交 ==========
async function executeCF(task) {
  const pid = task.remoteProblemId;
  const m = pid.match(/^(\d+)([A-Z]\d?)$/);
  if (!m) { reportFail(task, 'BAD_PID'); return; }
  const contestId = parseInt(m[1]);
  const problemIndex = m[2];
  const submitUrl = `https://codeforces.com/problemset/submit/${contestId}/${problemIndex}`;
  console.log('[Helper] Opening CF:', submitUrl);

  try {
    const tab = await chrome.tabs.create({ url: submitUrl, active: false });
    await sleep(3000);
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: doCFSubmit,
      args: [{ contestId, problemIndex, sourceCode: task.sourceCode, lang: task.language }],
    });
    const r = results[0]?.result;
    if (r?.submissionId) {
      console.log('[Helper] CF OK:', r.submissionId);
      reportOk(task, r.submissionId);
      // 5s 后查结果
      setTimeout(() => pollCFResult(task, tab), 5000);
    } else {
      reportFail(task, r?.error || 'CF_SUBMIT_FAILED');
    }
  } catch (e) {
    reportFail(task, 'NETWORK: ' + e.message);
  }
}

async function pollCFResult(task, tab) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: checkCFResult,
      args: [{ submissionId: lastSid }],
    });
    // ... simplified polling
    try { chrome.tabs.remove(tab.id); } catch (e) {}
  } catch (e) { /* ignore */ }
}

// ========== 注入 CF 页面的函数 ==========
function doCFSubmit(args) {
  const { contestId, problemIndex, sourceCode, lang } = args;
  const langMap = { cpp: '73', c: '61', python: '70', java: '60' };
  const programTypeId = langMap[lang] || '73';

  return new Promise((resolve) => {
    const csrf = (document.querySelector('meta[name="X-Csrf-Token"]') || {}).content;
    if (!csrf) return resolve({ error: 'CF 未登录，请在 codeforces.com 登录后重试' });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/problemset/submit/${contestId}/${problemIndex}?csrf_token=${encodeURIComponent(csrf)}`);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

    const body = new URLSearchParams({
      csrf_token: csrf,
      ftaa: Array.from({ length: 18 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
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
      const url = xhr.responseURL || window.location.href;
      const m = url.match(/\/status\/(\d+)\/my/);
      if (m) resolve({ submissionId: parseInt(m[1]) });
      else setTimeout(() => {
        const m2 = window.location.href.match(/\/status\/(\d+)\/my/);
        if (m2) resolve({ submissionId: parseInt(m2[1]) });
        else resolve({ error: 'No submission ID in response' });
      }, 2500);
    };
    xhr.onerror = () => resolve({ error: 'CF 提交请求失败' });
    xhr.send(body.toString());
  });
}

function checkCFResult(args) {
  return null;
}

// ========== 报报告 ==========
let lastSid = 0;
function reportOk(task, sid) {
  lastSid = sid;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'helper.receipt',
    data: { taskId: task.taskId, userId, remoteSubmissionId: String(sid), remoteUsername: '', submittedAt: new Date().toISOString() },
  }));

  // 同时通过 HTTP 回填结果（提交成功就是 QUEUING）
  fetch(`${SERVER}/api/submissions/${task.submissionId}/fill-result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'JUDGING', score: 0, remoteSubmissionId: String(sid) }),
  }).catch(() => {});
}

function reportFail(task, msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'helper.failure',
    data: { taskId: task.taskId, userId, failureCode: 'FAILED', failureMessage: msg },
  }));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
