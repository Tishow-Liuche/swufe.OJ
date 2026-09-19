import { PublicController } from './public.controller';

describe('PublicController lightweight endpoints', () => {
  it('coalesces and caches homepage statistics for one minute', async () => {
    const prisma: any = {
      problem: { count: jest.fn().mockResolvedValue(2) },
      submission: { count: jest.fn().mockResolvedValue(3) },
      user: { count: jest.fn().mockResolvedValue(4) },
    };
    const controller = new PublicController(prisma, {} as any);

    await expect(Promise.all([controller.getStats(), controller.getStats()])).resolves.toEqual([
      { problemCount: 2, submissionCount: 3, userCount: 4 },
      { problemCount: 2, submissionCount: 3, userCount: 4 },
    ]);
    await expect(controller.getStats()).resolves.toEqual({ problemCount: 2, submissionCount: 3, userCount: 4 });

    expect(prisma.problem.count).toHaveBeenCalledTimes(1);
    expect(prisma.submission.count).toHaveBeenCalledTimes(1);
    expect(prisma.user.count).toHaveBeenCalledTimes(1);
  });

  it('provides a database-independent health response', () => {
    const controller = new PublicController({} as any, {} as any);
    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });
});
