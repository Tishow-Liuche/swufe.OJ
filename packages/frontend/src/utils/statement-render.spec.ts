import { expect, it } from 'vitest';
import { renderStatement } from './statement-render';

it('renders raw arrows and old escaped arrows without displaying entities', () => {
  const host = document.createElement('div');
  host.innerHTML = renderStatement('```\nH -> V -> H\n1 -&gt; 2\n```');
  expect(host.querySelector('code')?.textContent).toBe('H -> V -> H\n1 -> 2\n');
});
it('retains formulas and the statement tail while removing executable HTML', () => {
  const html = renderStatement('$$a_i<a_{i-1}$$\n\n完整尾部\n<img src="/x" onerror="alert(1)"><script>alert(2)</script>');
  expect(html).toContain('完整尾部');
  expect(html).toContain('katex');
  expect(html).not.toMatch(/onerror|<script/i);
});
