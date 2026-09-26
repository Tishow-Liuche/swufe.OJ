import AdmZip from 'adm-zip';
import { ProblemService } from './problem.service';

describe('optional SPJ reference outputs', () => {
  const service = new ProblemService({} as any, {} as any, {} as any);
  function parse(files: Record<string,string>) {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content));
    return (service as any).parseTestDataZip({originalname:'data.zip',buffer:zip.toBuffer()}, 'SPJ');
  }
  it.each(['out','ans'])('preserves provided .%s contents', extension => {
    const cases = parse({'abs1.in':'1\n',[`abs1.${extension}`]:'Yes\n'});
    expect(cases[0].expectedOutput).toBe('Yes\n');
    expect(cases[0].byteSize).toBe(6);
  });
  it('still accepts input-only archives', () => {
    expect(parse({'1.in':'1\n'})[0].expectedOutput).toBe('');
  });
  it('preserves optional inline reference data', () => {
    expect((service as any).normalizeInlineTestCases([{input:'1',expectedOutput:'No'}],'SPJ','DRAFT')[0].expectedOutput).toBe('No');
  });
  it('streams large reference outputs without losing bytes', async () => {
    const output = 'Yes\n'.repeat(100000);
    const cases = parse({'1.in':'1\n','1.out':output});
    const db:any = {$executeRaw:jest.fn(),problemVersion:{updateMany:jest.fn(),create:jest.fn().mockResolvedValue({id:'v2'})}};
    await (service as any).publishVersion(db,{id:'v1',version:1,testGroups:[]},{id:'p'},{testCases:cases});
    const chunks = db.$executeRaw.mock.calls.filter(([sql,kind]:any[])=>sql.join('').includes('INSERT INTO pg_temp.oj_import_chunks')&&kind==='output');
    expect(chunks.map((c:any[])=>c[3]).join('')===output).toBe(true);
    expect(db.problemVersion.create.mock.calls[0][0].data.testCases).toBeUndefined();
  });
});
