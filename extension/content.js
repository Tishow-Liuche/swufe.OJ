/**
 * Content script — runs on OJ platform page
 * Polls for pending CF tasks and triggers background submit
 */
const S = 'http://127.0.0.1:3000';
const U = 'cmrj7k0hm00006eqfpcjxuwgn';
let lastTaskId = null;

setInterval(async () => {
  try {
    const r = await fetch(`${S}/api/helper/tasks/next?userId=${U}&deviceId=content`);
    if (!r.ok) return;
    const t = await r.json();
    if (t && t.taskId && t.taskId !== lastTaskId) {
      lastTaskId = t.taskId;
      console.log('[OJ-Content] Found CF task:', t.remoteProblemId);
      chrome.runtime.sendMessage({ action: 'cf-submit', task: t });
    }
  } catch (e) { /* network */ }
}, 5000);
