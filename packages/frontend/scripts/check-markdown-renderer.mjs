import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = path.join(root, 'node_modules', '.tmp', 'markdown-renderer-test');
const bundledFile = path.join(tempDir, 'markdown-renderer.mjs');

await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'utils', 'markdown.ts')],
  outfile: bundledFile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});

const { renderMarkdownWithMath } = await import(pathToFileURL(bundledFile).href);

const inline = renderMarkdownWithMath('矩阵大小为 $n \\times m$，区域为 $x \\times y$。');
assert.match(inline, /class="katex"/, 'inline formula should render with KaTeX');
assert.doesNotMatch(inline, /\$n \\times m\$/, 'raw inline math delimiters should not remain');

const spacedInline = renderMarkdownWithMath('在一个 $ n \\times m$ 的矩阵中，包含字母 $g$、$y$ 和 $a$。');
assert.match(spacedInline, /class="katex"/, 'inline formula with leading inner space should render');
assert.doesNotMatch(spacedInline, /\$ n \\times m\$/, 'spaced inline math delimiters should not remain');

const block = renderMarkdownWithMath('$$\na_i = b_i + c_i\n$$');
assert.match(block, /katex-display/, 'block formula should render in display mode');

const codeforcesInline = renderMarkdownWithMath('A group of $$$n$$$ spiders has $$$1$$$ plushie.');
assert.match(codeforcesInline, /class="katex"/, 'Codeforces triple-dollar inline formulas should render with KaTeX');
assert.doesNotMatch(codeforcesInline, /\$\$\$n\$\$\$/, 'raw Codeforces triple-dollar delimiters should not remain');

const escapedDelimiters = renderMarkdownWithMath('Let \\(a_i\\) be valid and \\[\\sum_{i=1}^{n} a_i\\] be displayed.');
assert.match(escapedDelimiters, /class="katex"/, 'escaped parenthesis and bracket math should render with KaTeX');
assert.match(escapedDelimiters, /katex-display/, 'escaped bracket math should render in display mode');
assert.doesNotMatch(escapedDelimiters, /\\\(a_i\\\)/, 'raw escaped inline delimiters should not remain');

const htmlEntityMath = renderMarkdownWithMath('Constraints: $$$1 &lt;= n &lt;= 10^5$$$.');
assert.match(htmlEntityMath, /class="katex"/, 'math containing HTML entities should render with KaTeX');
assert.doesNotMatch(htmlEntityMath, /math-fallback/, 'HTML entities inside formulas should not cause KaTeX fallback');
assert.doesNotMatch(htmlEntityMath, /\$\$\$1 &lt;= n &lt;= 10\^5\$\$\$/, 'raw HTML-entity formula should not remain');

const fenced = renderMarkdownWithMath('```text\n$x \\times y$\n```');
assert.match(fenced, /<pre><code/, 'fenced code block should remain a code block');
assert.doesNotMatch(fenced, /katex/, 'math inside fenced code should not be rendered');
assert.match(fenced, /\$x \\times y\$/, 'math text inside fenced code should be preserved');

console.log('markdown renderer checks passed');
