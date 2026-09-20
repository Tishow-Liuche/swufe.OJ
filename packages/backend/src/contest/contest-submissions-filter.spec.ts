import { ContestService } from './contest.service';
import { ContestStandingsCalculatorService } from './contest-standings-calculator.service';

describe('contest submission ownership filter', () => {
  it.each([true, false])('filters before limiting records: mine=%s', async (mine) => {
    const prisma: any = {
      contest: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', visibility: 'PUBLIC', problems: [] }) },
      contestSubmission: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ContestService(prisma, {} as any, new ContestStandingsCalculatorService());
    await (service.contestSubmissions as any)('c1', { id: 'self', role: 'STUDENT' }, mine);
    expect(prisma.contestSubmission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: mine ? { contestId: 'c1', submission: { userId: 'self' } } : { contestId: 'c1' },
      take: 80,
    }));
  });
});
