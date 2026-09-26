import { NotFoundException } from '@nestjs/common';
import { SubmissionService } from './submission.service';

describe('SubmissionService contest reserved access', () => {
  function createService(problem: any) {
    const prisma: any = {
      problem: {
        findUnique: jest.fn().mockResolvedValue(problem),
      },
      submission: {
        create: jest.fn().mockResolvedValue({ id: 'submission-1' }),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'submission-1', status: 'QUEUING' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      problemTestCase: {
        count: jest.fn().mockResolvedValue(1),
      },
      judgeTask: {
        create: jest.fn().mockResolvedValue({ id: 'judge-task-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$executeRaw = jest.fn().mockResolvedValue(1);
    prisma.$transaction = jest.fn().mockImplementation((callback) => callback(prisma));
    const judgeQueue: any = {
      add: jest.fn().mockResolvedValue({ id: 'queue-job-1' }),
      getWaitingCount: jest.fn().mockResolvedValue(0),
      getPrioritizedCount: jest.fn().mockResolvedValue(0),
    };
    const service = new SubmissionService(prisma, {} as any, {} as any, {} as any, judgeQueue);
    return { service, prisma, judgeQueue };
  }

  const reservedProblem = {
    source: 'LOCAL',
    id: 'problem-1',
    status: 'CONTEST_RESERVED',
    createdById: 'teacher-1',
    timeLimit: 1000,
    memoryLimit: 256,
    outputLimit: 1024,
    versions: [{ id: 'version-1' }],
    sourceInfo: null,
  };

  it('rejects contest reserved problems through the regular submission path', async () => {
    const { service, prisma } = createService(reservedProblem);

    await expect(service.submit('student-1', {
      problemId: 'problem-1',
      language: 'cpp',
      sourceCode: 'int main() { return 0; }',
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.submission.create).not.toHaveBeenCalled();
  });

  it('allows contest reserved problems only when called from contest context', async () => {
    const { service, prisma, judgeQueue } = createService(reservedProblem);

    await expect(service.submit('student-1', {
      problemId: 'problem-1',
      language: 'cpp',
      sourceCode: 'int main() { return 0; }',
    }, { allowContestReserved: true })).resolves.toEqual({
      id: 'submission-1',
      status: 'QUEUING',
      mode: 'LOCAL',
    });

    expect(prisma.submission.create).toHaveBeenCalledWith({
      data: {
        problemId: 'problem-1',
        problemVersionId: 'version-1',
        userId: 'student-1',
        language: 'cpp',
        sourceCode: 'int main() { return 0; }',
        status: 'PENDING',
      },
    });
    expect(judgeQueue.add).toHaveBeenCalledWith('local-judge', expect.objectContaining({
      submissionId: 'submission-1',
      problemId: 'problem-1',
      language: 'cpp',
      outputLimit: 1024,
    }), { priority: 1 });
  });

  it('allows the author to verify a contest reserved problem before publishing it', async () => {
    const { service, prisma } = createService(reservedProblem);

    await expect(service.submit('teacher-1', {
      problemId: 'problem-1',
      language: 'cpp',
      sourceCode: 'int main() { return 0; }',
    }, { authorPreviewActor: { id: 'teacher-1', role: 'TEACHER' } })).resolves.toEqual({
      id: 'submission-1',
      status: 'QUEUING',
      mode: 'LOCAL',
    });

    expect(prisma.submission.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        problemId: 'problem-1',
        userId: 'teacher-1',
      }),
    }));
  });

  it('lets another teacher verify a shared contest reserved problem', async () => {
    const { service, prisma } = createService(reservedProblem);

    await expect(service.submit('teacher-2', {
      problemId: 'problem-1',
      language: 'cpp',
      sourceCode: 'int main() { return 0; }',
    }, { authorPreviewActor: { id: 'teacher-2', role: 'TEACHER' } })).resolves.toMatchObject({ mode: 'LOCAL' });

    expect(prisma.submission.create).toHaveBeenCalled();
  });

  it('allows another local submission while the user has one active submission outside cooldown', async () => {
    const { service, prisma } = createService(reservedProblem);
    prisma.submission.count.mockResolvedValue(1);
    prisma.submission.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(where.status ? { id: 'active-submission' } : null));

    await expect(service.submit('student-1', {
      problemId: 'problem-1', language: 'cpp', sourceCode: 'int main() {}',
    }, { allowContestReserved: true })).resolves.toMatchObject({ status: 'QUEUING' });
    expect(prisma.submission.count).toHaveBeenCalledWith({ where: {
      userId: 'student-1', status: { in: ['PENDING', 'QUEUING', 'COMPILING', 'RUNNING', 'JUDGING'] },
    } });
  });

  it('rejects submissions at the default five pending submissions per user', async () => {
    const { service, prisma } = createService(reservedProblem);
    prisma.submission.count.mockResolvedValue(5);

    await expect(service.submit('student-1', {
      problemId: 'problem-1',
      language: 'cpp',
      sourceCode: 'int main() { return 0; }',
    }, { allowContestReserved: true })).rejects.toMatchObject({ status: 429 });

    expect(prisma.submission.create).not.toHaveBeenCalled();
  });

  it('honors the configurable per-user pending limit', async () => {
    const previous = process.env.JUDGE_MAX_PENDING_PER_USER;
    process.env.JUDGE_MAX_PENDING_PER_USER = '2';
    try {
      const { service, prisma } = createService(reservedProblem);
      prisma.submission.count.mockResolvedValue(2);
      await expect(service.submit('student-1', {
        problemId: 'problem-1', language: 'cpp', sourceCode: 'int main() {}',
      }, { allowContestReserved: true })).rejects.toMatchObject({ status: 429 });
      expect(prisma.submission.create).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.JUDGE_MAX_PENDING_PER_USER;
      else process.env.JUDGE_MAX_PENDING_PER_USER = previous;
    }
  });

  it('retains the five-second submission cooldown', async () => {
    const { service, prisma } = createService(reservedProblem);
    prisma.submission.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(where.createdAt ? { id: 'recent-submission' } : null));
    await expect(service.submit('student-1', {
      problemId: 'problem-1', language: 'cpp', sourceCode: 'int main() {}',
    }, { allowContestReserved: true })).rejects.toMatchObject({ status: 429 });
    expect(prisma.submission.create).not.toHaveBeenCalled();
  });

  it('locks admission per user before checking capacity and reserving a submission', async () => {
    const { service, prisma, judgeQueue } = createService(reservedProblem);
    await service.submit('student-1', {
      problemId: 'problem-1', language: 'cpp', sourceCode: 'int main() {}',
    }, { allowContestReserved: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledWith(expect.any(Array), 'local-submission:student-1');
    expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.submission.count.mock.invocationCallOrder[0]);
    expect(prisma.submission.count.mock.invocationCallOrder[0]).toBeLessThan(prisma.submission.create.mock.invocationCallOrder[0]);
    expect(prisma.judgeTask.create.mock.invocationCallOrder[0]).toBeLessThan(judgeQueue.add.mock.invocationCallOrder[0]);
  });

  it('does not overwrite a fast worker status after queue admission', async () => {
    const { service, prisma, judgeQueue } = createService(reservedProblem);
    let status = 'PENDING';
    prisma.submission.update.mockImplementation(({ data }) => {
      status = data.status;
      return Promise.resolve({ id: 'submission-1', status });
    });
    judgeQueue.add.mockImplementation(async () => {
      status = 'ACCEPTED';
      return { id: 'job-1' };
    });
    await service.submit('student-1', {
      problemId: 'problem-1', language: 'cpp', sourceCode: 'int main() {}',
    }, { allowContestReserved: true });
    expect(status).toBe('ACCEPTED');
  });

  it('rejects submissions when the configured judge queue is full', async () => {
    const { service, prisma, judgeQueue } = createService(reservedProblem);
    judgeQueue.getWaitingCount.mockResolvedValue(500);

    await expect(service.submit('student-1', {
      problemId: 'problem-1',
      language: 'cpp',
      sourceCode: 'int main() { return 0; }',
    }, { allowContestReserved: true })).rejects.toMatchObject({ status: 429 });

    expect(prisma.submission.create).not.toHaveBeenCalled();
  });

  it('includes prioritized local judge jobs in the global backlog limit', async () => {
    const { service, prisma, judgeQueue } = createService(reservedProblem);
    judgeQueue.getWaitingCount.mockResolvedValue(100);
    judgeQueue.getPrioritizedCount.mockResolvedValue(400);
    await expect(service.submit('student-1', {
      problemId: 'problem-1', language: 'cpp', sourceCode: 'int main() {}',
    }, { allowContestReserved: true })).rejects.toMatchObject({ status: 429 });
    expect(prisma.submission.create).not.toHaveBeenCalled();
  });

  it('releases a pending slot and finishes its judge task when queue publication fails', async () => {
    const { service, prisma, judgeQueue } = createService(reservedProblem);
    const failure = new Error('Redis unavailable');
    judgeQueue.add.mockRejectedValue(failure);
    await expect(service.submit('student-1', {
      problemId: 'problem-1', language: 'cpp', sourceCode: 'int main() {}',
    }, { allowContestReserved: true })).rejects.toBe(failure);
    expect(prisma.submission.updateMany).toHaveBeenCalledWith({
      where: { id: 'submission-1', status: { in: ['PENDING', 'QUEUING'] } },
      data: expect.objectContaining({ status: 'SYSTEM_ERROR', judgedAt: expect.any(Date) }),
    });
    expect(prisma.judgeTask.updateMany).toHaveBeenCalledWith({
      where: { submissionId: 'submission-1', finishedAt: null },
      data: { finishedAt: expect.any(Date) },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('does not finish a task already picked up when publication reports an error', async () => {
    const { service, prisma, judgeQueue } = createService(reservedProblem);
    const failure = new Error('Queue acknowledgement lost');
    judgeQueue.add.mockRejectedValue(failure);
    prisma.submission.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.submit('student-1', {
      problemId: 'problem-1', language: 'cpp', sourceCode: 'int main() {}',
    }, { allowContestReserved: true })).rejects.toBe(failure);
    expect(prisma.submission.updateMany).toHaveBeenCalled();
    expect(prisma.judgeTask.updateMany).not.toHaveBeenCalled();
  });
});
