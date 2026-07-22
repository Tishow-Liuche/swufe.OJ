import { describe, expect, it } from 'vitest';
import { isCurrentPageSelected, setCurrentPageSelected, toggleProblem } from './assignment-selection';

type Problem = { id: string; title: string };

const a = { id: 'a', title: 'A' };
const b = { id: 'b', title: 'B' };
const c = { id: 'c', title: 'C' };

describe('assignment selection', () => {
  it('adds and removes one problem without duplicating it', () => {
    expect(toggleProblem<Problem>([], a)).toEqual([a]);
    expect(toggleProblem([a], a)).toEqual([]);
  });

  it('selects and clears only the current page while retaining other pages', () => {
    expect(setCurrentPageSelected([c], [a, b], true)).toEqual([c, a, b]);
    expect(setCurrentPageSelected([c, a, b], [a, b], false)).toEqual([c]);
  });

  it('recognizes complete current-page selection without counting other pages', () => {
    expect(isCurrentPageSelected([c, a, b], [a, b])).toBe(true);
    expect(isCurrentPageSelected([c, a], [a, b])).toBe(false);
    expect(isCurrentPageSelected([c], [])).toBe(false);
  });
});
