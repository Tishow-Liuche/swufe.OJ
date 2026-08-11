// ==UserScript==
// @name         SWUFE Singularity OJ - Codeforces Auto Submit Helper
// @namespace    https://oj.example.com
// @version      7.3
// @description  Auto fill code, auto submit to Codeforces, report SID back to SWUFE OJ, then close the helper tab.
// @author       OJ Team
// @match        https://codeforces.com/*
// @match        https://www.codeforces.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @connect      127.0.0.1
// @connect      localhost
// @connect      codeforces.com
// @connect      *
// @run-at       document-end
// @noframes
// ==/UserScript==

(function() {
'use strict';

var DEFAULT_API = 'http://127.0.0.1:3000';
var API_BASE_KEY = 'swufe_oj_api_base';
var API = resolveApiBase();
var HELPER_VERSION = '7.3';
var L = { cpp: '54', c: '43', python: '31', java: '60' };
var STATE_KEY = 'swufe_cf_auto_state';
var LOGIN_REQUIRED_KEY = 'swufe_cf_login_required_at';

function gv(k, d) { return GM_getValue(k, d != null ? d : 0); }
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
  if (st.submissionId || st.submittedAt || st.leaseNonce || st.stage) clearState();
  sv(LOGIN_REQUIRED_KEY, String(Date.now()));
}

function banner(text, bg) {
  var el = document.getElementById('cf-h');
  if (el) el.remove();
  if (!text) return;
  var d = document.createElement('div');
  d.id = 'cf-h';
  d.textContent = text;
  d.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:9999999;padding:12px 24px;' +
    'text-align:center;font:15px sans-serif;color:#fff;background:' + bg + ';' +
    'box-shadow:0 2px 14px rgba(0,0,0,.3);';
  document.body.appendChild(d);
}

function diagnostic(text) {
  console.log('[CF-Helper v' + HELPER_VERSION + '] ' + text);
  banner('SWUFE OJ Codeforces Helper v' + HELPER_VERSION + ': ' + text, '#3498db');
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
      } catch (e) {
        cb('Bad JSON response', null);
      }
    },
    onerror: function() { cb('Network error', null); },
    ontimeout: function() { cb('Timeout', null); }
  });
}

function getCfHandle() {
  var a = document.querySelector('a[href*="/profile/"]');
  if (a) {
    var m = a.getAttribute('href').match(/\/profile\/([^/?#]+)/);
    if (m) return m[1];
  }
  return null;
}

function isLoggedIn() {
  return !!(document.querySelector('a[href*="/profile/"]') ||
            document.querySelector('.header-bell__img'));
}

function parsePid(raw) {
  var m = String(raw || '').match(/^(\d+)([A-Z]\d*)$/i);
  if (!m) return null;
  return { contestId: parseInt(m[1], 10), index: m[2].toUpperCase() };
}

function pollCfApi(handle, cb) {
  GM_xmlhttpRequest({
    method: 'GET',
    url: 'https://codeforces.com/api/user.status?handle=' +
         encodeURIComponent(handle) + '&from=1&count=20',
    timeout: 10000,
    onload: function(r) {
      try {
        var d = JSON.parse(r.responseText);
        if (d.status === 'OK' && Array.isArray(d.result)) cb(null, d.result);
        else cb('CF API returned status=' + (d.status || '?'), null);
      } catch (e) {
        cb('JSON parse error', null);
      }
    },
    onerror: function() { cb('Network error', null); },
    ontimeout: function() { cb('Timeout', null); }
  });
}

function findSubmitFormElements() {
  var language = document.querySelector('select[name="programTypeId"]');
  var source =
    document.querySelector('textarea[name="source"]') ||
    document.querySelector('textarea#sourceCodeTextarea') ||
    document.querySelector('textarea.sourceCodeTextarea') ||
    document.querySelector('textarea');
  var submit =
    document.querySelector('input.submit[type="submit"]') ||
    document.querySelector('input[type="submit"][value="Submit"]') ||
    document.querySelector('input[type="submit"]') ||
    document.querySelector('button[type="submit"]');

  return { language: language, source: source, submit: submit };
}

function setSourceCode(textarea, sourceCode) {
  textarea.focus();
  textarea.value = sourceCode;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));

  if (window.CodeMirror) {
    var cms = document.querySelectorAll('.CodeMirror');
    for (var i = 0; i < cms.length; i++) {
      if (cms[i].CodeMirror && typeof cms[i].CodeMirror.setValue === 'function') {
        cms[i].CodeMirror.setValue(sourceCode);
        cms[i].CodeMirror.save && cms[i].CodeMirror.save();
      }
    }
  }
}

function parseStatusRows() {
  var rows = document.querySelectorAll('tr[data-submission-id], table.status-frame-datatable tr');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var sid = row.getAttribute('data-submission-id');
    if (!sid) {
      var idLink = row.querySelector('a[href*="/submission/"]');
      var idMatch = idLink && idLink.getAttribute('href').match(/\/submission\/(\d+)/);
      sid = idMatch ? idMatch[1] : '';
    }
    var problemLink = row.querySelector('a[href*="/problem/"], a[href*="/problemset/problem/"]');
    var href = problemLink && problemLink.getAttribute('href');
    var m = href && href.match(/\/(?:contest|problemset)\/(?:problem\/)?(\d+)\/([A-Z]\d*)/i);
    if (sid && m) {
      out.push({ sid: sid, problemId: m[1] + m[2].toUpperCase() });
    }
  }
  return out;
}

function fallbackReportFromStatusPage() {
  diagnostic('status page fallback scanning recent rows');
  var rows = parseStatusRows();
  if (!rows.length) {
    banner('OJ CF Helper ' + HELPER_VERSION + ' active — no status rows found yet', '#f39c12');
    setTimeout(fallbackReportFromStatusPage, 2500);
    return;
  }

  var idx = 0;
  function tryNext() {
    if (idx >= rows.length) {
      banner('OJ CF Helper ' + HELPER_VERSION + ' active — no matching pending OJ task for visible CF rows', '#f39c12');
      return;
    }
    var row = rows[idx++];
    apiRequest('GET', '/api/cf-submit-helper/lookup?problemId=' + encodeURIComponent(row.problemId), null, function(err, task) {
      if (err || !task || !task.submissionId) {
        tryNext();
        return;
      }
      saveState({
        stage: 'SID_FOUND',
        submissionId: task.submissionId,
        problemId: row.problemId,
        token: task.token || '',
        submittedAt: Math.floor(Date.now() / 1000),
        cfSubmissionId: String(row.sid)
      });
      apiRequest('POST', '/api/cf-submit-helper/' + task.submissionId + '/report-sid', {
        cfSubmissionId: String(row.sid)
      }, function(reportErr) {
        if (reportErr) {
          console.error('[CF-Helper] fallback report failed:', reportErr);
          banner('OJ CF Helper ' + HELPER_VERSION + ' active — fallback SID report failed: ' + reportErr, '#e74c3c');
          return;
        }
        clearState();
        banner('SID reported to OJ. Closing Codeforces tab...', '#27ae60');
        setTimeout(function() {
          window.close();
          banner('Result has been returned to OJ. You can safely close this tab.', '#27ae60');
        }, 500);
      });
    });
  }
  tryNext();
}

function reportSidAndClose(sid) {
  var st = loadState();
  if (!st.submissionId || !st.token || !st.leaseNonce) {
    banner('SID found, but OJ task state is missing. Keep this page open and retry from OJ.', '#e74c3c');
    return;
  }

  banner('Reporting SID ' + sid + ' to OJ...', '#27ae60');
  apiRequest('POST', '/api/cf-submit-helper/' + st.submissionId + '/report-sid', {
    token: st.token,
    leaseNonce: st.leaseNonce,
    cfSubmissionId: String(sid)
  }, function(err) {
    if (err) {
      console.error('[CF-Helper] report-sid failed:', err);
      banner('SID report failed. Retrying soon...', '#f39c12');
      setTimeout(function() { reportSidAndClose(sid); }, 3000);
      return;
    }

    clearState();
    banner('SID reported. Closing Codeforces tab...', '#27ae60');
    setTimeout(function() {
      window.close();
      banner('Result has been returned to OJ. You can safely close this tab.', '#27ae60');
    }, 500);
  });
}

function watchForOurSub() {
  var st = loadState();
  var ts = st.submittedAt;
  var pid = st.problemId;
  var now = Math.floor(Date.now() / 1000);

  if (!ts || ts < now - 900 || !pid) {
    banner('No active OJ submission state found on this Codeforces page.', '#f39c12');
    return;
  }

  var handle = getCfHandle();
  if (!handle) {
    banner('Could not detect your CF handle. Please log in, then refresh.', '#e74c3c');
    return;
  }

  var parsed = parsePid(pid);
  if (!parsed) {
    banner('Invalid CF problem id stored by OJ helper: ' + pid, '#e74c3c');
    return;
  }

  banner('Waiting for Codeforces SID...', '#3498db');

  var retries = 0;
  var maxRetries = 80;

  function tick() {
    if (retries++ > maxRetries) {
      banner('Timeout finding SID. Refresh this page to keep searching; no second submit will be made.', '#f39c12');
      return;
    }

    pollCfApi(handle, function(err, subs) {
      if (err || !subs) {
        console.error('[CF-Helper] CF API poll failed:', err || 'no data');
        setTimeout(tick, 2500);
        return;
      }

      for (var i = 0; i < subs.length; i++) {
        var x = subs[i];
        var ct = x.creationTimeSeconds || 0;
        var pcid = (x.problem && x.problem.contestId != null) ? x.problem.contestId : x.contestId;
        var pidx = (x.problem && x.problem.index) ? String(x.problem.index).toUpperCase() : '';

        if (
          pcid === parsed.contestId &&
          pidx === parsed.index &&
          ct >= ts - 10 &&
          ct <= ts + 600
        ) {
          saveState(Object.assign({}, loadState(), {
            stage: 'SID_FOUND',
            cfSubmissionId: String(x.id)
          }));
          reportSidAndClose(x.id);
          return;
        }
      }

      setTimeout(tick, 2500);
    });
  }

  setTimeout(tick, 2000);
}

function isActiveSubmittedState(st) {
  var now = Math.floor(Date.now() / 1000);
  return !!(
    st &&
    st.helperVersion === HELPER_VERSION &&
    st.submissionId &&
    st.problemId &&
    st.token &&
    st.leaseNonce &&
    st.submittedAt &&
    st.submittedAt >= now - 900
  );
}

var href = location.href;
diagnostic('loaded on ' + location.pathname);
var onStatusPage =
  /\/(problemset|contest\/\d+|gym\/\d+)\/status/.test(href) ||
  /\/my$/.test(href) ||
  /\/submissions\//.test(href);

if (onStatusPage) {
  if (isActiveSubmittedState(loadState())) watchForOurSub();
  else {
    clearState();
    banner('No active OJ submission state. Return to SWUFE OJ and submit again after logging in to Codeforces.', '#f39c12');
  }
  return;
}

var m = href.match(/\/submit\/(\d+)\/([A-Z]\d*)/i);
if (!m) return;

var problemId = m[1] + m[2].toUpperCase();
var formFilled = false;
var pollAttempts = 0;

function fillAndSubmit() {
  if (formFilled) return;
  pollAttempts++;

  if (pollAttempts > 200) {
    banner('Codeforces submit form did not become ready. Refresh to retry.', '#f39c12');
    return;
  }

  if (document.title.indexOf('Just a moment') !== -1 ||
      document.title.indexOf('请稍候') !== -1) {
    banner('Waiting for Codeforces verification...', '#3498db');
    setTimeout(fillAndSubmit, 2000);
    return;
  }

  if (!isLoggedIn()) {
    markLoginRequired();
    if (pollAttempts % 10 === 1) {
      banner('Please log into Codeforces first, then refresh this page.', '#e74c3c');
    }
    setTimeout(fillAndSubmit, 3000);
    return;
  }

  var els = findSubmitFormElements();
  var sl = els.language;
  var ar = els.source;
  var bn = els.submit;
  if (!sl || !ar || !bn) {
    if (pollAttempts % 5 === 1) {
      banner(
        'OJ CF Helper ' + HELPER_VERSION + ' active — waiting for CF form: lang=' + !!sl +
        ' source=' + !!ar + ' submit=' + !!bn,
        '#3498db'
      );
    }
    setTimeout(fillAndSubmit, 1200);
    return;
  }

  banner('Fetching code from OJ...', '#3498db');

  apiRequest('GET', '/api/cf-submit-helper/lookup?problemId=' + encodeURIComponent(problemId), null, function(err, d) {
    if (err) {
      console.error('[CF-Helper] Lookup failed:', err);
      setTimeout(fillAndSubmit, 3000);
      return;
    }
    if (!d || !d.sourceCode || !d.submissionId || !d.token) {
      banner('OJ helper lookup did not return a complete task.', '#e74c3c');
      return;
    }

    formFilled = true;

    sl.value = L[d.language] || '54';
    sl.dispatchEvent(new Event('change', { bubbles: true }));

    setSourceCode(ar, d.sourceCode);

    if (sl.value !== (L[d.language] || '54') || ar.value !== d.sourceCode) {
      banner('Codeforces form verification failed. Submit blocked.', '#e74c3c');
      return;
    }

    var existing = loadState();
    if (existing.submissionId !== d.submissionId || existing.problemId !== problemId) {
      existing = {};
      clearState();
    }
    var taskState = {
      stage: existing.stage || 'FILLED',
      submissionId: d.submissionId,
      problemId: problemId,
      token: d.token,
      helperVersion: HELPER_VERSION,
      submittedAt: existing.submittedAt || 0,
      leaseNonce: existing.leaseNonce || ''
    };
    saveState(taskState);

    apiRequest('POST', '/api/cf-submit-helper/' + d.submissionId + '/lease', {
      token: d.token,
      leaseNonce: taskState.leaseNonce || undefined
    }, function(leaseErr, lease) {
      if (leaseErr) {
        console.error('[CF-Helper] Lease failed:', leaseErr);
        banner('Could not acquire OJ submit lease: ' + leaseErr, '#e74c3c');
        return;
      }

      var current = loadState();
      current.leaseNonce = lease.leaseNonce;
      current.stage = current.submittedAt ? 'SUBMITTED' : 'LEASED';
      saveState(current);

      if (current.submittedAt) {
        banner('Submission already sent. Waiting for SID...', '#3498db');
        watchForOurSub();
        return;
      }

      current.submittedAt = Math.floor(Date.now() / 1000);
      current.stage = 'SUBMITTED';
      saveState(current);
      banner('Submitting to Codeforces automatically...', '#3498db');
      setTimeout(function() {
        if (bn.click) bn.click();
        else {
          var form = bn.closest && bn.closest('form');
          if (form) form.submit();
        }
      }, 300);
    });
  });
}

setTimeout(fillAndSubmit, 1500);

})();
