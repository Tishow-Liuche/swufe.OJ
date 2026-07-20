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
});
