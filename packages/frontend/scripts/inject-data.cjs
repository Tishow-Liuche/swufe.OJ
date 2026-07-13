const { execSync } = require('child_process');
const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const indexPath = join(__dirname, '..', 'dist', 'index.html');

// URL 必须加引号，否则 shell 会错误解析 ? 和 &
const url = '"http://127.0.0.1:3000/api/problems?pageSize=100"';
const cmd = `curl -s ${url}`;

let problems = [];
try {
  const result = execSync(cmd, { encoding: 'utf-8', timeout: 8000 }).trim();
  const data = JSON.parse(result);
  problems = data.items || [];
  console.log(`✅ 数据库返回 ${problems.length} 道题目`);
} catch (e) {
  console.log(`⚠️  后端未连接: ${e.message}`);
  console.log('   注入空数组');
}

const slim = problems.map(p => ({
  id: p.id,
  title: p.title,
  difficulty: p.difficulty,
  timeLimit: p.timeLimit,
  memoryLimit: p.memoryLimit,
  tags: p.tags || [],
}));

let html = readFileSync(indexPath, 'utf-8');
html = html.replace('</head>', `<script>window.__PROBLEMS__ = ${JSON.stringify(slim)};</script>\n</head>`);
writeFileSync(indexPath, html, 'utf-8');

const verify = readFileSync(indexPath, 'utf-8');
const count = (verify.match(/"title":"/g) || []).length;
console.log(`✅ index.html 已注入 ${count} 道题目`);
