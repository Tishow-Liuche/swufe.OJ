import { JudgeProcessor } from './judge.processor';

describe('JudgeProcessor local test data judging', () => {
  let prisma: any;
  let judge: any;
  let learning: any;
  let processor: JudgeProcessor;

  beforeEach(() => {
    prisma = {
      problemVersion: { findFirst: jest.fn() },
      submission: { update: jest.fn() },
      submissionCase: { create: jest.fn() },
      judgeTask: { update: jest.fn().mockResolvedValue({}) },
    };
    judge = {
      compile: jest.fn(),
      run: jest.fn(),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    learning = { recordSubmissionResult: jest.fn().mockResolvedValue(undefined) };
    processor = new JudgeProcessor(prisma, judge, learning);
  });

  it('ignores terminal whitespace when matching standard-problem output', async () => {
    prisma.problemVersion.findFirst.mockResolvedValue({
      checker: { type: 'STANDARD' },
      testCases: [{ order: 1, input: '1 2\n', expectedOutput: '3\n', score: 100 }],
    });
    judge.compile.mockResolvedValue({ success: true, fileId: 'program', message: '' });
    judge.run.mockResolvedValue({ status: 'ACCEPTED', timeUsed: 3, memoryUsed: 128, output: '3' });

    const result = await processor.process({ data: {
      submissionId: 's1',
      problemId: 'p1',
      language: 'cpp',
      sourceCode: 'code',
      timeLimit: 1000,
      memoryLimit: 256,
    } } as any);

    expect(result.status).toBe('ACCEPTED');
    expect(prisma.submissionCase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'ACCEPTED',
        expectedOutput: '3\n',
        actualOutput: '3',
      }),
    });
  });

  it('runs SPJ checker with user output as checker stdin', async () => {
    prisma.problemVersion.findFirst.mockResolvedValue({
      checker: {
        type: 'SPJ',
        language: 'python',
        sourceCode: 'import sys; print(sys.stdin.read().strip() == "3")',
      },
      testCases: [{ order: 1, input: '1 2\n', expectedOutput: '', score: 100 }],
    });
    judge.compile
      .mockResolvedValueOnce({ success: true, fileId: 'program', message: '' })
      .mockResolvedValueOnce({ success: true, fileId: 'checker', message: '' });
    judge.run
      .mockResolvedValueOnce({ status: 'ACCEPTED', timeUsed: 3, memoryUsed: 128, output: '3\n' })
      .mockResolvedValueOnce({ status: 'ACCEPTED', timeUsed: 1, memoryUsed: 64, output: 'true\n' });

    const result = await processor.process({ data: {
      submissionId: 's1',
      problemId: 'p1',
      language: 'cpp',
      sourceCode: 'code',
      timeLimit: 1000,
      memoryLimit: 256,
    } } as any);

    expect(result.status).toBe('ACCEPTED');
    expect(judge.compile).toHaveBeenNthCalledWith(2, 'python', 'import sys; print(sys.stdin.read().strip() == "3")');
    expect(judge.run).toHaveBeenNthCalledWith(
      2,
      'python',
      '3\n',
      1000,
      256,
      'checker',
      'import sys; print(sys.stdin.read().strip() == "3")',
    );
    expect(prisma.submissionCase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'ACCEPTED',
        input: '1 2\n',
        expectedOutput: '[SPJ]',
        actualOutput: '3\n',
      }),
    });
  });
});
