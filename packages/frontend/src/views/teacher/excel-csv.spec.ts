import { describe, expect, it } from 'vitest';
import { excelSafeFraction } from './excel-csv';

describe('excelSafeFraction', () => {
  it('wraps fractions so Excel will not treat them as dates', () => {
    expect(excelSafeFraction(1, 2)).toBe('="1/2"');
    expect(excelSafeFraction(0, 11)).toBe('="0/11"');
  });

  it('falls back to zeros for non-numeric input', () => {
    expect(excelSafeFraction(Number.NaN, Number.NaN)).toBe('="0/0"');
  });
});
