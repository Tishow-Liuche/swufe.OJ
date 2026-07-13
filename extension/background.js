const S = 'http://127.0.0.1:3000';
const U = 'cmrj7k0hm00006eqfpcjxuwgn';

// Handle messages from content script
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.action === 'cf-submit' && msg.task) {
    await handleCF(msg.task);
  }
});

async function handleCF(t) {
  const m = t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
  if (!m) return;
  const cid = parseInt(m[1]), pidx = m[2];

  try {
    const tab = await chrome.tabs.create({
      url: `https://codeforces.com/problemset/submit/${cid}/${pidx}`,
      active: false
    });
    await sleep(5000);
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: submitCF,
      args: [{ cid, pidx, lang: t.language, code: t.sourceCode }]
    });

    if (r?.result?.sid) {
      post(t.submissionId, 'JUDGING', 0, r.result.sid, '已提交');
      await sleep(4000);
      for (let i = 0; i < 20; i++) {
        await sleep(3000);
        const [r2] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: checkVerdict,
          args: [r.result.sid]
        });
        if (r2?.result) {
          post(t.submissionId, r2.result.status, r2.result.score, r.result.sid, null, r2.result.time, r2.result.mem);
          break;
        }
      }
    } else {
      post(t.submissionId, 'REMOTE_ERROR', 0, null, (r?.result?.error || '提交失败'));
    }
    try { chrome.tabs.remove(tab.id); } catch (e) {}
  } catch (e) {
    post(t.submissionId, 'REMOTE_ERROR', 0, null, e.message);
  }
}

async function post(sid, status, score, cfid, msg, time, mem) {
  await fetch(`${S}/api/submissions/${sid}/fill-result`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, score: score || 0, remoteSubmissionId: cfid ? String(cfid) : 'N/A', userId: U, compileMessage: msg || null, timeUsed: time || 0, memoryUsed: mem || 0 })
  }).catch(() => {});
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function submitCF(args) {
  return new Promise(resolve => {
    const L = { cpp: '73', c: '61', python: '70', java: '60' };
    const pt = L[args.lang] || '73';
    function trySubmit(n) {
      const sel = document.querySelector('select[name="programTypeId"]');
      const area = document.querySelector('textarea[name="source"]');
      const btn = document.querySelector('input.submit[type="submit"]');
      if (!sel || !area || !btn) {
        if (n < 15) return setTimeout(() => trySubmit(n + 1), 1000);
        return resolve({ error: 'CF 页面加载超时，请确认已登录 codeforces.com' });
      }
      sel.value = pt; sel.dispatchEvent(new Event('change', { bubbles: true }));
      area.value = args.code; area.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => {
        btn.click();
        let c = 0;
        const iv = setInterval(() => {
          c++;
          const el = document.querySelector('tr[data-submission-id]');
          if (el) { clearInterval(iv); return resolve({ sid: +el.getAttribute('data-submission-id') }); }
          const m2 = location.href.match(/\/status\/(\d+)/);
          if (m2) { clearInterval(iv); return resolve({ sid: +m2[1] }); }
          if (c > 25) { clearInterval(iv); resolve({ error: '无法获取 Submission ID' }); }
        }, 1200);
      }, 2000);
    }
    trySubmit(1);
  });
}

function checkVerdict(sid) {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/user.status?from=1&count=10');
    xhr.onload = () => {
      try {
        const d = JSON.parse(xhr.responseText);
        const s = (d.result || []).find(x => x.id === sid);
        if (s && s.verdict && s.verdict !== 'TESTING') {
          const m = { OK: 'ACCEPTED', WRONG_ANSWER: 'WRONG_ANSWER', TIME_LIMIT_EXCEEDED: 'TLE', MEMORY_LIMIT_EXCEEDED: 'MLE', RUNTIME_ERROR: 'RE', COMPILATION_ERROR: 'CE' };
          resolve({ status: m[s.verdict] || s.verdict, score: s.verdict === 'OK' ? 100 : 0, time: s.timeConsumedMillis || 0, mem: s.memoryConsumedBytes ? Math.round(s.memoryConsumedBytes / 1024) : 0 });
        } else resolve(null);
      } catch { resolve(null); }
    };
    xhr.onerror = () => resolve(null);
    xhr.send();
  });
}
