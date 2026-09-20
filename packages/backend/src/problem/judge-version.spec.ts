import AdmZip from 'adm-zip';
import { ProblemService } from './problem.service';

describe('immutable judge versions', () => {
  let db: any; let service: ProblemService;
  const actor = { id: 'author', role: 'TEACHER' };
  const current = { id: 'v1', version: 1, description: 'statement', isCurrent: true,
    checker: { type: 'SPJ', language: 'python', sourceCode: 'print(True)', protocol: 'LEGACY' },
    testCases: [{ input: 'old', expectedOutput: '', order: 1, score: 100, isSample: false }], testGroups: [] };
  beforeEach(() => {
    db = {
      problem: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', status: 'DRAFT', timeLimit: 1000, memoryLimit: 256 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'p1', status: 'DRAFT', timeLimit: 1000, memoryLimit: 256 }), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      problemVersion: { findFirst: jest.fn().mockResolvedValue(structuredClone(current)), update: jest.fn(), updateMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'v2' }) },
      problemTestCase: { deleteMany: jest.fn(), createMany: jest.fn(), count: jest.fn().mockResolvedValue(1) },
      testGroup: { deleteMany: jest.fn(), create: jest.fn() }, checker: { upsert: jest.fn() },
      $executeRaw: jest.fn(), $transaction: jest.fn((fn: any) => fn(db)),
    };
    service = new ProblemService(db, { uploadFile: jest.fn() } as any, { assertCanManage: jest.fn() } as any);
  });
  it('uploads new cases by publishing a new version without deleting old test data', async () => {
    const zip = new AdmZip(); zip.addFile('1.in', Buffer.from('new'));
    await service.uploadTestData('p1', { originalname: 'data.zip', buffer: zip.toBuffer(), size: 100 } as any, actor);
    expect(db.problemTestCase.deleteMany).not.toHaveBeenCalled();
    expect(db.$executeRaw).toHaveBeenCalled();
    expect(db.problemVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      problemId: 'p1', version: 2, isCurrent: true,
      checker: { create: expect.objectContaining({ protocol: 'LEGACY' }) },
      testCases: { create: [expect.objectContaining({ input: 'new' })] },
    }) }));
  });
  it('updates checker in a new version and preserves legacy protocol when not specified', async () => {
    await service.update('p1', { spjSourceCode: 'print(False)' }, actor);
    expect(db.checker.upsert).not.toHaveBeenCalled();
    expect(db.problemVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      checker: { create: expect.objectContaining({ sourceCode: 'print(False)', protocol: 'LEGACY' }) },
      testCases: { create: [expect.objectContaining({ input: 'old' })] },
    }) }));
  });
  it('new SPJ defaults to strict boolean protocol', async () => {
    await service.createFull({ title: 'p', description: 'd', judgeMode: 'SPJ', spjLanguage: 'python', spjSourceCode: 'print(True)' }, actor);
    expect(db.problem.create).toHaveBeenCalledWith(expect.objectContaining({data: expect.objectContaining({versions:{create: expect.objectContaining({checker:{create:expect.objectContaining({protocol:'BOOLEAN_STDOUT'})}})}})}));
  });
  it('uploads checker source bytes, not an object storage path', async () => {
    await service.uploadChecker('p1', { originalname:'checker.py', buffer:Buffer.from('print(False)') } as any, 'SPJ', 'python', actor);
    expect(db.problemVersion.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({checker:{create:expect.objectContaining({sourceCode:'print(False)'})}})}));
  });
  it('rejects switching a published input-only SPJ to standard without new answers', async () => {
    db.problem.findUniqueOrThrow.mockResolvedValue({ id:'p1',status:'PUBLISHED',timeLimit:1000,memoryLimit:256 });
    await expect(service.update('p1', { judgeMode:'STANDARD' }, actor)).rejects.toThrow('草稿');
    expect(db.problemVersion.create).not.toHaveBeenCalled();
  });
  it('switching draft SPJ to standard removes input-only cases only from the new version', async () => {
    await service.update('p1', { judgeMode:'STANDARD' }, actor);
    expect(db.problemVersion.create.mock.calls[0][0].data.testCases.create).toEqual([]);
    expect(db.problemTestCase.deleteMany).not.toHaveBeenCalled();
  });
  it('rejects invalid protocol', async () => {
    await expect(service.createFull({title:'p',description:'d',judgeMode:'SPJ',spjLanguage:'python',spjSourceCode:'pass',spjProtocol:'invalid'},actor)).rejects.toThrow('协议');
  });
  it('checks publication data under the same lock as version changes', async () => {
    db.problem.findUniqueOrThrow.mockResolvedValue({id:'p1',source:'LOCAL'});
    db.problem.findUnique.mockResolvedValue({id:'p1',source:'LOCAL'});
    db.problemVersion.findFirst.mockResolvedValue({...current,testCases:[]});
    await expect(service.updateStatus('p1','PUBLISHED',actor)).rejects.toThrow('测试数据');
    expect(db.$executeRaw).toHaveBeenCalled();
    expect(db.problem.update).not.toHaveBeenCalled();
  });
});
