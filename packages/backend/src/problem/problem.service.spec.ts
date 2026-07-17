import { BadRequestException, ForbiddenException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { ProblemService } from './problem.service';

describe('ProblemService createFull with judge data', () => {
  let service: ProblemService;
  let prisma: any;
  let access: any;
  let fileUpload: any;

  const actor = { id: 'teacher-1', role: 'TEACHER' };

  beforeEach(() => {
    prisma = {
      problem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      problemVersion: {
        findFirst: jest.fn(),
      },
      problemTestCase: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        count: jest.fn(),
      },
      testGroup: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      checker: {
        upsert: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      problemPermission: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    access = {
      assertCanManage: jest.fn().mockResolvedValue({ id: 'p1' }),
      assertCanChangePermissions: jest.fn().mockResolvedValue({ id: 'p1' }),
    };
    fileUpload = {
      uploadFile: jest.fn().mockResolvedValue('checkers/p1/main.cpp'),
    };
    service = new (ProblemService as any)(prisma, fileUpload, access);
  });

  function zipFile(entries: Record<string, string>): Express.Multer.File {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(entries)) zip.addFile(name, Buffer.from(content));
    const buffer = zip.toBuffer();
    return {
      originalname: 'testdata.zip',
      mimetype: 'application/zip',
      buffer,
      size: buffer.length,
    } as Express.Multer.File;
  }

  it('allows draft problems to be created before uploading zip test data', async () => {
    prisma.problem.create.mockResolvedValue({ id: 'p0' });

    await service.createFull({
      title: 'A+B',
      description: 'desc',
      judgeMode: 'STANDARD',
      status: 'DRAFT',
    } as any, actor);

    expect(prisma.problem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'DRAFT',
        versions: {
          create: expect.not.objectContaining({ testCases: expect.anything() }),
        },
      }),
    }));
  });

  it('records the authenticated creator as the problem owner', async () => {
    prisma.problem.create.mockResolvedValue({ id: 'p-owner' });

    await service.createFull({ title: 'Owned', description: 'desc' } as any, actor);

    expect(prisma.problem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createdById: 'teacher-1' }),
    }));
  });

  it('sanitizes statement HTML before it is persisted', async () => {
    prisma.problem.create.mockResolvedValue({ id: 'p-sanitized' });

    await service.createFull({
      title: 'Sanitized',
      description: '<img src="https://example.com/a.png" onerror="alert(1)"><script>alert(2)</script>',
    } as any, actor);

    const version = prisma.problem.create.mock.calls[0][0].data.versions.create;
    expect(version.description).toContain('<img src="https://example.com/a.png" />');
    expect(version.description).not.toMatch(/script|onerror/i);
  });

  it('checks specific delegated actions before changing an existing problem', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p1', source: 'EXTERNAL', status: 'DRAFT' });
    prisma.problemVersion.findFirst.mockResolvedValue({ id: 'v1', checker: { type: 'STANDARD' } });
    prisma.problemTestCase.createMany.mockResolvedValue({ count: 1 });

    await service.uploadTestData('p1', zipFile({ '1.in': '1\n', '1.out': '1\n' }), actor);
    await service.uploadChecker('p1', { originalname: 'main.cpp' } as Express.Multer.File, 'STANDARD', 'cpp', actor);
    await service.update('p1', {}, actor);
    await service.updateStatus('p1', 'PUBLISHED', actor);
    await service.delete('p1', actor);

    expect(access.assertCanManage).toHaveBeenCalledWith('p1', actor, 'MANAGE_TESTDATA');
    expect(access.assertCanManage).toHaveBeenCalledWith('p1', actor, 'MANAGE_CHECKER');
    expect(access.assertCanManage).toHaveBeenCalledWith('p1', actor, 'EDIT');
    expect(access.assertCanManage).toHaveBeenCalledWith('p1', actor, 'PUBLISH');
    expect(access.assertCanManage).toHaveBeenCalledWith('p1', actor, 'DELETE');
  });

  it('requires publication permission when a generic edit changes status', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p1', source: 'EXTERNAL', status: 'DRAFT' });

    await service.update('p1', { status: 'PUBLISHED' }, actor);

    expect(access.assertCanManage).toHaveBeenCalledWith('p1', actor, 'EDIT');
    expect(access.assertCanManage).toHaveBeenCalledWith('p1', actor, 'PUBLISH');
  });

  it('grants a validated teacher permission only after the owner policy approves it', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'teacher-2', role: 'TEACHER' });

    await service.grantPermission('p1', { targetId: 'teacher-2', permission: 'MANAGE_TESTDATA' }, actor);

    expect(access.assertCanChangePermissions).toHaveBeenCalledWith('p1', actor);
    expect(prisma.problemPermission.upsert).toHaveBeenCalledWith({
      where: {
        problemId_targetType_targetId_permission: {
          problemId: 'p1',
          targetType: 'USER',
          targetId: 'teacher-2',
          permission: 'MANAGE_TESTDATA',
        },
      },
      create: {
        problemId: 'p1',
        targetType: 'USER',
        targetId: 'teacher-2',
        permission: 'MANAGE_TESTDATA',
      },
      update: {},
    });
  });

  it('rejects non-admin owner transfers and permits an administrator to assign a teacher', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'teacher-2', role: 'TEACHER' });

    await expect(service.assignOwner('p1', 'teacher-2', actor)).rejects.toBeInstanceOf(ForbiddenException);
    await service.assignOwner('p1', 'teacher-2', { id: 'admin-1', role: 'ADMIN' });

    expect(prisma.problem.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { createdById: 'teacher-2' },
    });
  });

  it('scopes permission revocation to the target problem after the owner policy approves it', async () => {
    prisma.problemPermission.deleteMany.mockResolvedValue({ count: 1 });

    await service.removePermission('p1', 'grant-1', actor);

    expect(access.assertCanChangePermissions).toHaveBeenCalledWith('p1', actor);
    expect(prisma.problemPermission.deleteMany).toHaveBeenCalledWith({
      where: { id: 'grant-1', problemId: 'p1' },
    });
  });

  it('searches published problems by title, internal ID, or remote problem metadata', async () => {
    prisma.problem.findMany.mockResolvedValue([]);
    prisma.problem.count.mockResolvedValue(0);

    await service.findAll({ keyword: 'P10001', pageSize: 12, status: 'DRAFT' });

    const expectedWhere = {
      status: 'PUBLISHED',
      OR: [
        { title: { contains: 'P10001', mode: 'insensitive' } },
        { id: { contains: 'P10001', mode: 'insensitive' } },
        { sourceInfo: { is: { remoteProblemId: { contains: 'P10001', mode: 'insensitive' } } } },
        { sourceInfo: { is: { remoteUrl: { contains: 'P10001', mode: 'insensitive' } } } },
      ],
    };
    expect(prisma.problem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere, take: 12 }));
    expect(prisma.problem.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it('returns only public statement fields for published problem details', async () => {
    prisma.problem.findFirst.mockResolvedValue({ id: 'p1', status: 'PUBLISHED', versions: [] });

    await service.findOne('p1');

    const query = prisma.problem.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({ id: 'p1', status: 'PUBLISHED' });
    expect(query.select.versions.select).not.toHaveProperty('testCases');
    expect(query.select.versions.select).not.toHaveProperty('checker');
  });

  it('creates normal problems with inline input and exact expected output', async () => {
    prisma.problem.create.mockResolvedValue({ id: 'p1' });

    await service.createFull({
      title: 'A+B',
      description: 'desc',
      judgeMode: 'STANDARD',
      testCases: [{ input: '1 2\n', expectedOutput: '3\n', score: 100 }],
    } as any, actor);

    expect(prisma.problem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        versions: {
          create: expect.objectContaining({
            testCases: {
              create: [{
                input: '1 2\n',
                expectedOutput: '3\n',
                score: 100,
                order: 1,
                isSample: false,
              }],
            },
            checker: {
              create: {
                type: 'STANDARD',
                language: null,
                sourceCode: null,
              },
            },
          }),
        },
      }),
    }));
  });

  it('rejects spj problems without checker code', async () => {
    await expect(
      service.createFull({
        title: 'Any order',
        description: 'desc',
        judgeMode: 'SPJ',
        testCases: [{ input: '1 2\n' }],
    } as any, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates spj problems with checker code and input-only test cases', async () => {
    prisma.problem.create.mockResolvedValue({ id: 'p2' });

    await service.createFull({
      title: 'Any order',
      description: 'desc',
      judgeMode: 'SPJ',
      spjLanguage: 'python',
      spjSourceCode: 'print(input().strip() == "3")',
      testCases: [{ input: '1 2\n', score: 100 }],
    } as any, actor);

    expect(prisma.problem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        versions: {
          create: expect.objectContaining({
            testCases: {
              create: [{
                input: '1 2\n',
                expectedOutput: '',
                score: 100,
                order: 1,
                isSample: false,
              }],
            },
            checker: {
              create: {
                type: 'SPJ',
                language: 'python',
                sourceCode: 'print(input().strip() == "3")',
              },
            },
          }),
        },
      }),
    }));
  });

  it('imports standard zip files by pairing numbered .in and .out files', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.problemVersion.findFirst.mockResolvedValue({
      id: 'v1',
      checker: { type: 'STANDARD' },
    });
    prisma.problemTestCase.createMany.mockResolvedValue({ count: 2 });

    const result: any = await service.uploadTestData('p1', zipFile({
      '1.in': '1 2\n',
      '1.out': '3\n',
      '2.in': '2 5\n',
      '2.ans': '7\n',
    }), actor);

    expect(prisma.problemTestCase.deleteMany).toHaveBeenCalledWith({ where: { problemVersionId: 'v1' } });
    expect(prisma.problemTestCase.createMany).toHaveBeenCalledWith({
      data: [
        { problemVersionId: 'v1', input: '1 2\n', expectedOutput: '3\n', score: 50, order: 1, isSample: false },
        { problemVersionId: 'v1', input: '2 5\n', expectedOutput: '7\n', score: 50, order: 2, isSample: false },
      ],
    });
    expect(result.testCount).toBe(2);
  });

  it('imports SPJ zip files from numbered .in files without output files', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p2' });
    prisma.problemVersion.findFirst.mockResolvedValue({
      id: 'v2',
      checker: { type: 'SPJ' },
    });
    prisma.problemTestCase.createMany.mockResolvedValue({ count: 2 });

    await service.uploadTestData('p2', zipFile({
      '1.in': 'hello\n',
      '2.in': 'world\n',
    }), actor);

    expect(prisma.problemTestCase.createMany).toHaveBeenCalledWith({
      data: [
        { problemVersionId: 'v2', input: 'hello\n', expectedOutput: '', score: 50, order: 1, isSample: false },
        { problemVersionId: 'v2', input: 'world\n', expectedOutput: '', score: 50, order: 2, isSample: false },
      ],
    });
  });

  it('rejects standard zip files when an input file has no matching output file', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p3' });
    prisma.problemVersion.findFirst.mockResolvedValue({
      id: 'v3',
      checker: { type: 'STANDARD' },
    });

    await expect(service.uploadTestData('p3', zipFile({ '1.in': '1 2\n' }), actor))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a ZIP entry whose declared extracted size exceeds the safety budget', () => {
    expect(() => (service as any).validateZipBudget([
      { isDirectory: false, header: { size: 101 * 1024 * 1024, compressedSize: 1024 } },
    ])).toThrow('解压后大小超过限制');
  });

  it('rejects a ZIP entry with a suspicious compression ratio before extraction', () => {
    expect(() => (service as any).validateZipBudget([
      { isDirectory: false, header: { size: 10 * 1024 * 1024, compressedSize: 10 } },
    ])).toThrow('压缩比超过限制');
  });

  it('prevents publishing local problems before test data is imported', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p4', source: 'LOCAL' });
    prisma.problemVersion.findFirst.mockResolvedValue({ id: 'v4' });
    prisma.problemTestCase.count.mockResolvedValue(0);

    await expect(service.updateStatus('p4', 'PUBLISHED', actor)).rejects.toBeInstanceOf(BadRequestException);
  });
});
