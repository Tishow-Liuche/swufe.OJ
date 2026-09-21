import { ConflictException } from '@nestjs/common';
import { LuoguHelperController } from './luogu-helper.controller';
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

describe('Luogu blocked reports', () => {
  const report = { failureCode: 'LANGUAGE_MISMATCH', failureMessage: 'Compiler language does not match', rawStatus: 'C selected' };
  function fixture(patch: any = {}) {
    const prisma = makePrisma({ submissionId: 's', platformCode: 'LUOGU', status: 'PROCESSING', nonce: 'token', leaseNonce: 'lease', remoteSubmissionId: null, expiresAt: new Date(Date.now() + 60000), ...patch });
    prisma.remoteSubmissionTask.updateMany.mockResolvedValue({ count: 1 });
    prisma.submission.updateMany.mockResolvedValue({ count: 1 });
    prisma.remoteJudgeJob.updateMany.mockResolvedValue({ count: 1 });
    return { prisma, service: new LuoguTaskLeaseService(prisma) as any };
  }
  it('registers report-blocked and forwards authenticated fields', async () => {
    const lease: any = { reportBlocked: jest.fn().mockResolvedValue({ ok: true }) };
    const controller: any = new LuoguHelperController(lease);
    expect(typeof controller.reportBlocked).toBe('function');
    expect(Reflect.getMetadata('path', controller.reportBlocked)).toBe(':submissionId/report-blocked');
    expect(Reflect.getMetadata('method', controller.reportBlocked)).toBe(1); // POST
    await controller.reportBlocked('s', { token: 'token', leaseNonce: 'lease', ...report });
    expect(lease.reportBlocked).toHaveBeenCalledWith('s', 'token', 'lease', expect.objectContaining(report));
  });
  it('atomically records a pre-submit language failure without inventing a verdict', async () => {
    const { service, prisma } = fixture();
    await expect(service.reportBlocked('s', 'token', 'lease', report)).resolves.toEqual({ ok: true, submissionId: 's', status: 'REMOTE_ERROR' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.remoteSubmissionTask.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ submissionId: 's', platformCode: 'LUOGU', nonce: 'token', leaseNonce: 'lease', remoteSubmissionId: null, status: 'PROCESSING' }), data: expect.objectContaining({ status: 'FAILED', helperStage: 'LANGUAGE_MISMATCH', failureCode: report.failureCode, failureMessage: report.failureMessage }) });
    expect(prisma.submission.updateMany).toHaveBeenCalledWith({ where: { id: 's', status: { in: ['PENDING', 'PROCESSING', 'QUEUING', 'JUDGING'] } }, data: { status: 'REMOTE_ERROR', score: 0, compileMessage: report.failureMessage, judgedAt: expect.any(Date) } });
    expect(prisma.remoteJudgeJob.updateMany).toHaveBeenCalledWith({ where: { submissionId: 's', remoteSubmissionId: null }, data: { finishedAt: expect.any(Date), rawStatus: 'LANGUAGE_MISMATCH: Compiler language does not match\nC selected' } });
  });
  it.each([
    [{ nonce: null }, 'token', 'lease'], [{}, 'wrong', 'lease'], [{}, '', 'lease'],
    [{}, 'token', 'wrong'], [{}, 'token', ''], [{ leaseNonce: null }, 'token', 'lease'],
    [{ platformCode: 'CODEFORCES' }, 'token', 'lease'], [{ status: 'COMPLETED' }, 'token', 'lease'],
    [{ status: 'FAILED' }, 'token', 'lease'], [{ remoteSubmissionId: '123' }, 'token', 'lease'],
    [{ expiresAt: new Date(0) }, 'token', 'lease'],
  ])('rejects unsafe task/auth combination %p', async (patch, token, lease) => {
    const { service, prisma } = fixture(patch);
    await expect(service.reportBlocked('s', token, lease, report)).rejects.toThrow();
    expect(prisma.remoteSubmissionTask.updateMany).not.toHaveBeenCalled();
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });
  it.each(['LOGIN_REQUIRED', 'VERIFICATION_REQUIRED'])('accepts authenticated pre-lease %s', async failureCode => {
    const { service } = fixture({ leaseNonce: null });
    await expect(service.reportBlocked('s', 'token', undefined, { ...report, failureCode })).resolves.toHaveProperty('status', 'REMOTE_ERROR');
  });
  it('accepts FORM_TIMEOUT with an existing matching lease', async () => {
    const { service } = fixture();
    await expect(service.reportBlocked('s', 'token', 'lease', { ...report, failureCode: 'FORM_TIMEOUT' })).resolves.toHaveProperty('ok', true);
  });
  it.each(['ACCEPTED', '', 'ARBITRARY_ERROR'])('rejects unsupported failure code %s', async failureCode => {
    const { service, prisma } = fixture();
    await expect(service.reportBlocked('s', 'token', 'lease', { ...report, failureCode })).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('aborts when the task changes concurrently', async () => {
    const { service, prisma } = fixture(); prisma.remoteSubmissionTask.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reportBlocked('s', 'token', 'lease', report)).rejects.toThrow(ConflictException);
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });
  it('throws inside the transaction when submission is already terminal (rollback)', async () => {
    const { service, prisma } = fixture(); prisma.submission.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reportBlocked('s', 'token', 'lease', report)).rejects.toThrow(ConflictException);
    expect(prisma.remoteJudgeJob.updateMany).not.toHaveBeenCalled();
  });
  it('rolls back if the judge job already has a remote ID or is missing', async () => {
    const { service, prisma } = fixture(); prisma.remoteJudgeJob.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reportBlocked('s', 'token', 'lease', report)).rejects.toThrow(ConflictException);
  });
  it.each(['', '   ', null])('rejects missing human-readable reason %p', async failureMessage => {
    const { service, prisma } = fixture();
    await expect(service.reportBlocked('s', 'token', 'lease', { ...report, failureMessage })).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('requires the current lease even for login reports when a lease exists', async () => {
    const { service } = fixture();
    await expect(service.reportBlocked('s', 'token', undefined, { ...report, failureCode: 'LOGIN_REQUIRED' })).rejects.toThrow(ConflictException);
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
