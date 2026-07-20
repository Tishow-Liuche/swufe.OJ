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

const fenced = renderMarkdownWithMath('```text\n$x \\times y$\n```');
assert.match(fenced, /<pre><code/, 'fenced code block should remain a code block');
assert.doesNotMatch(fenced, /katex/, 'math inside fenced code should not be rendered');
assert.match(fenced, /\$x \\times y\$/, 'math text inside fenced code should be preserved');

console.log('markdown renderer checks passed');
