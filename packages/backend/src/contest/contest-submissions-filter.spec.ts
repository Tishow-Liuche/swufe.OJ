import { ContestService } from './contest.service';
import { ContestStandingsCalculatorService } from './contest-standings-calculator.service';

describe('contest submission ownership filter', () => {
  it('provides only minimal filter options to unenrolled campus teachers',async()=>{
    const prisma:any={contest:{findUnique:jest.fn().mockResolvedValue({id:'c1',visibility:'CAMPUS_PRIVATE',participants:[],problems:[{problemId:'p1',problem:{id:'p1',title:'Sum',description:'secret'}}]})},contestSubmission:{findMany:jest.fn().mockResolvedValue([])}};
    const service=new ContestService(prisma,{} as any,new ContestStandingsCalculatorService());
    const response:any=await service.contestSubmissions('c1',{id:'teacher',role:'TEACHER'});
    expect(response.problems).toEqual([{id:'p1',label:'A',title:'Sum'}]);
  });
  it('combines problem, mine and nickname before limiting and bypasses shared cache',async()=>{
    const prisma:any={contest:{findUnique:jest.fn().mockResolvedValue({id:'c1',visibility:'PUBLIC',problems:[{problemId:'p1'}]})},contestSubmission:{findMany:jest.fn().mockResolvedValue([])}};
    const cache:any={get:jest.fn()};
    const service=new ContestService(prisma,{} as any,new ContestStandingsCalculatorService(),cache);
    await (service.contestSubmissions as any)('c1',{id:'self',role:'STUDENT'},true,'Alice','p1');
    expect(prisma.contestSubmission.findMany.mock.calls[0][0].where.submission).toMatchObject({userId:'self',problemId:'p1'});
    await (service.contestSubmissions as any)('c1',{id:'self',role:'STUDENT'},false,undefined,'p1');
    expect(cache.get).not.toHaveBeenCalled();
    await expect((service.contestSubmissions as any)('c1',{id:'self'},false,undefined,'foreign')).rejects.toThrow('题目');
  });
  it.each(['TEACHER','ADMIN'])('allows unenrolled campus %s to read without manager escalation',async role=>{
    const contest={id:'c1',visibility:'CAMPUS_PRIVATE',participants:[],problems:[],submissions:[],createdBy:'owner'};
    const prisma:any={contest:{findUnique:jest.fn().mockResolvedValue(contest)},contestSubmission:{findMany:jest.fn().mockResolvedValue([])}};
    const calculator:any={calculate:jest.fn().mockReturnValue({})};
    const service=new ContestService(prisma,{} as any,calculator);
    await expect(service.contestSubmissions('c1',{id:'self',role})).resolves.toBeDefined();
    await service.standings('c1',{id:'self',role});
    expect(calculator.calculate.mock.calls[0][0].canManage).toBe(role==='ADMIN');
  });
  it.each([true, false])('filters before limiting records: mine=%s', async (mine) => {
    const prisma: any = {
      contest: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', visibility: 'PUBLIC', problems: [] }) },
      contestSubmission: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ContestService(prisma, {} as any, new ContestStandingsCalculatorService());
    await (service.contestSubmissions as any)('c1', { id: 'self', role: 'STUDENT' }, mine);
    expect(prisma.contestSubmission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: mine ? { contestId: 'c1', submission: { userId: 'self' } } : { contestId: 'c1' },
      take: 80,
    }));
  });
});
