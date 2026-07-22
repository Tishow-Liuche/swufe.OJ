import {
  assignmentLifecycleLabel,
  buildAssignmentReportCsv,
  computeStudentProgress,
  filterReportStudents,
  parsePassCondition,
  requiredSolveCount,
} from './assignment-progress';

describe('assignment progress rules', () => {
  const start = new Date('2026-07-20T00:00:00.000Z');
  const end = new Date('2026-07-25T00:00:00.000Z');
  const problems = [
    { problemId: 'p1', score: 100, order: 1 },
    { problemId: 'p2', score: 100, order: 2 },
  ];

  it('parses pass conditions', () => {
    expect(parsePassCondition(null)).toEqual({ type: 'ALL' });
    expect(parsePassCondition('COUNT:1')).toEqual({ type: 'COUNT', count: 1 });
    expect(parsePassCondition('PERCENT:50')).toEqual({ type: 'PERCENT', percent: 50 });
    expect(requiredSolveCount(4, 'PERCENT:50')).toBe(2);
    expect(requiredSolveCount(3, 'COUNT:5')).toBe(3);
  });

  it('marks on-time full completion as COMPLETED with full score', () => {
    const result = computeStudentProgress(
      problems,
      [
        { problemId: 'p1', acceptedAt: new Date('2026-07-21T10:00:00.000Z'), source: 'LOCAL' },
        { problemId: 'p2', acceptedAt: new Date('2026-07-22T10:00:00.000Z'), source: 'LOCAL' },
      ],
      { startTime: start, endTime: end, allowLate: false, latePenalty: 20 },
      new Date('2026-07-23T00:00:00.000Z'),
    );

    expect(result).toMatchObject({
      status: 'COMPLETED',
      completed: true,
      late: false,
      solvedCount: 2,
      score: 200,
    });
    expect(result.completedAt?.toISOString()).toBe('2026-07-22T10:00:00.000Z');
  });

  it('applies late penalty when allowLate and AC is after deadline', () => {
    const result = computeStudentProgress(
      problems,
      [
        { problemId: 'p1', acceptedAt: new Date('2026-07-21T10:00:00.000Z'), source: 'LOCAL' },
        { problemId: 'p2', acceptedAt: new Date('2026-07-26T10:00:00.000Z'), source: 'LOCAL' },
      ],
      { startTime: start, endTime: end, allowLate: true, latePenalty: 50 },
      new Date('2026-07-27T00:00:00.000Z'),
    );

    expect(result.status).toBe('LATE');
    expect(result.late).toBe(true);
    expect(result.score).toBe(150); // 100 + 50
    expect(result.problems.find((item) => item.problemId === 'p2')?.earnedScore).toBe(50);
  });

  it('ignores post-deadline AC when late is not allowed and marks EXPIRED', () => {
    const result = computeStudentProgress(
      problems,
      [{ problemId: 'p1', acceptedAt: new Date('2026-07-26T10:00:00.000Z'), source: 'LOCAL' }],
      { startTime: start, endTime: end, allowLate: false, latePenalty: 0 },
      new Date('2026-07-27T00:00:00.000Z'),
    );

    expect(result.solvedCount).toBe(0);
    expect(result.status).toBe('EXPIRED');
  });

  it('supports COUNT pass condition with partial completion', () => {
    const result = computeStudentProgress(
      problems,
      [{ problemId: 'p1', acceptedAt: new Date('2026-07-21T10:00:00.000Z'), source: 'LOCAL' }],
      { startTime: start, endTime: end, allowLate: false, latePenalty: 0, passCondition: 'COUNT:1' },
      new Date('2026-07-22T00:00:00.000Z'),
    );

    expect(result.completed).toBe(true);
    expect(result.requiredCount).toBe(1);
    expect(result.status).toBe('COMPLETED');
  });

  it('ignores external AC unless countExternalAc is enabled', () => {
    const without = computeStudentProgress(
      problems,
      [{ problemId: 'p1', acceptedAt: new Date('2026-07-21T10:00:00.000Z'), source: 'EXTERNAL' }],
      { startTime: start, endTime: end, allowLate: false, latePenalty: 0, countExternalAc: false },
      new Date('2026-07-22T00:00:00.000Z'),
    );
    const withExternal = computeStudentProgress(
      problems,
      [{ problemId: 'p1', acceptedAt: new Date('2026-07-21T10:00:00.000Z'), source: 'EXTERNAL' }],
      { startTime: start, endTime: end, allowLate: false, latePenalty: 0, countExternalAc: true },
      new Date('2026-07-22T00:00:00.000Z'),
    );

    expect(without.solvedCount).toBe(0);
    expect(withExternal.solvedCount).toBe(1);
  });

  it('reports assignment lifecycle labels', () => {
    expect(assignmentLifecycleLabel(start, end, new Date('2026-07-19T00:00:00.000Z'))).toBe('NOT_STARTED');
    expect(assignmentLifecycleLabel(start, end, new Date('2026-07-22T00:00:00.000Z'))).toBe('IN_PROGRESS');
    expect(assignmentLifecycleLabel(start, end, new Date('2026-07-26T00:00:00.000Z'), false)).toBe('CLOSED');
    expect(assignmentLifecycleLabel(start, end, new Date('2026-07-26T00:00:00.000Z'), true)).toBe('LATE_OPEN');
  });

  it('filters report students by status, completion and keyword', () => {
    const students = [
      { status: 'COMPLETED', completed: true, user: { username: 'alice', nickname: 'Alice' } },
      { status: 'EXPIRED', completed: false, user: { username: 'bob', nickname: null } },
    ];
    expect(filterReportStudents(students, { completion: 'completed' })).toHaveLength(1);
    expect(filterReportStudents(students, { status: 'EXPIRED' })[0].user.username).toBe('bob');
    expect(filterReportStudents(students, { keyword: 'ali' })[0].user.username).toBe('alice');
  });

  it('builds a CSV report with BOM for Excel', () => {
    const csv = buildAssignmentReportCsv({
      assignmentTitle: 'Week1',
      problems: [{ id: 'p1', title: 'A+B' }],
      students: [{
        username: 'alice',
        nickname: 'Alice',
        status: 'COMPLETED',
        solvedCount: 1,
        totalProblems: 1,
        score: 100,
        completedAt: new Date('2026-07-22T10:00:00.000Z'),
        problems: [{ problemId: 'p1', title: 'A+B', status: 'ACCEPTED', attempts: 2 }],
      }],
    });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('用户名');
    expect(csv).toContain('alice');
    expect(csv).toContain('ACCEPTED(2)');
  });
});
