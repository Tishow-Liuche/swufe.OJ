import { describe, expect, it } from 'vitest';
import { sanitizeStatementHtml } from './sanitize-statement';

describe('sanitizeStatementHtml', () => {
  it('removes script elements, event handlers, and javascript URLs before v-html rendering', () => {
    const result = sanitizeStatementHtml(
      '<img src="https://example.com/a.png" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">bad</a><p>safe</p>',
    );

    expect(result).toContain('<img src="https://example.com/a.png">');
    expect(result).toContain('<a>bad</a>');
    expect(result).toContain('<p>safe</p>');
    expect(result).not.toMatch(/script|onerror|javascript:/i);
  });
});
