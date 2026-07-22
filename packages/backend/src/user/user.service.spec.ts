import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import * as bcrypt from 'bcryptjs';

describe('UserService profile settings', () => {
  let service: UserService;
  let prisma: any;
  let fileUpload: any;
  let cfAcceptedSync: any;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      userSession: {
        deleteMany: jest.fn(),
      },
      submission: {
        findMany: jest.fn(),
      },
      externalSolvedProblem: {
        findMany: jest.fn(),
      },
      externalAccount: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      competitionAward: {
        findMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      class: {
        findUnique: jest.fn(),
      },
      assignment: {
        findMany: jest.fn(),
      },
      classMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      assignmentStudent: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (operations: any[]) => Promise.all(operations)),
    };
    cfAcceptedSync = {
      syncUserAccepted: jest.fn(),
    };
    fileUpload = {
      uploadAvatar: jest.fn(),
      getPresignedUrl: jest.fn(),
    };
    service = new UserService(prisma, fileUpload, cfAcceptedSync);
  });

  it('updates nickname, email and phone for the current user', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      email: 'alice@example.com',
      phone: '13800138000',
      nickname: 'Alice',
      avatar: null,
      role: 'STUDENT',
      school: null,
    });

    const result = await service.updateProfile('u1', {
      nickname: ' Alice ',
      email: ' ALICE@example.com ',
      phone: ' 13800138000 ',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        nickname: 'Alice',
        email: 'alice@example.com',
        phone: '13800138000',
      },
      select: expect.objectContaining({
        id: true,
        email: true,
        phone: true,
        nickname: true,
      }),
    });
    expect(result.email).toBe('alice@example.com');
  });

  it('includes the mandatory-password-change state in the authenticated profile', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', username: 'alice', email: 'alice@example.com', avatar: null,
      phone: null, nickname: 'Alice', role: 'STUDENT', school: null,
      requestedRole: 'STUDENT', teacherApplicationStatus: 'NOT_REQUIRED',
      mustChangePassword: true, createdAt: new Date(),
    });

    const result = await service.getProfile('u1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ mustChangePassword: true }),
    }));
    expect(result).toMatchObject({ mustChangePassword: true });
  });

  it('includes the approved member count in each student class record', async () => {
    prisma.classMember.findMany.mockResolvedValue([{
      id: 'membership-1',
      status: 'APPROVED',
      reviewNote: null,
      joinedAt: new Date('2026-07-22T08:00:00.000Z'),
      reviewedAt: new Date('2026-07-22T09:00:00.000Z'),
      class: {
        id: 'class-1', name: '算法训练一班', teacherId: 'teacher-1', status: 'APPROVED', course: null,
        _count: { members: 36 },
      },
    }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'teacher-1', username: 'teacher', nickname: '王老师' }]);

    const result = await service.listMyClasses('student-1');

    expect(prisma.classMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        class: expect.objectContaining({
          select: expect.objectContaining({
            _count: { select: { members: { where: { status: 'APPROVED' } } } },
          }),
        }),
      }),
    }));
    expect(result[0].class._count.members).toBe(36);
  });

  it('rejects duplicate email when another user already owns it', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u2' });

    await expect(
      service.updateProfile('u1', { email: 'taken@example.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows optional profile fields to be cleared with null', async () => {
    prisma.user.update.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      email: 'alice@example.com',
      phone: null,
      nickname: null,
      avatar: null,
      role: 'STUDENT',
      school: null,
    });

    await service.updateProfile('u1', { nickname: null as any, phone: null as any });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { nickname: null, phone: null },
      select: expect.any(Object),
    });
  });

  it('upserts Codeforces and Luogu accounts and removes blank binding', async () => {
    prisma.externalAccount.upsert.mockResolvedValue({});
    prisma.externalAccount.deleteMany.mockResolvedValue({ count: 1 });
    prisma.externalAccount.findMany.mockResolvedValue([
      {
        platform: 'CODEFORCES',
        remoteUserId: 'tourist',
        remoteUsername: 'tourist',
      },
    ]);

    const result = await service.updateExternalAccounts('u1', {
      codeforcesHandle: ' tourist ',
      luoguHandle: '',
    });

    expect(prisma.externalAccount.upsert).toHaveBeenCalledWith({
      where: { platform_remoteUserId: { platform: 'CODEFORCES', remoteUserId: 'tourist' } },
      create: expect.objectContaining({
        userId: 'u1',
        platform: 'CODEFORCES',
        remoteUserId: 'tourist',
        remoteUsername: 'tourist',
      }),
      update: expect.objectContaining({
        userId: 'u1',
        remoteUsername: 'tourist',
      }),
    });
    expect(prisma.externalAccount.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', platform: 'LUOGU' },
    });
    expect(result.codeforcesHandle).toBe('tourist');
  });

  it('syncs accepted Codeforces problems for the current user', async () => {
    cfAcceptedSync.syncUserAccepted.mockResolvedValue({
      handle: 'tourist',
      fetchedCount: 20,
      acceptedCount: 8,
      matchedCount: 5,
      createdCount: 3,
      updatedCount: 1,
      unchangedCount: 1,
      unmatchedCount: 3,
    });

    const result = await service.syncCodeforcesAccepted('u1');

    expect(cfAcceptedSync.syncUserAccepted).toHaveBeenCalledWith('u1');
    expect(result.createdCount).toBe(3);
    expect(result.unmatchedCount).toBe(3);
  });

  it('lists local and external accepted problems newest first', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 'sub-local',
        problemId: 'p-local',
        status: 'ACCEPTED',
        judgedAt: new Date('2026-07-10T10:00:00.000Z'),
        createdAt: new Date('2026-07-10T09:59:00.000Z'),
        timeUsed: 12,
        memoryUsed: 256,
        language: 'cpp',
        problem: {
          id: 'p-local',
          title: '本地题',
          difficulty: 'POINT_0',
          source: 'LOCAL',
          sourceInfo: null,
        },
      },
    ]);
    prisma.externalSolvedProblem.findMany.mockResolvedValue([
      {
        id: 'ext-cf',
        platform: 'CODEFORCES',
        remoteProblemId: '4A',
        remoteSubmissionId: '1001',
        acceptedAt: new Date('2026-07-11T10:00:00.000Z'),
        timeUsed: 46,
        memoryUsed: 200,
        problem: {
          id: 'p-cf',
          title: 'Watermelon',
          difficulty: 'POINT_0',
          source: 'REMOTE',
          sourceInfo: { platform: 'CODEFORCES', remoteProblemId: '4A', remoteUrl: 'https://codeforces.com/problemset/problem/4/A' },
        },
      },
    ]);

    const result = await service.listAcceptedProblems('u1');

    expect(result.total).toBe(2);
    expect(result.items.map((item: any) => item.problem.id)).toEqual(['p-cf', 'p-local']);
    expect(result.items[0]).toEqual(expect.objectContaining({
      source: 'CODEFORCES',
      remoteProblemId: '4A',
      remoteSubmissionId: '1001',
      acceptedAt: new Date('2026-07-11T10:00:00.000Z'),
    }));
    expect(result.items[1]).toEqual(expect.objectContaining({
      source: 'LOCAL',
      submissionId: 'sub-local',
      language: 'cpp',
    }));
  });

  it('creates award recognition as pending for the current user', async () => {
    prisma.competitionAward.create.mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      competition: 'ICPC',
      year: 2025,
      awardLevel: '银奖',
      status: 'PENDING',
    });

    const result = await service.createAward('u1', {
      competition: 'ICPC',
      year: 2025,
      awardLevel: '银奖',
    });

    expect(prisma.competitionAward.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        competition: 'ICPC',
        year: 2025,
        awardLevel: '银奖',
        status: 'PENDING',
      }),
    });
    expect(result.status).toBe('PENDING');
  });

  it('prevents editing an award owned by another user', async () => {
    prisma.competitionAward.findFirst.mockResolvedValue(null);

    await expect(
      service.updateAward('u1', 'a2', { awardLevel: '金奖' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a pending class application from a valid join code', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'STUDENT' });
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: '算法训练一班',
      status: 'APPROVED',
      joinCodeExpiresAt: new Date(Date.now() + 3600000),
    });
    prisma.classMember.findUnique.mockResolvedValue(null);
    prisma.classMember.create.mockResolvedValue({ id: 'member-1', status: 'PENDING' });

    const result = await service.applyToClass('u1', 'abcd2345');

    expect(prisma.class.findUnique).toHaveBeenCalledWith({
      where: { joinCode: 'ABCD2345' },
      select: { id: true, name: true, status: true, joinCodeExpiresAt: true },
    });
    expect(prisma.classMember.create).toHaveBeenCalledWith({
      data: { classId: 'class-1', userId: 'u1', status: 'PENDING' },
    });
    expect(result).toEqual({ id: 'member-1', classId: 'class-1', className: '算法训练一班', status: 'PENDING' });
  });

  it('rejects an expired class join code', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'STUDENT' });
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: '算法训练一班',
      status: 'APPROVED',
      joinCodeExpiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.applyToClass('u1', 'ABCD2345')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.classMember.create).not.toHaveBeenCalled();
  });

  it('does not expose class assignments to a member who is not approved', async () => {
    prisma.classMember.findUnique.mockResolvedValue({ status: 'PENDING' });

    await expect(service.getClassAssignments('student-1', 'class-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.assignment.findMany).not.toHaveBeenCalled();
  });

  it('returns only the student class assignments with completion during each assignment window', async () => {
    prisma.classMember.findUnique.mockResolvedValue({ status: 'APPROVED' });
    prisma.class.findUnique.mockResolvedValue({ id: 'class-1', name: '算法训练一班' });
    prisma.assignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        classId: 'class-1',
        title: '第一周作业',
        description: '基础练习',
        startTime: new Date('2026-07-21T00:00:00.000Z'),
        endTime: new Date('2026-07-30T00:00:00.000Z'),
        allowLate: false,
        latePenalty: 0,
        passCondition: null,
        countExternalAc: false,
        createdAt: new Date('2026-07-20T00:00:00.000Z'),
        problems: [
          { problemId: 'problem-1', order: 1, score: 100, problem: { id: 'problem-1', title: 'A+B', source: 'LOCAL', difficulty: '入门' } },
          { problemId: 'problem-2', order: 2, score: 100, problem: { id: 'problem-2', title: '排序', source: 'LOCAL', difficulty: '简单' } },
        ],
      },
      {
        id: 'assignment-2',
        classId: 'class-1',
        title: '限时练习',
        description: null,
        startTime: new Date('2026-07-21T00:00:00.000Z'),
        endTime: new Date('2026-07-23T00:00:00.000Z'),
        allowLate: false,
        latePenalty: 0,
        passCondition: null,
        countExternalAc: false,
        createdAt: new Date('2026-07-20T00:00:00.000Z'),
        problems: [
          { problemId: 'problem-2', order: 1, score: 100, problem: { id: 'problem-2', title: '排序', source: 'LOCAL', difficulty: '简单' } },
        ],
      },
    ]);
    prisma.assignmentStudent = {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      findUnique: jest.fn()
        .mockResolvedValueOnce({ status: 'COMPLETED', score: 200, submittedAt: new Date('2026-07-22T10:00:00.000Z'), completedAt: new Date('2026-07-25T10:00:00.000Z') })
        .mockResolvedValueOnce({ status: 'EXPIRED', score: 0, submittedAt: null, completedAt: null }),
    };
    const assignmentProgress = {
      recomputeStudent: jest.fn().mockResolvedValue(null),
      calculate: jest.fn()
        .mockResolvedValueOnce({
          status: 'COMPLETED',
          solvedCount: 2,
          totalProblems: 2,
          requiredCount: 2,
          completed: true,
          late: false,
          score: 200,
          maxScore: 200,
          submittedAt: new Date('2026-07-22T10:00:00.000Z'),
          completedAt: new Date('2026-07-25T10:00:00.000Z'),
          problems: [
            { problemId: 'problem-1', solved: true, late: false, earnedScore: 100 },
            { problemId: 'problem-2', solved: true, late: false, earnedScore: 100 },
          ],
        })
        .mockResolvedValueOnce({
          status: 'EXPIRED',
          solvedCount: 0,
          totalProblems: 1,
          requiredCount: 1,
          completed: false,
          late: false,
          score: 0,
          maxScore: 100,
          submittedAt: null,
          completedAt: null,
          problems: [
            { problemId: 'problem-2', solved: false, late: false, earnedScore: 0 },
          ],
        }),
    };
    service = new UserService(prisma, fileUpload, cfAcceptedSync, assignmentProgress as any);

    const result = await service.getClassAssignments('student-1', 'class-1');

    expect(prisma.classMember.findUnique).toHaveBeenCalledWith({
      where: { classId_userId: { classId: 'class-1', userId: 'student-1' } },
      select: { status: true },
    });
    expect(result.class).toEqual({ id: 'class-1', name: '算法训练一班' });
    expect(result.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'assignment-1',
        progress: expect.objectContaining({ solvedCount: 2, totalProblems: 2, completed: true, status: 'COMPLETED' }),
      }),
      expect.objectContaining({
        id: 'assignment-2',
        progress: expect.objectContaining({ solvedCount: 0, totalProblems: 1, completed: false, status: 'EXPIRED' }),
      }),
    ]));
  });

  it('uses the configured solved-count requirement when listing current student assignments', async () => {
    prisma.classMember.findMany.mockResolvedValue([{
      classId: 'class-1',
      status: 'APPROVED',
      class: {
        id: 'class-1', name: '算法训练一班', teacherId: 'teacher-1', status: 'APPROVED', course: null,
      },
    }]);
    prisma.assignment.findMany.mockResolvedValue([{
      id: 'assignment-1',
      classId: 'class-1',
      title: '第一周作业',
      description: '基础题训练',
      startTime: new Date('2026-07-20T00:00:00.000Z'),
      endTime: new Date('2026-07-30T00:00:00.000Z'),
      passCondition: 'COUNT:1',
      createdAt: new Date('2026-07-19T00:00:00.000Z'),
      problems: [
        { order: 1, score: 100, problem: { id: 'problem-1', title: 'A+B', source: 'LOCAL', difficulty: 'POINT_0', sourceInfo: null } },
        { order: 2, score: 100, problem: { id: 'problem-2', title: '排序', source: 'LOCAL', difficulty: 'POINT_1', sourceInfo: null } },
      ],
    }]);
    prisma.assignmentStudent.findMany.mockResolvedValue([{
      assignmentId: 'assignment-1', status: 'IN_PROGRESS', score: 100, submittedAt: null, completedAt: null,
    }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'teacher-1', username: 'teacher', nickname: '王老师' }]);
    prisma.submission.findMany.mockResolvedValue([{
      id: 'submission-1', problemId: 'problem-1', status: 'ACCEPTED', score: 100,
      timeUsed: 12, memoryUsed: 256, createdAt: new Date('2026-07-21T00:00:00.000Z'),
    }]);

    const result = await service.listMyAssignments('student-1');

    expect(prisma.classMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'student-1', status: 'APPROVED' },
    }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'assignment-1',
      class: { id: 'class-1', name: '算法训练一班' },
      teacher: { id: 'teacher-1', username: 'teacher', nickname: '王老师' },
      progress: { total: 2, solved: 1, requiredCount: 1, completed: true },
      enrollmentStatus: 'COMPLETED',
    });
    expect(result.items[0].problems[0]).toMatchObject({
      id: 'problem-1', status: 'ACCEPTED', attempts: 1, bestSubmissionId: 'submission-1',
    });
    expect(result.items[0].problems[1]).toMatchObject({
      id: 'problem-2', status: 'NOT_SUBMITTED', attempts: 0,
    });
  });

  it('requires the current password when changing password from settings', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      password: await bcrypt.hash('Oldpass123', 4),
      mustChangePassword: false,
    });

    await expect(
      service.changeOwnPassword('u1', { password: 'Newpass123' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects an incorrect current password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      password: await bcrypt.hash('Oldpass123', 4),
      mustChangePassword: false,
    });

    await expect(
      service.changeOwnPassword('u1', { currentPassword: 'Wrongpass123', password: 'Newpass123' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('updates password and clears existing sessions after a settings password change', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      password: await bcrypt.hash('Oldpass123', 4),
      mustChangePassword: false,
    });
    prisma.user.update.mockResolvedValue({});
    prisma.userSession.deleteMany.mockResolvedValue({ count: 2 });

    const result = await service.changeOwnPassword('u1', {
      currentPassword: 'Oldpass123',
      password: 'Newpass123',
    } as any);

    expect(result).toEqual({ success: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        password: expect.any(String),
        mustChangePassword: false,
        authVersion: { increment: 1 },
      },
    });
    expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('allows forced first-login password change without the current password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      password: await bcrypt.hash('TempPass123', 4),
      mustChangePassword: true,
    });
    prisma.user.update.mockResolvedValue({});

    await expect(
      service.changeOwnPassword('u1', { password: 'Newpass123' } as any),
    ).resolves.toEqual({ success: true });
    expect(prisma.userSession.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a new password without both letters and numbers', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      password: await bcrypt.hash('Oldpass123', 4),
      mustChangePassword: false,
    });

    await expect(
      service.changeOwnPassword('u1', { currentPassword: 'Oldpass123', password: 'abcdefgh' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
