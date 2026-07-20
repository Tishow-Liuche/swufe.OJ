import { CfVerdictMapper } from './cf-verdict.mapper';
import { CfWorkerService } from './cf-worker.service';

describe('CfWorkerService tentative matching', () => {
  function createService(prisma: any) {
    const config = {
      get: jest.fn((key: string, fallback: any) => fallback),
    };
    return new CfWorkerService(prisma, config as any, new CfVerdictMapper());
  }

  it('does not bind a remoteSubmissionId from an unconfirmed problem-time match', async () => {
    const prisma = {
      remoteSubmissionTask: {
        findUnique: jest.fn().mockResolvedValue({
          remoteSubmissionId: null,
          submissionId: 'sub-new',
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      remoteJudgeJob: {
        findUnique: jest.fn().mockResolvedValue({ maxQueries: 60, queryCount: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      submission: {
        update: jest.fn().mockResolvedValue({}),
      },
      submissionCase: {
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = createService(prisma) as any;

    await service.matchAndUpdate({
      id: 'task-new',
      submissionId: 'sub-new',
      remoteProblemId: '2A',
      remoteSubmissionId: null,
      createdAt: new Date('2026-07-17T07:56:00.000Z'),
    }, [{
      id: 383089742,
      creationTimeSeconds: Math.floor(new Date('2026-07-17T07:57:45.000Z').getTime() / 1000),
      problem: { contestId: 2, index: 'A' },
      programmingLanguage: 'GNU G++17',
      verdict: undefined,
      passedTestCount: 0,
      timeConsumedMillis: 0,
      memoryConsumedBytes: 0,
    }]);

    expect(prisma.remoteSubmissionTask.update).toHaveBeenCalledWith({
      where: { id: 'task-new' },
      data: {
        status: 'PROCESSING',
      },
    });
    expect(prisma.remoteJudgeJob.update).toHaveBeenCalledWith({
      where: { submissionId: 'sub-new' },
      data: {
        rawStatus: null,
        finishedAt: undefined,
      },
    });
  });
});
