import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy mandatory password change', () => {
  const config: any = {
    get: jest.fn().mockReturnValue('test-access-secret'),
    getOrThrow: jest.fn().mockReturnValue('test-access-secret'),
  };

  it('rejects a must-change-password user on a normal protected endpoint', async () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1', username: 'alice', role: 'STUDENT', authVersion: 0, mustChangePassword: true,
        }),
      },
    };
    const strategy = new JwtStrategy(config, prisma);

    await expect((strategy as any).validate({ method: 'POST', path: '/api/submissions' }, { sub: 'u1', ver: 0 }))
      .rejects.toThrow('必须先修改密码');
  });

  it('allows a must-change-password user to reach the password-change endpoint', async () => {
    const user = { id: 'u1', username: 'alice', role: 'STUDENT', authVersion: 0, mustChangePassword: true };
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const strategy = new JwtStrategy(config, prisma);

    await expect((strategy as any).validate({ method: 'POST', path: '/api/user/password' }, { sub: 'u1', ver: 0 }))
      .resolves.toEqual(user);
  });
});
