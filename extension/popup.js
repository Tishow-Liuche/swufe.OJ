/**
 * OJ Helper Popup — 一键连接，实时状态
 */
const SERVER = 'http://127.0.0.1:3000';
const UID = 'cmrj7k0hm00006eqfpcjxuwgn';

(async function () {
  const statusEl = document.getElementById('wsStatus');
  statusEl.textContent = '✅ Helper 已在后台运行';
  statusEl.className = 'status ok';

  // Set connected flag
  await chrome.storage.local.set({ connected: true, userId: UID });

  // Restart background polling
  chrome.runtime.sendMessage({ action: 'reconnect' });

  // Show status
  const uidDisplay = document.getElementById('uidDisplay');
  if (uidDisplay) uidDisplay.textContent = UID;
  const deviceDisplay = document.getElementById('deviceNameDisplay');
  if (deviceDisplay) deviceDisplay.textContent = 'Chrome-Helper';

  // Hide config, show connected
  const configEl = document.getElementById('configSection');
  const connEl = document.getElementById('connectedSection');
  if (configEl) configEl.style.display = 'none';
  if (connEl) connEl.style.display = 'block';

  // Check last task
  try {
    const r = await fetch(`${SERVER}/api/helper/tasks/next?userId=${UID}&deviceId=ext-popup`);
    const task = await r.json();
    const taskStatus = document.getElementById('taskStatus');
    if (task && task.taskId) {
      taskStatus.textContent = '🔔 有待处理任务: ' + task.remoteProblemId;
      taskStatus.className = 'status wait';
    } else {
      taskStatus.textContent = '📭 暂无待处理任务';
      taskStatus.className = 'status ok';
    }
  } catch (e) {
    const taskStatus = document.getElementById('taskStatus');
    taskStatus.textContent = '⚠️ 无法连接 OJ 服务器';
    taskStatus.className = 'status err';
  }
})();
