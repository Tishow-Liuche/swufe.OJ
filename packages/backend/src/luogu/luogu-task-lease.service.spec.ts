import { ConflictException } from '@nestjs/common';
import {
  LuoguTaskLeaseService,
  normalizeLuoguReportedStatus,
  normalizeLuoguStatus,
  normalizeOptionalMetric,
} from './luogu-task-lease.service';

function makePrisma(task: any) {
  const state = { task };
  const prisma: any = {
    remoteSubmissionTask: {
      findFirst: jest.fn(async () => state.task),
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => state.task),
      update: jest.fn(async ({ data }: any) => {
        state.task = { ...state.task, ...data };
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

describe('LuoguTaskLeaseService', () => {
  const now = new Date('2026-07-14T12:00:00Z');

  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  it('returns the current active lease when a helper retries without its nonce', async () => {
    const leaseExpiresAt = new Date('2026-07-14T12:01:00Z');
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'LUOGU',
      status: 'PROCESSING',
      nonce: 'task-token',
      leaseNonce: 'existing',
      leaseExpiresAt,
      remoteSubmissionId: null,
      expiresAt: new Date('2026-07-14T12:30:00Z'),
    });
    const service = new LuoguTaskLeaseService(prisma);

    const result = await service.acquireLease('sub_1', 'task-token');

    expect(result).toEqual({
      submissionId: 'sub_1',
      leaseNonce: 'existing',
      leaseExpiresAt,
      alreadyLeased: true,
    });
    expect(prisma.remoteSubmissionTask.update).not.toHaveBeenCalled();
  });

  it('retires older login-blocked or expired-lease tasks for the same problem during lookup', async () => {
    const latest = {
      submissionId: 'sub_new',
      platformCode: 'LUOGU',
      status: 'PENDING',
      remoteProblemId: 'P1001',
      language: 'cpp',
      sourceCode: 'int main(){return 0;}',
      nonce: 'new-token',
      remoteSubmissionId: null,
      createdAt: new Date('2026-07-14T12:05:00Z'),
      expiresAt: new Date('2026-07-14T12:35:00Z'),
    };
    const prisma = makePrisma(latest);
    prisma.remoteSubmissionTask.findMany = jest.fn(async () => [
      { submissionId: 'sub_old_login' },
      { submissionId: 'sub_old_lease' },
    ]);
    const service = new LuoguTaskLeaseService(prisma);

    const result = await service.lookup('P1001');

    expect(result.submissionId).toBe('sub_new');
    expect(prisma.remoteSubmissionTask.findMany).toHaveBeenCalledWith({
      where: {
        platformCode: 'LUOGU',
        status: { in: ['PENDING', 'PROCESSING'] },
        remoteProblemId: 'P1001',
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
      where: { submissionId: { in: ['sub_old_login', 'sub_old_lease'] } },
      data: {
        status: 'FAILED',
        helperStage: 'LOGIN_RETRY_REPLACED',
        remoteSubmissionId: null,
      },
    });
    expect(prisma.remoteJudgeJob.updateMany).toHaveBeenCalledWith({
      where: { submissionId: { in: ['sub_old_login', 'sub_old_lease'] } },
      data: {
        rawStatus: 'LOGIN_RETRY_REPLACED',
        finishedAt: now,
        remoteSubmissionId: null,
      },
    });
    expect(prisma.submission.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sub_old_login', 'sub_old_lease'] } },
      data: { status: 'REMOTE_ERROR', judgedAt: now },
    });
  });

  it('rejects a Luogu remote id already bound to another task', async () => {
    const prisma = makePrisma({
      submissionId: 'sub_new',
      platformCode: 'LUOGU',
      status: 'PROCESSING',
      nonce: 'task-token',
      leaseNonce: 'lease-a',
      leaseExpiresAt: new Date('2026-07-14T12:01:00Z'),
      remoteSubmissionId: null,
      expiresAt: new Date('2026-07-14T12:30:00Z'),
    });
    prisma.remoteSubmissionTask.findFirst = jest.fn(async (args: any) => {
      if (args.where.remoteSubmissionId === 'lg123') return { submissionId: 'sub_old' };
      return prisma.__state?.task || null;
    });
    const service = new LuoguTaskLeaseService(prisma);

    await expect(service.reportRemoteId('sub_new', 'task-token', 'lease-a', 'lg123'))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe('normalizeLuoguStatus', () => {
  it.each([
    ['AC', 'ACCEPTED'],
    ['Accepted', 'ACCEPTED'],
    ['WA', 'WRONG_ANSWER'],
    ['Wrong Answer', 'WRONG_ANSWER'],
    ['TLE', 'TIME_LIMIT_EXCEEDED'],
    ['Time Limit Exceeded', 'TIME_LIMIT_EXCEEDED'],
    ['MLE', 'MEMORY_LIMIT_EXCEEDED'],
    ['RE', 'RUNTIME_ERROR'],
    ['CE', 'COMPILE_ERROR'],
    ['Judging', 'JUDGING'],
    ['Waiting', 'QUEUING'],
  ])('maps %s to %s', (raw, expected) => {
    expect(normalizeLuoguStatus(raw)).toBe(expected);
  });

  it('maps unknown statuses to SYSTEM_ERROR', () => {
    expect(normalizeLuoguStatus('Something strange')).toBe('SYSTEM_ERROR');
  });
});

describe('normalizeLuoguReportedStatus', () => {
  it('does not let generic memory-limit page text override an accepted Luogu verdict', () => {
    expect(
      normalizeLuoguReportedStatus(
        'MEMORY_LIMIT_EXCEEDED',
        'Accepted\nMemory Limit 128 MB\nTime Limit 1.00s',
      ),
    ).toBe('ACCEPTED');
  });
});

describe('normalizeOptionalMetric', () => {
  it.each([
    [46, 46],
    ['46', 46],
    ['46 ms', 46],
    ['9.75 MB', 9.75],
    ['', undefined],
    [undefined, undefined],
    ['--', undefined],
  ])('normalizes %p to %p', (raw, expected) => {
    expect(normalizeOptionalMetric(raw)).toBe(expected);
  });
});
