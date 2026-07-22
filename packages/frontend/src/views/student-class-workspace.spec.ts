import { describe, expect, it } from 'vitest';
import { canViewClassAssignments, selectCurrentClass } from './student-class-workspace';

const memberships = [
  { class: { id: 'pending-class' }, status: 'PENDING' },
  { class: { id: 'approved-class' }, status: 'APPROVED' },
  { class: { id: 'rejected-class' }, status: 'REJECTED' },
] as const;

describe('student class workspace navigation', () => {
  it('initially opens an approved class instead of a pending application', () => {
    expect(selectCurrentClass(memberships, '')).toBe('approved-class');
  });

  it('retains a class the student explicitly selected while it still exists', () => {
    expect(selectCurrentClass(memberships, 'pending-class')).toBe('pending-class');
    expect(selectCurrentClass(memberships, 'missing-class')).toBe('approved-class');
  });

  it('only exposes class assignments to approved members', () => {
    expect(canViewClassAssignments('APPROVED')).toBe(true);
    expect(canViewClassAssignments('PENDING')).toBe(false);
    expect(canViewClassAssignments('REJECTED')).toBe(false);
  });
});
