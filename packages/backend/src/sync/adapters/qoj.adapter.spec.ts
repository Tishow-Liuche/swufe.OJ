import { parseQojProblemList, parseQojProblemPage } from './qoj.adapter';

describe('QojAdapter parsers', () => {
  it('extracts problem ids from a QOJ problem list table', () => {
    const html = `
      <table class="table table-hover">
        <tbody>
          <tr>
            <td><a href="/problem/9237">9237</a></td>
            <td><a href="/problem/9237">ICPC World Finals</a></td>
          </tr>
          <tr>
            <td><a href="/problem/1">1</a></td>
            <td><a href="/problem/1">A+B Problem</a></td>
          </tr>
        </tbody>
      </table>
      <ul class="pagination"><li><a href="/problems?page=164">164</a></li></ul>
    `;

    expect(parseQojProblemList(html)).toEqual({
      items: [{ remoteId: '9237' }, { remoteId: '1' }],
      total: 164 * 50,
    });
  });

  it('extracts title, limits, statement, samples and tags from a QOJ problem page', () => {
    const html = `
      <html>
        <head><title>QOJ Problem 1 - A+B Problem</title></head>
        <body>
          <h1>A+B Problem</h1>
          <div class="card">
            <div class="card-header">Statement</div>
            <div class="card-body problem-statement">
              <p>Given two integers <span class="tex-font-style-bf">a</span> and b, output their sum.</p>
              <h3>Input</h3><p>Two integers.</p>
              <h3>Output</h3><p>The sum.</p>
              <h3>Example</h3>
              <pre>1 2</pre>
              <pre>3</pre>
            </div>
          </div>
          <div>Time Limit: 1 s</div>
          <div>Memory Limit: 512 MB</div>
          <a href="/problems?tag=math">math</a>
          <a href="/problems?tag=implementation">implementation</a>
        </body>
      </html>
    `;

    const problem = parseQojProblemPage('1', html);

    expect(problem?.remoteId).toBe('1');
    expect(problem?.title).toBe('QOJ 1 A+B Problem');
    expect(problem?.timeLimit).toBe(1000);
    expect(problem?.memoryLimit).toBe(512);
    expect(problem?.tags).toEqual(['math', 'implementation']);
    expect(problem?.description).toContain('Given two integers');
    expect(problem?.inputFormat).toContain('Two integers.');
    expect(problem?.outputFormat).toContain('The sum.');
    expect(problem?.samples).toEqual([{ input: '1 2', output: '3' }]);
  });
});
