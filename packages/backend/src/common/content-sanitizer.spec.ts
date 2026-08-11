import { sanitizeProblemContent } from './content-sanitizer';

describe('sanitizeProblemContent', () => {
  it('removes executable tags, event handlers, and unsafe URL schemes from a statement', () => {
    const html = '<img src="https://example.com/a.png" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">bad</a><p class="note">safe</p>';

    const result = sanitizeProblemContent(html);

    expect(result).toContain('<img src="https://example.com/a.png" />');
    expect(result).toContain('<a>bad</a>');
    expect(result).toContain('<p class="note">safe</p>');
    expect(result).not.toMatch(/script|onerror|javascript:/i);
  });

  it('keeps same-site uploaded problem images while sanitizing unsafe attributes', () => {
    const html = '<p>插图</p><img src="/oj-testdata/problem-images/demo.png" alt="demo" onerror="alert(1)">';

    const result = sanitizeProblemContent(html);

    expect(result).toContain('<img src="/oj-testdata/problem-images/demo.png" alt="demo" />');
    expect(result).not.toMatch(/onerror|javascript:/i);
  });
});
