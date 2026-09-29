import { ContestService } from './contest.service';
import { ContestStandingsCalculatorService } from './contest-standings-calculator.service';

describe('ended contest public reads', () => {
  const now = new Date('2026-09-29T09:10:00Z');
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(now); });
  afterEach(() => jest.useRealTimers());
  function fixture(visibility = 'PRIVATE', mode = 'ACM') {
    const submission = { id: 's', userId: 'author', problemId: 'p', status: 'WRONG_ANSWER',
      sourceCode: 'int main(){}', createdAt: new Date(now.getTime()-1000),
      user: { id: 'author', username: 'author' }, problem: { id: 'p', title: 'Sum' },
      cases: [{ caseIndex: 1, status: 'WRONG_ANSWER', timeUsed: 1, memoryUsed: 2, input: 'secret', output: 'secret', checkerMessage: 'secret' }] };
    const contest: any = { id: 'c', title: 'Contest', visibility, mode, password: 'secret-password',
      createdBy: 'owner', startTime: new Date(now.getTime()-60000), endTime: now,
      participants: [], problems: [], submissions: [{ submission }] };
    const prisma: any = { contest: { findUnique: jest.fn(async()=>contest), findMany: jest.fn(async()=>[contest]) },
      user: { findMany: jest.fn(async()=>[]) }, contestSubmission: { findMany: jest.fn(async()=>[{submission}]) } };
    return { contest, prisma, service: new ContestService(prisma, {} as any, new ContestStandingsCalculatorService()) };
  }
  it.each(['PUBLIC','PASSWORD','PRIVATE','CAMPUS_PRIVATE'].flatMap(v=>['ACM','IOI'].map(m=>[v,m])))
  ('opens %s %s at the official end to guests and unenrolled users',async(visibility,mode)=>{
    for(const viewer of [undefined,{id:'outsider',role:'STUDENT'}]) {
      const {service}=fixture(visibility,mode);
      await expect(service.getContest('c',viewer)).resolves.toMatchObject({state:'ENDED'});
      expect(await service.getContest('c',viewer)).not.toHaveProperty('password');
      await expect(service.standings('c',viewer as any)).resolves.toMatchObject({rows:[]});
      await expect(service.contestSubmissions('c',viewer as any)).resolves.toMatchObject({items:[{id:'s'}]});
      const detail=await service.contestSubmissionDetail('c','s',viewer as any);
      expect(detail.sourceCode).toBe('int main(){}');
      expect(detail.cases).toEqual([{caseIndex:1,status:'WRONG_ANSWER',timeUsed:1,memoryUsed:2}]);
    }
  });
  it.each(['PUBLIC','PASSWORD','PRIVATE','CAMPUS_PRIVATE'])('keeps anonymous reads protected before %s ends',async visibility=>{
    const {service,contest}=fixture(visibility); contest.endTime=new Date(now.getTime()+1);
    await expect(service.getContest('c')).rejects.toThrow();
    await expect(service.standings('c',undefined as any)).rejects.toThrow();
    await expect(service.contestSubmissions('c',undefined as any)).rejects.toThrow();
    await expect(service.contestSubmissionDetail('c','s',undefined as any)).rejects.toThrow();
  });
  it('does not reveal a submission outside the requested contest',async()=>{
    const {service,contest}=fixture(); contest.submissions=[];
    await expect(service.contestSubmissionDetail('c','foreign',undefined as any)).rejects.toThrow('提交记录不属于');
  });
  it('rejects anonymous mine instead of dropping the user filter',async()=>{
    const {service}=fixture();
    await expect(service.contestSubmissions('c',undefined as any,true)).rejects.toThrow();
  });
  it('does not reuse public cache access when an end time is extended',async()=>{
    const {service,contest}=fixture();await service.standings('c',undefined as any);
    contest.endTime=new Date(now.getTime()+60000);
    await expect(service.standings('c',undefined as any)).rejects.toThrow();
  });
  it('includes ended private contests in both discovery queries',async()=>{
    const {service,prisma}=fixture();
    await service.listPublic();await service.listMine({id:'outsider'});
    for(const [query] of prisma.contest.findMany.mock.calls) {
      expect(query.where.OR).toContainEqual({endTime:{lte:now}});
    }
  });
  it('paginates bounded submissions without hiding records older than the first 80',async()=>{
    const {service,prisma}=fixture();
    const item=(await prisma.contestSubmission.findMany())[0];
    prisma.contestSubmission.findMany.mockResolvedValue(Array.from({length:81},(_,i)=>({submission:{...item.submission,id:String(i)}})));
    const response=await (service.contestSubmissions as any)('c',undefined,false,undefined,undefined,2);
    expect(prisma.contestSubmission.findMany).toHaveBeenLastCalledWith(expect.objectContaining({skip:80,take:81}));
    expect(response.items).toHaveLength(80);expect(response).toMatchObject({page:2,pageSize:80,hasMore:true});
  });
});
