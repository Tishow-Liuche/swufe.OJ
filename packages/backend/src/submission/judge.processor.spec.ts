import { JudgeProcessor } from './judge.processor';

describe('JudgeProcessor local test data judging', () => {
  let prisma: any;
  let judge: any;
  let learning: any;
  let contestCache: any;
  let processor: JudgeProcessor;
  let storedCases: any[];

  beforeEach(() => {
    storedCases = [];
    prisma = {
      problemVersion: { findFirst: jest.fn() },
      submission: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ problemId: 'p1', problemVersionId: 'v-original' }) },
      submissionCase: {
        createMany: jest.fn(async ({ data }) => { storedCases.push(...data); }),
        deleteMany: jest.fn(async ({ where }) => {
          storedCases = storedCases.filter((row) => row.submissionId !== where.submissionId
            || (where.caseIndex && !where.caseIndex.in.includes(row.caseIndex)));
        }),
      },
      judgeTask: { update: jest.fn().mockResolvedValue({}) },
      contestSubmission: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    prisma.$transaction = jest.fn(async (callback) => {
      const snapshot = [...storedCases];
      try { return await callback(prisma); }
      catch (error) { storedCases = snapshot; throw error; }
    });
    prisma.$executeRaw = jest.fn(async (query) => {
      const rows = JSON.parse(query.values[0]);
      storedCases = storedCases.filter((old) => !rows.some((row) =>
        row.submissionId === old.submissionId && row.caseIndex === old.caseIndex));
      storedCases.push(...rows);
      return rows.length;
    });
    judge = {
      compile: jest.fn(),
      run: jest.fn(),
      runWithFiles: jest.fn(),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    learning = { recordSubmissionResult: jest.fn().mockResolvedValue(undefined) };
    contestCache = { invalidateContest: jest.fn().mockResolvedValue(undefined) };
    processor = new JudgeProcessor(prisma, judge, learning, undefined, contestCache);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('time-limit fail-fast and case persistence', () => {
    const job = { data: {
      submissionId: 's1', problemId: 'p1', language: 'cpp', sourceCode: 'code',
      timeLimit: 1000, memoryLimit: 256,
    } } as any;

    function prepare(type: string, statuses: string[]) {
      prisma.problemVersion.findFirst.mockResolvedValue({
        checker: { type, language: 'cpp', sourceCode: 'checker code' },
        testCases: statuses.map((_, index) => ({
          order: index + 1, input: `input-${index}`, expectedOutput: 'ok',
          score: index + 1, isSample: false,
        })),
      });
      judge.compile
        .mockResolvedValueOnce({ success: true, fileId: 'program', message: '' })
        .mockResolvedValueOnce({ success: true, fileId: 'checker', message: '' });
      statuses.forEach((status) => judge.run.mockResolvedValueOnce({
        status, timeUsed: status === 'TIME_LIMIT_EXCEEDED' ? 1000 : 3,
        memoryUsed: 128, output: 'ok',
      }));
      judge.runWithFiles.mockResolvedValue({
        status: 'ACCEPTED', timeUsed: 1, memoryUsed: 64, output: 'true',
      });
    }

    it('loads the stored snapshot, including its original limits', async () => {
      prepare('STANDARD', ['ACCEPTED']);
      const version = await prisma.problemVersion.findFirst();
      version.timeLimit = 4200;
      version.memoryLimit = 512;
      prisma.problemVersion.findFirst.mockClear();
      await processor.process(job);
      expect(prisma.problemVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'v-original', problemId: 'p1' } }));
      expect(judge.run).toHaveBeenCalledWith('cpp', 'input-0', 4200, 512, 'program', 'code');
    });

    it('fails closed when a stored snapshot is missing', async () => {
      prisma.problemVersion.findFirst.mockResolvedValue(null);
      expect(await processor.process(job)).toEqual({ status: 'SYSTEM_ERROR' });
      expect(prisma.problemVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'v-original', problemId: 'p1' } }));
      expect(judge.compile).not.toHaveBeenCalled();
    });

    it('allows explicit historical null snapshot fallback only', async () => {
      prepare('STANDARD', ['ACCEPTED']);
      prisma.submission.findUnique.mockResolvedValue({ problemId: 'p1', problemVersionId: null });
      await processor.process(job);
      expect(prisma.problemVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { problemId: 'p1', isCurrent: true } }));
    });

    it('records compiler infrastructure failure as SYSTEM_ERROR and zero score', async () => {
      prepare('STANDARD', ['ACCEPTED']);
      judge.compile.mockReset().mockResolvedValue({ success: false, systemError: true, message: 'sandbox HTTP 503' });
      expect(await processor.process(job)).toEqual({ status: 'SYSTEM_ERROR' });
      expect(prisma.submission.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SYSTEM_ERROR', score: 0 }) }));
    });

    it.each(['TIME_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'SYSTEM_ERROR', 'MEMORY_LIMIT_EXCEEDED'])('stops and zeroes the whole judgement for checker %s', async (status) => {
      prepare('SPJ', ['ACCEPTED', 'ACCEPTED', 'ACCEPTED']);
      judge.runWithFiles.mockReset()
        .mockResolvedValueOnce({ status: 'ACCEPTED', exitStatus: 0, output: 'true' })
        .mockResolvedValueOnce({ status, exitStatus: 7, stderr: 'checker fault detail', output: '' });
      expect(await processor.process(job)).toEqual({ status: 'SYSTEM_ERROR', score: 0 });
      expect(judge.run).toHaveBeenCalledTimes(2);
      expect(storedCases.map((row) => row.status)).toEqual(['ACCEPTED', 'SYSTEM_ERROR']);
      expect(prisma.submission.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ compileMessage: expect.stringContaining('checker fault detail') }) }));
    });

    it.each([
      ['BOOLEAN_STDOUT', '', 0, 'ACCEPTED', 'SYSTEM_ERROR'],
      ['BOOLEAN_STDOUT', 'nonsense', 0, 'ACCEPTED', 'SYSTEM_ERROR'],
      ['BOOLEAN_STDOUT', 'true', 0, 'ACCEPTED', 'ACCEPTED'],
      ['BOOLEAN_STDOUT', 'false', 0, 'ACCEPTED', 'WRONG_ANSWER'],
      ['BOOLEAN_STDOUT', 'false', 1, 'RUNTIME_ERROR', 'SYSTEM_ERROR'],
      ['EXIT_CODE', '', 0, 'ACCEPTED', 'ACCEPTED'],
      ['EXIT_CODE', 'true', 1, 'RUNTIME_ERROR', 'WRONG_ANSWER'],
      ['EXIT_CODE', '', 2, 'RUNTIME_ERROR', 'WRONG_ANSWER'],
      ['EXIT_CODE', '', 3, 'RUNTIME_ERROR', 'SYSTEM_ERROR'],
      ['LEGACY', '', 0, 'ACCEPTED', 'ACCEPTED'],
      ['LEGACY', 'false', 0, 'ACCEPTED', 'WRONG_ANSWER'],
    ])('honors checker protocol %s output %s exit %s', async (protocol, output, exitStatus, status, expected) => {
      prepare('SPJ', ['ACCEPTED']);
      const version = await prisma.problemVersion.findFirst();
      version.checker.protocol = protocol;
      judge.runWithFiles.mockResolvedValue({ status, output, exitStatus, sandboxStatus: status === 'RUNTIME_ERROR' ? 'Nonzero Exit Status' : 'Accepted' });
      expect((await processor.process(job)).status).toBe(expected);
    });

    it('does not treat a signal with exit one as an explicit wrong verdict', async () => {
      prepare('SPJ', ['ACCEPTED']);
      judge.runWithFiles.mockResolvedValue({ status: 'RUNTIME_ERROR', output: '', exitStatus: 1, signal: 11, sandboxStatus: 'Signalled' });
      expect((await processor.process(job)).status).toBe('SYSTEM_ERROR');
    });

    it('gives the checker independent minimum resource limits', async () => {
      prepare('SPJ', ['ACCEPTED']);
      await processor.process({ ...job, data: { ...job.data, timeLimit: 10, memoryLimit: 8 } });
      expect(judge.runWithFiles).toHaveBeenCalledWith('cpp', 'ok', 2000, 256, 'checker', 'checker code', expect.any(Object));
    });

    it('lets a system fault override an earlier wrong answer', async () => {
      prepare('STANDARD', ['WRONG_ANSWER', 'SYSTEM_ERROR', 'ACCEPTED']);
      expect(await processor.process(job)).toEqual({ status: 'SYSTEM_ERROR', score: 0 });
      expect(judge.run).toHaveBeenCalledTimes(2);
    });

    it.each(['STANDARD', 'SPJ'])('stops %s after a timed-out case while retaining the full score denominator', async (type) => {
      prepare(type, ['ACCEPTED', 'TIME_LIMIT_EXCEEDED', 'ACCEPTED']);

      const result = await processor.process(job);

      expect(judge.run).toHaveBeenCalledTimes(2);
      expect(storedCases.map((row) => row.status))
        .toEqual(['ACCEPTED', 'TIME_LIMIT_EXCEEDED']);
      expect(result).toEqual({ status: 'TIME_LIMIT_EXCEEDED', score: 17 });
      expect(prisma.submission.update).toHaveBeenLastCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({
          status: 'TIME_LIMIT_EXCEEDED', score: 17, timeUsed: 1000, memoryUsed: 128,
          judgedAt: expect.any(Date),
        }),
      });
      expect(judge.deleteFile).toHaveBeenCalledWith('program');
      expect(judge.runWithFiles).toHaveBeenCalledTimes(type === 'SPJ' ? 1 : 0);
      if (type === 'SPJ') expect(judge.deleteFile).toHaveBeenCalledWith('checker');
      expect(prisma.judgeTask.update).toHaveBeenCalled();
      expect(learning.recordSubmissionResult).toHaveBeenCalledWith('s1', 'TIME_LIMIT_EXCEEDED');
    });

    it('preserves the first failure when a later case times out', async () => {
      prepare('STANDARD', ['WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'ACCEPTED']);
      expect(await processor.process(job)).toEqual({ status: 'WRONG_ANSWER', score: 0 });
      expect(judge.run).toHaveBeenCalledTimes(2);
    });

    it('continues after wrong answers to retain partial scoring', async () => {
      prepare('STANDARD', ['WRONG_ANSWER', 'ACCEPTED', 'ACCEPTED']);
      expect(await processor.process(job)).toEqual({ status: 'WRONG_ANSWER', score: 83 });
      expect(judge.run).toHaveBeenCalledTimes(3);
    });

    it('runs all cases for an accepted submission', async () => {
      prepare('STANDARD', ['ACCEPTED', 'ACCEPTED', 'ACCEPTED']);
      expect(await processor.process(job)).toEqual({ status: 'ACCEPTED', score: 100 });
      expect(judge.run).toHaveBeenCalledTimes(3);
      expect(prisma.submissionCase.deleteMany).not.toHaveBeenCalled();
    });

    it.each([{ attemptsMade: 1 }, { attemptsStarted: 2 }])('clears stale case tails before an earlier timeout on retry %j', async (retry) => {
      prepare('STANDARD', ['TIME_LIMIT_EXCEEDED', 'ACCEPTED', 'ACCEPTED']);
      storedCases.push(...[1, 2, 3].map((caseIndex) => ({
        submissionId: 's1', caseIndex, status: 'ACCEPTED',
      })));
      await processor.process({ ...job, ...retry });
      expect(storedCases.map((row) => [row.caseIndex, row.status]))
        .toEqual([[1, 'TIME_LIMIT_EXCEEDED']]);
      expect(prisma.submissionCase.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.submissionCase.deleteMany).toHaveBeenCalledWith({ where: { submissionId: 's1' } });
      expect(prisma.submissionCase.deleteMany.mock.invocationCallOrder[0])
        .toBeLessThan(judge.compile.mock.invocationCallOrder[0]);
    });

    it('clears stale cases even when a retried submission fails compilation', async () => {
      prepare('STANDARD', ['ACCEPTED']);
      storedCases.push({ submissionId: 's1', caseIndex: 1, status: 'ACCEPTED' });
      judge.compile.mockReset().mockResolvedValue({ success: false, message: 'compile failed' });
      expect(await processor.process({ ...job, attemptsMade: 1 }))
        .toEqual({ status: 'COMPILE_ERROR' });
      expect(storedCases).toEqual([]);
    });

    it('flushes the first case then batches ten cases and the final remainder', async () => {
      prepare('STANDARD', Array(23).fill('ACCEPTED'));
      await processor.process(job);
      expect(prisma.$executeRaw.mock.calls.map(([query]) => JSON.parse(query.values[0]).length))
        .toEqual([1, 10, 10, 2]);
      expect(storedCases.map((row) => row.caseIndex)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(4);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('flushes progress after one second even before ten cases accumulate', async () => {
      prepare('STANDARD', Array(5).fill('ACCEPTED'));
      let now = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      judge.run.mockReset().mockImplementation(async () => {
        now += 600;
        return { status: 'ACCEPTED', timeUsed: 3, memoryUsed: 128, output: 'ok' };
      });
      await processor.process(job);
      expect(prisma.$executeRaw.mock.calls.map(([query]) => JSON.parse(query.values[0]).length))
        .toEqual([1, 2, 2]);
    });

    it.each(['run', 'runWithFiles'])('flushes completed cases and cleans artifacts when %s throws', async (method) => {
      prepare('SPJ', Array(4).fill('ACCEPTED'));
      judge[method].mockReset()
        .mockResolvedValueOnce({ status: 'ACCEPTED', timeUsed: 3, memoryUsed: 128, output: 'true' })
        .mockResolvedValueOnce({ status: 'ACCEPTED', timeUsed: 3, memoryUsed: 128, output: 'true' })
        .mockRejectedValueOnce(new Error('sandbox disconnected'));
      await expect(processor.process(job)).rejects.toThrow('sandbox disconnected');
      expect(storedCases.map((row) => row.caseIndex)).toEqual([1, 2]);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(judge.deleteFile).toHaveBeenCalledWith('program');
      expect(judge.deleteFile).toHaveBeenCalledWith('checker');
    });

    it('replaces the same batch atomically when a job is replayed', async () => {
      prepare('STANDARD', Array(3).fill('ACCEPTED'));
      await processor.process(job);
      judge.compile.mockReset();
      prepare('STANDARD', Array(3).fill('ACCEPTED'));
      await processor.process(job);
      expect(storedCases.map((row) => row.caseIndex)).toEqual([1, 2, 3]);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(4);
    });

    it('does not report success when a batch cannot be persisted', async () => {
      prepare('STANDARD', Array(3).fill('ACCEPTED'));
      prisma.$executeRaw.mockRejectedValue(new Error('database unavailable'));
      await expect(processor.process(job)).rejects.toThrow('database unavailable');
      expect(prisma.submission.update).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'ACCEPTED' }),
      }));
      expect(judge.deleteFile).toHaveBeenCalledWith('program');
    });

    it('retains existing rows when the replacement insert fails', async () => {
      prepare('STANDARD', ['ACCEPTED']);
      const previous = { submissionId: 's1', caseIndex: 1, status: 'WRONG_ANSWER' };
      storedCases.push(previous);
      prisma.$executeRaw.mockRejectedValue(new Error('insert failed'));
      await expect(processor.process(job)).rejects.toThrow('insert failed');
      expect(storedCases).toEqual([previous]);
    });

    it('cleans the program artifact when checker compilation fails', async () => {
      prepare('SPJ', ['ACCEPTED']);
      judge.compile.mockReset()
        .mockResolvedValueOnce({ success: true, fileId: 'program', message: '' })
        .mockResolvedValueOnce({ success: false, message: 'checker compile failed' });
      expect(await processor.process(job)).toEqual({ status: 'SYSTEM_ERROR' });
      expect(judge.deleteFile).toHaveBeenCalledWith('program');
      expect(judge.run).not.toHaveBeenCalled();
    });

    it('binds all case data as one JSON parameter instead of interpolating it into SQL', async () => {
      prepare('STANDARD', ['ACCEPTED']);
      const hostileOutput = "'); DROP TABLE \"SubmissionCase\"; --\n中文";
      judge.run.mockReset().mockResolvedValue({
        status: 'ACCEPTED', timeUsed: 3, memoryUsed: 128, output: hostileOutput,
      });
      await processor.process(job);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const query = prisma.$executeRaw.mock.calls[0][0];
      expect(query.values).toHaveLength(1);
      expect(query.text).not.toContain(hostileOutput);
      expect(query.text).toContain('jsonb_to_recordset($1::jsonb)');
      expect(query.text).toContain('DELETE FROM "SubmissionCase"');
      expect(query.text).toContain('INSERT INTO "SubmissionCase"');
      expect(JSON.parse(query.values[0])[0]).toEqual(expect.objectContaining({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/), submissionId: 's1', caseIndex: 1,
        actualOutput: hostileOutput, input: null, expectedOutput: null,
      }));
    });
  });

  it('accepts standard output when only final whitespace or line endings differ', async () => {
    prisma.problemVersion.findFirst.mockResolvedValue({
      checker: { type: 'STANDARD' },
      testCases: [{ order: 1, input: '1 2\n', expectedOutput: 'Hello\r\nWorld', score: 100, isSample: true }],
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
    expect(storedCases).toContainEqual(expect.objectContaining({
        status: 'ACCEPTED',
        expectedOutput: 'Hello\r\nWorld',
        actualOutput: 'Hello\nWorld\n',
    }));
  });

  it('invalidates contest cache after a final local judgement', async () => {
    prisma.problemVersion.findFirst.mockResolvedValue({
      checker: { type: 'STANDARD' },
      testCases: [{ order: 1, input: '', expectedOutput: '', score: 100 }],
    });
    prisma.contestSubmission.findUnique.mockResolvedValue({ contestId: 'contest-1' });
    judge.compile.mockResolvedValue({ success: true, fileId: 'program', message: '' });
    judge.run.mockResolvedValue({ status: 'ACCEPTED', timeUsed: 1, memoryUsed: 64, output: '' });

    await processor.process({ data: {
      submissionId: 's1',
      problemId: 'p1',
      language: 'cpp',
      sourceCode: 'code',
      timeLimit: 1000,
      memoryLimit: 256,
    } } as any);

    expect(contestCache.invalidateContest).toHaveBeenCalledWith('contest-1');
  });

  it('keeps standard output strict for meaningful content differences', async () => {
    prisma.problemVersion.findFirst.mockResolvedValue({
      checker: { type: 'STANDARD' },
      testCases: [{ order: 1, input: '1 2\n', expectedOutput: 'Praise The Fool', score: 100, isSample: true }],
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
    expect(storedCases).toContainEqual(expect.objectContaining({
        status: 'WRONG_ANSWER',
        expectedOutput: 'Praise The Fool',
        actualOutput: 'Hello Ameng\n',
    }));
  });

  it('does not duplicate hidden test data and truncates oversized program output', async () => {
    const output = 'x'.repeat(40_000);
    prisma.problemVersion.findFirst.mockResolvedValue({
      checker: { type: 'STANDARD' },
      testCases: [{ order: 1, input: 'secret input', expectedOutput: output, score: 100, isSample: false }],
    });
    judge.compile.mockResolvedValue({ success: true, fileId: 'program', message: '' });
    judge.run.mockResolvedValue({ status: 'ACCEPTED', timeUsed: 3, memoryUsed: 128, output });

    await processor.process({ data: {
      submissionId: 's1', problemId: 'p1', language: 'cpp', sourceCode: 'code',
      timeLimit: 1000, memoryLimit: 256,
    } } as any);

    const stored = storedCases[0];
    expect(stored.input).toBeNull();
    expect(stored.expectedOutput).toBeNull();
    expect(stored.actualOutput).toHaveLength(32_787);
    expect(stored.actualOutput).toMatch(/\[output truncated\]$/);
  });

  it('runs SPJ checker with user output as checker stdin', async () => {
    prisma.problemVersion.findFirst.mockResolvedValue({
      checker: {
        type: 'SPJ',
        language: 'python',
        sourceCode: 'import sys; print(sys.stdin.read().strip() == "3")',
      },
      testCases: [{ order: 1, input: '1 2\n', expectedOutput: '', score: 100, isSample: true }],
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
      2000,
      256,
      'checker',
      'import sys; print(sys.stdin.read().strip() == "3")',
      {
        input: '1 2\n',
        output: '',
        user_output: '3\n',
      },
    );
    expect(storedCases).toContainEqual(expect.objectContaining({
        status: 'ACCEPTED',
        input: '1 2\n',
        expectedOutput: '[SPJ]',
        actualOutput: '3\n',
    }));
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
      2000,
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
