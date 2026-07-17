import { AtCoderService } from './atcoder.service';

describe('AtCoderService ownership', () => {
  const actor = { id: 'teacher-1', role: 'TEACHER' };
  const metadata = {
    contestScreenName: 'abc400',
    taskScreenName: 'abc400_a',
    remoteProblemId: 'abc400/abc400_a',
    remoteUrl: 'https://atcoder.jp/contests/abc400/tasks/abc400_a',
    remoteProblemIndex: 'A',
    title: 'ABC400 A - Sample',
    timeLimitMs: 2000,
    memoryLimitMb: 1024,
  };

  function setup(existing: unknown) {
    const tx: any = {
      problemSource: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn(),
      },
      problem: {
        create: jest.fn().mockResolvedValue({ id: 'p-created' }),
        update: jest.fn(),
      },
      problemVersion: { updateMany: jest.fn() },
    };
    const prisma: any = {
      externalPlatform: { upsert: jest.fn().mockResolvedValue({ enabled: true }) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const adapter: any = { fetchProblem: jest.fn().mockResolvedValue(metadata) };
    const config: any = { get: jest.fn().mockReturnValue('true') };
    const access: any = { assertCanManage: jest.fn().mockResolvedValue({ id: 'p1' }) };
    return { service: new (AtCoderService as any)(prisma, adapter, config, access), tx, access };
  }

  it('checks ownership before a teacher refreshes an existing imported problem', async () => {
    const { service, access } = setup({ id: 'source-1', problemId: 'p1' });

    await service.importProblem(metadata.remoteUrl, actor);

    expect(access.assertCanManage).toHaveBeenCalledWith('p1', actor, 'EDIT');
  });

  it('records the importer as owner when creating an AtCoder problem', async () => {
    const { service, tx } = setup(null);

    await service.importProblem(metadata.remoteUrl, actor);

    expect(tx.problem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createdById: 'teacher-1' }),
    }));
  });
});
