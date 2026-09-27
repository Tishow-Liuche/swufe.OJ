import { ContestService } from './contest.service';

describe('administrator participant import', () => {
  let db:any, service:ContestService, cache:any;
  const admin={id:'admin',role:'ADMIN'};
  beforeEach(()=>{
    let inserted:any[]=[];
    db={contest:{findUnique:jest.fn().mockResolvedValue({id:'c',visibility:'PUBLIC',endTime:new Date(Date.now()+60000)})},
      user:{findMany:jest.fn().mockResolvedValue([{id:'u',username:'alice',studentId:'42411036',deletedAt:null}])},
      contestParticipant:{findMany:jest.fn(async({where})=>where.id?inserted:[]),createMany:jest.fn(async({data})=>{inserted=data;return{count:data.length};})}};
    db.$transaction=jest.fn(fn=>fn(db));cache={invalidateContest:jest.fn()};
    service=new ContestService(db,{} as any,{} as any,cache);
  });
  const run=(s:any,rows:any,actor:any=admin)=>s.importParticipants('c',actor,{rows});
  it.each(['STUDENT','TEACHER',undefined])('rejects role %s',async role=>{
    await expect(run(service,[{username:'alice'}],{id:'owner',role})).rejects.toThrow();
    expect(db.contestParticipant.createMany).not.toHaveBeenCalled();
  });
  it.each(['ACM','IOI'].flatMap(mode=>['PUBLIC','PRIVATE','PASSWORD','CAMPUS_PRIVATE'].flatMap(visibility=>[false,true].map(teamMode=>({mode,visibility,teamMode})))))('allows admin in %j after registration closes',async flags=>{
    db.contest.findUnique.mockResolvedValue({id:'c',...flags,startTime:new Date(0),registerEnd:new Date(0),endTime:new Date(Date.now()+60000)});
    const r=await run(service,[{username:'alice',studentId:'42411036',realName:'张三'}]);
    expect(r.imported).toBe(1);expect(cache.invalidateContest).toHaveBeenCalledWith('c');
    expect(db.contestParticipant.createMany.mock.calls[0][0].data[0].isVirtual).toBe(false);
  });
  it('rejects ended contests',async()=>{
    db.contest.findUnique.mockResolvedValue({id:'c',endTime:new Date(0)});
    await expect(run(service,[{username:'alice'}])).rejects.toThrow('结束');
  });
  it('aborts if an insert waits beyond the contest deadline',async()=>{
    const clock=jest.spyOn(Date,'now');const start=Date.now();
    db.contest.findUnique.mockResolvedValue({id:'c',visibility:'PUBLIC',endTime:new Date(start+1000)});
    db.contestParticipant.createMany.mockImplementation(async()=>{clock.mockReturnValue(start+2000);return{count:1};});
    try{await expect(run(service,[{username:'alice'}])).rejects.toThrow('结束');expect(cache.invalidateContest).not.toHaveBeenCalled();}
    finally{clock.mockRestore();}
  });
  it('skips existing virtual registrations without writing or changing their timing',async()=>{
    db.contestParticipant.findMany.mockResolvedValue([{userId:'u',isVirtual:true,virtualStart:new Date(0)}]);
    const r=await run(service,[{username:'alice'}]);expect(r.skipped).toBe(1);expect(db.contestParticipant.createMany).not.toHaveBeenCalled();
  });
  it('handles concurrent duplicates without claiming they were inserted',async()=>{
    db.contestParticipant.findMany.mockResolvedValue([]);
    expect(await run(service,[{username:'alice'}])).toMatchObject({imported:0,skipped:1,invalid:0});
  });
  it('filters deleted users and rejects malformed fields',async()=>{
    const r=await run(service,[null,{username:123},{username:'alice',realName:'x'.repeat(101)}]);
    expect(r.invalid).toBe(3);expect(db.user.findMany.mock.calls[0][0].where.deletedAt).toBeNull();expect(db.contestParticipant.createMany).not.toHaveBeenCalled();
  });
  it('reports invalid accounts and duplicates without overwriting registrations',async()=>{
    const r=await run(service,[{username:'alice'},{studentId:'42411036'},{username:'missing'}]);
    expect(r).toMatchObject({imported:1,skipped:1,invalid:1});
    expect(db.contestParticipant.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });
  it('validates campus identity and does not silently match conflicting identifiers',async()=>{
    db.contest.findUnique.mockResolvedValue({id:'c',visibility:'CAMPUS_PRIVATE',endTime:new Date(Date.now()+60000)});
    const r=await run(service,[{username:'alice'},{username:'alice',studentId:'00000000',realName:'张三'}]);
    expect(r.invalid).toBe(2);expect(db.contestParticipant.createMany).not.toHaveBeenCalled();
  });
  it.each([null,[],Array(501).fill({username:'alice'})])('rejects invalid batch size',async rows=>{
    await expect(run(service,rows)).rejects.toThrow();
  });
});
