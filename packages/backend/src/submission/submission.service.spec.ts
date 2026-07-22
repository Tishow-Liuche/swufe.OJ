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
        update: jest.fn().mockResolvedValue({ id: 'submission-1', status: 'QUEUING' }),
      },
      problemTestCase: {
        count: jest.fn().mockResolvedValue(1),
      },
      judgeTask: {
        create: jest.fn().mockResolvedValue({ id: 'judge-task-1' }),
      },
    };
    const judgeQueue: any = {
      add: jest.fn().mockResolvedValue({ id: 'queue-job-1' }),
    };
    const service = new SubmissionService(prisma, {} as any, {} as any, {} as any, judgeQueue);
    return { service, prisma, judgeQueue };
  }

  const reservedProblem = {
    id: 'problem-1',
    status: 'CONTEST_RESERVED',
    createdById: 'teacher-1',
    timeLimit: 1000,
    memoryLimit: 256,
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

  it('does not let another teacher verify someone else\'s contest reserved problem', async () => {
    const { service, prisma } = createService(reservedProblem);

    await expect(service.submit('teacher-2', {
      problemId: 'problem-1',
      language: 'cpp',
      sourceCode: 'int main() { return 0; }',
    }, { authorPreviewActor: { id: 'teacher-2', role: 'TEACHER' } })).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.submission.create).not.toHaveBeenCalled();
  });
});
