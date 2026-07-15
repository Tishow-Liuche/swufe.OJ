// ==UserScript==
// @name         OJ QOJ Statement Sync
// @namespace    https://oj.example.com
// @version      1.0
// @description  从 QOJ 题面页抓取题目并回传到本地 OJ
// @author       OJ Team
// @downloadURL  http://localhost:5173/qoj-sync.user.js
// @updateURL    http://localhost:5173/qoj-sync.user.js
// @match        https://qoj.ac/problem/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function () {
  'use strict';

  var API = 'http://localhost:3000';

  function text(sel, root) {
    var el = (root || document).querySelector(sel);
    return el ? el.textContent.trim() : '';
  }

  function html(sel, root) {
    var el = (root || document).querySelector(sel);
    return el ? el.innerHTML.trim() : '';
  }

  function banner(msg, color) {
    var box = document.getElementById('oj-qoj-sync-banner');
    if (!box) {
      box = document.createElement('div');
      box.id = 'oj-qoj-sync-banner';
      box.style.cssText = 'position:fixed;right:16px;top:16px;z-index:99999;padding:10px 14px;border-radius:8px;color:#fff;font:13px/1.4 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:360px';
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.style.background = color || '#2d8cf0';
  }

  function parseLimit(pattern, fallback) {
    var m = document.body.textContent.match(pattern);
    if (!m) return fallback;
    var n = Number(m[1]);
    if (!Number.isFinite(n)) return fallback;
    var unit = (m[2] || '').toLowerCase();
    if (unit === 's' || unit.indexOf('sec') === 0) return Math.round(n * 1000);
    if (unit === 'gb' || unit === 'gib') return Math.round(n * 1024);
    if (unit === 'kb' || unit === 'kib') return Math.max(1, Math.round(n / 1024));
    return Math.round(n);
  }

  function findStatement() {
    var selectors = ['.problem-statement', '#problem-statement', '.statement', '.card-body', 'main'];
    for (var i = 0; i < selectors.length; i++) {
      var nodes = Array.prototype.slice.call(document.querySelectorAll(selectors[i]));
      var found = nodes.find(function (el) { return el.textContent.trim().length > 80; });
      if (found) return found;
    }
    return document.body;
  }

  function sectionText(statement, name) {
    var hs = Array.prototype.slice.call(statement.querySelectorAll('h1,h2,h3,h4,strong,b'));
    var h = hs.find(function (el) { return el.textContent.trim().toLowerCase() === name.toLowerCase(); });
    if (!h) return '';
    var parts = [];
    var n = h.nextElementSibling;
    while (n && !/^H[1-4]$/.test(n.tagName)) {
      var t = n.textContent.trim();
      if (t) parts.push(t);
      n = n.nextElementSibling;
    }
    return parts.join('\n\n');
  }

  function samples(statement) {
    var result = [];
    Array.prototype.slice.call(statement.querySelectorAll('.sample,.sample-test')).forEach(function (s) {
      var pres = Array.prototype.slice.call(s.querySelectorAll('pre')).map(function (p) { return p.textContent.trim(); }).filter(Boolean);
      if (pres.length >= 2) result.push({ input: pres[0], output: pres[1] });
    });
    if (result.length) return result;
    var all = Array.prototype.slice.call(statement.querySelectorAll('pre')).map(function (p) { return p.textContent.trim(); }).filter(Boolean);
    for (var i = 0; i + 1 < all.length; i += 2) result.push({ input: all[i], output: all[i + 1] });
    return result;
  }

  function postJson(url, data) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'POST',
        url: url,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(data),
        onload: function (res) {
          if (res.status >= 200 && res.status < 300) resolve(JSON.parse(res.responseText || '{}'));
          else reject(new Error('HTTP ' + res.status + ': ' + res.responseText));
        },
        onerror: function () { reject(new Error('Network error')); },
      });
    });
  }

  async function sync() {
    var idMatch = location.pathname.match(/\/problem\/(\d+)/);
    if (!idMatch) return;
    var remoteId = idMatch[1];
    var statement = findStatement();
    var rawTitle = text('h1') || document.title.replace(/\s*-\s*QOJ.*$/i, '');
    var title = /^QOJ\s+\d+/.test(rawTitle) ? rawTitle : 'QOJ ' + remoteId + ' ' + rawTitle.replace(/^Problem\s+\d+\s*[-:：]?\s*/i, '');
    var tags = Array.prototype.slice.call(document.querySelectorAll('a[href*="tag="],a[href*="/tag/"]'))
      .map(function (a) { return a.textContent.trim(); })
      .filter(function (t, i, arr) { return t && t.length <= 40 && arr.indexOf(t) === i; });

    banner('OJ QOJ Sync: 正在回传 QOJ ' + remoteId + ' ...');
    var data = await postJson(API + '/api/sync/qoj-statement', {
      remoteId: remoteId,
      title: title,
      description: statement.innerHTML.trim(),
      inputFormat: sectionText(statement, 'Input'),
      outputFormat: sectionText(statement, 'Output'),
      samples: samples(statement),
      timeLimit: parseLimit(/Time\s*Limit\s*:?\s*([0-9.]+)\s*(ms|s|sec|second|seconds)/i, 1000),
      memoryLimit: parseLimit(/Memory\s*Limit\s*:?\s*([0-9.]+)\s*(MB|MiB|GB|GiB|KB|KiB)/i, 1024),
      tags: tags,
      sourceUrl: location.href,
    });
    banner('OJ QOJ Sync: QOJ ' + remoteId + (data.created ? ' 已创建' : ' 已更新'), '#19be6b');
  }

  setTimeout(function () {
    sync().catch(function (err) { banner('OJ QOJ Sync 失败: ' + err.message, '#ed4014'); });
  }, 800);
})();
