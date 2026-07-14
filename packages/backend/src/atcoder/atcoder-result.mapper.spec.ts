import { mapAtCoderVerdict } from './atcoder-result.mapper';

describe('mapAtCoderVerdict', () => {
  it.each([
    ['WJ', 'JUDGING', false],
    ['Judging 12 / 40', 'JUDGING', false],
    ['AC', 'ACCEPTED', true],
    ['WA', 'WRONG_ANSWER', true],
    ['TLE', 'TIME_LIMIT_EXCEEDED', true],
    ['MLE', 'MEMORY_LIMIT_EXCEEDED', true],
    ['RE', 'RUNTIME_ERROR', true],
    ['CE', 'COMPILE_ERROR', true],
    ['OLE', 'OUTPUT_LIMIT_EXCEEDED', true],
  ])('maps %s to %s', (rawStatus, status, terminal) => {
    expect(mapAtCoderVerdict(rawStatus)).toMatchObject({ status, terminal });
  });

  it('returns null for an unknown status so callers can stop parsing', () => {
    expect(mapAtCoderVerdict('NEW_REMOTE_STATUS')).toBeNull();
  });
});
