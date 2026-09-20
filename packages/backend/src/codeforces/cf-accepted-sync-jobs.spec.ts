import { CfAcceptedSyncJobs } from './cf-accepted-sync-jobs';

describe('CF accepted background jobs', () => {
  it('deduplicates an active job and exposes only the current user job', async () => {
    const job = { getState: jest.fn().mockResolvedValue('active'), progress: { fetchedCount: 1000 } };
    const queue: any = { getJob: jest.fn().mockResolvedValue(job), add: jest.fn() };
    const db: any = { externalAccount: { findFirst: jest.fn().mockResolvedValue({remoteUsername:'tourist'}) } };
    const service = new CfAcceptedSyncJobs(queue, db);
    expect(await service.start('u1')).toMatchObject({state:'active',progress:{fetchedCount:1000}});
    expect(queue.getJob).toHaveBeenCalledWith('cf-u1');
    expect(queue.add).not.toHaveBeenCalled();
  });
  it('starts a durable user-keyed job without waiting for CF', async () => {
    const queue: any = {getJob:jest.fn().mockResolvedValue(null),add:jest.fn().mockResolvedValue({})};
    const db:any={externalAccount:{findFirst:jest.fn().mockResolvedValue({remoteUsername:'tourist'})}};
    expect(await new CfAcceptedSyncJobs(queue,db).start('u2')).toMatchObject({state:'waiting'});
    expect(queue.add).toHaveBeenCalledWith('sync',{userId:'u2'},expect.objectContaining({jobId:'cf-u2'}));
  });
  it('does not create a job for an unbound user', async () => {
    const queue:any={add:jest.fn()};const db:any={externalAccount:{findFirst:jest.fn().mockResolvedValue(null)}};
    await expect(new CfAcceptedSyncJobs(queue,db).start('u1')).rejects.toThrow('绑定');
    expect(queue.add).not.toHaveBeenCalled();
  });
});
