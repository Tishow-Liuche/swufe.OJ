/**
 * OJ Helper v3.1 — 在 CF 页面上填写表单+点击提交+反馈结果
 */
const SERVER = 'http://127.0.0.1:3000';
const USER_ID = 'cmrj7k0hm00006eqfpcjxuwgn';
let pollTimer = null;
let busy = false;

// ========== Init ==========
(async function() {
  const d = await chrome.storage.local.get(['connected']);
  if (d.connected) startPolling();
})();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'reconnect') startPolling();
  if (msg.action === 'disconnect') { if (pollTimer) clearInterval(pollTimer); }
});

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  console.log('[Helper] Polling every 4s');
  pollTimer = setInterval(checkTask, 4000);
}

async function checkTask() {
  if (busy) return;
  try {
    const r = await fetch(`${SERVER}/api/helper/tasks/next?userId=${USER_ID}&deviceId=ext-v3`);
    if (!r.ok) return;
    const task = await r.json();
    if (task && task.taskId && task.platform === 'CODEFORCES') {
      busy = true;
      console.log('[Helper] Task:', task.remoteProblemId);
      await handleCF(task);
      busy = false;
    }
  } catch (e) {}
}

// ========== CF Submit ==========
async function handleCF(task) {
  const m = task.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
  if (!m) { busy = false; return; }
  const cid = parseInt(m[1]), pidx = m[2];

  // Report to user
  postResult(task.submissionId, 'QUEUING', 0, null, '正在提交到 Codeforces...');

  try {
    const tab = await chrome.tabs.create({
      url: `https://codeforces.com/problemset/submit/${cid}/${pidx}`,
      active: true,
    });
    await sleep(6000);

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectCFSubmit,
      args: [{cid, pidx, code: task.sourceCode, lang: task.language, subId: task.submissionId, server: SERVER, uid: USER_ID}],
    });

    const r = results[0]?.result;
    console.log('[Helper] Result:', JSON.stringify(r));
  } catch (e) {
    console.error('[Helper] Error:', e.message);
    postResult(task.submissionId, 'REMOTE_ERROR', 0, null, e.message);
  }
}

// ========== 注入 CF 页面的脚本 ==========
function injectCFSubmit(args) {
  return new Promise((resolve) => {
    const LANG = { cpp: '73', c: '61', python: '70', java: '60' };
    const langId = LANG[args.lang] || '73';
    const { cid, pidx, code, subId, server, uid } = args;

    // Notify OJ
    function notifyOJ(status, score, sid, msg) {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', server + '/api/submissions/' + subId + '/fill-result');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({
        status: status, score: score || 0,
        remoteSubmissionId: sid ? String(sid) : 'N/A',
        userId: uid,
        compileMessage: msg || null,
        timeUsed: 0, memoryUsed: 0,
      }));
    }

    // Check logged in
    const profile = document.querySelector('a[href*="/profile/"]');
    if (!profile || profile.textContent.trim() === 'Enter') {
      notifyOJ('REMOTE_ERROR', 0, null, '请先在 codeforces.com 登录账号再试');
      return resolve({ error: 'NOT_LOGGED_IN' });
    }

    function attempt(attemptNum) {
      const select = document.querySelector('select[name="programTypeId"]');
      const textarea = document.querySelector('textarea[name="source"]');
      const btn = document.querySelector('input.submit[type="submit"]');

      if (!select || !textarea || !btn) {
        if (attemptNum < 15) return setTimeout(() => attempt(attemptNum + 1), 1000);
        notifyOJ('REMOTE_ERROR', 0, null, 'CF 页面加载超时，请手动提交');
        return resolve({ error: 'PAGE_LOAD_TIMEOUT' });
      }

      // Fill form
      select.value = langId;
      select.dispatchEvent(new Event('change', { bubbles: true }));

      textarea.value = code;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));

      console.log('[CF-Inject] Filled, clicking submit...');

      setTimeout(() => {
        btn.click();
        console.log('[CF-Inject] Submit clicked!');

        // Wait for result
        // Poll: check table for submission-id, check URL
        let count = 0;
        const iv = setInterval(() => {
          count++;
          // Look for submission ID in status table
          const row = document.querySelector('tr[data-submission-id]');
          if (row) {
            const sid = parseInt(row.getAttribute('data-submission-id'));
            clearInterval(iv);
            notifyOJ('JUDGING', 0, sid, '已提交到 CF，等待评测...');
            console.log('[CF-Inject] SID from table:', sid);
            return resolve({ sid });
          }

          // Check URL redirect
          const m2 = window.location.href.match(/\/status\/(\d+)/);
          if (m2) {
            const sid2 = parseInt(m2[1]);
            clearInterval(iv);
            notifyOJ('JUDGING', 0, sid2, '已提交到 CF，等待评测...');
            console.log('[CF-Inject] SID from URL:', sid2);
            return resolve({ sid: sid2 });
          }

          if (count > 25) {
            clearInterval(iv);
            notifyOJ('JUDGING', 0, null, '已提交但未获取到 ID，请检查 CF');
            resolve({ sid: null });
          }
        }, 1200);
      }, 2000);
    }

    attempt(1);
  });
}

async function postResult(subId, status, score, sid, msg) {
  try {
    await fetch(`${SERVER}/api/submissions/${subId}/fill-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, score: score || 0, remoteSubmissionId: sid ? String(sid) : 'N/A', userId: USER_ID, compileMessage: msg || null, timeUsed: 0, memoryUsed: 0 }),
    });
  } catch (e) {}
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
