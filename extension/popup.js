// Popup 脚本 — 自动配置版本

const SERVER = 'http://127.0.0.1:3000';
const USER_ID = 'cmrj7k0hm00006eqfpcjxuwgn';  // 一只天守

const userIdInput = document.getElementById('userIdInput');
const deviceNameInput = document.getElementById('deviceNameInput');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const configSection = document.getElementById('configSection');
const connectedSection = document.getElementById('connectedSection');
const uidDisplay = document.getElementById('uidDisplay');
const deviceNameDisplay = document.getElementById('deviceNameDisplay');
const wsStatus = document.getElementById('wsStatus');
const taskStatus = document.getElementById('taskStatus');
const ojUrl = document.getElementById('ojUrl');

// 预填用户ID
if (userIdInput) userIdInput.value = USER_ID;
if (deviceNameInput) deviceNameInput.value = 'Chrome-' + (navigator.userAgent.includes('Firefox') ? 'FF' : 'Chrome');
ojUrl.textContent = SERVER;

// 初始化
chrome.storage.local.get(['userId', 'deviceId', 'deviceName', 'connected'], (data) => {
  if (data.connected && data.userId) {
    showConnected(data.userId, data.deviceName || '-');
    wsStatus.className = 'status ok';
    wsStatus.textContent = '✅ Helper 已连接';
  }
});

// 自动连接（如果已有配置但未连接）
setTimeout(async () => {
  const stored = await chrome.storage.local.get(['userId', 'deviceId', 'deviceName']);
  if (stored.userId && stored.deviceId) {
    showConnected(stored.userId, stored.deviceName || '-');
    if (userIdInput) userIdInput.value = stored.userId;
    if (deviceNameInput) deviceNameInput.value = stored.deviceName || 'Chrome-Chrome';
  }
}, 200);

connectBtn.addEventListener('click', async () => {
  const uid = (userIdInput.value || '').trim() || USER_ID;
  const dname = (deviceNameInput.value || '').trim() || 'Chrome-Chrome';

  wsStatus.className = 'status wait';
  wsStatus.textContent = '⏳ 注册中...';

  try {
    const resp = await fetch(`${SERVER}/api/external/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceName: dname,
        browserName: navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Chrome',
        extensionVersion: '0.1.0',
      }),
    });

    if (!resp.ok) {
      // 可能是未登录，尝试提示
      wsStatus.className = 'status err';
      wsStatus.textContent = '❌ 请先在 OJ 平台登录';
      return;
    }

    const dev = await resp.json();
    await chrome.storage.local.set({
      userId: uid,
      deviceId: dev.id,
      deviceName: dname,
      connected: true,
      serverUrl: SERVER,
    });

    showConnected(uid, dname);

    // 重启 background 以建立 WebSocket
    chrome.runtime.sendMessage({ action: 'reconnect', userId: uid, deviceId: dev.id });

    wsStatus.className = 'status ok';
    wsStatus.textContent = '✅ 注册成功, WebSocket 正在连接...';
  } catch (e) {
    wsStatus.className = 'status err';
    wsStatus.textContent = '❌ 连接失败: ' + e.message;
  }
});

disconnectBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ connected: false });
  showDisconnected();
  chrome.runtime.sendMessage({ action: 'disconnect' });
});

function showConnected(uid, dname) {
  configSection.style.display = 'none';
  connectedSection.style.display = 'block';
  if (uidDisplay) uidDisplay.textContent = uid;
  if (deviceNameDisplay) deviceNameDisplay.textContent = dname;
  wsStatus.className = 'status ok';
  wsStatus.textContent = '✅ 已连接';
}

function showDisconnected() {
  configSection.style.display = 'block';
  connectedSection.style.display = 'none';
  wsStatus.className = 'status err';
  wsStatus.textContent = '❌ 未连接';
}
