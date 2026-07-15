import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeacherService } from './teacher.service';

describe('TeacherService', () => {
  let service: TeacherService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      class: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      problem: {
        findMany: jest.fn(),
      },
      assignment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      assignmentProblem: {
        createMany: jest.fn(),
      },
      assignmentStudent: {
        createMany: jest.fn(),
      },
      submission: {
        findMany: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      classMember: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new TeacherService(prisma);
  });

  it('returns classes with a memberCount field from Prisma relation counts', async () => {
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        name: '2024 级 1 班',
        teacherId: 'teacher-1',
        createdAt: new Date('2026-07-15T00:00:00.000Z'),
        _count: { members: 3 },
      },
    ]);

    const classes = await service.getClasses('teacher-1');

    expect(classes).toEqual([
      {
        id: 'class-1',
        name: '2024 级 1 班',
        teacherId: 'teacher-1',
        createdAt: new Date('2026-07-15T00:00:00.000Z'),
        memberCount: 3,
      },
    ]);
  });

  it('removes a student from a class owned by the teacher', async () => {
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1', teacherId: 'teacher-1' });
    prisma.classMember.findUnique.mockResolvedValue({ classId: 'class-1', userId: 'student-1' });

    const result = await service.removeStudent('class-1', 'teacher-1', 'student-1');

    expect(prisma.classMember.delete).toHaveBeenCalledWith({
      where: { classId_userId: { classId: 'class-1', userId: 'student-1' } },
    });
    expect(result).toEqual({ removed: true });
  });

  it('imports students by username or email and reports skipped identifiers', async () => {
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1', teacherId: 'teacher-1' });
    prisma.user.findFirst
      .mockResolvedValueOnce({ id: 'student-1', username: 'alice', email: 'alice@example.com' })
      .mockResolvedValueOnce({ id: 'student-2', username: 'bob', email: 'bob@example.com' })
      .mockResolvedValueOnce(null);
    prisma.classMember.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ classId: 'class-1', userId: 'student-2' });

    const result = await service.importStudents('class-1', 'teacher-1', [
      'alice',
      'bob@example.com',
      'missing_user',
      'alice',
    ]);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { username: { equals: 'alice', mode: 'insensitive' } },
          { email: { equals: 'alice', mode: 'insensitive' } },
        ],
      },
      select: { id: true, username: true, email: true },
    });
    expect(prisma.classMember.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      added: 1,
      skipped: 3,
      notFound: ['missing_user'],
      alreadyInClass: ['bob@example.com'],
      duplicatedInput: ['alice'],
    });
  });

  it('rejects removing students from a class owned by another teacher', async () => {
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1', teacherId: 'teacher-2' });

    await expect(service.removeStudent('class-1', 'teacher-1', 'student-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.classMember.delete).not.toHaveBeenCalled();
  });

  it('reports missing class members when removing a student who is not in the class', async () => {
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1', teacherId: 'teacher-1' });
    prisma.classMember.findUnique.mockResolvedValue(null);

    await expect(service.removeStudent('class-1', 'teacher-1', 'student-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.classMember.delete).not.toHaveBeenCalled();
  });

  it('creates an assignment with selected problems and enrolls current class members', async () => {
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1', teacherId: 'teacher-1' });
    prisma.problem.findMany.mockResolvedValue([{ id: 'problem-1' }, { id: 'problem-2' }]);
    prisma.assignment.create.mockResolvedValue({ id: 'assignment-1', classId: 'class-1', title: '第一周作业' });
    prisma.classMember.findMany = jest.fn().mockResolvedValue([
      { userId: 'student-1' },
      { userId: 'student-2' },
    ]);

    const result = await service.createAssignment('teacher-1', {
      classId: 'class-1',
      title: '第一周作业',
      problemIds: ['problem-1', 'problem-2'],
    });

    expect(prisma.assignmentProblem.createMany).toHaveBeenCalledWith({
      data: [
        { assignmentId: 'assignment-1', problemId: 'problem-1', order: 1, score: 100 },
        { assignmentId: 'assignment-1', problemId: 'problem-2', order: 2, score: 100 },
      ],
      skipDuplicates: true,
    });
    expect(prisma.assignmentStudent.createMany).toHaveBeenCalledWith({
      data: [
        { assignmentId: 'assignment-1', userId: 'student-1' },
        { assignmentId: 'assignment-1', userId: 'student-2' },
      ],
      skipDuplicates: true,
    });
    expect(result).toEqual({ id: 'assignment-1', classId: 'class-1', title: '第一周作业' });
  });

  it('builds an assignment report from class students, problems, and submissions', async () => {
    prisma.assignment.findUnique.mockResolvedValue({
      id: 'assignment-1',
      title: '第一周作业',
      classId: 'class-1',
      problems: [
        { order: 1, problem: { id: 'problem-1', title: 'A+B' } },
        { order: 2, problem: { id: 'problem-2', title: '排序' } },
      ],
    });
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1', teacherId: 'teacher-1', name: '一班' });
    prisma.classMember.findMany = jest.fn().mockResolvedValue([
      { user: { id: 'student-1', username: 'alice', nickname: 'Alice' } },
      { user: { id: 'student-2', username: 'bob', nickname: null } },
    ]);
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        userId: 'student-1',
        problemId: 'problem-1',
        status: 'WRONG_ANSWER',
        score: 0,
        timeUsed: 10,
        memoryUsed: 1024,
        createdAt: new Date('2026-07-15T01:00:00.000Z'),
      },
      {
        id: 'sub-2',
        userId: 'student-1',
        problemId: 'problem-1',
        status: 'ACCEPTED',
        score: 100,
        timeUsed: 8,
        memoryUsed: 900,
        createdAt: new Date('2026-07-15T02:00:00.000Z'),
      },
    ]);

    const report = await service.getAssignmentReport('teacher-1', 'assignment-1');

    expect(report.summary).toEqual({ studentCount: 2, problemCount: 2, completedStudents: 0 });
    expect(report.students[0].solvedCount).toBe(1);
    expect(report.students[0].problems[0]).toMatchObject({
      problemId: 'problem-1',
      status: 'ACCEPTED',
      attempts: 2,
      bestSubmissionId: 'sub-2',
    });
    expect(report.students[1].problems[0]).toMatchObject({
      problemId: 'problem-1',
      status: 'NOT_SUBMITTED',
      attempts: 0,
    });
  });
});
