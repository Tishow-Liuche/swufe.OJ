import { AtCoderAdapterError } from './atcoder.types';
import { parseAtCoderProblemRef } from './atcoder-url';

describe('parseAtCoderProblemRef', () => {
  it('normalizes an AtCoder task URL and removes query parameters', () => {
    expect(
      parseAtCoderProblemRef(
        'https://atcoder.jp/contests/ABC400/tasks/ABC400_A?lang=en',
      ),
    ).toEqual({
      contestScreenName: 'abc400',
      taskScreenName: 'abc400_a',
      remoteProblemId: 'abc400/abc400_a',
      remoteUrl: 'https://atcoder.jp/contests/abc400/tasks/abc400_a',
    });
  });

  it('accepts the canonical composite identifier', () => {
    expect(parseAtCoderProblemRef('abc400/abc400_a').remoteUrl).toBe(
      'https://atcoder.jp/contests/abc400/tasks/abc400_a',
    );
  });

  it.each([
    'http://atcoder.jp/contests/abc400/tasks/abc400_a',
    'https://evil.example/contests/abc400/tasks/abc400_a',
    'https://atcoder.jp/users/example',
    'https://atcoder.jp:444/contests/abc400/tasks/abc400_a',
    'abc400/../../users/example',
  ])('rejects an unsafe or unsupported URL: %s', (value) => {
    expect(() => parseAtCoderProblemRef(value)).toThrow(AtCoderAdapterError);
  });
});
