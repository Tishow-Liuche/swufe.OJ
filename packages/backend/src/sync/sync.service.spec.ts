import { SyncService } from './sync.service';

describe('SyncService ownership', () => {
  const actor = { id: 'teacher-1', role: 'TEACHER' };

  function setup(existing: unknown, description = 'statement') {
    const prisma: any = {
      problemSource: { findFirst: jest.fn().mockResolvedValue(existing) },
      problem: { create: jest.fn().mockResolvedValue({ id: 'p-created' }) },
      problemVersion: { update: jest.fn() },
    };
    const access: any = { assertCanManage: jest.fn().mockResolvedValue({ id: 'p1' }) };
    const service = new (SyncService as any)(prisma, access);
    service.registerAdapter({
      platform: 'QOJ',
      baseUrl: 'https://qoj.ac',
      fetchList: jest.fn(),
      healthCheck: jest.fn(),
      fetchProblem: jest.fn().mockResolvedValue({
        remoteId: '1', title: 'QOJ 1', description, timeLimit: 1000, memoryLimit: 256,
      }),
    });
    return { service, prisma, access };
  }

  it('checks ownership before refreshing an existing remote problem', async () => {
    const { service, access } = setup({
      problemId: 'p1',
      problem: { id: 'p1', versions: [{ id: 'v1', description: 'complete statement' }] },
    });

    await service.syncProblem('QOJ', '1', actor);

    expect(access.assertCanManage).toHaveBeenCalledWith('p1', actor, 'EDIT');
  });

  it('records the actor as owner for a newly synced remote problem', async () => {
    const { service, prisma } = setup(null);

    await service.syncProblem('QOJ', '1', actor);

    expect(prisma.problem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createdById: 'teacher-1' }),
    }));
  });

  it('sanitizes a remote statement before creating a problem', async () => {
    const { service, prisma } = setup(null, '<img src="https://example.com/a.png" onerror="alert(1)"><script>alert(2)</script>');

    await service.syncProblem('QOJ', '1', actor);

    const version = prisma.problem.create.mock.calls[0][0].data.versions.create;
    expect(version.description).toContain('<img src="https://example.com/a.png" />');
    expect(version.description).not.toMatch(/script|onerror/i);
  });
});
