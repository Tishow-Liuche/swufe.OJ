import { normalizeLuoguStatus } from './luogu-task-lease.service';

describe('normalizeLuoguStatus', () => {
  it.each([
    ['AC', 'ACCEPTED'],
    ['Accepted', 'ACCEPTED'],
    ['WA', 'WRONG_ANSWER'],
    ['Wrong Answer', 'WRONG_ANSWER'],
    ['TLE', 'TIME_LIMIT_EXCEEDED'],
    ['Time Limit Exceeded', 'TIME_LIMIT_EXCEEDED'],
    ['MLE', 'MEMORY_LIMIT_EXCEEDED'],
    ['RE', 'RUNTIME_ERROR'],
    ['CE', 'COMPILE_ERROR'],
    ['Judging', 'JUDGING'],
    ['Waiting', 'QUEUING'],
  ])('maps %s to %s', (raw, expected) => {
    expect(normalizeLuoguStatus(raw)).toBe(expected);
  });

  it('maps unknown statuses to SYSTEM_ERROR', () => {
    expect(normalizeLuoguStatus('Something strange')).toBe('SYSTEM_ERROR');
  });
});
