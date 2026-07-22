import { formatAssignmentDeadline } from './assignment-notification';

describe('assignment notification formatting', () => {
  it('formats deadlines in the application time zone', () => {
    expect(formatAssignmentDeadline(new Date('2026-07-30T12:00:00.000Z'))).toBe('2026年7月30日 20:00');
  });
});
