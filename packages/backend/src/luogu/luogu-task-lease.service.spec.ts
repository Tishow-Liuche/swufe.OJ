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
      findUnique: jest.fn(async () => state.task),
      update: jest.fn(async ({ data }: any) => {
        state.task = { ...state.task, ...data };
        return state.task;
      }),
    },
    remoteJudgeJob: {
      update: jest.fn(async ({ data }: any) => ({ ...data })),
    },
    submission: {
      update: jest.fn(async ({ data }: any) => ({ ...data })),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
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
