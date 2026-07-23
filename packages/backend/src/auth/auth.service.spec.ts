import * as bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService refresh sessions', () => {
  it('registers a teacher applicant with student permissions until approval', async () => {
    const prisma: any = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'teacher-candidate', role: 'STUDENT', requestedRole: 'TEACHER', teacherApplicationStatus: 'PENDING',
        }),
        findUnique: jest.fn().mockResolvedValue({ authVersion: 0, mustChangePassword: false, deletedAt: null }),
      },
      userSession: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new AuthService(prisma, { sign: jest.fn().mockReturnValue('access-token') } as any, {
      get: jest.fn().mockReturnValue('7d'),
    } as any);

    const result = await service.register({
      username: 'teacher-candidate', email: 'teacher@example.com', password: 'Passw0rd1',
      school: 'SWUFE', requestedRole: 'TEACHER',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        role: 'STUDENT', requestedRole: 'TEACHER', teacherApplicationStatus: 'PENDING',
      }),
    }));
    expect(result.registration).toEqual({
      role: 'STUDENT', requestedRole: 'TEACHER', teacherApplicationStatus: 'PENDING',
    });
  });

  it('stores only a SHA-256 hash of a newly issued refresh token', async () => {
    const password = await bcrypt.hash('Passw0rd1', 4);
    const prisma: any = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'u1', password, mustChangePassword: false }),
        findUnique: jest.fn().mockResolvedValue({ authVersion: 0 }),
      },
      userSession: { create: jest.fn().mockResolvedValue({}) },
    };
    const jwt: any = { sign: jest.fn().mockReturnValue('access-token') };
    const config: any = { get: jest.fn().mockReturnValue('7d') };
    const service = new AuthService(prisma, jwt, config);

    await service.login({ account: 'alice', password: 'Passw0rd1' });

    expect(prisma.userSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        refreshTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
  });

  it('preserves the mandatory-password-change state across a refresh rotation', async () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ authVersion: 0, mustChangePassword: true }),
      },
      userSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 's1', userId: 'u1', expiresAt: new Date(Date.now() + 60_000) }),
        delete: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const jwt: any = { sign: jest.fn().mockReturnValue('access-token') };
    const config: any = { get: jest.fn().mockReturnValue('7d') };
    const service = new AuthService(prisma, jwt, config);

    const result = await service.refresh('old-refresh-token');

    expect(result.mustChangePassword).toBe(true);
  });

  it('does not issue a session for a logically deleted account', async () => {
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      userSession: { create: jest.fn() },
    };
    const service = new AuthService(prisma, { sign: jest.fn() } as any, { get: jest.fn() } as any);

    await expect(service.login({ account: 'deleted-user', password: 'Passw0rd1' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ deletedAt: null }),
    }));
  });
});
