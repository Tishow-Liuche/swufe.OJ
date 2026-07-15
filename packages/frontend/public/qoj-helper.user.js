// ==UserScript==
// @name         OJ QOJ Helper
// @namespace    https://oj.example.com
// @version      1.3
// @description  自动填表 + 自动提交 + 回传 QOJ 结果 + 自动关闭 QOJ 标签页
// @author       OJ Team
// @downloadURL  http://localhost:5173/qoj-helper.user.js
// @updateURL    http://localhost:5173/qoj-helper.user.js
// @match        https://qoj.ac/*
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
var STATE_KEY = 'swufe_qoj_auto_state';
var SUBMIT_ONCE_KEY_PREFIX = 'swufe_qoj_submit_once_';

function gv(k, d) { return GM_getValue(k, d != null ? d : ''); }
function sv(k, v) { GM_setValue(k, v); }
function dv(k) { GM_deleteValue(k); }
function loadState() { try { return JSON.parse(gv(STATE_KEY, '{}') || '{}'); } catch (_) { return {}; } }
function saveState(next) { sv(STATE_KEY, JSON.stringify(next || {})); }
function clearState() { dv(STATE_KEY); }

function banner(text, bg) {
  var old = document.getElementById('oj-qoj-helper-banner');
  if (old) old.remove();
  var d = document.createElement('div');
  d.id = 'oj-qoj-helper-banner';
  d.textContent = text;
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:12px 24px;text-align:center;font:15px sans-serif;color:#fff;background:' + bg + ';box-shadow:0 2px 14px rgba(0,0,0,.3);';
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
      } catch (_) { cb('Bad JSON response', null); }
    },
    onerror: function() { cb('Network error', null); },
    ontimeout: function() { cb('Timeout', null); }
  });
}

function problemIdFromLocation() {
  var m = location.pathname.match(/\/problem\/(\d+)/i);
  return m ? m[1] : '';
}

function visibleText(el) {
  return (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
}

function clickByText(patterns) {
  var els = Array.prototype.slice.call(document.querySelectorAll('a,button,input[type="button"],input[type="submit"]'));
  for (var i = 0; i < els.length; i++) {
    var t = visibleText(els[i]) || els[i].value || '';
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
  clickByText([/^Submit$/i, /Submit Code/i, /提交/]);
  if (!/submit/i.test(location.href)) {
    var links = Array.prototype.slice.call(document.querySelectorAll('a[href*="submit"]'));
    if (links[0]) links[0].click();
  }
}

function findCodeEditors() {
  var fields = Array.prototype.slice.call(document.querySelectorAll('textarea, [contenteditable="true"], .cm-content, .monaco-editor textarea'));
  return fields.filter(function(el) {
    return isVisible(el);
  });
}

function isVisible(el) {
  if (!el) return false;
  var style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  var rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function closestSubmitForm() {
  var submit = findSubmitButton();
  if (submit) {
    var form = submit.closest && submit.closest('form');
    if (form) return form;
    var panel = submit.closest && submit.closest('.card, .panel, .box, .submit, [class*="submit"], [id*="submit"]');
    if (panel) return panel;
  }
  return document;
}

function hasMultiFileForm() {
  var root = closestSubmitForm();
  var fileInputs = Array.prototype.slice.call(root.querySelectorAll('input[type="file"]')).filter(isVisible);
  var sourceFields = Array.prototype.slice.call(root.querySelectorAll(
    'textarea[name*="code" i], textarea[name*="source" i], textarea[id*="code" i], textarea[id*="source" i], [contenteditable="true"], .cm-content, .monaco-editor textarea'
  )).filter(isVisible);

  // 普通 QOJ 题通常没有文件上传，或最多只有一个源码入口。
  // 只在提交表单本身出现多个真实可见文件/源码入口时拦截。
  return fileInputs.length > 1 || sourceFields.length > 1;
}

function setCode(code) {
  var editors = findCodeEditors();
  if (!editors.length) return false;
  var textarea = editors[0];
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
  clickByText([/Language/i, /语言/]);
  var items = Array.prototype.slice.call(document.querySelectorAll('li,div,span,button,a'));
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
    if (/^Submit$|Submit Code|提交/i.test(t) && !/Status|Statistics|Clarification/i.test(t)) return candidates[i];
  }
  return null;
}

function normalizeStatus(text) {
  text = String(text || '').toUpperCase();
  if (/ACCEPTED|\bAC\b/.test(text)) return 'ACCEPTED';
  if (/WRONG ANSWER|\bWA\b/.test(text)) return 'WRONG_ANSWER';
  if (/TIME LIMIT|\bTLE\b/.test(text)) return 'TIME_LIMIT_EXCEEDED';
  if (/MEMORY LIMIT|\bMLE\b/.test(text)) return 'MEMORY_LIMIT_EXCEEDED';
  if (/RUNTIME ERROR|\bRE\b/.test(text)) return 'RUNTIME_ERROR';
  if (/COMPILE ERROR|\bCE\b/.test(text)) return 'COMPILE_ERROR';
  if (/WAITING|PENDING|JUDGING|COMPILING|RUNNING|QUEUED/.test(text)) return 'JUDGING';
  return '';
}

function parseScore(text) {
  var m = String(text || '').match(/(?:Score|得分)?\s*(\d{1,3})\s*(?:pts|points|\/\s*100)?/i);
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
  var m = location.href.match(/submission\/(\d+)/i) || location.href.match(/record\/(\d+)/i) || document.body.innerHTML.match(/submission\/(\d+)/i);
  return m ? m[1] : '';
}

function reportId(id) {
  var st = loadState();
  if (!id || !st.submissionId || !st.token || !st.leaseNonce || st.reportedId === id) return;
  st.reportedId = id;
  saveState(st);
  apiRequest('POST', '/api/qoj-submit-helper/' + st.submissionId + '/report-id', {
    token: st.token,
    leaseNonce: st.leaseNonce,
    remoteSubmissionId: id
  }, function(err) {
    if (err) console.warn('[QOJ Helper] report-id failed:', err);
  });
}

function reportResult(status, rawText) {
  var st = loadState();
  if (!st.submissionId || !st.token || !st.leaseNonce) return;
  rawText = document.body.innerText || rawText || '';
  var rid = parseRemoteId() || st.reportedId || '';
  var metrics = parseUsageMetrics(rawText);
  if ((metrics.timeUsed === undefined || metrics.memoryUsed === undefined) && status !== 'REMOTE_ERROR') {
    st.metricWaits = (st.metricWaits || 0) + 1;
    saveState(st);
    if (st.metricWaits <= 8) {
      banner('已获得 QOJ 结果，等待时间/内存数据渲染...', '#3498db');
      setTimeout(function() { reportResult(status, document.body.innerText || rawText); }, 1500);
      return;
    }
  }
  apiRequest('POST', '/api/qoj-submit-helper/' + st.submissionId + '/report-result', {
    token: st.token,
    leaseNonce: st.leaseNonce,
    remoteSubmissionId: rid,
    status: status,
    score: parseScore(rawText),
    timeUsed: metrics.timeUsed,
    memoryUsed: metrics.memoryUsed,
    rawStatus: rawText.slice(0, 500)
  }, function(err) {
    if (err) {
      banner('QOJ 结果回传失败，稍后重试：' + err, '#f39c12');
      setTimeout(function() { reportResult(status, rawText); }, 3000);
      return;
    }
    clearState();
    banner('QOJ 结果已回传 OJ，正在关闭标签页...', '#27ae60');
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
    var status = normalizeStatus(text);
    if (status && status !== 'JUDGING') {
      reportResult(status, text);
      return;
    }
    if (tries > 240) {
      reportResult('REMOTE_ERROR', 'Timeout waiting for QOJ result');
      return;
    }
    banner('等待 QOJ 评测结果...', '#3498db');
    setTimeout(tick, 2500);
  }
  setTimeout(tick, 1500);
}

function startSubmitFlow() {
  var pid = problemIdFromLocation();
  if (!pid) return;
  banner('正在从 OJ 获取 QOJ 提交任务...', '#3498db');

  apiRequest('GET', '/api/qoj-submit-helper/lookup?problemId=' + encodeURIComponent(pid), null, function(err, task) {
    if (err) {
      setTimeout(startSubmitFlow, 2500);
      return;
    }
    if (!task || !task.submissionId || !task.sourceCode || !task.token) {
      banner('OJ 没有返回完整 QOJ 提交任务。', '#e74c3c');
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
    apiRequest('POST', '/api/qoj-submit-helper/' + task.submissionId + '/lease', {
      token: task.token,
      leaseNonce: st.leaseNonce || undefined
    }, function(leaseErr, lease) {
      if (leaseErr) {
        banner('QOJ 提交任务加锁失败：' + leaseErr, '#e74c3c');
        return;
      }
      var cur = loadState();
      cur.leaseNonce = lease.leaseNonce;
      saveState(cur);
      if (cur.submittedAt || gv(SUBMIT_ONCE_KEY_PREFIX + task.submissionId, '')) {
        banner('检测到已经提交过，继续等待 QOJ 结果...', '#3498db');
        watchResult();
        return;
      }
      var attempts = 0;
      function fillAndClick() {
        attempts++;
        ensureSubmitPanel();
        if (hasMultiFileForm()) {
          banner('该 QOJ 提交表单疑似多文件/多源码入口，暂不自动提交，避免错误提交。', '#e74c3c');
          return;
        }        chooseLanguage(task.language);
        var codeOk = setCode(task.sourceCode);
        var button = findSubmitButton();
        if (!codeOk || !button) {
          if (attempts > 80) {
            banner('QOJ 提交表单未就绪，请确认已登录 QOJ 或刷新页面重试。', '#e74c3c');
            return;
          }
          banner('等待 QOJ 提交表单加载...', '#3498db');
          setTimeout(fillAndClick, 1000);
          return;
        }
        cur = loadState();
        cur.submittedAt = Math.floor(Date.now() / 1000);
        saveState(cur);
        sv(SUBMIT_ONCE_KEY_PREFIX + task.submissionId, '1');
        banner('正在自动提交到 QOJ...', '#3498db');
        setTimeout(function() {
          button.click();
          setTimeout(watchResult, 2500);
        }, 300);
      }
      fillAndClick();
    });
  });
}

if (/\/submission\//i.test(location.pathname) || /\/record\//i.test(location.pathname) || /\/submissions/i.test(location.pathname)) {
  watchResult();
  return;
}
if (/\/problem\/\d+/i.test(location.pathname)) {
  setTimeout(startSubmitFlow, 1200);
}

})();
