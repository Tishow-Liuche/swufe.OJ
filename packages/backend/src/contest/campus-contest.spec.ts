import { ContestService } from './contest.service';
import { ContestStandingsCalculatorService } from './contest-standings-calculator.service';

describe('Campus contest registration and access', () => {
  function setup(studentId: string | null = '42411036') {
    const contest: any = { id: 'c1', visibility: 'CAMPUS_PRIVATE', createdBy: 'teacher',
      startTime: new Date(Date.now() + 3600000), endTime: new Date(Date.now() + 7200000),
      participants: [], problems: [{ problemId: 'p1', problem: { id: 'p1', title: 'Secret' } }] };
    const prisma: any = {
      contest: { findUnique: jest.fn().mockResolvedValue(contest), findMany: jest.fn().mockResolvedValue([contest]) },
      user: { findUnique: jest.fn().mockResolvedValue({ studentId }), findMany: jest.fn().mockResolvedValue([]) },
      contestParticipant: { upsert: jest.fn().mockResolvedValue({ userId: 'u1' }) },
    };
    return { contest, prisma, service: new ContestService(prisma, {} as any, new ContestStandingsCalculatorService()) };
  }
  const viewer = { id: 'u1', role: 'STUDENT' };
  it('requires a bound student ID', async () => {
    const { service, prisma } = setup(null);
    await expect(service.register('c1', viewer, '', { studentId: '42411036', realName: '张三' })).rejects.toThrow('绑定学号');
    expect(prisma.contestParticipant.upsert).not.toHaveBeenCalled();
  });
  it('rejects mismatched ID and malformed names', async () => {
    const { service } = setup();
    await expect(service.register('c1', viewer, '', { studentId: '42411037', realName: '张三' })).rejects.toThrow('一致');
    for (const realName of ['', 'a_b', '\n', '张'.repeat(41)]) {
      await expect(service.register('c1', viewer, '', { studentId: '42411036', realName })).rejects.toThrow('姓名');
    }
  });
  it('stores a trimmed immutable registration snapshot', async () => {
    const { service, prisma } = setup();
    await service.register('c1', viewer, '', { studentId: ' 42411036 ', realName: ' 张三 ' });
    expect(prisma.contestParticipant.upsert).toHaveBeenCalledWith({
      where: { contestId_userId: { contestId: 'c1', userId: 'u1' } },
      create: { contestId: 'c1', userId: 'u1', studentId: '42411036', realName: '张三' }, update: {},
    });
  });
  it('does not expose campus problem metadata to unregistered visitors', async () => {
    const { service } = setup();
    expect((await service.listPublic())[0].problems).toEqual([]);
    expect((await service.getContest('c1', viewer)).problems).toEqual([]);
  });
  it('does not expose statements before the start to registered contestants', async () => {
    const { service, contest } = setup(); contest.participants = [{ userId: 'u1' }];
    await expect(service.getContestProblem('c1', 'p1', viewer)).rejects.toThrow('尚未开始');
    expect((await service.getContest('c1', viewer)).problems).toEqual([]);
    expect((await service.getContestProblem('c1', 'p1', { id: 'teacher' })).id).toBe('p1');
  });
  it('formats campus standings using the registration snapshot', () => {
    const { contest } = setup();
    const board = new ContestStandingsCalculatorService().calculate({ contest,
      participants: [{ userId: 'u1', studentId: '42411036', realName: '张三', user: { username: 'abc', nickname: '昵称' } }],
      problems: [], submissions: [], now: new Date(), canManage: false });
    expect(board.rows[0].user.nickname).toBe('42411036_张三');
  });
});
