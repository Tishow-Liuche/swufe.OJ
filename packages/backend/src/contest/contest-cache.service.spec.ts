import { ContestCacheService } from './contest-cache.service';

describe('ContestCacheService', () => {
  it('stores and loads standings using stable Redis keys', async () => {
    const redis: any = {
      get: jest.fn().mockResolvedValue(JSON.stringify({ rows: [{ userId: 'alice' }] })),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(2),
    };
    const service = new ContestCacheService(redis);

    await expect(service.getStandings('contest-1')).resolves.toEqual({ rows: [{ userId: 'alice' }] });
    await service.setStandings('contest-1', { rows: [] }, 3);
    await service.invalidateContest('contest-1');

    expect(redis.get).toHaveBeenCalledWith('contest:contest-1:standings:v1');
    expect(redis.set).toHaveBeenCalledWith('contest:contest-1:standings:v1', JSON.stringify({ rows: [] }), 'EX', 3);
    expect(redis.del).toHaveBeenCalledWith('contest:contest-1:standings:v1', 'contest:contest-1:submissions:v1');
  });

  it('safely no-ops when Redis is not available or cache is disabled', async () => {
    const service = new ContestCacheService(null as any);

    await expect(service.getStandings('contest-1')).resolves.toBeNull();
    await expect(service.setStandings('contest-1', { rows: [] }, 0)).resolves.toBeUndefined();
    await expect(service.invalidateContest('contest-1')).resolves.toBeUndefined();
  });
});
