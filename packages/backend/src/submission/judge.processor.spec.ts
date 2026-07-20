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
      runWithFiles: jest.fn(),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    learning = { recordSubmissionResult: jest.fn().mockResolvedValue(undefined) };
    processor = new JudgeProcessor(prisma, judge, learning);
  });

  it('accepts standard output when only final whitespace or line endings differ', async () => {
    prisma.problemVersion.findFirst.mockResolvedValue({
      checker: { type: 'STANDARD' },
      testCases: [{ order: 1, input: '1 2\n', expectedOutput: 'Hello\r\nWorld', score: 100 }],
    });
    judge.compile.mockResolvedValue({ success: true, fileId: 'program', message: '' });
    judge.run.mockResolvedValue({ status: 'ACCEPTED', timeUsed: 3, memoryUsed: 128, output: 'Hello\nWorld\n' });

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
        expectedOutput: 'Hello\r\nWorld',
        actualOutput: 'Hello\nWorld\n',
      }),
    });
  });

  it('keeps standard output strict for meaningful content differences', async () => {
    prisma.problemVersion.findFirst.mockResolvedValue({
      checker: { type: 'STANDARD' },
      testCases: [{ order: 1, input: '1 2\n', expectedOutput: 'Praise The Fool', score: 100 }],
    });
    judge.compile.mockResolvedValue({ success: true, fileId: 'program', message: '' });
    judge.run.mockResolvedValue({ status: 'ACCEPTED', timeUsed: 3, memoryUsed: 128, output: 'Hello Ameng\n' });

    const result = await processor.process({ data: {
      submissionId: 's1',
      problemId: 'p1',
      language: 'cpp',
      sourceCode: 'code',
      timeLimit: 1000,
      memoryLimit: 256,
    } } as any);

    expect(result.status).toBe('WRONG_ANSWER');
    expect(prisma.submissionCase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'WRONG_ANSWER',
        expectedOutput: 'Praise The Fool',
        actualOutput: 'Hello Ameng\n',
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
      .mockResolvedValueOnce({ status: 'ACCEPTED', timeUsed: 3, memoryUsed: 128, output: '3\n' });
    judge.runWithFiles
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
    expect(judge.runWithFiles).toHaveBeenCalledWith(
      'python',
      '3\n',
      1000,
      256,
      'checker',
      'import sys; print(sys.stdin.read().strip() == "3")',
      {
        input: '1 2\n',
        output: '',
        user_output: '3\n',
      },
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

  it('runs SPJ checker with classic input/output/user_output files and accepts exit code success', async () => {
    prisma.problemVersion.findFirst.mockResolvedValue({
      checker: {
        type: 'SPJ',
        language: 'cpp',
        sourceCode: 'classic checker',
      },
      testCases: [{ order: 1, input: '1 2\n', expectedOutput: '', score: 100 }],
    });
    judge.compile
      .mockResolvedValueOnce({ success: true, fileId: 'program', message: '' })
      .mockResolvedValueOnce({ success: true, fileId: 'checker', message: '' });
    judge.run
      .mockResolvedValueOnce({ status: 'ACCEPTED', timeUsed: 3, memoryUsed: 128, output: '3\n' });
    judge.runWithFiles
      .mockResolvedValueOnce({ status: 'ACCEPTED', timeUsed: 1, memoryUsed: 64, output: '' });

    const result = await processor.process({ data: {
      submissionId: 's1',
      problemId: 'p1',
      language: 'cpp',
      sourceCode: 'code',
      timeLimit: 1000,
      memoryLimit: 256,
    } } as any);

    expect(result.status).toBe('ACCEPTED');
    expect(judge.runWithFiles).toHaveBeenCalledWith(
      'cpp',
      '3\n',
      1000,
      256,
      'checker',
      'classic checker',
      {
        input: '1 2\n',
        output: '',
        user_output: '3\n',
      },
    );
  });

  it('rejects SPJ checker when classic checker exits successfully but prints a false verdict', async () => {
    prisma.problemVersion.findFirst.mockResolvedValue({
      checker: {
        type: 'SPJ',
        language: 'python',
        sourceCode: 'print("false")',
      },
      testCases: [{ order: 1, input: '1 2\n', expectedOutput: '', score: 100 }],
    });
    judge.compile
      .mockResolvedValueOnce({ success: true, fileId: 'program', message: '' })
      .mockResolvedValueOnce({ success: true, fileId: 'checker', message: '' });
    judge.run
      .mockResolvedValueOnce({ status: 'ACCEPTED', timeUsed: 3, memoryUsed: 128, output: '3\n' });
    judge.runWithFiles
      .mockResolvedValueOnce({ status: 'ACCEPTED', timeUsed: 1, memoryUsed: 64, output: 'false\n' });

    const result = await processor.process({ data: {
      submissionId: 's1',
      problemId: 'p1',
      language: 'cpp',
      sourceCode: 'code',
      timeLimit: 1000,
      memoryLimit: 256,
    } } as any);

    expect(result.status).toBe('WRONG_ANSWER');
  });
});
