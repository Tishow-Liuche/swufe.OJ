import { DelayedError } from 'bullmq';
import { deferDatabaseOutage, isTransientDatabaseError } from './database-outage';

describe('database outage recovery', () => {
  it.each([{ code: 'P1001' }, { errorCode: 'P1001' }, { code: 'P2024' },
    { code: 'P2010', meta: { code: '08006' } }, { code: 'P2010', meta: { code: '57P01' } },
    { name: 'PrismaClientInitializationError', message: "Can't reach database server at `127.0.0.1:15432`" }])
  ('recognizes connection errors including raw query wrappers: %j', error => {
    expect(isTransientDatabaseError(error)).toBe(true);
  });
  it.each([{ code: 'P1000' }, { code: 'P2002' }, { code: 'P2010', meta: { code: '42601' } },
    { name: 'PrismaClientInitializationError', message: 'Authentication failed' }, new Error('database unavailable')])
  ('does not disguise credentials, schema or unknown bugs as connection outages: %j', error => {
    expect(isTransientDatabaseError(error)).toBe(false);
  });
  function job(data = {}) {
    return { data: { submissionId: 's1', ...data }, updateData: jest.fn().mockResolvedValue(undefined),
      moveToDelayed: jest.fn().mockResolvedValue(undefined), attemptsMade: 3 } as any;
  }
  it('persists recovery clock then releases the worker slot even after ordinary retries exhausted', async () => {
    const task = job();
    await expect(deferDatabaseOutage(task, 'lock', 100000)).rejects.toBeInstanceOf(DelayedError);
    expect(task.updateData).toHaveBeenCalledWith({ submissionId: 's1', databaseRecovery: { since: 100000, count: 1 } });
    expect(task.moveToDelayed).toHaveBeenCalledWith(110000, 'lock');
  });
  it('backs off to at most a minute without resetting the outage clock', async () => {
    const task = job({ databaseRecovery: { since: 100000, count: 9 } });
    await expect(deferDatabaseOutage(task, 'lock', 200000)).rejects.toBeInstanceOf(DelayedError);
    expect(task.moveToDelayed).toHaveBeenCalledWith(260000, 'lock');
    expect(task.updateData.mock.calls[0][0].databaseRecovery.since).toBe(100000);
  });
  it('persists an expiry marker after 30 minutes and defers only terminal publication', async () => {
    const task = job({ databaseRecovery: { since: 100000, count: 40 } });
    await expect(deferDatabaseOutage(task, 'lock', 1900000)).rejects.toBeInstanceOf(DelayedError);
    expect(task.updateData.mock.calls[0][0].databaseRecovery).toEqual({ since: 100000, count: 41, expiredAt: 1900000 });
    expect(task.moveToDelayed).toHaveBeenCalledWith(1960000, 'lock');
  });
  it('does not mark a task deferred if Redis cannot persist it', async () => {
    const task = job();
    task.updateData.mockRejectedValue(new Error('redis disconnected'));
    await expect(deferDatabaseOutage(task, 'lock', 100000)).rejects.toThrow('redis disconnected');
    expect(task.moveToDelayed).not.toHaveBeenCalled();
  });
  it('preserves the original expiry marker across publication retries', async () => {
    const task = job({ databaseRecovery: { since: 100000, count: 41, expiredAt: 1900000 } });
    await expect(deferDatabaseOutage(task, 'lock', 1960000)).rejects.toBeInstanceOf(DelayedError);
    expect(task.updateData.mock.calls[0][0].databaseRecovery.expiredAt).toBe(1900000);
    expect(task.moveToDelayed).toHaveBeenCalledWith(2020000, 'lock');
  });
});
