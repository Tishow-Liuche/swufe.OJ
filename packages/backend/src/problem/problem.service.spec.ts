import { BadRequestException } from '@nestjs/common';
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
        findUnique: jest.fn(),
        update: jest.fn(),
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
});
