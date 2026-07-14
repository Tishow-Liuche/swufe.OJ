import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAtCoderProblemPage } from './atcoder-metadata.parser';
import { AtCoderAdapterError } from './atcoder.types';
import { parseAtCoderProblemRef } from './atcoder-url';

const ref = parseAtCoderProblemRef('abc400/abc400_a');

describe('parseAtCoderProblemPage', () => {
  it('extracts only the minimum English metadata', () => {
    const metadata = parseAtCoderProblemPage(fixture('problem-en.html'), ref);
    expect(metadata).toMatchObject({
      title: 'ABC400 A - Sample Task',
      remoteProblemIndex: 'A',
      timeLimitMs: 2000,
      memoryLimitMb: 1024,
    });
  });

  it('supports Japanese limit labels and millisecond units', () => {
    const metadata = parseAtCoderProblemPage(
      fixture('problem-ja.html'),
      parseAtCoderProblemRef('abc400/abc400_b'),
    );
    expect(metadata.timeLimitMs).toBe(500);
    expect(metadata.memoryLimitMb).toBe(512);
    expect(metadata.remoteProblemIndex).toBe('B');
  });

  it('fails closed when required semantic fields are missing', () => {
    expect(() =>
      parseAtCoderProblemPage(fixture('problem-missing-limits.html'), ref),
    ).toThrow(AtCoderAdapterError);
  });
});

function fixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf8');
}
