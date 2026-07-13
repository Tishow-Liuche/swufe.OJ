/**
 * Helper 模拟器 — 在终端运行，替代浏览器扩展
 *
 * 连接本平台 WebSocket → 获取提交任务 → 通过 HTTP 提交到洛谷 → 回传结果
 *
 * 用法: node scripts/helper-simulator.js
 */

const { io } = require('socket.io-client');
const https = require('https');
const readline = require('readline');

const SERVER = 'http://localhost:3000';
const USER_ID = 'cmrj7k0hm00006eqfpcjxuwgn';  // 一只天守
const DEVICE_ID = 'helper-simulator-01';

// ========== 洛谷提交逻辑 ==========
// 使用洛谷开放平台的评测 API
// 注意：这需要 OpenApp Token。如果没有 Token，则降级为打开浏览器手动提交。
const LUOGU_OPENAPP_TOKEN = ''; // 留空则使用降级模式

let socket = null;

function connect() {
  console.log(`[模拟Helper] 正在连接 ${SERVER}...`);

  socket = io(`${SERVER}/helper`, {
    query: { userId: USER_ID, deviceId: DEVICE_ID },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log('[模拟Helper] ✅ WebSocket 已连接');
    socket.emit('helper.register', { userId: USER_ID, deviceId: DEVICE_ID, token: '' });
    socket.emit('helper.nextTask', { userId: USER_ID, deviceId: DEVICE_ID });
  });

  socket.on('disconnect', () => {
    console.log('[模拟Helper] ⚠️ 断开连接，5s 后重连...');
    setTimeout(connect, 5000);
  });

  socket.on('connect_error', (err) => {
    console.error('[模拟Helper] ❌ 连接失败:', err.message);
    setTimeout(connect, 5000);
  });

  // 收到评测任务
  socket.on('helper.task.created', (task) => {
    console.log(`\n[模拟Helper] 📥 收到任务: ${task.taskId}`);
    console.log(`  平台: ${task.platform} | 题目: ${task.remoteProblemId}`);
    console.log(`  语言: ${task.language}`);
    console.log(`  代码长度: ${task.sourceCode?.length || 0} 字符`);

    if (LUOGU_OPENAPP_TOKEN) {
      submitToLuogu(task);
    } else {
      fallbackMode(task);
    }
  });
}

// ========== 洛谷 OpenApp 提交 ==========
async function submitToLuogu(task) {
  console.log('[模拟Helper] 🚀 正在通过洛谷 OpenApp 提交...');
  try {
    const auth = Buffer.from(LUOGU_OPENAPP_TOKEN).toString('base64');
    const langMap = { cpp: 'cxx/14/gcc', c: 'c/99/gcc', python: 'python3/c', java: 'java/8' };

    const body = JSON.stringify({
      pid: task.remoteProblemId,
      lang: langMap[task.language] || 'cxx/14/gcc',
      o2: true,
      code: task.sourceCode,
      trackId: task.submissionId,
    });

    const resp = await fetch('https://open-v1.lgapi.cn/judge/problem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'swufe-oj-helper/0.1',
      },
      body,
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('[模拟Helper] 提交失败:', resp.status, err.substring(0, 200));
      socket.emit('helper.failure', {
        taskId: task.taskId, userId: USER_ID,
        failureCode: 'REMOTE_SUBMISSION_FAILED',
        failureMessage: `HTTP ${resp.status}: ${err.substring(0, 200)}`,
      });
      return;
    }

    const result = await resp.json();
    const requestId = result.requestId;
    console.log(`[模拟Helper] ✅ 提交成功! requestId: ${requestId}`);

    // 回传提交凭证
    socket.emit('helper.receipt', {
      taskId: task.taskId, userId: USER_ID,
      remoteSubmissionId: requestId,
      remoteUsername: 'alxy5201314',
      submittedAt: new Date().toISOString(),
    });

    // 轮询结果
    console.log('[模拟Helper] 🔍 轮询评测结果...');
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      try {
        const auth = Buffer.from(LUOGU_OPENAPP_TOKEN).toString('base64');
        const res = await fetch(`https://open-v1.lgapi.cn/judge/result/${requestId}`, {
          headers: { 'Accept': 'application/json', 'Authorization': `Basic ${auth}` },
        });

        if (!res.ok) continue;
        const judge = await res.json();

        if (judge.status === 'COMPLETED' && judge.result) {
          const verdict = judge.result.verdict;
          console.log(`[模拟Helper] 📊 评测完成: ${verdict} (${judge.result.score || 0}分, ${judge.result.time || 0}ms)`);

          // 更新服务器上的提交状态
          await fetch(`${SERVER}/api/submissions/${task.submissionId}/judge-result`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: verdict, score: judge.result.score,
              timeUsed: judge.result.time, memoryUsed: judge.result.memory,
              compileMessage: judge.result.compile?.success === false ? judge.result.compile.message : null,
            }),
          });
          break;
        }
        if (i % 5 === 0) console.log(`  轮询 ${i + 1}/30...`);
      } catch (e) { console.error('轮询错误:', e.message); }
    }
  } catch (e) {
    console.error('[模拟Helper] ❌', e.message);
    socket.emit('helper.failure', {
      taskId: task.taskId, userId: USER_ID,
      failureCode: 'REMOTE_SUBMISSION_FAILED', failureMessage: e.message,
    });
  }
}

// ========== 降级模式 ==========
function fallbackMode(task) {
  console.log('\n[模拟Helper] ⚠️ 洛谷 OpenApp Token 未配置');
  console.log('   启用降级模式：请在浏览器中手动提交');
  console.log(`   洛谷题目链接: https://www.luogu.com.cn/problem/${task.remoteProblemId}`);
  console.log('   语言: ' + task.language);
  console.log('   代码:');
  console.log('   ---');
  console.log(task.sourceCode?.substring(0, 500));
  console.log('   ---');
  console.log('\n   提交完成后，请在本平台手动标记结果。');
  console.log(`   提交 ID: ${task.submissionId}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ========== 启动 ==========
console.log('╔══════════════════════════════════╗');
console.log('║  OJ Remote Judge Helper 模拟器  ║');
console.log('╚══════════════════════════════════╝');
console.log(`服务器: ${SERVER}`);
console.log(`用户ID: ${USER_ID}`);
console.log(`设备ID: ${DEVICE_ID}`);
console.log(`OpenApp Token: ${LUOGU_OPENAPP_TOKEN ? '已配置 ✅' : '未配置（降级模式）'}`);
console.log('');

if (!LUOGU_OPENAPP_TOKEN) {
  console.log('💡 提示：如果你有洛谷 OpenApp Token，编辑此文件设置 LUOGU_OPENAPP_TOKEN');
  console.log('   申请地址：https://docs.lgapi.cn/open/');
  console.log('');
}

connect();

// 保持进程不退出
process.on('SIGINT', () => {
  socket?.disconnect();
  process.exit(0);
});
