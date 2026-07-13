/**
 * OJ Helper Popup — 极简版
 * 用户 ID 已预填，点击连接即可使用
 */
const SERVER = 'http://127.0.0.1:3000';
const USER_ID = 'cmrj7k0hm00006eqfpcjxuwgn';

const statusEl = document.getElementById('wsStatus');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const configSection = document.getElementById('configSection');
const connectedSection = document.getElementById('connectedSection');

// 自动尝试连接
(async function init() {
  const stored = await chrome.storage.local.get(['userId', 'deviceId', 'connected']);
  if (stored.connected && stored.userId) {
    showConnected(stored.userId);
    statusEl.textContent = '✅ Helper 已连接';
    statusEl.className = 'status ok';
  } else {
    // 预填用户ID
    const uidInput = document.getElementById('userIdInput');
    const nameInput = document.getElementById('deviceNameInput');
    if (uidInput) uidInput.value = USER_ID;
    if (nameInput) nameInput.value = 'Chrome-' + navigator.userAgent.slice(0, 30).replace(/[^a-zA-Z]/g, '');
    statusEl.textContent = '点击「连接」开始';
  }
})();

connectBtn.addEventListener('click', async () => {
  const uid = document.getElementById('userIdInput')?.value?.trim() || USER_ID;
  const dname = document.getElementById('deviceNameInput')?.value?.trim() || 'Chrome-Helper';

  statusEl.textContent = '⏳ 注册设备...';
  statusEl.className = 'status wait';

  // 直接存储配置，让 background 自己连接
  // deviceId 由 background 生成（随机UUID）
  const deviceId = 'ext-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  await chrome.storage.local.set({
    userId: uid,
    deviceId: deviceId,
    deviceName: dname,
    connected: true,
    serverUrl: SERVER,
  });

  showConnected(uid);
  statusEl.textContent = '✅ 已连接，WebSocket 接入中...';
  statusEl.className = 'status ok';

  // 通知 background 连接
  chrome.runtime.sendMessage({ action: 'reconnect', userId: uid, deviceId: deviceId });
});

disconnectBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ connected: false });
  showDisconnected();
  chrome.runtime.sendMessage({ action: 'disconnect' });
  statusEl.textContent = '❌ 已断开';
  statusEl.className = 'status err';
});

function showConnected(uid) {
  configSection.style.display = 'none';
  connectedSection.style.display = 'block';
  document.getElementById('uidDisplay').textContent = uid;
  document.getElementById('deviceNameDisplay').textContent = 'Chrome-Helper';
}

function showDisconnected() {
  configSection.style.display = 'block';
  connectedSection.style.display = 'none';
}
