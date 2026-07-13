const S = 'http://127.0.0.1:3000';
const U = 'cmrj7k0hm00006eqfpcjxuwgn';
let busy = false;

chrome.alarms.create('poll', { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener(() => { if (!busy) doPoll(); });
doPoll();

async function doPoll() {
  try {
    const r = await fetch(`${S}/api/helper/tasks/next?userId=${U}&deviceId=bg`);
    if (!r.ok) return;
    const t = await r.json();
    if (!t || !t.taskId || t.platform !== 'CODEFORCES') return;
    busy = true;
    console.log('[BG] Task:', t.remoteProblemId);

    const m = t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
    if (!m) { busy = false; return; }
    const cid = parseInt(m[1]), pidx = m[2];

    const tab = await chrome.tabs.create({
      url: `https://codeforces.com/problemset/submit/${cid}/${pidx}`,
      active: false
    });
    await sleep(5000);

    const [r1] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectSubmit,
      args: [{ cid, pidx, lang: t.language, code: t.sourceCode }]
    });

    const result = r1?.result;
    if (result?.sid) {
      console.log('[BG] SID:', result.sid);
      await post(t.submissionId, 'JUDGING', 0, result.sid);

      for (let i = 0; i < 25; i++) {
        await sleep(3000);
        try {
          const ar = await fetch(`https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10`);
          const ad = await ar.json();
          if (ad.status !== 'OK') continue;
          const sub = ad.result.find(s => s.id === result.sid);
          if (sub && sub.verdict && sub.verdict !== 'TESTING') {
            const vm = { OK: 'ACCEPTED', WRONG_ANSWER: 'WRONG_ANSWER', TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED', MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED', RUNTIME_ERROR: 'RUNTIME_ERROR', COMPILATION_ERROR: 'COMPILE_ERROR' };
            const sv = vm[sub.verdict] || sub.verdict;
            await post(t.submissionId, sv, sv === 'ACCEPTED' ? 100 : 0, result.sid, null, sub.timeConsumedMillis || 0, (sub.memoryConsumedBytes / 1024) | 0);
            console.log('[BG] Done:', sv);
            break;
          }
        } catch (e) {}
      }
    } else {
      await post(t.submissionId, 'REMOTE_ERROR', 0, null, result?.error || '提交失败');
    }
    try { chrome.tabs.remove(tab.id); } catch (e) {}
    busy = false;
  } catch (e) { console.error('[BG]', e.message); busy = false; }
}

async function post(sid, s, sc, cfid, msg, t, m) {
  await fetch(`${S}/api/submissions/${sid}/fill-result`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: s, score: sc || 0, remoteSubmissionId: cfid ? String(cfid) : 'N/A', userId: U, compileMessage: msg || null, timeUsed: t || 0, memoryUsed: m || 0 })
  }).catch(() => {});
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function injectSubmit(args) {
  const L = { cpp: '73', c: '61', python: '70', java: '60' };
  const pt = L[args.lang] || '73';
  return new Promise(resolve => {
    function attempt(n) {
      const sel = document.querySelector('select[name="programTypeId"]');
      const area = document.querySelector('textarea[name="source"]');
      const btn = document.querySelector('input.submit[type="submit"]');
      if (!sel || !area || !btn) {
        if (n < 18) return setTimeout(() => attempt(n + 1), 800);
        return resolve({ error: 'CF 页面加载超时，请确认已登录' });
      }
      sel.value = pt; sel.dispatchEvent(new Event('change', { bubbles: true }));
      area.value = args.code; area.dispatchEvent(new Event('input', { bubbles: true }));
      area.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => {
        btn.click();
        let c = 0;
        const iv = setInterval(() => {
          c++;
          const el = document.querySelector('tr[data-submission-id]');
          if (el) { clearInterval(iv); resolve({ sid: +el.getAttribute('data-submission-id') }); return; }
          const m2 = location.href.match(/\/status\/(\d+)/);
          if (m2) { clearInterval(iv); resolve({ sid: +m2[1] }); return; }
          if (c > 30) { clearInterval(iv); resolve({ error: '无法获取 Submission ID' }); }
        }, 1000);
      }, 2000);
    }
    attempt(1);
  });
}
