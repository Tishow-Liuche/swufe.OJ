import { BadRequestException } from '@nestjs/common';
import { CfAcceptedSyncService } from './cf-accepted-sync.service';

describe('CfAcceptedSyncService', () => {
  let prisma: any;
  let service: CfAcceptedSyncService;

  beforeEach(() => {
    prisma = {
      externalAccount: {
        findFirst: jest.fn(),
      },
      problemSource: {
        findMany: jest.fn(),
      },
      externalSolvedProblem: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new CfAcceptedSyncService(prisma);
  });

  it('imports accepted Codeforces submissions that match local remote problems', async () => {
    prisma.externalAccount.findFirst.mockResolvedValue({
      id: 'acc1',
      remoteUserId: 'tourist',
      remoteUsername: 'tourist',
    });
    prisma.problemSource.findMany.mockResolvedValue([
      {
        problemId: 'local-4a',
        platform: 'CODEFORCES',
        remoteProblemId: '4A',
      },
    ]);
    prisma.externalSolvedProblem.findUnique.mockResolvedValue(null);
    prisma.externalSolvedProblem.create.mockResolvedValue({ id: 'solved-1' });
    jest.spyOn(service as any, 'fetchUserStatus').mockResolvedValue([
      {
        id: 1001,
        creationTimeSeconds: 1_700_000_000,
        problem: { contestId: 4, index: 'A', name: 'Watermelon' },
        verdict: 'OK',
        timeConsumedMillis: 46,
        memoryConsumedBytes: 204800,
      },
      {
        id: 1002,
        creationTimeSeconds: 1_700_000_100,
        problem: { contestId: 4, index: 'A', name: 'Watermelon' },
        verdict: 'WRONG_ANSWER',
        timeConsumedMillis: 30,
        memoryConsumedBytes: 102400,
      },
      {
        id: 1003,
        creationTimeSeconds: 1_700_000_200,
        problem: { contestId: 999, index: 'B', name: 'Not Imported' },
        verdict: 'OK',
        timeConsumedMillis: 15,
        memoryConsumedBytes: 1024,
      },
    ]);

    const result = await service.syncUserAccepted('u1');

    expect(result).toEqual({
      handle: 'tourist',
      fetchedCount: 3,
      acceptedCount: 2,
      matchedCount: 1,
      createdCount: 1,
      updatedCount: 0,
      unchangedCount: 0,
      unmatchedCount: 1,
    });
    expect(prisma.externalSolvedProblem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        problemId: 'local-4a',
        platform: 'CODEFORCES',
        remoteProblemId: '4A',
        remoteSubmissionId: '1001',
        timeUsed: 46,
        memoryUsed: 200,
      }),
    });
  });

  it('updates an existing synced record instead of creating duplicates', async () => {
    prisma.externalAccount.findFirst.mockResolvedValue({
      id: 'acc1',
      remoteUserId: 'tourist',
      remoteUsername: 'tourist',
    });
    prisma.problemSource.findMany.mockResolvedValue([
      {
        problemId: 'local-4a',
        platform: 'CODEFORCES',
        remoteProblemId: '4A',
      },
    ]);
    prisma.externalSolvedProblem.findUnique.mockResolvedValue({
      id: 'solved-1',
      timeUsed: 60,
      memoryUsed: 256,
    });
    prisma.externalSolvedProblem.update.mockResolvedValue({ id: 'solved-1' });
    jest.spyOn(service as any, 'fetchUserStatus').mockResolvedValue([
      {
        id: 1001,
        creationTimeSeconds: 1_700_000_000,
        problem: { contestId: 4, index: 'A' },
        verdict: 'OK',
        timeConsumedMillis: 46,
        memoryConsumedBytes: 204800,
      },
    ]);

    const result = await service.syncUserAccepted('u1');

    expect(result.createdCount).toBe(0);
    expect(result.updatedCount).toBe(1);
    expect(prisma.externalSolvedProblem.create).not.toHaveBeenCalled();
    expect(prisma.externalSolvedProblem.update).toHaveBeenCalledWith({
      where: { id: 'solved-1' },
      data: expect.objectContaining({
        remoteSubmissionId: '1001',
        timeUsed: 46,
        memoryUsed: 200,
      }),
    });
  });

  it('requires a bound Codeforces handle before syncing', async () => {
    prisma.externalAccount.findFirst.mockResolvedValue(null);

    await expect(service.syncUserAccepted('u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
