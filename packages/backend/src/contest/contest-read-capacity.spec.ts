import { ContestService } from './contest.service';
describe('contest read capacity and privacy',()=>{
  afterEach(()=>jest.useRealTimers());
  const student={id:'u',role:'STUDENT'};
  function fixture(){
    const contest:any={id:'c',title:'Contest',visibility:'CAMPUS_PRIVATE',createdBy:'admin',updatedAt:new Date(0),startTime:new Date(0),endTime:new Date(Date.now()+60000),participants:[{userId:'u'}],problems:[],submissions:[]};
    const db:any={contest:{findUnique:jest.fn(async()=>contest)},contestSubmission:{findMany:jest.fn(async()=>[])}};
    const calculator={calculate:jest.fn(({canManage})=>({rows:[],adminOnly:canManage}))};
    return{contest,db,calculator,service:new ContestService(db,{} as any,calculator as any)};
  }
  it('coalesces concurrent heavy standings queries and reuses them before SQL',async()=>{
    const {db,calculator,service}=fixture();await Promise.all(Array.from({length:20},()=>service.standings('c',student)));
    expect(calculator.calculate).toHaveBeenCalledTimes(1);
    expect(db.contest.findUnique.mock.calls.filter(([q])=>q.include?.submissions)).toHaveLength(1);
    await service.standings('c',student);expect(calculator.calculate).toHaveBeenCalledTimes(1);
  });
  it('never bypasses private contest authorization when warm',async()=>{
    const {service}=fixture();await service.standings('c',student);
    await expect(service.standings('c',{id:'outsider',role:'STUDENT'})).rejects.toThrow();
  });
  it('keeps teacher observation in contestant cache scope and denies outsider access to a warm feed',async()=>{
    const {service}=fixture();
    await service.standings('c',{id:'admin',role:'ADMIN'});
    expect(await service.standings('c',{id:'teacher',role:'TEACHER'})).toMatchObject({adminOnly:false});
    await service.contestSubmissions('c',{id:'teacher',role:'TEACHER'});
    await expect(service.contestSubmissions('c',{id:'outsider',role:'STUDENT'})).rejects.toThrow();
  });
  it('does not grant unenrolled teachers submit privileges',async()=>{
    const {service,db}=fixture();db.contestParticipant={findUnique:jest.fn().mockResolvedValue(null)};
    await expect(service.submit('c',{id:'teacher',role:'TEACHER'},{problemId:'p',language:'cpp',sourceCode:''})).rejects.toThrow('报名');
  });
  it('separates manager, freeze and ended cache scopes',async()=>{
    const {contest,calculator,service}=fixture();await service.standings('c',{id:'admin',role:'ADMIN'});
    expect(await service.standings('c',student)).toMatchObject({adminOnly:false});
    contest.freezeTime=new Date(0);await service.standings('c',student);expect(calculator.calculate).toHaveBeenCalledTimes(3);
    contest.endTime=new Date(0);await service.standings('c',student);expect(calculator.calculate).toHaveBeenCalledTimes(4);
  });
  it('changes scope when only the clock crosses freeze and end',async()=>{
    jest.useFakeTimers();jest.setSystemTime(10000);
    const {contest,calculator,service}=fixture();contest.freezeTime=new Date(10500);contest.endTime=new Date(11000);
    await service.standings('c',student);jest.setSystemTime(10501);await service.standings('c',student);
    jest.setSystemTime(11001);await service.standings('c',student);expect(calculator.calculate).toHaveBeenCalledTimes(3);
  });
  it('coalesces only unfiltered feed and preserves personal/search queries',async()=>{
    const {db,service}=fixture();await Promise.all(Array.from({length:20},()=>service.contestSubmissions('c',student)));
    expect(db.contestSubmission.findMany).toHaveBeenCalledTimes(1);
    const selection=db.contestSubmission.findMany.mock.calls[0][0].include.submission.select;
    expect(selection).toBeDefined();expect(selection.sourceCode).toBeUndefined();expect(selection.status).toBe(true);
    await service.contestSubmissions('c',student,true);await service.contestSubmissions('c',student,false,'Name');
    expect(db.contestSubmission.findMany).toHaveBeenCalledTimes(3);
    expect(db.contestSubmission.findMany.mock.calls[1][0].where.submission.userId).toBe('u');
  });
});
