import { ContestStandingsCalculatorService } from './contest-standings-calculator.service';

describe('ContestStandingsCalculatorService', () => {
  const service = new ContestStandingsCalculatorService();

  it('ranks ACM participants by solved count then penalty and marks first blood', () => {
    const start = new Date('2026-08-12T10:00:00.000Z');
    const result = service.calculate({
      contest: {
        id: 'contest-1',
        title: 'ICPC Practice',
        mode: 'ACM',
        startTime: start,
        endTime: new Date('2026-08-12T13:00:00.000Z'),
        freezeTime: null,
        penaltyTime: 20,
      },
      participants: [
        { userId: 'alice', isVirtual: false, virtualStart: null, virtualEnd: null, user: { id: 'alice', username: 'alice', nickname: 'Alice' } },
        { userId: 'bob', isVirtual: false, virtualStart: null, virtualEnd: null, user: { id: 'bob', username: 'bob', nickname: 'Bob' } },
      ],
      problems: [
        { problemId: 'p-a', order: 0, score: 100, problem: { title: 'A. Warmup' } },
        { problemId: 'p-b', order: 1, score: 100, problem: { title: 'B. Trap' } },
      ],
      submissions: [
        { id: 's1', userId: 'alice', problemId: 'p-a', status: 'WRONG_ANSWER', score: 0, createdAt: new Date('2026-08-12T10:05:00.000Z') },
        { id: 's2', userId: 'alice', problemId: 'p-a', status: 'ACCEPTED', score: 100, createdAt: new Date('2026-08-12T10:10:00.000Z') },
        { id: 's3', userId: 'bob', problemId: 'p-a', status: 'ACCEPTED', score: 100, createdAt: new Date('2026-08-12T10:30:00.000Z') },
      ],
      now: new Date('2026-08-12T11:00:00.000Z'),
      canManage: false,
    });

    expect(result.rows.map((row: any) => row.userId)).toEqual(['alice', 'bob']);
    expect(result.rows[0]).toEqual(expect.objectContaining({ rank: 1, userId: 'alice', solvedCount: 1, penalty: 30 }));
    expect(result.rows[0].problems[0]).toEqual(expect.objectContaining({ status: 'ACCEPTED', firstBlood: true, viewableSubmissionId: null }));
    expect(result.rows[1]).toEqual(expect.objectContaining({ rank: 1, userId: 'bob', solvedCount: 1, penalty: 30 }));
  });

  it('hides frozen submissions from normal participants but exposes them to managers', () => {
    const input = {
      contest: {
        id: 'contest-1',
        title: 'Frozen',
        mode: 'ACM',
        startTime: new Date('2026-08-12T10:00:00.000Z'),
        endTime: new Date('2026-08-12T13:00:00.000Z'),
        freezeTime: new Date('2026-08-12T12:00:00.000Z'),
        penaltyTime: 20,
      },
      participants: [
        { userId: 'alice', isVirtual: false, virtualStart: null, virtualEnd: null, user: { id: 'alice', username: 'alice' } },
      ],
      problems: [
        { problemId: 'p-a', order: 0, score: 100, problem: { title: 'A' } },
      ],
      submissions: [
        { id: 's1', userId: 'alice', problemId: 'p-a', status: 'ACCEPTED', score: 100, createdAt: new Date('2026-08-12T12:10:00.000Z') },
      ],
      now: new Date('2026-08-12T12:30:00.000Z'),
    };

    const participantView = service.calculate({ ...input, canManage: false });
    const managerView = service.calculate({ ...input, canManage: true });

    expect(participantView.contest.frozen).toBe(true);
    expect(participantView.rows[0].solvedCount).toBe(0);
    expect(managerView.contest.frozen).toBe(false);
    expect(managerView.rows[0].solvedCount).toBe(1);
  });
});
