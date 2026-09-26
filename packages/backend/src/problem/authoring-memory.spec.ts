import { ProblemService } from './problem.service';
import AdmZip from 'adm-zip';
describe('bounded authoring queries', () => {
  it('preserves large inline replacements instead of inserting empty cases', async () => {
    const db: any = { problemVersion: {updateMany:jest.fn(),create:jest.fn().mockResolvedValue({id:'v2'})}, $executeRaw:jest.fn() };
    const service = new ProblemService(db, {} as any, {} as any);
    const input = 'x'.repeat(300000);
    await (service as any).publishVersion(db, {id:'v1',version:1,testGroups:[]}, {id:'p'}, {testCases:[{input,expectedOutput:'ok',score:100,order:1,isSample:false}]});
    const chunks = db.$executeRaw.mock.calls.filter(([sql]:any[]) => sql.join('').includes('INSERT INTO pg_temp.oj_import_chunks'));
    expect(chunks.filter((c:any[])=>c[1]==='input').map((c:any[])=>c[3]).join('')).toBe(input);
    expect(chunks.filter((c:any[])=>c[1]==='output').map((c:any[])=>c[3]).join('')).toBe('ok');
  });
  it('rejects corrupt supplied SPJ outputs even when their content is discarded', async () => {
    const zip = new AdmZip(); zip.addFile('1.in', Buffer.from('x')); zip.addFile('1.out', Buffer.from('y'));
    const buffer = zip.toBuffer();
    let offset = buffer.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
    offset = buffer.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]),offset+4);
    buffer.writeUInt32LE(0,offset+16);
    const db:any = {problem:{findUnique:jest.fn().mockResolvedValue({id:'p'}),findUniqueOrThrow:jest.fn().mockResolvedValue({id:'p'})}, problemVersion:{findFirst:jest.fn().mockResolvedValue({id:'v',checker:{type:'SPJ'},testGroups:[],testCases:[]}),updateMany:jest.fn(),create:jest.fn().mockResolvedValue({id:'v2'})},$executeRaw:jest.fn()};
    db.$transaction=(fn:any)=>fn(db);
    const service = new ProblemService(db,{} as any,{assertCanManage:jest.fn()} as any);
    await expect(service.uploadTestData('p',{originalname:'data.zip',buffer,size:buffer.length} as any,{id:'t',role:'TEACHER'})).rejects.toThrow('损坏');
    expect(db.problemVersion.create).not.toHaveBeenCalled();
  });
  it('does not load test bodies for editor detail or version locking', async () => {
    const db: any = { problem: { findUnique: jest.fn().mockResolvedValue({id:'p',source:'LOCAL'}) }, problemVersion: {findFirst:jest.fn().mockResolvedValue({id:'v'})}, $executeRaw:jest.fn() };
    const service = new ProblemService(db, {} as any, {assertCanManage:jest.fn()} as any);
    await service.findManageable('p', {id:'t',role:'TEACHER'});
    await (service as any).lockCurrentVersion(db,'p');
    expect(db.problem.findUnique.mock.calls[0][0].include.versions.include.testCases.select).toEqual({id:true});
    expect(db.problemVersion.findFirst.mock.calls[0][0].include.testCases.select).toEqual({id:true});
  });
  it('copies immutable test rows in PostgreSQL without pulling strings into Node', async () => {
    const db: any = { problemVersion: {updateMany:jest.fn(),create:jest.fn().mockResolvedValue({id:'v2'})}, $executeRaw:jest.fn() };
    const service = new ProblemService(db, {} as any, {} as any);
    await (service as any).publishVersion(db, {id:'v1',version:1,testCases:[{id:'tc'}],testGroups:[]}, {id:'p'}, {description:'new'});
    expect(db.problemVersion.create.mock.calls[0][0].data.testCases).toBeUndefined();
    expect(db.$executeRaw.mock.calls.some(([sql]:any[])=>sql.join('').includes('INSERT INTO "ProblemTestCase"'))).toBe(true);
  });
});
