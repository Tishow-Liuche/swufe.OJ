import { SubmissionService } from './submission.service';
import { ContestService } from '../contest/contest.service';
import { ContestStandingsCalculatorService } from '../contest/contest-standings-calculator.service';
it('filters all submissions before pagination and preserves the user restriction', async () => {
  const db: any = { submission: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
  const service = new SubmissionService(db, {} as any, {} as any, {} as any, {} as any);
  jest.spyOn(service as any, 'expireStaleQojHelperTasks').mockResolvedValue(undefined);
  await service.findAll({ nickname: ' Alice ', userId: 'student', page: 2, pageSize: 50 });
  const query = db.submission.findMany.mock.calls[0][0];
  expect(query.where).toEqual({ userId: 'student', user: { nickname: { contains: 'Alice', mode: 'insensitive' } } });
  expect(query.skip).toBe(50);
  expect(query.select.user.select.nickname).toBe(true);
  expect(query.select.createdAt).toBe(true);
  expect(db.submission.count).toHaveBeenCalledWith({ where: query.where });
});
it('combines contest nickname search and only-mine before taking recent records', async () => {
  const db: any = { contest: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', problems: [], participants: [] }) }, contestSubmission: { findMany: jest.fn().mockResolvedValue([]) } };
  const service = new ContestService(db, {} as any, new ContestStandingsCalculatorService());
  await service.contestSubmissions('c1', { id: 't1', role: 'ADMIN' }, true, ' Alice ');
  expect(db.contestSubmission.findMany.mock.calls[0][0].where).toEqual({ contestId: 'c1', submission: { userId: 't1', user: { nickname: { contains: 'Alice', mode: 'insensitive' } } } });
});
