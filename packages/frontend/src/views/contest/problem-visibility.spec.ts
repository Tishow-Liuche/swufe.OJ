import { expect, it } from 'vitest';
import { hideContestHints } from './problem-visibility';
it('hides hints during contests and fails closed before state is available', () => {
  for (const state of [undefined, 'UPCOMING', 'RUNNING']) expect(hideContestHints('c1', state)).toBe(true);
  expect(hideContestHints('c1', 'ENDED')).toBe(false);
  expect(hideContestHints('', undefined)).toBe(false);
});
