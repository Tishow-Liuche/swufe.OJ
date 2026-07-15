import { ProblemService } from './problem.service';

describe('ProblemService.findAll', () => {
  const createService = () => {
    const prisma = {
      problem: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new ProblemService(prisma as any, {} as any);
    return { service, prisma };
  };

  it('filters external problems by their real platform and returns sourceInfo', async () => {
    const { service, prisma } = createService();

    await service.findAll({ source: 'CODEFORCES', page: 2, pageSize: 50 });

    expect(prisma.problem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PUBLISHED',
          sourceInfo: { platform: 'CODEFORCES' },
        },
        select: expect.objectContaining({
          sourceInfo: {
            select: {
              platform: true,
              remoteProblemId: true,
              remoteUrl: true,
            },
          },
        }),
        skip: 50,
        take: 50,
      }),
    );
    expect(prisma.problem.count).toHaveBeenCalledWith({
      where: {
        status: 'PUBLISHED',
        sourceInfo: { platform: 'CODEFORCES' },
      },
    });
  });

  it('keeps LOCAL filtering on the Problem.source field', async () => {
    const { service, prisma } = createService();

    await service.findAll({ source: 'LOCAL' });

    expect(prisma.problem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PUBLISHED',
          source: 'LOCAL',
        },
      }),
    );
  });
});
