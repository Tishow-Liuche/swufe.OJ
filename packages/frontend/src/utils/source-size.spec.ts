import { expect, it } from 'vitest';
import { sourceSizeError } from './source-size';
it('allows 100000 typical lines and exactly 4 MiB', () => {
  expect(sourceSizeError('int value; // test line\n'.repeat(100000))).toBe('');
  expect(sourceSizeError('x'.repeat(4 * 1024 * 1024))).toBe('');
});
it('counts UTF8 bytes and gives the source-size limit', () => {
  expect(sourceSizeError('汉'.repeat(2 * 1024 * 1024))).toContain('4 MiB');
});
