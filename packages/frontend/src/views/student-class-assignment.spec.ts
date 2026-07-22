import { describe, expect, it } from 'vitest';
import { isLatestAssignmentRequest, selectInitialAssignment } from './student-class-assignment';

describe('student class assignment selection', () => {
  const assignments = [{ id: 'assignment-2' }, { id: 'assignment-1' }];

  it('selects the assignment requested by an in-app notification', () => {
    expect(selectInitialAssignment(assignments, 'assignment-1')).toBe('assignment-1');
  });

  it('falls back to the first class assignment when the requested one is unavailable', () => {
    expect(selectInitialAssignment(assignments, 'missing')).toBe('assignment-2');
    expect(selectInitialAssignment([], 'assignment-1')).toBe('');
  });

  it('ignores a response from an older class-assignment request', () => {
    expect(isLatestAssignmentRequest(3, 3)).toBe(true);
    expect(isLatestAssignmentRequest(2, 3)).toBe(false);
  });
});
