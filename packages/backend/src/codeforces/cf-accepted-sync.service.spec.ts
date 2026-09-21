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
      problem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      externalSolvedProblem: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
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
      createdCount: 2,
      updatedCount: 0,
      unchangedCount: 0,
      unmatchedCount: 1,
    });
    expect(prisma.externalSolvedProblem.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        userId: 'u1',
        problemId: 'local-4a',
        platform: 'CODEFORCES',
        remoteProblemId: '4A',
        remoteSubmissionId: '1001',
        timeUsed: 46,
        memoryUsed: 200,
      }),
    }));
    expect(prisma.externalSolvedProblem.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ problemId: null, remoteProblemId: '999B' }),
    }));
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
    prisma.externalSolvedProblem.findMany.mockResolvedValue([{
      id: 'solved-1',
      remoteProblemId: '4A',
      timeUsed: 60,
      memoryUsed: 256,
    }]);
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
    expect(prisma.externalSolvedProblem.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        remoteSubmissionId: '1001',
        timeUsed: 46,
        memoryUsed: 200,
      }),
    }));
  });

  it('requires a bound Codeforces handle before syncing', async () => {
    prisma.externalAccount.findFirst.mockResolvedValue(null);

    await expect(service.syncUserAccepted('u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reads page two and keeps newest AC when page boundaries overlap', async () => {
    prisma.externalAccount.findFirst.mockResolvedValue({remoteUsername:'tourist'});
    prisma.problemSource.findMany.mockResolvedValue([]);
    const entry = { id:2000,creationTimeSeconds:1700000000,problem:{contestId:4,index:'A'},verdict:'OK' };
    const fetch = jest.spyOn(service as any,'fetchUserStatus').mockResolvedValueOnce(Array(1000).fill(entry))
      .mockResolvedValueOnce([{...entry,id:1000,problem:{contestId:5,index:'B'}},entry]);
    const result = await service.syncUserAccepted('u1');
    expect(fetch).toHaveBeenNthCalledWith(2,'tourist',1000,1001);
    expect(result).toMatchObject({fetchedCount:1002,acceptedCount:2,createdCount:2,unmatchedCount:2});
  }, 10000);

  it('does not write a partial sync when a later page fails', async () => {
    prisma.externalAccount.findFirst.mockResolvedValue({remoteUsername:'tourist'});
    jest.spyOn(service as any,'fetchUserStatus').mockResolvedValueOnce(Array(1000).fill({id:1,problem:{contestId:4,index:'A'},verdict:'OK'}))
      .mockRejectedValue(new Error('CF unavailable'));
    await expect(service.syncUserAccepted('u1')).rejects.toThrow('CF unavailable');
    expect(prisma.externalSolvedProblem.upsert).not.toHaveBeenCalled();
  }, 10000);

  it('does not rewrite unchanged records, but links a newly imported problem on resync', async () => {
    prisma.externalAccount.findFirst.mockResolvedValue({remoteUsername:'tourist'});
    const submission={id:1001,creationTimeSeconds:1700000000,problem:{contestId:4,index:'A'},verdict:'OK',timeConsumedMillis:1,memoryConsumedBytes:1024};
    jest.spyOn(service as any,'fetchUserStatus').mockResolvedValue([submission]);
    prisma.externalSolvedProblem.findMany.mockResolvedValue([{remoteProblemId:'4A',problemId:null,remoteSubmissionId:'1001',timeUsed:1,memoryUsed:1,rawPayload:submission}]);
    prisma.problemSource.findMany.mockResolvedValue([]);
    expect((await service.syncUserAccepted('u1')).unchangedCount).toBe(1);
    expect(prisma.externalSolvedProblem.upsert).not.toHaveBeenCalled();
    prisma.problemSource.findMany.mockResolvedValue([{remoteProblemId:'4A',problemId:'local4a'}]);
    expect((await service.syncUserAccepted('u1')).updatedCount).toBe(1);
    expect(prisma.externalSolvedProblem.upsert).toHaveBeenCalledWith(expect.objectContaining({update:expect.objectContaining({problemId:'local4a'})}));
  });

  it('rejects repeated full pages instead of looping or silently truncating', async () => {
    prisma.externalAccount.findFirst.mockResolvedValue({remoteUsername:'tourist'});
    jest.spyOn(service as any,'fetchUserStatus').mockResolvedValue(Array(1000).fill({id:1,problem:{contestId:4,index:'A'},verdict:'OK'}));
    await expect(service.syncUserAccepted('u1')).rejects.toThrow('重复分页');
    expect(prisma.externalSolvedProblem.upsert).not.toHaveBeenCalled();
  },10000);

  it('preserves an existing local identity when a source is temporarily unavailable', async () => {
    prisma.externalAccount.findFirst.mockResolvedValue({remoteUsername:'tourist'});
    prisma.problemSource.findMany.mockResolvedValue([]);
    prisma.externalSolvedProblem.findMany.mockResolvedValue([{remoteProblemId:'4A',problemId:'local4a',remoteSubmissionId:'old'}]);
    jest.spyOn(service as any,'fetchUserStatus').mockResolvedValue([{id:1,creationTimeSeconds:1700000000,problem:{contestId:4,index:'A'},verdict:'OK'}]);
    await service.syncUserAccepted('u1');
    expect(prisma.externalSolvedProblem.upsert).toHaveBeenCalledWith(expect.objectContaining({update:expect.objectContaining({problemId:'local4a'})}));
  });

  it('refreshes rating metadata even if the accepted submission did not change', async () => {
    prisma.externalAccount.findFirst.mockResolvedValue({remoteUsername:'tourist'});
    prisma.problemSource.findMany.mockResolvedValue([]);
    prisma.externalSolvedProblem.findMany.mockResolvedValue([{remoteProblemId:'4A',problemId:null,remoteSubmissionId:'1',timeUsed:1,memoryUsed:1,rawPayload:{problem:{contestId:4,index:'A'}}}]);
    jest.spyOn(service as any,'fetchUserStatus').mockResolvedValue([{id:1,creationTimeSeconds:1700000000,problem:{contestId:4,index:'A',rating:1200},verdict:'OK',timeConsumedMillis:1,memoryConsumedBytes:1024}]);
    expect((await service.syncUserAccepted('u1')).updatedCount).toBe(1);
  });

  it('does not rewrite metadata reordered by PostgreSQL JSONB storage', async () => {
    prisma.externalAccount.findFirst.mockResolvedValue({ remoteUsername: 'tourist' });
    prisma.problemSource.findMany.mockResolvedValue([]);
    prisma.externalSolvedProblem.findMany.mockResolvedValue([{ remoteProblemId: '4A', problemId: null, remoteSubmissionId: '1', timeUsed: 1, memoryUsed: 1, rawPayload: { problem: { index: 'A', rating: 1200, contestId: 4 } } }]);
    jest.spyOn(service as any, 'fetchUserStatus').mockResolvedValue([{ id: 1, creationTimeSeconds: 1700000000, problem: { contestId: 4, index: 'A', rating: 1200 }, verdict: 'OK', timeConsumedMillis: 1, memoryConsumedBytes: 1024 }]);
    expect((await service.syncUserAccepted('u1')).unchangedCount).toBe(1);
    expect(prisma.externalSolvedProblem.upsert).not.toHaveBeenCalled();
  });

  it('corrects a published local CF difficulty from its actual rated submission', async () => {
    prisma.externalAccount.findFirst.mockResolvedValue({ remoteUsername: 'tourist' });
    prisma.problemSource.findMany.mockResolvedValue([{ remoteProblemId: '2232D', problemId: 'local', problem: { status: 'PUBLISHED', difficulty: 'POINT_3' } }]);
    jest.spyOn(service as any, 'fetchUserStatus').mockResolvedValue([{ id: 1, creationTimeSeconds: 1700000000, problem: { contestId: 2232, index: 'D', rating: 2000 }, verdict: 'OK' }]);
    await service.syncUserAccepted('u1');
    expect(prisma.problem.updateMany).toHaveBeenCalledWith({ where: { id: 'local', status: 'PUBLISHED', difficulty: 'POINT_3' }, data: { difficulty: 'POINT_4' } });
  });

  it('does not overwrite hidden or missing-rating local difficulty during accepted sync', async () => {
    prisma.externalAccount.findFirst.mockResolvedValue({ remoteUsername: 'tourist' });
    prisma.problemSource.findMany.mockResolvedValue([{ remoteProblemId: '4A', problemId: 'local', problem: { status: 'DRAFT', difficulty: null } }, { remoteProblemId: '5A', problemId: 'local2', problem: { status: 'PUBLISHED', difficulty: 'POINT_3' } }]);
    jest.spyOn(service as any, 'fetchUserStatus').mockResolvedValue([{ id: 1, creationTimeSeconds: 1700000000, problem: { contestId: 4, index: 'A', rating: 2000 }, verdict: 'OK' }, { id: 2, creationTimeSeconds: 1700000000, problem: { contestId: 5, index: 'A' }, verdict: 'OK' }]);
    await service.syncUserAccepted('u1');
    expect(prisma.problem.updateMany).not.toHaveBeenCalled();
  });
});
