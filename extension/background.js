/**
 * OJ Remote Submit Helper — Background Service Worker
 *
 * 流程：
 * 1. 连接本平台 WebSocket → 注册为 Helper
 * 2. 收到任务 → 创建新 Tab 打开第三方 OJ
 * 3. 注入 content script 执行提交
 * 4. 获取 remoteSubmissionId → 回传平台
 */

const PLATFORM_SETTINGS = {
  CODEFORCES: {
    origin: 'https://codeforces.com',
    submitUrl: '/problemset/submit',
    resultPageBase: '/problemset/status',
  },
  LUOGU: {
    origin: 'https://www.luogu.com.cn',
    submitUrl: '/fe/api/problem/submit/',
    resultPageBase: '/record/',
  },
  NOWCODER: {
    origin: 'https://ac.nowcoder.com',
    submitUrl: '/nccommon/submit',
    resultPageBase: '/acm/contest/status-list',
  },
  QOJ: {
    origin: 'https://qoj.ac',
    submitUrl: '/problem/',
    resultPageBase: '/submission/',
  },
};

// ========== 配置 ==========
const SERVER_URL = 'http://localhost:3000'; // 你的 OJ 平台地址
const WS_URL = 'ws://localhost:3000/helper';

// ========== 状态 ==========
let ws = null;
let userId = '';
let deviceId = '';
let reconnectTimer = null;
let currentTask = null;

// ========== 初始化 ==========
async function init() {
  const stored = await chrome.storage.local.get(['userId', 'deviceId', 'deviceName', 'serverUrl']);
  if (stored.userId && stored.deviceId) {
    userId = stored.userId;
    deviceId = stored.deviceId;
    connect();
  } else {
    console.log('[Helper] 等待用户配置...');
  }
}

// ========== WebSocket 连接 ==========
function connect() {
  if (ws) { ws.close(); }
  const url = `${WS_URL}?userId=${encodeURIComponent(userId)}&deviceId=${encodeURIComponent(deviceId)}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('[Helper] WebSocket 已连接');
    // 注册
    ws.send(JSON.stringify({
      type: 'helper.register',
      data: { userId, deviceId }
    }));
    // 请求第一个任务
    ws.send(JSON.stringify({
      type: 'helper.nextTask',
      data: { userId, deviceId }
    }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (e) { console.error('[Helper] 消息解析失败', e); }
  };

  ws.onclose = () => {
    console.log('[Helper] WebSocket 断开，5s 后重连...');
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 5000);
  };

  ws.onerror = (e) => {
    console.error('[Helper] WebSocket 错误', e);
  };
}

// ========== 消息处理 ==========
function handleMessage(msg) {
  switch (msg.type || msg.event) {
    case 'helper.task.created':
      handleTask(msg.data || msg);
      break;
    case 'task.created':
      handleTask(msg);
      break;
    default:
      // 可能是直接返回的任务响应
      if (msg.taskId && msg.platform) {
        handleTask(msg);
      }
  }
}

// ========== 任务执行 ==========
async function handleTask(task) {
  if (currentTask) {
    console.log('[Helper] 已有任务在处理中');
    return;
  }
  currentTask = task;
  console.log('[Helper] 收到任务:', task.taskId, task.platform, task.remoteProblemId);

  const settings = PLATFORM_SETTINGS[task.platform];
  if (!settings) {
    reportFailure(task, 'PLATFORM_UNSUPPORTED', '不支持的平台');
    return;
  }

  try {
    // 导航到提交页面，注入 content script 执行
    const submitUrl = buildSubmitUrl(task, settings);

    // 创建 tab
    const tab = await chrome.tabs.create({ url: getTaskPage(task), active: false });

    // 等待页面加载
    await sleep(3000);

    // 注入提交脚本
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: submitToPlatform,
      args: [task, settings],
    });

    const injectionResult = result[0]?.result;
    if (injectionResult?.error) {
      reportFailure(task, 'REMOTE_SUBMISSION_FAILED', injectionResult.error);
    } else {
      // 提交成功，等待跳转到结果页获取 submission ID
      await sleep(2000);

      // 从结果页 URL 提取 submission ID
      const submissionResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ url: window.location.href }),
      });

      const currentUrl = submissionResult[0]?.result?.url || '';
      const remoteId = extractSubmissionId(currentUrl, task.platform);

      if (remoteId) {
        reportReceipt(task, remoteId);
      } else {
        // 尝试从页面内容提取
        const contentResult = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractFromPage,
          args: [task.platform],
        });
        const fromPage = contentResult[0]?.result;
        if (fromPage) {
          reportReceipt(task, fromPage);
        } else {
          reportFailure(task, 'REMOTE_SUBMISSION_ID_NOT_FOUND', '无法获取远程提交编号');
        }
      }
    }

    // 关闭 tab
    try { chrome.tabs.remove(tab.id); } catch(e) {}
  } catch (e) {
    reportFailure(task, 'REMOTE_SUBMISSION_FAILED', e.message);
  } finally {
    currentTask = null;
  }
}

// ========== 提交到平台 ==========
function submitToPlatform(task, settings) {
  // 这个函数在 target OJ 页面的上下文中执行
  try {
    // 根据不同平台定位提交表单
    switch (task.platform) {
      case 'CODEFORCES':
        return submitCodeforces(task, settings);
      case 'LUOGU':
        return submitLuogu(task, settings);
      case 'NOWCODER':
        return submitNowcoder(task, settings);
      case 'QOJ':
        return submitQOJ(task, settings);
      default:
        return { error: 'UNSUPPORTED_PLATFORM' };
    }
  } catch (e) {
    return { error: e.message };
  }
}

function submitCodeforces(task) {
  // 找到语言选择器
  const langMap = { cpp: '54', c: '43', python: '70', java: '60' };
  const langId = langMap[task.language] || '54';

  const langSelect = document.querySelector('select[name="programTypeId"]');
  const sourceTextarea = document.querySelector('textarea[name="source"]');
  const submitBtn = document.querySelector('input[type="submit"].submit');

  if (!sourceTextarea) return { error: '未找到 Codeforces 提交页面元素' };

  if (langSelect) {
    langSelect.value = langId;
    langSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  sourceTextarea.value = task.sourceCode;
  sourceTextarea.dispatchEvent(new Event('input', { bubbles: true }));

  if (submitBtn) submitBtn.click();
  return { success: true };
}

function submitLuogu(task) {
  const langMap = { cpp: '11', c: '2', python: '17', java: '8' };
  const langId = langMap[task.language] || '11';

  // 洛谷使用 AJAX 提交
  fetch('/fe/api/problem/submit/' + task.remoteProblemId, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': (document.querySelector('meta[name="csrf-token"]') || {}).content || '',
    },
    body: JSON.stringify({
      lang: parseInt(langId),
      code: task.sourceCode,
      enableO2: 1,
    }),
  });
  return { success: true };
}

function submitNowcoder(task) {
  const sourceTextarea = document.querySelector('textarea[name="source"]');
  if (!sourceTextarea) return { error: '未找到牛客提交元素' };
  sourceTextarea.value = task.sourceCode;
  const submitBtn = document.querySelector('.submit-btn, button[type="submit"]');
  if (submitBtn) submitBtn.click();
  return { success: true };
}

function submitQOJ(task) {
  const sourceTextarea = document.querySelector('textarea[name="source"]');
  if (!sourceTextarea) return { error: '未找到 QOJ 提交元素' };
  sourceTextarea.value = task.sourceCode;
  const submitBtn = document.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.click();
  return { success: true };
}

function extractFromPage(platform) {
  // 尝试从页面内容提取 submission ID
  switch (platform) {
    case 'CODEFORCES':
      const tr = document.querySelector('table.status-frame-datatable tr[data-submission-id]');
      return tr ? tr.getAttribute('data-submission-id') : null;
    case 'LUOGU':
      const recordLink = document.querySelector('a[href*="/record/"]');
      if (recordLink) {
        const match = recordLink.href.match(/\/record\/(\d+)/);
        return match ? match[1] : null;
      }
      return null;
    case 'NOWCODER':
      const ncLink = document.querySelector('.submission-id');
      return ncLink ? ncLink.textContent.trim() : null;
    default:
      return null;
  }
}

function extractSubmissionId(url, platform) {
  const patterns = {
    CODEFORCES: /\/problemset\/status\/(\d+)/,
    LUOGU: /\/record\/(\d+)/,
    NOWCODER: /submissionId=(\d+)/,
    QOJ: /\/submissions\/(\d+)/,
  };
  const re = patterns[platform];
  if (re) {
    const match = url.match(re);
    return match ? match[1] : null;
  }
  return null;
}

// ========== 辅助函数 ==========
function buildSubmitUrl(task, settings) {
  const p = task.remoteProblemId;
  switch (task.platform) {
    case 'CODEFORCES':
      return `${settings.origin}/problemset/submit`;
    case 'LUOGU':
      return `${settings.origin}/problem/${p}`;
    case 'NOWCODER':
      return `${settings.origin}/acm/contest/submit`;
    case 'QOJ':
      return `${settings.origin}/problem/${p}`;
    default:
      return settings.origin;
  }
}

function getTaskPage(task) {
  switch (task.platform) {
    case 'CODEFORCES':
      return `https://codeforces.com/problemset/submit`;
    case 'LUOGU':
      return `https://www.luogu.com.cn/problem/${task.remoteProblemId}`;
    default:
      return `https://codeforces.com/problemset/submit`;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ========== 向平台报告 ==========
function reportReceipt(task, remoteId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'helper.receipt',
    data: {
      taskId: task.taskId,
      userId,
      remoteSubmissionId: remoteId,
      remoteUsername: '',
      submittedAt: new Date().toISOString(),
    }
  }));
  console.log('[Helper] 提交成功:', remoteId);
}

function reportFailure(task, code, message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'helper.failure',
    data: {
      taskId: task.taskId,
      userId,
      failureCode: code,
      failureMessage: message,
    }
  }));
  console.log('[Helper] 提交失败:', code, message);
}

// ========== 启动 ==========
init();
