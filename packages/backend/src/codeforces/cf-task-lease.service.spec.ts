import { ConflictException, NotFoundException } from '@nestjs/common';
import { CfTaskLeaseService } from './cf-task-lease.service';

function makePrisma(task: any) {
  const state = { task, updates: [] as any[] };
  const prisma: any = {
    remoteSubmissionTask: {
      findFirst: jest.fn(async () => state.task),
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => state.task),
      update: jest.fn(async ({ data }: any) => {
        state.task = { ...state.task, ...data, updatedAt: new Date('2026-07-14T12:00:00Z') };
        state.updates.push(data);
        return state.task;
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    remoteJudgeJob: {
      update: jest.fn(async ({ data }: any) => ({ ...data })),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    submission: {
      update: jest.fn(async ({ data }: any) => ({ ...data })),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    __state: state,
  };
  return prisma;
}

describe('CfTaskLeaseService', () => {
  const now = new Date('2026-07-14T12:00:00Z');

  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  it('acquires a new one-time lease for a pending task', async () => {
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PENDING',
      remoteProblemId: '4A',
      language: 'cpp',
      sourceCode: 'int main(){}',
      nonce: 'task-token',
      leaseNonce: null,
      leaseExpiresAt: null,
      remoteSubmissionId: null,
      expiresAt: new Date('2026-07-14T12:30:00Z'),
    });
    const service = new CfTaskLeaseService(prisma);

    const result = await service.acquireLease('sub_1', 'task-token');

    expect(result.submissionId).toBe('sub_1');
    expect(result.leaseNonce).toHaveLength(32);
    expect(result.leaseExpiresAt.toISOString()).toBe('2026-07-14T12:02:00.000Z');
    expect(prisma.remoteSubmissionTask.update).toHaveBeenCalledWith({
      where: { submissionId: 'sub_1' },
      data: {
        leaseNonce: result.leaseNonce,
        leaseExpiresAt: result.leaseExpiresAt,
        helperStage: 'LEASED',
        status: 'PROCESSING',
      },
    });
  });

  it('returns the current active lease when a helper retries without its nonce', async () => {
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PROCESSING',
      nonce: 'task-token',
      leaseNonce: 'existing',
      leaseExpiresAt: new Date('2026-07-14T12:01:00Z'),
      remoteSubmissionId: null,
      expiresAt: new Date('2026-07-14T12:30:00Z'),
    });
    const service = new CfTaskLeaseService(prisma);

    const result = await service.acquireLease('sub_1', 'task-token');

    expect(result).toEqual({
      submissionId: 'sub_1',
      leaseNonce: 'existing',
      leaseExpiresAt: new Date('2026-07-14T12:01:00Z'),
      alreadyLeased: true,
    });
    expect(prisma.remoteSubmissionTask.update).not.toHaveBeenCalled();
  });

  it('allows the same active lease to be replayed idempotently', async () => {
    const leaseExpiresAt = new Date('2026-07-14T12:01:00Z');
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PROCESSING',
      nonce: 'task-token',
      leaseNonce: 'existing',
      leaseExpiresAt,
      remoteSubmissionId: null,
      expiresAt: new Date('2026-07-14T12:30:00Z'),
    });
    const service = new CfTaskLeaseService(prisma);

    const result = await service.acquireLease('sub_1', 'task-token', 'existing');

    expect(result.leaseNonce).toBe('existing');
    expect(result.leaseExpiresAt).toBe(leaseExpiresAt);
    expect(prisma.remoteSubmissionTask.update).not.toHaveBeenCalled();
  });

  it('binds SID once and promotes the local submission to judging', async () => {
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PROCESSING',
      nonce: 'task-token',
      leaseNonce: 'lease-a',
      leaseExpiresAt: new Date('2026-07-14T12:01:00Z'),
      remoteSubmissionId: null,
      remoteProblemId: '4A',
      expiresAt: new Date('2026-07-14T12:30:00Z'),
    });
    prisma.remoteSubmissionTask.findFirst = jest.fn(async (args: any) => {
      if (args.where.remoteSubmissionId === '123456') return null;
      return prisma.__state.task;
    });
    const service = new CfTaskLeaseService(prisma);

    const result = await service.bindSid('sub_1', 'task-token', 'lease-a', '123456');

    expect(result).toEqual({ ok: true, submissionId: 'sub_1', cfSubmissionId: '123456', status: 'JUDGING' });
    expect(prisma.remoteSubmissionTask.update).toHaveBeenCalledWith({
      where: { submissionId: 'sub_1' },
      data: {
        remoteSubmissionId: '123456',
        helperStage: 'SID_REPORTED',
        status: 'PROCESSING',
      },
    });
    expect(prisma.submission.update).toHaveBeenCalledWith({
      where: { id: 'sub_1' },
      data: { status: 'JUDGING' },
    });
  });

  it('treats duplicate SID reports for the same task as success', async () => {
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PROCESSING',
      nonce: 'task-token',
      leaseNonce: 'lease-a',
      leaseExpiresAt: new Date('2026-07-14T12:01:00Z'),
      remoteSubmissionId: '123456',
      remoteProblemId: '4A',
      expiresAt: new Date('2026-07-14T12:30:00Z'),
    });
    const service = new CfTaskLeaseService(prisma);

    const result = await service.bindSid('sub_1', 'task-token', 'lease-a', '123456');

    expect(result.ok).toBe(true);
    expect(prisma.remoteSubmissionTask.update).not.toHaveBeenCalled();
  });

  it('rejects a different SID after one is already bound', async () => {
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PROCESSING',
      nonce: 'task-token',
      leaseNonce: 'lease-a',
      leaseExpiresAt: new Date('2026-07-14T12:01:00Z'),
      remoteSubmissionId: '123456',
      remoteProblemId: '4A',
      expiresAt: new Date('2026-07-14T12:30:00Z'),
    });
    const service = new CfTaskLeaseService(prisma);

    await expect(service.bindSid('sub_1', 'task-token', 'lease-a', '999999')).rejects.toBeInstanceOf(ConflictException);
  });

  it('binds SID from a legacy helper report without token during script migration', async () => {
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PROCESSING',
      nonce: null,
      leaseNonce: null,
      leaseExpiresAt: null,
      remoteSubmissionId: null,
      remoteProblemId: '4A',
      expiresAt: new Date('2026-07-14T12:30:00Z'),
    });
    prisma.remoteSubmissionTask.findFirst = jest.fn(async (args: any) => {
      if (args.where.remoteSubmissionId === '123456') return null;
      return prisma.__state.task;
    });
    const service = new CfTaskLeaseService(prisma);

    const result = await service.bindSidLegacy('sub_1', '123456');

    expect(result).toEqual({
      ok: true,
      submissionId: 'sub_1',
      cfSubmissionId: '123456',
      status: 'JUDGING',
      legacy: true,
    });
    expect(prisma.remoteSubmissionTask.update).toHaveBeenCalledWith({
      where: { submissionId: 'sub_1' },
      data: {
        remoteSubmissionId: '123456',
        helperStage: 'SID_REPORTED',
        status: 'PROCESSING',
      },
    });
  });

  it('rejects missing tasks', async () => {
    const prisma = makePrisma(null);
    const service = new CfTaskLeaseService(prisma);

    await expect(service.acquireLease('sub_missing', 'task-token')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates and returns a task token during lookup when the task has none', async () => {
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PENDING',
      remoteProblemId: '4A',
      language: 'cpp',
      sourceCode: 'int main(){}',
      nonce: null,
      remoteSubmissionId: null,
      expiresAt: new Date('2026-07-14T12:30:00Z'),
    });
    const service = new CfTaskLeaseService(prisma);

    const result = await service.lookup('4A');

    expect(result.token).toHaveLength(32);
    expect(prisma.remoteSubmissionTask.update).toHaveBeenCalledWith({
      where: { submissionId: 'sub_1' },
      data: { nonce: result.token },
    });
  });

  it('retires older unleased tasks for the same problem during lookup after a login retry', async () => {
    const latest = {
      submissionId: 'sub_new',
      platformCode: 'CODEFORCES',
      status: 'PENDING',
      remoteProblemId: '4A',
      language: 'cpp',
      sourceCode: 'int main(){return 0;}',
      nonce: 'new-token',
      remoteSubmissionId: null,
      createdAt: new Date('2026-07-14T12:05:00Z'),
      expiresAt: new Date('2026-07-14T12:35:00Z'),
    };
    const prisma = makePrisma(latest);
    prisma.remoteSubmissionTask.findMany = jest.fn(async () => [
      { submissionId: 'sub_old_1' },
      { submissionId: 'sub_old_2' },
    ]);
    const service = new CfTaskLeaseService(prisma);

    const result = await service.lookup('4A');

    expect(result.submissionId).toBe('sub_new');
    expect(prisma.remoteSubmissionTask.findMany).toHaveBeenCalledWith({
      where: {
        platformCode: 'CODEFORCES',
        status: { in: ['PENDING', 'PROCESSING'] },
        remoteProblemId: '4A',
        remoteSubmissionId: null,
        submissionId: { not: 'sub_new' },
        createdAt: { lt: latest.createdAt },
        OR: [
          { helperStage: null },
          { helperStage: 'LOGIN_REQUIRED' },
          { helperStage: 'LEASED', leaseExpiresAt: { lt: now } },
        ],
      },
      select: { submissionId: true },
    });
    expect(prisma.remoteSubmissionTask.updateMany).toHaveBeenCalledWith({
      where: { submissionId: { in: ['sub_old_1', 'sub_old_2'] } },
      data: {
        status: 'FAILED',
        helperStage: 'LOGIN_RETRY_REPLACED',
        remoteSubmissionId: null,
      },
    });
    expect(prisma.remoteJudgeJob.updateMany).toHaveBeenCalledWith({
      where: { submissionId: { in: ['sub_old_1', 'sub_old_2'] } },
      data: {
        rawStatus: 'LOGIN_RETRY_REPLACED',
        finishedAt: now,
        remoteSubmissionId: null,
      },
    });
    expect(prisma.submission.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sub_old_1', 'sub_old_2'] } },
      data: { status: 'REMOTE_ERROR', judgedAt: now },
    });
  });
});
