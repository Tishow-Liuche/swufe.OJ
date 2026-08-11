import { ContestService } from './contest.service';

describe('ContestService practice leaderboard', () => {
  it('counts local and external accepted problems once per problem in the global leaderboard', async () => {
    const prisma: any = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u1', username: 'alice', nickname: 'Alice', avatar: null, role: 'STUDENT' },
        ]),
      },
      submission: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'u1', problemId: 'p-local', status: 'ACCEPTED' },
          { userId: 'u1', problemId: 'p-wrong', status: 'WRONG_ANSWER' },
        ]),
      },
      externalSolvedProblem: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'u1', problemId: 'p-local' },
          { userId: 'u1', problemId: 'p-cf' },
        ]),
      },
    };
    const service = new ContestService(prisma, {} as any);

    const rows = await service.globalLeaderboard();

    expect(prisma.externalSolvedProblem.findMany).toHaveBeenCalledWith({
      where: {},
      select: { userId: true, problemId: true },
    });
    expect(rows[0]).toEqual(expect.objectContaining({
      userId: 'u1',
      solvedCount: 2,
      submissionCount: 2,
      acceptRate: 50,
    }));
  });

  it('computes overall score from accepted problems submitted on this OJ only', async () => {
    const prisma: any = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u1', username: 'alice', nickname: 'Alice', avatar: null, role: 'STUDENT' },
          { id: 'u2', username: 'bob', nickname: null, avatar: null, role: 'STUDENT' },
        ]),
      },
      submission: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'u1', problemId: 'p0', problem: { difficulty: 'POINT_0' } },
          { userId: 'u1', problemId: 'p0', problem: { difficulty: 'POINT_0' } },
          { userId: 'u1', problemId: 'cf-p1', problem: { difficulty: 'POINT_1' } },
          { userId: 'u1', problemId: 'luogu-p2', problem: { difficulty: 'POINT_2' } },
          { userId: 'u1', problemId: 'qoj-p3', problem: { difficulty: 'POINT_3' } },
          { userId: 'u1', problemId: 'local-p4', problem: { difficulty: 'POINT_4' } },
          { userId: 'u1', problemId: 'local-p5', problem: { difficulty: 'POINT_5' } },
          { userId: 'u2', problemId: 'unknown', problem: { difficulty: null } },
        ]),
      },
      externalSolvedProblem: {
        findMany: jest.fn(),
      },
    };
    const service = new ContestService(prisma, {} as any);

    const rows = await service.overallLeaderboard();

    expect(prisma.submission.findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACCEPTED',
        problem: { status: 'PUBLISHED' },
      },
      select: {
        userId: true,
        problemId: true,
        problem: { select: { difficulty: true } },
      },
    });
    expect(prisma.externalSolvedProblem.findMany).not.toHaveBeenCalled();
    expect(rows[0]).toEqual(expect.objectContaining({
      rank: 1,
      userId: 'u1',
      overallScore: 141,
      problemScore: 141,
      contestScore: 0,
      localSolvedCount: 6,
      scoreBreakdown: { problemScore: 141, contestScore: 0 },
    }));
    expect(rows[1]).toEqual(expect.objectContaining({
      rank: 2,
      userId: 'u2',
      overallScore: 0,
      problemScore: 0,
      contestScore: 0,
      localSolvedCount: 1,
    }));
  });
});

describe('ContestService contest reserved problems', () => {
  it('returns contest reserved problem details for a participant in that contest', async () => {
    const problem = {
      id: 'problem-1',
      title: '预备题 A',
      status: 'CONTEST_RESERVED',
      versions: [{ id: 'version-1', description: 'statement' }],
      tags: [],
      sourceInfo: null,
    };
    const prisma: any = {
      contest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'contest-1',
          createdBy: 'teacher-1',
          visibility: 'PUBLIC',
          startTime: new Date('2026-07-22T10:00:00.000Z'),
          endTime: new Date('2026-07-22T12:00:00.000Z'),
          participants: [{ userId: 'student-1' }],
          problems: [{ problemId: 'problem-1', problem }],
        }),
      },
    };
    const service = new ContestService(prisma, {} as any);

    await expect(service.getContestProblem('contest-1', 'problem-1', { id: 'student-1', role: 'STUDENT' }))
      .resolves.toBe(problem);

    expect(prisma.contest.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'contest-1' },
    }));
  });

  it('submits contest reserved problems through contest context', async () => {
    const prisma: any = {
      contest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'contest-1',
          startTime: new Date(Date.now() - 60_000),
          endTime: new Date(Date.now() + 60_000),
        }),
      },
      contestParticipant: {
        findUnique: jest.fn().mockResolvedValue({ contestId: 'contest-1', userId: 'student-1' }),
      },
      contestProblem: {
        findUnique: jest.fn().mockResolvedValue({ contestId: 'contest-1', problemId: 'problem-1' }),
      },
      contestSubmission: {
        create: jest.fn(),
      },
    };
    const submissions = {
      submit: jest.fn().mockResolvedValue({ id: 'submission-1', status: 'QUEUING' }),
    };
    const service = new ContestService(prisma, submissions as any);

    const result = await service.submit('contest-1', { id: 'student-1', role: 'STUDENT' }, {
      problemId: 'problem-1',
      language: 'cpp',
      sourceCode: 'int main(){}',
    });

    expect(submissions.submit).toHaveBeenCalledWith('student-1', {
      problemId: 'problem-1',
      language: 'cpp',
      sourceCode: 'int main(){}',
    }, { allowContestReserved: true });
    expect(result).toEqual({ id: 'submission-1', status: 'QUEUING', contestId: 'contest-1' });
  });
});

describe('ContestService live contest board', () => {
  it('returns problem headers, per-cell verdict state, and first blood markers in standings', async () => {
    const contestStart = new Date('2026-07-22T10:00:00.000Z');
    const prisma: any = {
      contest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'contest-1',
          title: 'ICPC Practice',
          mode: 'ACM',
          visibility: 'PUBLIC',
          createdBy: 'teacher-1',
          startTime: contestStart,
          endTime: new Date('2026-07-22T12:00:00.000Z'),
          freezeTime: null,
          penaltyTime: 20,
          participants: [
            { userId: 'alice', isVirtual: false, user: { id: 'alice', username: 'alice', nickname: 'Alice', avatar: null } },
            { userId: 'bob', isVirtual: false, user: { id: 'bob', username: 'bob', nickname: 'Bob', avatar: null } },
          ],
          problems: [
            { problemId: 'p-a', order: 1, score: 100, problem: { id: 'p-a', title: 'A. Warmup' } },
            { problemId: 'p-b', order: 2, score: 100, problem: { id: 'p-b', title: 'B. Trap' } },
          ],
          submissions: [
            {
              submission: {
                id: 's1',
                userId: 'bob',
                problemId: 'p-a',
                status: 'WRONG_ANSWER',
                score: 0,
                createdAt: new Date('2026-07-22T10:05:00.000Z'),
              },
            },
            {
              submission: {
                id: 's2',
                userId: 'alice',
                problemId: 'p-a',
                status: 'ACCEPTED',
                score: 100,
                createdAt: new Date('2026-07-22T10:10:00.000Z'),
              },
            },
            {
              submission: {
                id: 's3',
                userId: 'bob',
                problemId: 'p-a',
                status: 'ACCEPTED',
                score: 100,
                createdAt: new Date('2026-07-22T10:20:00.000Z'),
              },
            },
            {
              submission: {
                id: 's4',
                userId: 'alice',
                problemId: 'p-b',
                status: 'WRONG_ANSWER',
                score: 0,
                createdAt: new Date('2026-07-22T10:25:00.000Z'),
              },
            },
          ],
        }),
      },
    };
    const service = new ContestService(prisma, {} as any);

    const result = await service.standings('contest-1', { id: 'student-1', role: 'STUDENT' });

    expect(result.problems).toEqual([
      { problemId: 'p-a', order: 1, label: 'A', title: 'A. Warmup', score: 100 },
      { problemId: 'p-b', order: 2, label: 'B', title: 'B. Trap', score: 100 },
    ]);
    const alice = result.rows.find((row: any) => row.userId === 'alice');
    const bob = result.rows.find((row: any) => row.userId === 'bob');
    expect(alice.problems[0]).toEqual(expect.objectContaining({
      problemId: 'p-a',
      label: 'A',
      status: 'ACCEPTED',
      accepted: true,
      firstBlood: true,
      attempts: 1,
    }));
    expect(alice.problems[1]).toEqual(expect.objectContaining({
      problemId: 'p-b',
      label: 'B',
      status: 'WRONG_ANSWER',
      accepted: false,
      firstBlood: false,
      wrongAttempts: 1,
    }));
    expect(bob.problems[0]).toEqual(expect.objectContaining({
      problemId: 'p-a',
      status: 'ACCEPTED',
      firstBlood: false,
      wrongAttempts: 1,
    }));
  });

  it('returns recent contest submissions with user and problem metadata', async () => {
    const prisma: any = {
      contest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'contest-1',
          title: 'ICPC Practice',
          visibility: 'PUBLIC',
          createdBy: 'teacher-1',
          participants: [],
          problems: [
            { problemId: 'p-a', order: 1, problem: { id: 'p-a', title: 'A. Warmup' } },
          ],
        }),
      },
      contestSubmission: {
        findMany: jest.fn().mockResolvedValue([
          {
            submission: {
              id: 's1',
              problemId: 'p-a',
              status: 'ACCEPTED',
              language: 'cpp',
              score: 100,
              timeUsed: 12,
              memoryUsed: 2048,
              createdAt: new Date('2026-07-22T10:10:00.000Z'),
              user: { id: 'alice', username: 'alice', nickname: 'Alice', avatar: null },
              problem: { id: 'p-a', title: 'A. Warmup' },
            },
          },
        ]),
      },
    };
    const service = new ContestService(prisma, {} as any);

    const result = await (service as any).contestSubmissions('contest-1', { id: 'student-1', role: 'STUDENT' });

    expect(prisma.contestSubmission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { contestId: 'contest-1' },
      take: 80,
    }));
    expect(result.items[0]).toEqual(expect.objectContaining({
      id: 's1',
      status: 'ACCEPTED',
      problem: { id: 'p-a', title: 'A. Warmup', label: 'A' },
      user: { id: 'alice', username: 'alice', nickname: 'Alice', avatar: null },
    }));
  });
});
