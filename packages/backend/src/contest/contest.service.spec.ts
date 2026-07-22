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
