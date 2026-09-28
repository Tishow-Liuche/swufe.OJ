import * as bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { hashRefreshToken } from './refresh-token';

describe('AuthService response-loss recovery', () => {
  const attempt = 'a'.repeat(64);
  function fixture() {
    const sessions = new Map<string, any>();
    sessions.set(hashRefreshToken('old-cookie'), {
      id: 'old', userId: 'u1', expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(),
    });
    const user = { authVersion: 3, mustChangePassword: true, deletedAt: null as Date | null };
    const database: any = {
      user: { findUnique: jest.fn(async () => user) },
      userSession: {
        findUnique: jest.fn(async ({ where }) => sessions.get(where.refreshTokenHash) ?? null),
        deleteMany: jest.fn(async ({ where }) => {
          const entries = [...sessions].filter(([hash, value]) => where.id
            ? value.id === where.id
            : typeof where.refreshTokenHash === 'string' ? hash === where.refreshTokenHash
              : where.refreshTokenHash.in.includes(hash));
          entries.forEach(([hash]) => sessions.delete(hash));
          return { count: entries.length };
        }),
        create: jest.fn(async ({ data }) => {
          const row = { ...data, id: data.refreshTokenHash, createdAt: new Date() };
          sessions.set(data.refreshTokenHash, row);
          return row;
        }),
      },
    };
    database.$transaction = (operation: any) => operation(database);
    const config: any = {
      get: (name: string) => name === 'JWT_REFRESH_EXPIRES' ? '7d' : 'server-only-secret',
      getOrThrow: () => 'server-only-secret',
    };
    const jwt: any = { sign: jest.fn(() => 'access-token') };
    const service: any = new AuthService(database, jwt, config);
    return { service, sessions, database, user, jwt };
  }

  it('recovers the exact committed successor after the complete HTTP response was lost', async () => {
    const { service, sessions, database, jwt } = fixture();
    const lost = await service.refresh('old-cookie', attempt);
    const retry = await service.refresh('old-cookie', attempt);
    expect(retry.refreshToken).toBe(lost.refreshToken);
    expect(retry.mustChangePassword).toBe(true);
    expect(jwt.sign).toHaveBeenLastCalledWith({ sub: 'u1', ver: 3 });
    expect(sessions.size).toBe(1);
    expect(database.userSession.create).toHaveBeenCalledTimes(1);
    expect([...sessions.keys()]).toEqual([hashRefreshToken(lost.refreshToken)]);
    expect([...sessions.values()][0]).not.toHaveProperty('refreshToken');
  });

  it('accepts a retry when Set-Cookie arrived but the response body did not', async () => {
    const { service, sessions } = fixture();
    const lost = await service.refresh('old-cookie', attempt);
    const retry = await service.refresh(lost.refreshToken, attempt);
    expect(retry.accessToken).toBe('access-token');
    expect(sessions.size).toBe(1);
  });

  it.each([undefined, 'b'.repeat(64)])('rejects consumed cookies without the exact attempt (%s)', async key => {
    const { service } = fixture();
    await service.refresh('old-cookie', attempt);
    await expect(service.refresh('old-cookie', key)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each(['', 'a', 'g'.repeat(64), 'a'.repeat(65), ['a'.repeat(64)]])('rejects malformed attempt keys before consuming a session: %s', async key => {
    const { service, database } = fixture();
    await expect(service.refresh('old-cookie', key)).rejects.toMatchObject({ status: 400 });
    expect(database.userSession.deleteMany).not.toHaveBeenCalled();
  });

  it.each(['window', 'expired', 'revoked', 'deleted-user'])('never recovers an ineligible successor: %s', async condition => {
    const { service, sessions, user, database } = fixture();
    await service.refresh('old-cookie', attempt);
    const successor = [...sessions.values()][0];
    if (condition === 'window') successor.createdAt = new Date(Date.now() - 300_001);
    if (condition === 'expired') successor.expiresAt = new Date(0);
    if (condition === 'revoked') sessions.clear();
    if (condition === 'deleted-user') user.deletedAt = new Date();
    await expect(service.refresh('old-cookie', attempt)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.userSession.create).toHaveBeenCalledTimes(1);
  });

  it('lets concurrent identical attempts converge even when both read the old session', async () => {
    const { service, sessions, database } = fixture();
    // A PostgreSQL delete waiting for another transaction sees count=0 after it commits.
    const find = database.userSession.findUnique;
    const old = [...sessions.values()][0];
    await service.refresh('old-cookie', attempt);
    find.mockResolvedValueOnce(old);
    const retry = await service.refresh('old-cookie', attempt);
    expect(hashRefreshToken(retry.refreshToken)).toBe([...sessions.keys()][0]);
    expect(database.userSession.create).toHaveBeenCalledTimes(1);
  });

  it('keeps no-key clients single use', async () => {
    const { service } = fixture();
    await service.refresh('old-cookie');
    await expect(service.refresh('old-cookie')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes a successor on logout even if its Set-Cookie response was lost', async () => {
    const { service, sessions } = fixture();
    await service.refresh('old-cookie', attempt);
    await service.logout('old-cookie', attempt);
    expect(sessions.size).toBe(0);
    await expect(service.refresh('old-cookie', attempt)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('cannot revoke an unrelated successor using the wrong logout attempt', async () => {
    const { service, sessions } = fixture();
    await service.refresh('old-cookie', attempt);
    await service.logout('old-cookie', 'b'.repeat(64));
    expect(sessions.size).toBe(1);
  });

  it('rechecks the successor after waiting for an in-flight rotation to commit during logout', async () => {
    const { service, sessions, database } = fixture();
    const oldEntries = [...sessions];
    await service.refresh('old-cookie', attempt);
    const successorEntries = [...sessions];
    sessions.clear();
    oldEntries.forEach(([key, value]) => sessions.set(key, value));
    database.userSession.deleteMany.mockImplementationOnce(async () => {
      // The first DELETE took its statement snapshot before the refresh committed.
      sessions.clear();
      successorEntries.forEach(([key, value]) => sessions.set(key, value));
      return { count: 0 };
    });
    await service.logout('old-cookie', attempt);
    expect(sessions.size).toBe(0);
    await expect(service.refresh('old-cookie', attempt)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService refresh sessions', () => {
  it.each([null, { id: 'expired', expiresAt: new Date(0) }])('rejects missing or expired refresh sessions', async session => {
    const transaction: any = { userSession: { findUnique: jest.fn().mockResolvedValue(session), deleteMany: jest.fn() } };
    const prisma: any = { $transaction: (fn: any) => fn(transaction) };
    const service = new AuthService(prisma, {} as any, {} as any);
    await expect(service.refresh('invalid')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(transaction.userSession.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a session consumed or revoked by another transaction', async () => {
    const transaction: any = { userSession: {
      findUnique: jest.fn().mockResolvedValue({ id: 's1', userId: 'u1', expiresAt: new Date(Date.now() + 60_000) }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(),
    } };
    const service = new AuthService({ $transaction: (fn: any) => fn(transaction) } as any, {} as any, {} as any);
    await expect(service.refresh('consumed')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(transaction.userSession.create).not.toHaveBeenCalled();
  });
  it('rotates within one transaction so replacement failure cannot consume the session', async () => {
    const transaction: any = {
      userSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 's1', userId: 'u1', expiresAt: new Date(Date.now() + 60_000) }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockRejectedValue(new Error('database unavailable')),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ authVersion: 0 }) },
    };
    const prisma: any = { $transaction: jest.fn(fn => fn(transaction)) };
    const service = new AuthService(prisma, { sign: () => 'access' } as any, { get: () => '7d' } as any);
    await expect(service.refresh('old')).rejects.toThrow('database unavailable');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.userSession.deleteMany).toHaveBeenCalledWith({ where: { id: 's1' } });
  });
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

  it('stores an 8-digit student ID when a student registers', async () => {
    const prisma: any = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ authVersion: 0, mustChangePassword: false, deletedAt: null }),
        create: jest.fn().mockResolvedValue({
          id: 'u1',
          role: 'STUDENT',
          requestedRole: 'STUDENT',
          teacherApplicationStatus: 'NOT_REQUIRED',
        }),
      },
      userSession: { create: jest.fn().mockResolvedValue({}) },
    };
    const jwt: any = { sign: jest.fn().mockReturnValue('access-token') };
    const config: any = { get: jest.fn().mockReturnValue('7d') };
    const service = new AuthService(prisma, jwt, config);

    await service.register({
      username: 'alice',
      email: 'alice@example.com',
      password: 'Passw0rd1',
      school: 'SWUFE',
      college: 'Computer School',
      requestedRole: 'STUDENT',
      studentId: '42411036',
    } as any);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { username: { equals: 'alice', mode: 'insensitive' } },
          { email: { equals: 'alice@example.com', mode: 'insensitive' } },
          { studentId: '42411036' },
        ],
      },
      select: { username: true, email: true, studentId: true },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ studentId: '42411036' }),
    });
  });

  it('rejects a student registration when the student ID is already bound', async () => {
    const prisma: any = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          username: 'other',
          email: 'other@example.com',
          studentId: '42411036',
        }),
      },
    };
    const jwt: any = { sign: jest.fn() };
    const config: any = { get: jest.fn() };
    const service = new AuthService(prisma, jwt, config);

    await expect(service.register({
      username: 'alice',
      email: 'alice@example.com',
      password: 'Passw0rd1',
      school: 'SWUFE',
      college: 'Computer School',
      requestedRole: 'STUDENT',
      studentId: '42411036',
    } as any)).rejects.toMatchObject({
      message: '该学号已绑定其他账号',
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
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const jwt: any = { sign: jest.fn().mockReturnValue('access-token') };
    const config: any = { get: jest.fn().mockReturnValue('7d') };
    const service = new AuthService(prisma, jwt, config);

    prisma.$transaction = jest.fn(fn => fn(prisma));
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
