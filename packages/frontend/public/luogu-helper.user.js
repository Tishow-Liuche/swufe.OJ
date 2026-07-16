// ==UserScript==
// @name         OJ Luogu Helper
// @namespace    https://oj.example.com
// @version      1.3
// @description  自动填表 + 自动提交 + 回传洛谷结果 + 自动关闭洛谷标签页
// @author       OJ Team
// @downloadURL  http://localhost:5173/luogu-helper.user.js
// @updateURL    http://localhost:5173/luogu-helper.user.js
// @match        https://www.luogu.com.cn/*
// @match        https://luogu.com.cn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-end
// @noframes
// ==/UserScript==

(function() {
'use strict';

var API = 'http://127.0.0.1:3000';
var STATE_KEY = 'swufe_luogu_auto_state';
var SUBMIT_ONCE_KEY_PREFIX = 'swufe_luogu_submit_once_';

function gv(k, d) { return GM_getValue(k, d != null ? d : ''); }
function sv(k, v) { GM_setValue(k, v); }
function dv(k) { GM_deleteValue(k); }

function loadState() {
  try { return JSON.parse(gv(STATE_KEY, '{}') || '{}'); }
  catch (_) { return {}; }
}

function saveState(next) {
  sv(STATE_KEY, JSON.stringify(next || {}));
}

function clearState() {
  dv(STATE_KEY);
}

function banner(text, bg) {
  var old = document.getElementById('oj-lg-helper-banner');
  if (old) old.remove();
  var d = document.createElement('div');
  d.id = 'oj-lg-helper-banner';
  d.textContent = text;
  d.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:12px 24px;' +
    'text-align:center;font:15px sans-serif;color:#fff;background:' + bg + ';' +
    'box-shadow:0 2px 14px rgba(0,0,0,.3);';
  document.body.appendChild(d);
}

function apiRequest(method, url, data, cb) {
  GM_xmlhttpRequest({
    method: method,
    url: API + url,
    headers: { 'Content-Type': 'application/json' },
    data: data ? JSON.stringify(data) : undefined,
    timeout: 10000,
    onload: function(r) {
      try {
        var parsed = r.responseText ? JSON.parse(r.responseText) : {};
        if (r.status >= 200 && r.status < 300) cb(null, parsed);
        else cb(parsed && parsed.message ? parsed.message : 'HTTP ' + r.status, null);
      } catch (_) {
        cb('Bad JSON response', null);
      }
    },
    onerror: function() { cb('Network error', null); },
    ontimeout: function() { cb('Timeout', null); }
  });
}

function problemIdFromLocation() {
  var m = location.pathname.match(/\/problem\/([A-Z]\d+[A-Z0-9-]*)/i);
  return m ? m[1].toUpperCase() : '';
}

function isLoggedIn() {
  return !!(
    document.querySelector('a[href*="/user/"]') ||
    document.querySelector('[class*="Avatar"]') ||
    document.body.innerText.indexOf('个人中心') >= 0
  );
}

function visibleText(el) {
  return (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
}

function clickByText(patterns) {
  var els = Array.prototype.slice.call(document.querySelectorAll('a,button,span,div'));
  for (var i = 0; i < els.length; i++) {
    var t = visibleText(els[i]);
    for (var j = 0; j < patterns.length; j++) {
      if (patterns[j].test(t)) {
        els[i].click();
        return true;
      }
    }
  }
  return false;
}

function ensureSubmitPanel() {
  if (location.hash !== '#submit') {
    history.replaceState(null, '', location.pathname + '#submit');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
  clickByText([/^提交$/, /提交答案/, /Submit/i]);
}

function findTextarea() {
  return (
    document.querySelector('textarea') ||
    document.querySelector('[contenteditable="true"]') ||
    document.querySelector('.cm-content') ||
    document.querySelector('.monaco-editor textarea')
  );
}

function setCode(code) {
  var textarea = findTextarea();
  if (!textarea) return false;

  textarea.focus();
  if ('value' in textarea) {
    textarea.value = code;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    textarea.textContent = code;
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: code }));
  }

  if (window.monaco && window.monaco.editor) {
    var models = window.monaco.editor.getModels ? window.monaco.editor.getModels() : [];
    for (var i = 0; i < models.length; i++) models[i].setValue(code);
  }
  return true;
}

function chooseLanguage(lang) {
  var labelMap = { cpp: /C\+\+|G\+\+|Clang/i, c: /^C$|GCC/i, python: /Python|PyPy/i, java: /Java/i };
  var want = labelMap[lang] || labelMap.cpp;
  var selects = Array.prototype.slice.call(document.querySelectorAll('select'));
  for (var i = 0; i < selects.length; i++) {
    var opts = Array.prototype.slice.call(selects[i].options || []);
    for (var j = 0; j < opts.length; j++) {
      if (want.test(opts[j].textContent || '')) {
        selects[i].value = opts[j].value;
        selects[i].dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
  }

  clickByText([/语言|Language/i]);
  var items = Array.prototype.slice.call(document.querySelectorAll('li,div,span,button'));
  for (var k = 0; k < items.length; k++) {
    if (want.test(visibleText(items[k]))) {
      items[k].click();
      return true;
    }
  }
  return false;
}

function findSubmitButton() {
  var candidates = Array.prototype.slice.call(document.querySelectorAll('button,input[type="submit"],a'));
  for (var i = 0; i < candidates.length; i++) {
    var t = visibleText(candidates[i]) || candidates[i].value || '';
    if (/提交|Submit/i.test(t) && !/记录|题解|列表/.test(t)) return candidates[i];
  }
  return null;
}

function normalizeStatus(text) {
  text = String(text || '').toUpperCase();
  if (/ACCEPTED|答案正确|\bAC\b/.test(text)) return 'ACCEPTED';
  if (/WRONG ANSWER|答案错误|\bWA\b/.test(text)) return 'WRONG_ANSWER';
  if (/TIME LIMIT|超时|\bTLE\b/.test(text)) return 'TIME_LIMIT_EXCEEDED';
  if (/MEMORY LIMIT|内存|\bMLE\b/.test(text)) return 'MEMORY_LIMIT_EXCEEDED';
  if (/RUNTIME ERROR|运行错误|\bRE\b/.test(text)) return 'RUNTIME_ERROR';
  if (/COMPILE ERROR|编译错误|\bCE\b/.test(text)) return 'COMPILE_ERROR';
  if (/WAITING|JUDGING|COMPILING|RUNNING|评测|等待|编译|运行/.test(text)) return 'JUDGING';
  return '';
}

function normalizeLuoguVerdictStatus(text) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  var upper = text.toUpperCase();
  if (/ACCEPTED|答案正确|通过|(?:^|[^A-Z])AC(?:[^A-Z]|$)/i.test(text)) return 'ACCEPTED';
  if (/WRONG\s+ANSWER|答案错误|(?:^|[^A-Z])WA(?:[^A-Z]|$)/i.test(text)) return 'WRONG_ANSWER';
  if (/TIME\s+LIMIT\s+EXCEEDED|时间超限|超时|(?:^|[^A-Z])TLE(?:[^A-Z]|$)/i.test(text)) return 'TIME_LIMIT_EXCEEDED';
  if (/MEMORY\s+LIMIT\s+EXCEEDED|内存超限|超过内存|内存限制超出|(?:^|[^A-Z])MLE(?:[^A-Z]|$)/i.test(text)) return 'MEMORY_LIMIT_EXCEEDED';
  if (/RUNTIME\s+ERROR|运行错误|(?:^|[^A-Z])RE(?:[^A-Z]|$)/i.test(text)) return 'RUNTIME_ERROR';
  if (/COMPILE\s+ERROR|编译错误|(?:^|[^A-Z])CE(?:[^A-Z]|$)/i.test(text)) return 'COMPILE_ERROR';
  if (/WAITING|JUDGING|COMPILING|RUNNING|评测|等待|编译|运行/i.test(text) || /PENDING/.test(upper)) return 'JUDGING';
  return '';
}

function extractLuoguVerdictText() {
  var selectors = [
    '[class*="status"]',
    '[class*="result"]',
    '[class*="verdict"]',
    '[class*="judge"]',
    'td',
    'span',
    'div'
  ];
  var seen = [];
  var candidates = [];
  for (var i = 0; i < selectors.length; i++) {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(selectors[i]));
    for (var j = 0; j < nodes.length; j++) {
      if (seen.indexOf(nodes[j]) !== -1) continue;
      seen.push(nodes[j]);
      var itemText = visibleText(nodes[j]);
      if (!itemText || itemText.length > 120) continue;
      candidates.push(itemText);
    }
  }

  for (var k = 0; k < candidates.length; k++) {
    var terminal = normalizeLuoguVerdictStatus(candidates[k]);
    if (terminal && terminal !== 'JUDGING') return candidates[k];
  }
  for (var m = 0; m < candidates.length; m++) {
    if (normalizeLuoguVerdictStatus(candidates[m]) === 'JUDGING') return candidates[m];
  }
  return '';
}

function parseScore(text) {
  var m = String(text || '').match(/(?:得分|Score)?\s*(\d{1,3})\s*(?:分|pts|\/\s*100)?/i);
  if (!m) return undefined;
  var n = parseInt(m[1], 10);
  return n >= 0 && n <= 100 ? n : undefined;
}

function parseUsageMetrics(text) {
  text = String(text || '').replace(/\s+/g, ' ');
  var timeUsed;
  var memoryUsed;

  var timePatterns = [
    /(?:time|耗时|用时|时间)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)\s*(ms|毫秒|s|sec|second|seconds|秒)\b/i,
    /\b([0-9]+(?:\.[0-9]+)?)\s*(ms|毫秒)\b/i
  ];
  for (var i = 0; i < timePatterns.length; i++) {
    var tm = text.match(timePatterns[i]);
    if (tm) {
      var tv = Number(tm[1]);
      if (Number.isFinite(tv)) timeUsed = /^(s|sec|second|seconds|秒)$/i.test(tm[2]) ? Math.round(tv * 1000) : Math.round(tv);
      break;
    }
  }

  var memPatterns = [
    /(?:memory|内存|空间)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)\s*(kb|kib|mb|mib|gb|gib|b)\b/i,
    /\b([0-9]+(?:\.[0-9]+)?)\s*(kb|kib|mb|mib|gb|gib)\b/i
  ];
  for (var j = 0; j < memPatterns.length; j++) {
    var mm = text.match(memPatterns[j]);
    if (mm) {
      var mv = Number(mm[1]);
      var unit = String(mm[2] || '').toLowerCase();
      if (Number.isFinite(mv)) {
        if (unit === 'gb' || unit === 'gib') memoryUsed = Math.round(mv * 1024 * 1024);
        else if (unit === 'mb' || unit === 'mib') memoryUsed = Math.round(mv * 1024);
        else if (unit === 'b') memoryUsed = Math.round(mv / 1024);
        else memoryUsed = Math.round(mv);
      }
      break;
    }
  }

  return { timeUsed: timeUsed, memoryUsed: memoryUsed };
}

function parseRemoteId() {
  var m =
    location.href.match(/record\/(\d+)/i) ||
    location.href.match(/submission\/(\d+)/i) ||
    document.body.innerHTML.match(/record\/(\d+)/i);
  return m ? m[1] : '';
}

function reportId(id) {
  var st = loadState();
  if (!id || !st.submissionId || !st.token || !st.leaseNonce) return;
  if (st.reportedId === id) return;
  st.reportedId = id;
  saveState(st);
  apiRequest('POST', '/api/luogu-submit-helper/' + st.submissionId + '/report-id', {
    token: st.token,
    leaseNonce: st.leaseNonce,
    remoteSubmissionId: id
  }, function(err) {
    if (err) console.warn('[Luogu Helper] report-id failed:', err);
  });
}

function reportResult(status, rawText) {
  var st = loadState();
  if (!st.submissionId || !st.token || !st.leaseNonce) return;
  rawText = document.body.innerText || rawText || '';
  var rid = parseRemoteId() || st.reportedId || '';
  var score = parseScore(rawText);
  var metrics = parseUsageMetrics(rawText);
  if ((metrics.timeUsed === undefined || metrics.memoryUsed === undefined) && status !== 'REMOTE_ERROR') {
    st.metricWaits = (st.metricWaits || 0) + 1;
    saveState(st);
    if (st.metricWaits <= 8) {
      banner('已获得洛谷结果，等待时间/内存数据渲染...', '#3498db');
      setTimeout(function() { reportResult(status, document.body.innerText || rawText); }, 1500);
      return;
    }
  }
  apiRequest('POST', '/api/luogu-submit-helper/' + st.submissionId + '/report-result', {
    token: st.token,
    leaseNonce: st.leaseNonce,
    remoteSubmissionId: rid,
    status: status,
    score: score,
    timeUsed: metrics.timeUsed,
    memoryUsed: metrics.memoryUsed,
    rawStatus: rawText.slice(0, 500)
  }, function(err) {
    if (err) {
      banner('洛谷结果回传失败，稍后重试：' + err, '#f39c12');
      setTimeout(function() { reportResult(status, rawText); }, 3000);
      return;
    }
    clearState();
    banner('洛谷结果已回传 OJ，正在关闭标签页...', '#27ae60');
    setTimeout(function() {
      window.close();
      banner('结果已回到 OJ，可以关闭此页。', '#27ae60');
    }, 600);
  });
}

function watchResult() {
  var tries = 0;
  function tick() {
    tries++;
    var rid = parseRemoteId();
    if (rid) reportId(rid);

    var text = document.body.innerText || '';
    var verdictText = extractLuoguVerdictText();
    var status = normalizeLuoguVerdictStatus(verdictText || text);
    if (status && status !== 'JUDGING') {
      reportResult(status, verdictText ? (verdictText + '\n' + text) : text);
      return;
    }

    if (tries > 240) {
      reportResult('REMOTE_ERROR', 'Timeout waiting for Luogu result');
      return;
    }

    banner('等待洛谷评测结果...', '#3498db');
    setTimeout(tick, 2500);
  }
  setTimeout(tick, 1500);
}

function startSubmitFlow() {
  var pid = problemIdFromLocation();
  if (!pid) return;

  if (!isLoggedIn()) {
    banner('请先登录洛谷，然后刷新此页继续自动提交。', '#e74c3c');
    return;
  }

  ensureSubmitPanel();
  banner('正在从 OJ 获取洛谷提交任务...', '#3498db');

  apiRequest('GET', '/api/luogu-submit-helper/lookup?problemId=' + encodeURIComponent(pid), null, function(err, task) {
    if (err) {
      setTimeout(startSubmitFlow, 2500);
      return;
    }
    if (!task || !task.submissionId || !task.sourceCode || !task.token) {
      banner('OJ 没有返回完整洛谷提交任务。', '#e74c3c');
      return;
    }

    var st = loadState();
    if (st.submissionId !== task.submissionId || st.problemId !== pid) {
      st = {};
      clearState();
    }
    saveState({
      submissionId: task.submissionId,
      problemId: pid,
      token: task.token,
      leaseNonce: st.leaseNonce || '',
      submittedAt: st.submittedAt || 0,
      reportedId: st.reportedId || ''
    });

    apiRequest('POST', '/api/luogu-submit-helper/' + task.submissionId + '/lease', {
      token: task.token,
      leaseNonce: st.leaseNonce || undefined
    }, function(leaseErr, lease) {
      if (leaseErr) {
        banner('洛谷提交任务加锁失败：' + leaseErr, '#e74c3c');
        return;
      }
      var cur = loadState();
      cur.leaseNonce = lease.leaseNonce;
      saveState(cur);

      if (cur.submittedAt || gv(SUBMIT_ONCE_KEY_PREFIX + task.submissionId, '')) {
        banner('检测到已经提交过，继续等待洛谷结果...', '#3498db');
        watchResult();
        return;
      }

      var attempts = 0;
      function fillAndClick() {
        attempts++;
        ensureSubmitPanel();
        chooseLanguage(task.language);
        var codeOk = setCode(task.sourceCode);
        var button = findSubmitButton();
        if (!codeOk || !button) {
          if (attempts > 80) {
            banner('洛谷提交表单未就绪，请刷新洛谷页面重试。', '#e74c3c');
            return;
          }
          banner('等待洛谷提交表单加载...', '#3498db');
          setTimeout(fillAndClick, 1000);
          return;
        }

        cur = loadState();
        cur.submittedAt = Math.floor(Date.now() / 1000);
        saveState(cur);
        sv(SUBMIT_ONCE_KEY_PREFIX + task.submissionId, '1');
        banner('正在自动提交到洛谷...', '#3498db');
        setTimeout(function() {
          button.click();
          setTimeout(watchResult, 2500);
        }, 300);
      }
      fillAndClick();
    });
  });
}

if (/\/record\//i.test(location.pathname) || /\/submission\//i.test(location.pathname)) {
  watchResult();
  return;
}

if (/\/problem\//i.test(location.pathname)) {
  setTimeout(startSubmitFlow, 1200);
}

})();
