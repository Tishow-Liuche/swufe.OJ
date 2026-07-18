import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      classMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
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
