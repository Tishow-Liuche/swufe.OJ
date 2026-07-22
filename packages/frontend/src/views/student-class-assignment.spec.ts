import { describe, expect, it } from 'vitest';
import { filterClassAssignments, isLatestAssignmentRequest, selectInitialAssignment } from './student-class-assignment';

describe('student class assignment selection', () => {
  const assignments = [{ id: 'assignment-2' }, { id: 'assignment-1' }];

  it('selects the assignment requested by an in-app notification', () => {
    expect(selectInitialAssignment(assignments, 'assignment-1')).toBe('assignment-1');
  });

  it('keeps the class assignment overview when no valid assignment was requested', () => {
    expect(selectInitialAssignment(assignments, 'missing')).toBe('');
    expect(selectInitialAssignment([], 'assignment-1')).toBe('');
  });

  it('filters the class assignment overview by completion state', () => {
    const overview = [
      { id: 'assignment-1', progress: { completed: true } },
      { id: 'assignment-2', progress: { completed: false } },
    ];

    expect(filterClassAssignments(overview, 'ALL')).toHaveLength(2);
    expect(filterClassAssignments(overview, 'COMPLETED').map((item) => item.id)).toEqual(['assignment-1']);
    expect(filterClassAssignments(overview, 'INCOMPLETE').map((item) => item.id)).toEqual(['assignment-2']);
  });

  it('ignores a response from an older class-assignment request', () => {
    expect(isLatestAssignmentRequest(3, 3)).toBe(true);
    expect(isLatestAssignmentRequest(2, 3)).toBe(false);
  });
});
