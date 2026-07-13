// Popup 脚本

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

// 初始化
chrome.storage.local.get(['userId', 'deviceId', 'deviceName'], (data) => {
  if (data.userId && data.deviceId) {
    showConnected(data.userId, data.deviceName || '-');
    ojUrl.textContent = data.serverUrl || 'http://localhost:3000';
  }
});

connectBtn.addEventListener('click', async () => {
  const uid = userIdInput.value.trim();
  const dname = deviceNameInput.value.trim() || 'Chrome-Win';
  if (!uid) return;

  // 向平台注册设备
  try {
    const resp = await fetch(`http://localhost:3000/api/external/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceName: dname,
        browserName: navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Chrome',
        extensionVersion: '0.1.0',
      }),
    });
    if (!resp.ok) throw new Error('注册失败');

    const dev = await resp.json();
    await chrome.storage.local.set({
      userId: uid,
      deviceId: dev.id,
      deviceName: dname,
      serverUrl: 'http://localhost:3000',
    });

    showConnected(uid, dname);
    chrome.runtime.reload();
  } catch (e) {
    wsStatus.className = 'status err';
    wsStatus.textContent = '❌ 注册失败: ' + e.message;
  }
});

disconnectBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove(['userId', 'deviceId', 'deviceName']);
  showDisconnected();
  chrome.runtime.reload();
});

function showConnected(uid, dname) {
  configSection.style.display = 'none';
  connectedSection.style.display = 'block';
  uidDisplay.textContent = uid;
  deviceNameDisplay.textContent = dname;
  wsStatus.className = 'status ok';
  wsStatus.textContent = '✅ 已连接';
}

function showDisconnected() {
  configSection.style.display = 'block';
  connectedSection.style.display = 'none';
  wsStatus.className = 'status err';
  wsStatus.textContent = '❌ 未连接';
}
