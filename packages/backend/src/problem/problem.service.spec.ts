import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { ProblemService } from './problem.service';

describe('ProblemService createFull with judge data', () => {
  let service: ProblemService;
  let prisma: any;

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
        update: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      problemTestCase: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        count: jest.fn(),
      },
      problemTag: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      checker: {
        upsert: jest.fn(),
      },
      testGroup: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    service = new ProblemService(prisma, {} as any);
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
    } as any, 'teacher-1');

    expect(prisma.problem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'DRAFT',
        versions: {
          create: expect.not.objectContaining({ testCases: expect.anything() }),
        },
      }),
    }));
  });

  it('searches published problems by title, internal ID, or remote problem metadata', async () => {
    prisma.problem.findMany.mockResolvedValue([]);
    prisma.problem.count.mockResolvedValue(0);

    await service.findAll({ keyword: 'P10001', pageSize: 12 });

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

  it('filters published problems by SWUFE Point difficulty values', async () => {
    prisma.problem.findMany.mockResolvedValue([]);
    prisma.problem.count.mockResolvedValue(0);

    await service.findAll({ difficulty: 'POINT_1', pageSize: 12 });

    const expectedWhere = {
      status: 'PUBLISHED',
      difficulty: 'POINT_1',
    };
    expect(prisma.problem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere, take: 12 }));
    expect(prisma.problem.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it('normalizes legacy difficulty filters before querying published problems', async () => {
    prisma.problem.findMany.mockResolvedValue([]);
    prisma.problem.count.mockResolvedValue(0);

    await service.findAll({ difficulty: 'POPULAR', pageSize: 12 });

    const expectedWhere = {
      status: 'PUBLISHED',
      difficulty: 'POINT_1',
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
    } as any, 'teacher-1');

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
      } as any, 'teacher-1'),
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
    } as any, 'teacher-1');

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
    }));

    expect(prisma.problemTestCase.deleteMany).toHaveBeenCalledWith({ where: { problemVersionId: 'v1' } });
    expect(prisma.problemTestCase.createMany).toHaveBeenCalledWith({
      data: [
        { problemVersionId: 'v1', input: '1 2\n', expectedOutput: '3\n', score: 50, order: 1, isSample: false },
        { problemVersionId: 'v1', input: '2 5\n', expectedOutput: '7\n', score: 50, order: 2, isSample: false },
      ],
    });
    expect(result.testCount).toBe(2);
  });

  it('stores the author when creating a local problem', async () => {
    prisma.problem.create.mockResolvedValue({ id: 'p-owned' });

    await service.createFull({
      title: 'Owned Problem',
      description: 'desc',
      judgeMode: 'STANDARD',
      status: 'DRAFT',
    } as any, 'teacher-1');

    expect(prisma.problem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        createdBy: 'teacher-1',
      }),
    }));
  });

  it('lists only authored local problems for teachers', async () => {
    prisma.problem.findMany.mockResolvedValue([]);
    prisma.problem.count.mockResolvedValue(0);

    await service.findAuthored({ keyword: 'math', status: 'DRAFT', pageSize: 8 } as any, {
      id: 'teacher-1',
      role: 'TEACHER',
    });

    const expectedWhere = {
      source: 'LOCAL',
      createdBy: 'teacher-1',
      status: 'DRAFT',
      OR: [
        { title: { contains: 'math', mode: 'insensitive' } },
        { id: { contains: 'math', mode: 'insensitive' } },
      ],
    };
    expect(prisma.problem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere, take: 8 }));
    expect(prisma.problem.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it('does not expose contest reserved problems through the public problem list', async () => {
    prisma.problem.findMany.mockResolvedValue([]);
    prisma.problem.count.mockResolvedValue(0);

    await service.findAll({ status: 'CONTEST_RESERVED', pageSize: 12 });

    expect(prisma.problem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'PUBLISHED' },
    }));
    expect(prisma.problem.count).toHaveBeenCalledWith({ where: { status: 'PUBLISHED' } });
  });

  it('lists all local problems for admins', async () => {
    prisma.problem.findMany.mockResolvedValue([]);
    prisma.problem.count.mockResolvedValue(0);

    await service.findAuthored({ pageSize: 20 } as any, { id: 'admin-1', role: 'ADMIN' });

    expect(prisma.problem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { source: 'LOCAL' },
    }));
  });

  it('rejects teacher edits for local problems owned by another user', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p-other', source: 'LOCAL', createdBy: 'teacher-2' });

    await expect(service.update('p-other', { title: 'Hack' } as any, { id: 'teacher-1', role: 'TEACHER' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updates base fields, current version, tags, and checker for an authored local problem', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p1', source: 'LOCAL', createdBy: 'teacher-1' });
    prisma.problemVersion.findFirst.mockResolvedValue({
      id: 'v1',
      checker: { type: 'STANDARD', language: null, sourceCode: null },
    });
    prisma.problem.update.mockResolvedValue({ id: 'p1', title: 'New Title' });

    await service.update('p1', {
      title: 'New Title',
      difficulty: 'IMPROVE',
      timeLimit: 2000,
      memoryLimit: 512,
      outputLimit: 128,
      description: 'new statement',
      inputFormat: 'input',
      outputFormat: 'output',
      sampleInput: '1 2\n',
      sampleOutput: '3\n',
      hint: 'hint',
      dataRange: 'n <= 10',
      tags: ['math', 'prefix'],
      judgeMode: 'SPJ',
      spjLanguage: 'python',
      spjSourceCode: 'print(True)',
    } as any, { id: 'teacher-1', role: 'TEACHER' });

    expect(prisma.problem.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        title: 'New Title',
        difficulty: 'POINT_2',
        timeLimit: 2000,
        memoryLimit: 512,
        outputLimit: 128,
      },
    });
    expect(prisma.problemVersion.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: {
        description: 'new statement',
        inputFormat: 'input',
        outputFormat: 'output',
        sampleInput: '1 2\n',
        sampleOutput: '3\n',
        hint: 'hint',
        dataRange: 'n <= 10',
      },
    });
    expect(prisma.problemTag.deleteMany).toHaveBeenCalledWith({ where: { problemId: 'p1' } });
    expect(prisma.problemTag.createMany).toHaveBeenCalledWith({
      data: [
        { problemId: 'p1', name: 'math', type: 'TAG' },
        { problemId: 'p1', name: 'prefix', type: 'TAG' },
      ],
    });
    expect(prisma.checker.upsert).toHaveBeenCalledWith({
      where: { problemVersionId: 'v1' },
      create: {
        problemVersionId: 'v1',
        type: 'SPJ',
        language: 'python',
        sourceCode: 'print(True)',
      },
      update: {
        type: 'SPJ',
        language: 'python',
        sourceCode: 'print(True)',
      },
    });
  });

  it('rejects publishing through full update when test data is missing', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p7', source: 'LOCAL', createdBy: 'teacher-1' });
    prisma.problemVersion.findFirst.mockResolvedValue({
      id: 'v7',
      checker: { type: 'STANDARD' },
    });
    prisma.problemTestCase.count.mockResolvedValue(0);

    await expect(service.update('p7', { status: 'PUBLISHED' } as any, {
      id: 'teacher-1',
      role: 'TEACHER',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fills sample input and output from the first standard zip test when samples are empty', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.problemVersion.findFirst.mockResolvedValue({
      id: 'v1',
      sampleInput: null,
      sampleOutput: '',
      checker: { type: 'STANDARD' },
    });
    prisma.problemTestCase.createMany.mockResolvedValue({ count: 2 });

    await service.uploadTestData('p1', zipFile({
      '1.in': '1 2\n',
      '1.out': '3\n',
      '2.in': '2 5\n',
      '2.out': '7\n',
    }));

    expect(prisma.problemVersion.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: {
        sampleInput: '1 2\n',
        sampleOutput: '3\n',
      },
    });
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
    }));

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

    await expect(service.uploadTestData('p3', zipFile({ '1.in': '1 2\n' })))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents publishing local problems before test data is imported', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p4', source: 'LOCAL' });
    prisma.problemVersion.findFirst.mockResolvedValue({ id: 'v4' });
    prisma.problemTestCase.count.mockResolvedValue(0);

    await expect(service.updateStatus('p4', 'PUBLISHED')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents moving local problems into contest reserved before test data is imported', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p4', source: 'LOCAL', status: 'DRAFT' });
    prisma.problemVersion.findFirst.mockResolvedValue({ id: 'v4' });
    prisma.problemTestCase.count.mockResolvedValue(0);

    await expect(service.updateStatus('p4', 'CONTEST_RESERVED')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hides draft and contest reserved problem detail from public access', async () => {
    prisma.problem.findUnique.mockResolvedValue({
      id: 'p-secret',
      status: 'CONTEST_RESERVED',
      versions: [],
      tags: [],
      sourceInfo: null,
    });

    await expect(service.findOne('p-secret')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows the author to load contest reserved problem detail for editing', async () => {
    prisma.problem.findUnique.mockResolvedValue({
      id: 'p-secret',
      source: 'LOCAL',
      status: 'CONTEST_RESERVED',
      createdBy: 'teacher-1',
      versions: [],
      tags: [],
      sourceInfo: null,
    });

    await expect(service.findManageable('p-secret', { id: 'teacher-1', role: 'TEACHER' }))
      .resolves.toEqual(expect.objectContaining({ id: 'p-secret', status: 'CONTEST_RESERVED' }));
  });

  it('rejects test data upload for another teacher author', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p5', source: 'LOCAL', createdBy: 'teacher-2' });

    await expect(service.uploadTestData('p5', zipFile({ '1.in': '1\n', '1.out': '1\n' }), {
      id: 'teacher-1',
      role: 'TEACHER',
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects publishing another teacher author problem', async () => {
    prisma.problem.findUnique.mockResolvedValue({ id: 'p6', source: 'LOCAL', createdBy: 'teacher-2' });

    await expect(service.updateStatus('p6', 'PUBLISHED', {
      id: 'teacher-1',
      role: 'TEACHER',
    })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
