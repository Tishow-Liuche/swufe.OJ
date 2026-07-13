/**
 * OJ Helper v2.2 — HTTP polling for CF submissions
 */
const SERVER = 'http://127.0.0.1:3000';
let userId = 'cmrj7k0hm00006eqfpcjxuwgn';
let deviceId = '';
let pollTimer = null;

// ========== Init ==========
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'reconnect') { userId = msg.userId || userId; deviceId = msg.deviceId || deviceId; startPolling(); }
  if (msg.action === 'disconnect') { stopPolling(); }
});

(async function init() {
  const d = await chrome.storage.local.get(['userId', 'deviceId', 'connected']);
  if (d.connected && d.userId) {
    userId = d.userId;
    deviceId = 'ext-' + Date.now().toString(36);
    await chrome.storage.local.set({ deviceId });
    startPolling();
  }
})();

// ========== Polling ==========
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  console.log('[Helper] Polling started, uid=' + userId);
  pollTimer = setInterval(async () => {
    try {
      if (!deviceId) return;
      const r = await fetch(`${SERVER}/api/helper/tasks/next?userId=${userId}&deviceId=${deviceId}`);
      if (!r.ok) return;
      const task = await r.json();
      if (task && task.taskId) {
        console.log('[Helper] Task:', task.taskId, task.platform, task.remoteProblemId);
        if (task.platform === 'CODEFORCES') await executeCF(task);
      }
    } catch (e) { /* network ok */ }
  }, 4000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  console.log('[Helper] Polling stopped');
}

// ========== CF Submit ==========
async function executeCF(task) {
  const m = task.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
  if (!m) return;
  const cid = parseInt(m[1]), pidx = m[2];

  try {
    const tab = await chrome.tabs.create({ url: `https://codeforces.com/problemset/submit/${cid}/${pidx}`, active: false });
    await sleep(4000);

    const r = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (args) => {
        return new Promise((resolve) => {
          const csrf = document.querySelector('meta[name="X-Csrf-Token"]')?.getAttribute('content');
          if (!csrf) return resolve({ error: 'NOT_LOGGED_IN' });

          const lang = { cpp: '73', c: '61', python: '70', java: '60' }[args.lang] || '73';
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `/problemset/submit/${args.cid}/${args.pidx}?csrf_token=${encodeURIComponent(csrf)}`);
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

          const b = new URLSearchParams();
          b.set('csrf_token', csrf);
          b.set('ftaa', Array.from({ length: 18 }, () => Math.floor(Math.random() * 16).toString(16)).join(''));
          b.set('bfaa', 'f1b3f18c715565b589b7823cda7448ce');
          b.set('action', 'submitSolutionFormSubmitted');
          b.set('submittedProblemIndex', args.pidx);
          b.set('programTypeId', lang);
          b.set('source', args.code);
          b.set('tabSize', '4');
          b.set('sourceFile', '');
          b.set('_tta', '594');

          xhr.onload = () => {
            setTimeout(() => {
              const m2 = window.location.href.match(/\/status\/(\d+)\/my/);
              resolve(m2 ? { sid: parseInt(m2[1]) } : { error: 'NO_SID' });
            }, 3000);
          };
          xhr.onerror = () => resolve({ error: 'XHR_FAIL' });
          xhr.send(b.toString());
        });
      },
      args: [{ cid, pidx, code: task.sourceCode, lang: task.language }],
    });

    const result = r[0]?.result;
    if (result?.sid) {
      console.log('[Helper] CF Submitted:', result.sid);
      await fetch(`${SERVER}/api/submissions/${task.submissionId}/fill-result`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'JUDGING', score: 0, remoteSubmissionId: String(result.sid), userId }),
      });

      // Poll result
      await sleep(4000);
      const r2 = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', '/api/user.status?from=1&count=10');
            xhr.onload = () => { try { resolve(JSON.parse(xhr.responseText).result || []); } catch { resolve([]); } };
            xhr.onerror = () => resolve([]);
            xhr.send();
          });
        },
      });

      const subs = r2[0]?.result || [];
      const found = subs.find((s) => s.id === result.sid);
      if (found && found.verdict && found.verdict !== 'TESTING') {
        const vmap = { OK: 'ACCEPTED', WRONG_ANSWER: 'WRONG_ANSWER', TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED', MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED', RUNTIME_ERROR: 'RUNTIME_ERROR', COMPILATION_ERROR: 'COMPILE_ERROR' };
        const sv = vmap[found.verdict] || found.verdict;
        await fetch(`${SERVER}/api/submissions/${task.submissionId}/fill-result`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: sv, score: sv === 'ACCEPTED' ? 100 : 0, timeUsed: found.timeConsumedMillis || 0, memoryUsed: found.memoryConsumedBytes ? Math.round(found.memoryConsumedBytes / 1024) : 0, remoteSubmissionId: String(result.sid), userId }),
        });
        console.log('[Helper] Verdict:', sv);
      }
      try { chrome.tabs.remove(tab.id); } catch (e) { }
    } else {
      console.log('[Helper] Submit failed:', result?.error);
    }
  } catch (e) {
    console.error('[Helper] Error:', e.message);
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
