// ==UserScript==
// @name         SWUFE Singularity OJ - Luogu Auto Submit Helper
// @namespace    https://oj.example.com
// @version      1.8
// @description  Auto fill code, auto submit to Luogu, report result back to SWUFE OJ, then close the helper tab.
// @author       OJ Team
// @match        https://www.luogu.com.cn/*
// @match        https://luogu.com.cn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @connect      127.0.0.1
// @connect      localhost
// @connect      *
// @run-at       document-end
// @noframes
// ==/UserScript==

(function() {
'use strict';

var DEFAULT_API = 'http://127.0.0.1:3000';
var API_BASE_KEY = 'swufe_oj_api_base';
var API = resolveApiBase();
var HELPER_VERSION = '1.8';
var STATE_KEY = 'swufe_luogu_auto_state';
var SUBMIT_ONCE_KEY_PREFIX = 'swufe_luogu_submit_once_';
var LOGIN_REQUIRED_KEY = 'swufe_luogu_login_required_at';
var BLOCKED_REPORT_KEY_PREFIX = 'swufe_luogu_blocked_reported_';

function gv(k, d) { return GM_getValue(k, d != null ? d : ''); }
function sv(k, v) { GM_setValue(k, v); }
function dv(k) { GM_deleteValue(k); }

function normalizeApiBase(value) {
  var text = String(value || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(text) ? text : '';
}

function resolveApiBase() {
  var fromUrl = '';
  try {
    fromUrl = new URLSearchParams(location.search).get('swufeOjApi') || '';
  } catch (_) {}
  var normalized = normalizeApiBase(fromUrl);
  if (normalized) {
    sv(API_BASE_KEY, normalized);
    return normalized;
  }
  return normalizeApiBase(gv(API_BASE_KEY, '')) || DEFAULT_API;
}

function loadState() {
  try { return JSON.parse(gv(STATE_KEY, '{}') || '{}'); }
  catch (_) { return {}; }
}

function saveState(next) {
  var state = next || {};
  state.helperVersion = HELPER_VERSION;
  sv(STATE_KEY, JSON.stringify(state));
}

function clearState() {
  dv(STATE_KEY);
}

function markLoginRequired() {
  var st = loadState();
  if (st && st.submissionId) {
    st.stage = 'LOGIN_REQUIRED';
    saveState(st);
  }
  sv(LOGIN_REQUIRED_KEY, String(Date.now()));
}

function isActiveTaskState(st) {
  var now = Math.floor(Date.now() / 1000);
  return !!(
    st &&
    st.helperVersion === HELPER_VERSION &&
    st.submissionId &&
    st.problemId &&
    st.token &&
    st.leaseNonce &&
    st.submittedAt &&
    st.submittedAt >= now - 1800
  );
}

function isLaunchedFromSwufeOj() {
  try {
    return new URLSearchParams(location.search).has('swufeOjApi');
  } catch (_) {
    return false;
  }
}

function isLuoguResultTrackingPage() {
  return /\/record\//i.test(location.pathname) || /\/submission\//i.test(location.pathname);
}

function shouldActivateHelper() {
  var st = loadState();
  if (isLaunchedFromSwufeOj()) return true;
  return isLuoguResultTrackingPage() && isActiveTaskState(st);
}

function banner(text, bg) {
  var old = document.getElementById('oj-lg-helper-banner');
  if (old) old.remove();
  var d = document.createElement('div');
  d.id = 'oj-lg-helper-banner';
  d.textContent = text;
  d.style.cssText =
    'position:fixed;top:10px;right:12px;z-index:2147483647;max-width:min(520px,calc(100vw - 24px));' +
    'padding:8px 12px;border-radius:999px;pointer-events:none;opacity:.78;' +
    'text-align:left;font:13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#fff;background:' + bg + ';' +
    'box-shadow:0 6px 20px rgba(0,0,0,.22);backdrop-filter:blur(4px);';
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


function compactPageText() {
  return ((document.title || '') + '\n' + ((document.body && document.body.innerText) || '')).replace(/\s+/g, ' ').trim().slice(0, 500);
}

function isCaptchaOrVerificationPage() {
  var text = compactPageText();
  return /captcha|recaptcha|turnstile|verify|human|Cloudflare|Just a moment|验证码|人机验证|安全验证|滑动验证|请完成验证|请稍候/i.test(text) ||
    !!document.querySelector('iframe[src*="captcha"], iframe[src*="turnstile"], iframe[src*="recaptcha"], .g-recaptcha, .cf-turnstile');
}

function reportBlockedForTask(task, failureCode, failureMessage) {
  if (!task || !task.submissionId || !task.token) return;
  var key = BLOCKED_REPORT_KEY_PREFIX + task.submissionId + '_' + failureCode;
  if (gv(key, '')) return;
  sv(key, String(Date.now()));
  apiRequest('POST', '/api/luogu-submit-helper/' + task.submissionId + '/report-blocked', {
    token: task.token,
    leaseNonce: task.leaseNonce || undefined,
    failureCode: failureCode,
    failureMessage: failureMessage,
    rawStatus: compactPageText()
  }, function(err) {
    if (err) {
      console.warn('[Luogu Helper] report-blocked failed:', err);
      dv(key);
      return;
    }
    clearState();
    banner(failureMessage + ' 已回传到 SWUFE OJ。', '#e74c3c');
  });
}

function reportBlockedForProblem(pid, failureCode, failureMessage) {
  var st = loadState();
  if (st && st.submissionId && st.token) {
    reportBlockedForTask(st, failureCode, failureMessage);
    return;
  }
  apiRequest('GET', '/api/luogu-submit-helper/lookup?problemId=' + encodeURIComponent(pid), null, function(err, task) {
    if (!err && task && task.submissionId && task.token) {
      reportBlockedForTask(task, failureCode, failureMessage);
    }
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
  // The hash opens the panel. Never click arbitrary "Submit" text here:
  // it may already be the live form's submit button.
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

function languageFamily(text) {
  text = String(text || '').trim();
  if (/^(?:C\+\+|G\+\+)(?:\d+)?(?:\s|\(|$)/i.test(text)) return 'cpp';
  if (/^C(?:\d+)?(?:\s|\(|$)/i.test(text) && !/\+\+/.test(text)) return 'c';
  if (/^(?:Python|PyPy)(?:\d+(?:\.\d+)*)?(?:\s|\(|$)/i.test(text)) return 'python';
  if (/^Java(?:\d+)?(?:\s|\(|$)/i.test(text)) return 'java';
  return '';
}

function languageVisible(el) {
  return !!(el && el.isConnected && el.getClientRects().length &&
    getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden],[aria-hidden="true"]'));
}

function languageControls() {
  // Only actual controls, never arbitrary ancestors containing language names.
  return Array.prototype.slice.call(document.querySelectorAll('select,[role="combobox"],.lfe-select,.lang-select.combo-wrapper'))
    .filter(function(el) {
      if (!languageVisible(el) || el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
      if (el.tagName === 'SELECT') {
        return Array.prototype.some.call(el.options, function(o) { return !!languageFamily(o.textContent); });
      }
      return el.matches('.lang-select.combo-wrapper') || /语言|language/i.test(el.getAttribute('aria-label') || '') ||
        !!languageFamily(languageSelectionText(el));
    });
}

function languageSelectionText(control) {
  if (control.tagName === 'SELECT') return control.selectedOptions.length ? control.selectedOptions[0].textContent : '';
  if (control.matches('.lang-select.combo-wrapper')) return visibleText(control.querySelector('.text'));
  var selected = control.querySelector('.current,.selected,[aria-selected="true"],input');
  if (selected) return selected.value || visibleText(selected);
  // A combobox's own caption is authoritative only without an embedded menu.
  var clone = control.cloneNode(true);
  Array.prototype.forEach.call(clone.querySelectorAll('[role="listbox"],.dropdown,.options,ul'), function(menu) { menu.remove(); });
  return visibleText(clone);
}

function isLanguageSelected(lang) {
  var controls = languageControls();
  return controls.length === 1 && languageFamily(languageSelectionText(controls[0])) === lang;
}

function languageMenu(control) {
  var menuId = control.getAttribute('aria-controls') || control.getAttribute('aria-owns');
  if (menuId) return document.getElementById(menuId);
  if (control.matches('.lang-select.combo-wrapper')) {
    // Columba LCombo teleports its menu to #app. Match the component's Vue
    // scope attributes, never a hardcoded build hash or arbitrary page text.
    if (!control.classList.contains('shown') || document.querySelectorAll('.combo-wrapper.shown').length !== 1) return null;
    var scopes = control.getAttributeNames().filter(function(name) { return /^data-v-/.test(name); });
    var menus = Array.prototype.slice.call(document.querySelectorAll('#app > .dropdown')).filter(function(menu) {
      return languageVisible(menu) && scopes.some(function(scope) { return menu.hasAttribute(scope); });
    });
    return menus.length === 1 ? menus[0] : null;
  }
  return control.querySelector('[role="listbox"],.dropdown,.options,ul');
}

function chooseLanguage(lang) {
  if (['cpp', 'c', 'python', 'java'].indexOf(lang) === -1) return false;
  var controls = languageControls();
  if (controls.length !== 1) return false; // Ambiguous or changed page: fail closed.
  var control = controls[0];
  if (isLanguageSelected(lang)) return true;
  if (control.tagName === 'SELECT') {
    var option = Array.prototype.find.call(control.options, function(o) {
      return !o.disabled && !(o.parentElement && o.parentElement.disabled) && languageFamily(o.textContent) === lang;
    });
    if (!option) return false;
    control.value = option.value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return isLanguageSelected(lang);
  }
  var menu = languageMenu(control);
  if (!menu || !languageVisible(menu)) {
    if (!control.classList.contains('shown') && control.getAttribute('aria-expanded') !== 'true') control.click();
    menu = languageMenu(control);
  }
  if (!menu || !languageVisible(menu)) return false;
  var items = Array.prototype.slice.call(menu.querySelectorAll('[role="option"],li,.item'));
  var match = items.find(function(item) {
    return languageVisible(item) && item.getAttribute('aria-disabled') !== 'true' &&
      !item.classList.contains('disabled') && languageFamily(visibleText(item)) === lang;
  });
  if (match) match.click();
  return isLanguageSelected(lang);
}

function findSubmitButton() {
  var candidates = Array.prototype.slice.call(document.querySelectorAll('button,input[type="submit"],a[role="button"]'));
  var matches = [];
  for (var i = 0; i < candidates.length; i++) {
    var t = visibleText(candidates[i]) || candidates[i].value || '';
    if (languageVisible(candidates[i]) && !candidates[i].disabled && candidates[i].getAttribute('aria-disabled') !== 'true' &&
        /^(?:提交评测|Submit to Judge|提交|Submit)$/i.test(t)) matches.push(candidates[i]);
  }
  return matches.length === 1 ? matches[0] : null;
}

function normalizeStatus(text) {
  return normalizeLuoguVerdictStatus(text);
}

function normalizeLuoguVerdictStatus(text) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  if (/^(?:ACCEPTED|答案正确|通过|AC)$/i.test(text)) return 'ACCEPTED';
  if (/^(?:WRONG ANSWER|答案错误|WA)$/i.test(text)) return 'WRONG_ANSWER';
  if (/^(?:TIME LIMIT EXCEEDED|时间超限|超时|TLE)$/i.test(text)) return 'TIME_LIMIT_EXCEEDED';
  if (/^(?:MEMORY LIMIT EXCEEDED|内存超限|超过内存|内存限制超出|MLE)$/i.test(text)) return 'MEMORY_LIMIT_EXCEEDED';
  if (/^(?:RUNTIME ERROR|运行错误|RE)$/i.test(text)) return 'RUNTIME_ERROR';
  if (/^(?:COMPILE ERROR|COMPILATION ERROR|编译错误|CE)$/i.test(text)) return 'COMPILE_ERROR';
  if (/^(?:OUTPUT LIMIT EXCEEDED|UNKNOWN ERROR|INTERNAL ERROR|OLE|UKE)$/i.test(text)) return 'REMOTE_ERROR';
  if (/^(?:WAITING|JUDGING|COMPILING|RUNNING|PENDING|等待|评测中|编译中)$/i.test(text)) return 'JUDGING';
  return '';
}

// Verified against Luogu RecordShow (20260919-2271), not global page text.
function recordField(label) {
  var rows = Array.prototype.slice.call(document.querySelectorAll('.l-flex-info-row'));
  var matches = rows.filter(function(row) {
    return languageVisible(row) && row.children.length === 2 && visibleText(row.children[0]) === label;
  });
  return matches.length === 1 ? visibleText(matches[0].children[1]) : '';
}

function extractLuoguVerdictText() {
  return recordField('评测状态');
}

function readRecordResult() {
  var verdict = extractLuoguVerdictText();
  var status = normalizeLuoguVerdictStatus(verdict);
  var cases = Array.prototype.slice.call(document.querySelectorAll('.test-case .status'))
    .filter(languageVisible).map(visibleText);
  // Unaccepted is an aggregate failure, never Accepted. Only inspect this
  // record's testcase blocks to resolve its specific failure reason.
  if (/^Unaccepted$/i.test(verdict)) {
    for (var i = 0; i < cases.length; i++) {
      var failure = normalizeLuoguVerdictStatus(cases[i]);
      if (failure && failure !== 'ACCEPTED' && failure !== 'JUDGING') { status = failure; break; }
    }
  }
  var header = document.querySelector('.header-layout .top-row');
  var metrics = parseUsageMetrics(header ? visibleText(header) : '');
  var scoreText = recordField('评测分数');
  return {
    status: status, verdict: verdict,
    problemId: (recordField('所属题目').match(/^([A-Z]+\d+)\b/) || [])[1] || '',
    score: /^\d+(?:\.\d+)?$/.test(scoreText) ? Number(scoreText) : undefined,
    timeUsed: metrics.timeUsed, memoryUsed: metrics.memoryUsed,
    rawStatus: '评测状态\n' + verdict + '\n测试点状态\n' + cases.join(' ')
  };
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
  var m = location.pathname.match(/^\/(?:record|submission)\/(\d+)\/?$/i);
  return m ? m[1] : '';
}

function reportId(id) {
  if (!isActiveTaskState(loadState())) return;
  var st = loadState();
  if (!id || !st.submissionId || !st.token || !st.leaseNonce) return;
  if (st.reportedId === id) return;
  apiRequest('POST', '/api/luogu-submit-helper/' + st.submissionId + '/report-id', {
    token: st.token,
    leaseNonce: st.leaseNonce,
    remoteSubmissionId: id
  }, function(err) {
    if (err) console.warn('[Luogu Helper] report-id failed:', err);
    else {
      var current = loadState();
      if (current.submissionId === st.submissionId) { current.reportedId = id; saveState(current); }
    }
  });
}

function reportResult(status, rawText) {
  if (!isActiveTaskState(loadState())) return;
  var st = loadState();
  if (!st.submissionId || !st.token || !st.leaseNonce) return;
  var rid = parseRemoteId();
  if (!rid || st.reportedId !== rid) { setTimeout(watchResult, 2500); return; }
  var current = readRecordResult();
  if (status !== 'REMOTE_ERROR') {
    if (!current.status || current.status === 'JUDGING' || current.problemId !== st.problemId) {
      setTimeout(watchResult, 2500); return;
    }
    status = current.status;
    rawText = current.rawStatus;
  }
  var score = current.score;
  var metrics = current;
  if ((metrics.timeUsed === undefined || metrics.memoryUsed === undefined) && status !== 'REMOTE_ERROR') {
    st.metricWaits = (st.metricWaits || 0) + 1;
    saveState(st);
    if (st.metricWaits <= 8) {
      banner('已获得洛谷结果，等待时间/内存数据渲染...', '#3498db');
      setTimeout(function() { reportResult(status, rawText); }, 1500);
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

    var current = readRecordResult();
    var st = loadState();
    if (!isActiveTaskState(st)) return;
    if (rid && current.problemId === st.problemId) reportId(rid);
    if (current.status && current.status !== 'JUDGING' && current.problemId === st.problemId && st.reportedId === rid) {
      reportResult(current.status, current.rawStatus);
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

  if (isCaptchaOrVerificationPage()) {
    reportBlockedForProblem(pid, 'VERIFICATION_REQUIRED', '洛谷正在要求验证码或安全验证，自动提交已阻塞。');
    return;
  }

  if (!isLoggedIn()) {
    markLoginRequired();
    reportBlockedForProblem(pid, 'LOGIN_REQUIRED', '洛谷未登录，自动提交已停止。');
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
      helperVersion: HELPER_VERSION,
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
        var languageOk = chooseLanguage(task.language);
        var codeOk = setCode(task.sourceCode);
        var button = findSubmitButton();
        if (!languageOk || !codeOk || !button) {
          if (attempts > 80) {
            if (!languageOk) {
              reportBlockedForTask(loadState(), 'LANGUAGE_MISMATCH', '无法确认洛谷编译语言与 OJ 一致，已停止自动提交。');
              return;
            }
            reportBlockedForTask(loadState(), 'FORM_TIMEOUT', '洛谷提交表单、代码编辑器或提交按钮长时间未就绪。');
            banner('洛谷提交表单未就绪，请刷新洛谷页面重试。', '#e74c3c');
            return;
          }
          banner('等待洛谷提交表单加载...', '#3498db');
          setTimeout(fillAndClick, 1000);
          return;
        }

        banner('正在自动提交到洛谷...', '#3498db');
        setTimeout(function() {
          if (!isLanguageSelected(task.language)) {
            reportBlockedForTask(loadState(), 'LANGUAGE_MISMATCH', '洛谷编译语言在提交前发生变化，已停止自动提交。');
            return;
          }
          button = findSubmitButton();
          if (!button || button.disabled || !languageVisible(button)) {
            reportBlockedForTask(loadState(), 'FORM_TIMEOUT', '洛谷提交按钮未就绪，已停止自动提交。');
            return;
          }
          cur = loadState();
          cur.submittedAt = Math.floor(Date.now() / 1000);
          saveState(cur);
          sv(SUBMIT_ONCE_KEY_PREFIX + task.submissionId, '1');
          button.click();
          setTimeout(watchResult, 2500);
        }, 300);
      }
      fillAndClick();
    });
  });
}

if (!shouldActivateHelper()) return;

if (isLuoguResultTrackingPage()) {
  if (isActiveTaskState(loadState())) watchResult();
  else {
    clearState();
    banner('No active OJ Luogu submission state. Return to SWUFE OJ and submit again after logging in to Luogu.', '#f39c12');
  }
  return;
}

if (/\/problem\//i.test(location.pathname)) {
  setTimeout(startSubmitFlow, 1200);
}

})();
