import { describe, expect, it } from 'vitest';
import { nextContestTransition, verdictClass, canViewFeed, canManageContest } from './contest';
describe('contest presentation', () => {
  it('allows campus teacher observation without management privileges',()=>{
    const contest:any={visibility:'CAMPUS_PRIVATE',createdBy:'owner'};const teacher={id:'teacher',role:'TEACHER'};
    expect(canViewFeed(contest,teacher)).toBe(true);expect(canManageContest(contest,teacher)).toBe(false);
    expect(canViewFeed({...contest,visibility:'PRIVATE'},teacher)).toBe(false);
    expect(canViewFeed(contest,{id:'student',role:'STUDENT'})).toBe(false);
  });
  it('schedules future registration and contest boundaries including virtual time', () => {
    const now = Date.parse('2026-09-19T10:00:00Z');
    const contest = { registerEnd: '2026-09-19T10:02:00Z', startTime: '2026-09-19T09:00:00Z', endTime: '2026-09-19T11:00:00Z' };
    expect(nextContestTransition(contest, now)).toBe(120250);
    expect(nextContestTransition({ ...contest, participant: { virtualEnd: '2026-09-19T10:01:00Z' } }, now)).toBe(60250);
    expect(nextContestTransition(contest, now + 7200000)).toBeNull();
  });
  it('preserves accepted, failed, pending and system-error distinctions', () => {
    expect(verdictClass('ACCEPTED')).toBe('accepted');
    expect(verdictClass('WRONG_ANSWER')).toBe('wrong');
    expect(verdictClass('JUDGING')).toBe('pending');
    expect(verdictClass('SYSTEM_ERROR')).toBe('system-error');
  });
});
