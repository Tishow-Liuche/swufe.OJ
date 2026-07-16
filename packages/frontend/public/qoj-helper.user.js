// ==UserScript==
// @name         OJ QOJ Helper
// @namespace    https://oj.example.com
// @version      2.3
// @description  Auto submit QOJ from SWUFE OJ and report result back
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

(function () {
  'use strict';

  var API = 'http://127.0.0.1:3000';
  var STATE_KEY = 'swufe_qoj_auto_state';
  var SUBMIT_ONCE_KEY_PREFIX = 'swufe_qoj_submit_once_';
  var SUBMIT_BUTTON_SELECTOR = '#button-submit-answer';
  var SUBMIT_PANEL_SELECTOR = '#tab-submit-answer, #submit-answer, #submit, .tab-pane[id*="submit"], [id*="submit-answer"]';
  var EDITOR_SELECTOR = '#input-answer_answer_editor, textarea[name="answer_answer"], textarea[name*="answer"][name*="editor"]';
  var LANGUAGE_SELECTOR = '#input-answer_answer_language, select[name="answer_answer_language"], select[name*="language"]';

  function gv(key, fallback) {
    return GM_getValue(key, fallback == null ? '' : fallback);
  }

  function sv(key, value) {
    GM_setValue(key, value);
  }

  function dv(key) {
    GM_deleteValue(key);
  }

  function loadState() {
    try {
      return JSON.parse(gv(STATE_KEY, '{}') || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveState(next) {
    sv(STATE_KEY, JSON.stringify(next || {}));
  }

  function clearState() {
    dv(STATE_KEY);
  }

  function banner(text, bg) {
    var old = document.getElementById('oj-qoj-helper-banner');
    if (old) old.remove();
    var node = document.createElement('div');
    node.id = 'oj-qoj-helper-banner';
    node.textContent = 'QOJ Helper: ' + text;
    node.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      'z-index:2147483647',
      'padding:12px 24px',
      'text-align:center',
      'font:15px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      'color:#fff',
      'background:' + (bg || '#2563eb'),
      'box-shadow:0 2px 14px rgba(0,0,0,.3)'
    ].join(';');
    document.body.appendChild(node);
  }

  function responseSnippet(res) {
    var raw = '';
    if (res && res.responseText != null) raw = res.responseText;
    else if (res && res.response != null) raw = res.response;
    try {
      if (raw && typeof raw === 'object') raw = JSON.stringify(raw);
    } catch (_) {
      raw = String(raw || '');
    }
    return String(raw || '')
      .replace(/\u0000/g, '')
      .replace(/^\uFEFF/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
  }

  function parseApiJson(res) {
    var raw;
    if (res && res.response && typeof res.response === 'object') return res.response;
    if (res && res.responseText != null) raw = res.responseText;
    else if (res && res.response != null) raw = res.response;
    else raw = '';

    var text = String(raw || '')
      .replace(/\u0000/g, '')
      .replace(/^\uFEFF/, '')
      .trim();
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch (_) {}

    var objectStart = text.indexOf('{');
    var objectEnd = text.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(text.slice(objectStart, objectEnd + 1));
      } catch (_) {}
    }

    var arrayStart = text.indexOf('[');
    var arrayEnd = text.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(text.slice(arrayStart, arrayEnd + 1));
      } catch (_) {}
    }

    throw new Error('Bad JSON response');
  }

  function responseContentType(res) {
    var headers = String((res && res.responseHeaders) || '');
    var match = headers.match(/^content-type:\s*(.+)$/im);
    return match ? match[1].trim() : '';
  }

  function apiRequest(method, url, data, cb) {
    GM_xmlhttpRequest({
      method: method,
      url: API + url,
      headers: { 'Content-Type': 'application/json' },
      data: data ? JSON.stringify(data) : undefined,
      responseType: 'text',
      timeout: 10000,
      onload: function (res) {
        var parsed;
        try {
          parsed = parseApiJson(res);
        } catch (_) {
          cb(
            'Bad JSON response (HTTP ' + res.status +
              ', content-type: ' + (responseContentType(res) || 'unknown') +
              ', body: ' + responseSnippet(res) + ')',
            null
          );
          return;
        }
        if (res.status >= 200 && res.status < 300) cb(null, parsed);
        else cb(parsed && parsed.message ? parsed.message : 'HTTP ' + res.status, null);
      },
      onerror: function () {
        cb('Network error', null);
      },
      ontimeout: function () {
        cb('Timeout', null);
      }
    });
  }

  function leaseQojTaskWithRetry(task, previousLeaseNonce, attemptsLeft, cb) {
    apiRequest('POST', '/api/qoj-submit-helper/' + task.submissionId + '/lease', {
      token: task.token,
      leaseNonce: previousLeaseNonce || undefined
    }, function (leaseErr, lease) {
      if (leaseErr && /Bad JSON response/i.test(String(leaseErr)) && attemptsLeft > 0) {
        banner('Lease response was not JSON; retrying lease...', '#f59e0b');
        setTimeout(function () {
          leaseQojTaskWithRetry(task, previousLeaseNonce, attemptsLeft - 1, cb);
        }, 800);
        return;
      }
      cb(leaseErr, lease);
    });
  }

  function problemIdFromLocation() {
    var match = location.pathname.match(/\/problem\/(\d+)/i);
    return match ? match[1] : '';
  }

  function currentPageRemoteId() {
    var match = location.href.match(/(?:submission|record)\/(\d+)/i);
    return match ? match[1] : '';
  }

  function visibleText(element) {
    return (element && (element.innerText || element.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(element) {
    if (!element) return false;
    var style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    var rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function clickElement(element) {
    if (!element) return false;
    try {
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch (_) {}
    element.focus && element.focus();
    try {
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
      element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
    } catch (_) {}
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    element.click();
    if (window.$) {
      try {
        window.$(element).trigger('click');
      } catch (_) {}
    }
    return true;
  }

  function hasVisibleCodeEditor() {
    var candidates = Array.prototype.slice.call(document.querySelectorAll(EDITOR_SELECTOR + ', textarea, .CodeMirror, .ace_editor'));
    for (var i = 0; i < candidates.length; i++) {
      if (isVisible(candidates[i])) return true;
    }
    return false;
  }

  function hasSubmitInterfaceReady() {
    return hasVisibleCodeEditor() || !!findBottomSubmitButton();
  }

  function isSubmitNavigationElement(element) {
    if (!element || element.matches && element.matches(SUBMIT_BUTTON_SELECTOR)) return false;
    var tag = String(element.tagName || '').toLowerCase();
    var type = String(element.getAttribute && element.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' || type === 'submit') return false;
    if (element.closest && element.closest('form') && !element.getAttribute('role') && !element.getAttribute('data-toggle') && !element.getAttribute('data-bs-toggle')) {
      return false;
    }

    var href = String(element.getAttribute && element.getAttribute('href') || '');
    var target = String(
      (element.getAttribute && (
        element.getAttribute('data-target') ||
        element.getAttribute('data-bs-target') ||
        element.getAttribute('aria-controls') ||
        element.getAttribute('data-tab')
      )) || ''
    );
    var text = visibleText(element) || String(element.value || '');
    return /tab-submit-answer|submit-answer|#submit|\/submit/i.test(href + ' ' + target) ||
      /^(Submit\s+Answer|Submit\s+Code|Submit\s+Solution|提交|提交答案|提交代码)$/i.test(text);
  }

  function findSubmitNavigationElements() {
    var selectors = [
      'a[href="#tab-submit-answer"]',
      'a[href="#submit-answer"]',
      'a[href="#submit"]',
      '[data-target="#tab-submit-answer"]',
      '[data-bs-target="#tab-submit-answer"]',
      '[aria-controls="tab-submit-answer"]',
      '[data-target*="submit"]',
      '[data-bs-target*="submit"]',
      '[aria-controls*="submit"]',
      'a[href*="submit"]',
      'button[role="tab"]',
      'a[role="tab"]',
      '.nav a',
      '.nav-tabs a',
      '.nav-pills a',
      '.tabs a',
      '.tabs button'
    ];
    var seen = [];
    var items = [];
    for (var i = 0; i < selectors.length; i++) {
      var nodes = Array.prototype.slice.call(document.querySelectorAll(selectors[i]));
      for (var j = 0; j < nodes.length; j++) {
        if (seen.indexOf(nodes[j]) !== -1) continue;
        seen.push(nodes[j]);
        if (isSubmitNavigationElement(nodes[j])) items.push(nodes[j]);
      }
    }
    return items;
  }

  function activateSubmitPanel(panel) {
    if (!panel || !panel.classList) return false;
    var siblings = panel.parentElement ? Array.prototype.slice.call(panel.parentElement.children || []) : [];
    for (var i = 0; i < siblings.length; i++) {
      if (siblings[i] !== panel && siblings[i].classList) {
        siblings[i].classList.remove('active');
        siblings[i].classList.remove('show');
        siblings[i].style.display = '';
      }
    }
    panel.classList.add('active');
    panel.classList.add('show');
    panel.style.display = 'block';
    return true;
  }

  function openSubmitInterface() {
    if (hasSubmitInterfaceReady()) return true;

    var navs = findSubmitNavigationElements();
    for (var i = 0; i < navs.length; i++) {
      var nav = navs[i];
      banner('Opening QOJ submit tab...', '#2563eb');
      try {
        if (window.bootstrap && window.bootstrap.Tab) {
          window.bootstrap.Tab.getOrCreateInstance(nav).show();
        }
      } catch (_) {}
      if (window.$) {
        try {
          window.$(nav).tab('show');
        } catch (_) {}
      }
      clickElement(nav);
      if (nav.classList) nav.classList.add('active');
      var target = nav.getAttribute('data-bs-target') || nav.getAttribute('data-target') || nav.getAttribute('href') || '';
      if (target && target.charAt(0) === '#') {
        try {
          activateSubmitPanel(document.querySelector(target));
        } catch (_) {}
      }
    }

    var panel = document.querySelector(SUBMIT_PANEL_SELECTOR);
    if (panel) activateSubmitPanel(panel);

    if (location.hash !== '#tab-submit-answer') {
      try {
        history.replaceState(null, document.title, location.pathname + location.search + '#tab-submit-answer');
      } catch (_) {
        location.hash = '#tab-submit-answer';
      }
    }

    return hasSubmitInterfaceReady();
  }

  function ensureSubmitPanel() {
    openSubmitInterface();
  }

  function submitPanelWasOpened() {
    if (hasSubmitInterfaceReady()) return true;
    var panel = document.querySelector(SUBMIT_PANEL_SELECTOR);
    if (panel && isVisible(panel)) {
      var controls = panel.querySelector && panel.querySelector(EDITOR_SELECTOR + ', textarea, ' + SUBMIT_BUTTON_SELECTOR + ', button, input[type="submit"]');
      return !!controls;
    }
    return false;
  }

  function codeLooksInserted(expected) {
    var expectedText = String(expected || '').trim();
    if (!expectedText) return false;

    var fields = Array.prototype.slice.call(document.querySelectorAll(EDITOR_SELECTOR + ', textarea'));
    for (var i = 0; i < fields.length; i++) {
      var actual = String(fields[i].value || fields[i].textContent || '').trim();
      if (actual === expectedText) return true;
    }

    var mirrors = Array.prototype.slice.call(document.querySelectorAll('.CodeMirror'));
    for (var j = 0; j < mirrors.length; j++) {
      var cm = mirrors[j].CodeMirror;
      if (cm && typeof cm.getValue === 'function' && String(cm.getValue() || '').trim() === expectedText) {
        return true;
      }
    }

    return false;
  }

  function setCode(code) {
    var wrote = false;

    var primaryFields = Array.prototype.slice.call(document.querySelectorAll(EDITOR_SELECTOR));
    var textareas = Array.prototype.slice.call(document.querySelectorAll('textarea'));
    var fields = primaryFields.concat(textareas.filter(function (field) {
      return primaryFields.indexOf(field) === -1;
    }));

    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (!field) continue;
      field.value = code;
      field.textContent = code;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.$) {
        try {
          window.$(field).val(code).trigger('input').trigger('change');
        } catch (_) {}
      }
      wrote = true;
    }

    var mirrors = Array.prototype.slice.call(document.querySelectorAll('.CodeMirror'));
    for (var j = 0; j < mirrors.length; j++) {
      var cm = mirrors[j].CodeMirror;
      if (cm && typeof cm.setValue === 'function') {
        cm.setValue(code);
        wrote = true;
      }
    }

    if (window.ace && typeof window.ace.edit === 'function') {
      var aceNodes = Array.prototype.slice.call(document.querySelectorAll('.ace_editor'));
      for (var k = 0; k < aceNodes.length; k++) {
        try {
          var editor = window.ace.edit(aceNodes[k]);
          editor.setValue(code, -1);
          wrote = true;
        } catch (_) {}
      }
    }

    return wrote && codeLooksInserted(code);
  }

  function chooseLanguage(lang) {
    var languageMap = {
      cpp: /C\+\+|G\+\+|Clang/i,
      c: /^C$|GCC/i,
      python: /Python|PyPy/i,
      java: /Java/i
    };
    var wanted = languageMap[lang] || languageMap.cpp;
    var selects = Array.prototype.slice.call(document.querySelectorAll(LANGUAGE_SELECTOR + ', select'));

    for (var i = 0; i < selects.length; i++) {
      var options = Array.prototype.slice.call(selects[i].options || []);
      for (var j = 0; j < options.length; j++) {
        if (wanted.test(options[j].textContent || '')) {
          selects[i].value = options[j].value;
          selects[i].dispatchEvent(new Event('change', { bubbles: true }));
          if (window.$) {
            try {
              window.$(selects[i]).val(options[j].value).trigger('change');
            } catch (_) {}
          }
          return true;
        }
      }
    }

    return false;
  }

  function findBottomSubmitButton() {
    var exact = document.querySelector(SUBMIT_BUTTON_SELECTOR);
    if (exact && isVisible(exact) && !exact.disabled) return exact;

    var controls = Array.prototype.slice.call(document.querySelectorAll(
      'form button, form input[type="submit"], form input[type="button"], button, input[type="submit"], input[type="button"]'
    ));
    var matches = controls.filter(function (control) {
      if (!isVisible(control) || control.disabled) return false;
      var text = visibleText(control) || control.value || '';
      return /^Submit$/i.test(text) || /Submit Code/i.test(text);
    });

    if (!matches.length) return null;
    matches.sort(function (a, b) {
      return b.getBoundingClientRect().top - a.getBoundingClientRect().top;
    });
    return matches[0];
  }

  function currentQojUsername() {
    var parts = String(document.body.innerText || '').split('\n').map(function (item) {
      return item.trim();
    }).filter(Boolean);
    for (var i = 1; i < parts.length; i++) {
      if (/^Logout$/i.test(parts[i])) return parts[i - 1];
    }
    return '';
  }

  function problemPattern(problemId) {
    var escaped = String(problemId || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|[^0-9])#\\s*' + escaped + '(?:\\.|\\s|\\t|$)');
  }

  function pageMatchesProblem(problemId, text) {
    if (!problemId) return true;
    return problemPattern(problemId).test(String(text || document.body.innerText || ''));
  }

  function findSubmissionLinkForProblem(problemId) {
    var rows = Array.prototype.slice.call(document.querySelectorAll('tr, .submission, .table-row'));
    var pattern = problemPattern(problemId);
    var username = currentQojUsername();

    for (var i = 0; i < rows.length; i++) {
      var text = visibleText(rows[i]);
      if (!pattern.test(text)) continue;
      if (username && text.indexOf(username) === -1) continue;
      var link = rows[i].querySelector && rows[i].querySelector('a[href*="/submission/"],a[href*="/record/"]');
      if (!link) continue;
      var href = link.href || link.getAttribute('href') || '';
      var match = href.match(/(?:submission|record)\/(\d+)/i);
      if (match) return { id: match[1], href: href };
    }

    return null;
  }

  function goToSubmissionsPage() {
    var links = Array.prototype.slice.call(document.querySelectorAll('a[href*="/submissions"]'));
    for (var i = 0; i < links.length; i++) {
      var href = links[i].href || links[i].getAttribute('href') || '';
      if (/submissions/i.test(href)) {
        location.href = href;
        return;
      }
    }
    location.href = 'https://qoj.ac/submissions';
  }

  function markSubmittedAndWatch(watchDelayMs) {
    var state = loadState();
    if (!state.submissionId) return;
    state.submittedAt = Math.floor(Date.now() / 1000);
    var markedSubmissionId = state.submissionId;
    var markedSubmittedAt = state.submittedAt;
    saveState(state);
    sv(SUBMIT_ONCE_KEY_PREFIX + state.submissionId, '1');
    setTimeout(function () {
      var latest = loadState();
      if (latest.submissionId !== markedSubmissionId || latest.submittedAt !== markedSubmittedAt) return;
      if (!currentPageRemoteId()) goToSubmissionsPage();
      else watchResult();
    }, watchDelayMs == null ? 2500 : watchDelayMs);
  }

  function noteSubmitAttempt() {
    var state = loadState();
    if (!state.submissionId) return {};
    state.submitAttempts = (Number(state.submitAttempts) || 0) + 1;
    state.lastSubmitAttemptAt = Math.floor(Date.now() / 1000);
    saveState(state);
    return state;
  }

  function retrySubmitIfStillOnProblem(beforeHref) {
    var state = loadState();
    if (!state.submissionId || !/\/problem\/\d+/i.test(location.pathname)) return false;
    if (location.href !== beforeHref || currentPageRemoteId()) return false;
    if ((Number(state.submitAttempts) || 0) >= 4) return false;

    state.submittedAt = 0;
    saveState(state);
    dv(SUBMIT_ONCE_KEY_PREFIX + state.submissionId);
    banner('Submit did not leave the problem page; retrying bottom Submit button...', '#f59e0b');
    setTimeout(startSubmitFlow, 1200);
    return true;
  }

  function submitWithBottomButton(button) {
    var form = button && button.closest && button.closest('form');
    var beforeHref = location.href;
    var attempt = noteSubmitAttempt();
    markSubmittedAndWatch(5600);
    banner('Clicking bottom Submit button... attempt ' + (attempt.submitAttempts || 1), '#2563eb');
    window.__swufeQojProgrammaticSubmitting = true;
    clickElement(button);
    setTimeout(function () {
      window.__swufeQojProgrammaticSubmitting = false;
    }, 2200);

    if (form) {
      setTimeout(function () {
        if (location.href !== beforeHref || currentPageRemoteId()) return;
        banner('Bottom button did not navigate; forcing form submit...', '#f59e0b');
        try {
          if (form.requestSubmit) form.requestSubmit(button);
          else form.submit();
        } catch (_) {}
      }, 1200);
    }

    setTimeout(function () {
      if (retrySubmitIfStillOnProblem(beforeHref)) return;
      if (location.href === beforeHref && /\/problem\/\d+/i.test(location.pathname) && !currentPageRemoteId()) {
        banner('Submit click stayed on problem page; opening submissions page to verify record...', '#f59e0b');
        goToSubmissionsPage();
      }
    }, 4200);
  }

  function installManualSubmitWatcher() {
    if (window.__swufeQojManualSubmitWatcher) return;
    window.__swufeQojManualSubmitWatcher = true;

    document.addEventListener('submit', function () {
      if (window.__swufeQojProgrammaticSubmitting) return;
      if (loadState().submissionId) markSubmittedAndWatch();
    }, true);

    document.addEventListener('click', function (event) {
      if (window.__swufeQojProgrammaticSubmitting) return;
      if (!loadState().submissionId) return;
      var target = event.target && event.target.closest && event.target.closest(SUBMIT_BUTTON_SELECTOR + ', button, input[type="submit"], input[type="button"]');
      if (!target) return;
      var text = visibleText(target) || target.value || '';
      if ((target.matches && target.matches(SUBMIT_BUTTON_SELECTOR)) || /^Submit$/i.test(text) || /Submit Code/i.test(text)) {
        markSubmittedAndWatch();
      }
    }, true);
  }

  function normalizeStatus(text) {
    var raw = String(text || '').toUpperCase();
    if (/WRONG ANSWER|\bWA\b/.test(raw)) return 'WRONG_ANSWER';
    if (/TIME LIMIT|\bTLE\b/.test(raw)) return 'TIME_LIMIT_EXCEEDED';
    if (/MEMORY LIMIT|\bMLE\b/.test(raw)) return 'MEMORY_LIMIT_EXCEEDED';
    if (/RUNTIME ERROR|\bRE\b/.test(raw)) return 'RUNTIME_ERROR';
    if (/COMPILE ERROR|\bCE\b/.test(raw)) return 'COMPILE_ERROR';
    if (/ACCEPTED|(?:^|[\s\t])AC(?:[\s\t]|$)|\b100\s*(?:PTS|POINTS)?\b/.test(raw)) return 'ACCEPTED';
    if (/WAITING|PENDING|JUDGING|COMPILING|RUNNING|QUEUED/.test(raw)) return 'JUDGING';
    return '';
  }

  function parseScore(text) {
    var match = String(text || '').match(/(?:Score)?\s*(\d{1,3})\s*(?:pts|points|\/\s*100)?/i);
    if (!match) return undefined;
    var score = parseInt(match[1], 10);
    return score >= 0 && score <= 100 ? score : undefined;
  }

  function parseUsageMetrics(text) {
    var raw = String(text || '').replace(/\s+/g, ' ');
    var timeUsed;
    var memoryUsed;
    var timeMatch = raw.match(/(?:time)?\s*:?\s*([0-9]+(?:\.[0-9]+)?)\s*(ms|s|sec|second|seconds)\b/i);
    if (timeMatch) {
      var timeNumber = Number(timeMatch[1]);
      if (Number.isFinite(timeNumber)) {
        timeUsed = /^(s|sec|second|seconds)$/i.test(timeMatch[2]) ? Math.round(timeNumber * 1000) : Math.round(timeNumber);
      }
    }

    var memoryMatch = raw.match(/(?:memory)?\s*:?\s*([0-9]+(?:\.[0-9]+)?)\s*(kb|kib|mb|mib|gb|gib|b)\b/i);
    if (memoryMatch) {
      var memoryNumber = Number(memoryMatch[1]);
      var unit = String(memoryMatch[2] || '').toLowerCase();
      if (Number.isFinite(memoryNumber)) {
        if (unit === 'gb' || unit === 'gib') memoryUsed = Math.round(memoryNumber * 1024 * 1024);
        else if (unit === 'mb' || unit === 'mib') memoryUsed = Math.round(memoryNumber * 1024);
        else if (unit === 'b') memoryUsed = Math.round(memoryNumber / 1024);
        else memoryUsed = Math.round(memoryNumber);
      }
    }

    return { timeUsed: timeUsed, memoryUsed: memoryUsed };
  }

  function reportId(id) {
    var state = loadState();
    if (!id || !state.submissionId || !state.token || !state.leaseNonce || state.reportedId === id) return;
    state.reportedId = id;
    saveState(state);

    apiRequest('POST', '/api/qoj-submit-helper/' + state.submissionId + '/report-id', {
      token: state.token,
      leaseNonce: state.leaseNonce,
      remoteSubmissionId: id
    }, function (err) {
      if (err) console.warn('[QOJ Helper] report-id failed:', err);
    });
  }

  function reportResult(status, rawText) {
    var state = loadState();
    if (!state.submissionId || !state.token || !state.leaseNonce) return;

    var remoteId = currentPageRemoteId() || state.reportedId || '';
    if (status !== 'REMOTE_ERROR' && !remoteId) {
      banner('No QOJ submission detail id found; refusing result report.', '#dc2626');
      return;
    }

    rawText = document.body.innerText || rawText || '';
    if (status !== 'REMOTE_ERROR' && !pageMatchesProblem(state.problemId, rawText)) {
      banner('Current QOJ result is not for target problem; relocating...', '#dc2626');
      goToSubmissionsPage();
      return;
    }

    var metrics = parseUsageMetrics(rawText);
    if ((metrics.timeUsed === undefined || metrics.memoryUsed === undefined) && status !== 'REMOTE_ERROR') {
      state.metricWaits = (state.metricWaits || 0) + 1;
      saveState(state);
      if (state.metricWaits <= 8) {
        banner('Result found; waiting for time and memory...', '#2563eb');
        setTimeout(function () {
          reportResult(status, document.body.innerText || rawText);
        }, 1500);
        return;
      }
    }

    apiRequest('POST', '/api/qoj-submit-helper/' + state.submissionId + '/report-result', {
      token: state.token,
      leaseNonce: state.leaseNonce,
      remoteSubmissionId: remoteId,
      status: status,
      score: parseScore(rawText),
      timeUsed: metrics.timeUsed,
      memoryUsed: metrics.memoryUsed,
      rawStatus: rawText.slice(0, 500)
    }, function (err) {
      if (err) {
        banner('Report failed; retrying: ' + err, '#f59e0b');
        setTimeout(function () {
          reportResult(status, rawText);
        }, 3000);
        return;
      }
      clearState();
      banner('Result reported to OJ; closing tab...', '#16a34a');
      setTimeout(function () {
        window.close();
        banner('Result reported. You can close this tab.', '#16a34a');
      }, 600);
    });
  }

  function watchResult() {
    var tries = 0;
    function tick() {
      tries++;
      var remoteId = currentPageRemoteId();
      if (remoteId) reportId(remoteId);

      if (!remoteId) {
        var state = loadState();
        var latest = findSubmissionLinkForProblem(state.problemId);
        if (latest && latest.href) {
          reportId(latest.id);
          banner('Opening QOJ submission detail...', '#2563eb');
          location.href = latest.href;
          return;
        }

        if (/\/problem\/\d+/i.test(location.pathname) && tries > 2) {
          banner('Submitted; opening QOJ submissions page...', '#2563eb');
          goToSubmissionsPage();
          return;
        }

        if (tries > 40) {
          reportResult('REMOTE_ERROR', 'QOJ submission id was not found after submit');
          return;
        }

        banner('Waiting for QOJ submission record...', '#2563eb');
        setTimeout(tick, 2500);
        return;
      }

      var text = document.body.innerText || '';
      var state2 = loadState();
      if (state2.problemId && !pageMatchesProblem(state2.problemId, text)) {
        banner('Submission problem mismatch; relocating...', '#f59e0b');
        goToSubmissionsPage();
        return;
      }

      var status = normalizeStatus(text);
      if (status && status !== 'JUDGING') {
        reportResult(status, text);
        return;
      }

      if (tries > 240) {
        reportResult('REMOTE_ERROR', 'Timeout waiting for QOJ result');
        return;
      }

      banner('Waiting for QOJ judge result...', '#2563eb');
      setTimeout(tick, 2500);
    }

    setTimeout(tick, 1500);
  }

  function startSubmitFlow() {
    var problemId = problemIdFromLocation();
    if (!problemId) return;

    banner('Fetching submit task from OJ...', '#2563eb');
    apiRequest('GET', '/api/qoj-submit-helper/lookup?problemId=' + encodeURIComponent(problemId), null, function (err, task) {
      if (err) {
        setTimeout(startSubmitFlow, 2500);
        return;
      }

      if (!task || !task.submissionId || !task.sourceCode || !task.token) {
        banner('OJ returned an incomplete QOJ task.', '#dc2626');
        return;
      }

      var previous = loadState();
      if (previous.submissionId !== task.submissionId || previous.problemId !== problemId) {
        previous = {};
        clearState();
      }

      saveState({
        submissionId: task.submissionId,
        problemId: problemId,
        token: task.token,
        leaseNonce: previous.leaseNonce || '',
        submittedAt: previous.submittedAt || 0,
        reportedId: previous.reportedId || '',
        submitAttempts: previous.submitAttempts || 0
      });
      installManualSubmitWatcher();

      leaseQojTaskWithRetry(task, previous.leaseNonce || '', 3, function (leaseErr, lease) {
        if (leaseErr) {
          banner('Failed to lease QOJ task: ' + leaseErr, '#dc2626');
          return;
        }

        var state = loadState();
        state.leaseNonce = lease.leaseNonce;
        saveState(state);

        if (state.submittedAt || gv(SUBMIT_ONCE_KEY_PREFIX + task.submissionId, '')) {
          banner('Task was submitted before; watching result...', '#2563eb');
          watchResult();
          return;
        }

        var attempts = 0;
        function fillAndSubmit() {
          attempts++;
          var submitPanelReady = openSubmitInterface();

          var codeReady = submitPanelReady && setCode(task.sourceCode);
          var languageReady = submitPanelReady && chooseLanguage(task.language);
          var button = submitPanelReady && findBottomSubmitButton();

          if (!submitPanelReady || !codeReady || !button) {
            if (attempts > 80) {
              banner(!submitPanelReady ? 'Submit tab did not open.' : (!codeReady ? 'Code field is not ready or code was not inserted.' : 'Bottom Submit button was not found.'), '#dc2626');
              return;
            }
            banner(!submitPanelReady ? 'Opening QOJ submit tab...' : (!codeReady ? 'Waiting for real QOJ code editor...' : 'Waiting for bottom Submit button...'), '#2563eb');
            setTimeout(fillAndSubmit, 1000);
            return;
          }

          banner((languageReady ? 'Code and language are ready.' : 'Code is ready; language selector not found, using QOJ default.') + ' Submitting with bottom Submit button...', '#16a34a');
          setTimeout(function () {
            submitWithBottomButton(button);
          }, 300);
        }

        fillAndSubmit();
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
