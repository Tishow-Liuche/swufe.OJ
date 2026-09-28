import { ContestService } from './contest.service';
describe('campus contest submission identity',()=>{
  const user={id:'u1',username:'login',nickname:'Account nickname'};
  const submission={id:'s1',userId:'u1',problemId:'p1',user,sourceCode:'code'};
  function fixture(visibility='CAMPUS_PRIVATE',participants:any[]=[{userId:'u1',realName:'张三',studentId:'42411036'}]){
    const db:any={contest:{findUnique:jest.fn().mockResolvedValue({id:'c1',visibility,participants,problems:[],endTime:new Date(0),submissions:[{submission}]})},contestSubmission:{findMany:jest.fn().mockResolvedValue([{submission}])}};
    return {db,service:new ContestService(db,{} as any,{} as any)};
  }
  it('uses contest registration identity in both list and details without mutating account',async()=>{
    const {db,service}=fixture();const actor={id:'u1',role:'STUDENT'};
    expect((await service.contestSubmissions('c1',actor)).items[0].user.displayName).toBe('张三（42411036）');
    expect((await service.contestSubmissionDetail('c1','s1',actor)).user).toMatchObject({displayName:'张三（42411036）'});
    expect(user.nickname).toBe('Account nickname');
    expect(db.contest.findUnique.mock.calls.find(([q])=>q.include?.participants)?.[0].include.participants.select).toMatchObject({realName:true,studentId:true});
  });
  it.each(['PUBLIC','PRIVATE','PASSWORD'])('does not change non-campus %s identity',async visibility=>{
    const {service}=fixture(visibility);expect((await service.contestSubmissions('c1',{id:'u1'})).items[0].user).toEqual(user);
  });
  it('falls back for legacy participants without registration identity',async()=>{
    const {service}=fixture('CAMPUS_PRIVATE',[{userId:'u1'}]);expect((await service.contestSubmissions('c1',{id:'u1'})).items[0].user).toEqual(user);
  });
  it.each(['张三','42411036','张三（42411036）'])('searches registered identity %s while preserving only-mine restriction',async query=>{
    const {db,service}=fixture();await service.contestSubmissions('c1',{id:'u1'},true,query);
    expect(db.contestSubmission.findMany.mock.calls[0][0].where.submission).toMatchObject({userId:'u1',OR:expect.arrayContaining([{userId:{in:['u1']}}])});
  });
});
