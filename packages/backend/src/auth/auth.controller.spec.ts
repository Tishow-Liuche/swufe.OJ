import { AuthController } from './auth.controller';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthController refresh cookie', () => {
  it('writes the refresh token to an HTTP-only cookie and omits it from login JSON', async () => {
    const auth: any = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'access-token', refreshToken: 'refresh-token', expiresIn: '7d', mustChangePassword: false,
      }),
    };
    const response: any = { cookie: jest.fn() };
    const config: any = { get: jest.fn().mockReturnValue('false') };
    const controller: any = new (AuthController as any)(auth, config);

    const body = await controller.login({ account: 'alice', password: 'Passw0rd1' }, response);

    expect(response.cookie).toHaveBeenCalledWith(
      'oj_refresh',
      'refresh-token',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
    expect(body).toEqual({ accessToken: 'access-token', expiresIn: '7d', mustChangePassword: false });
  });

  it('rejects refresh requests without the HTTP-only refresh cookie', async () => {
    const auth: any = { refresh: jest.fn() };
    const config: any = { get: jest.fn().mockReturnValue('false') };
    const controller: any = new (AuthController as any)(auth, config);

    await expect(controller.refresh({ cookies: {} }, { cookie: jest.fn() })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('clears the refresh cookie using its scope without assigning a new max age', async () => {
    const auth: any = { logout: jest.fn().mockResolvedValue({}) };
    const config: any = { get: jest.fn().mockReturnValue('false') };
    const response: any = { clearCookie: jest.fn() };
    const controller: any = new (AuthController as any)(auth, config);

    await controller.logout({ cookies: { oj_refresh: 'refresh-token' } }, response);

    expect(auth.logout).toHaveBeenCalledWith('refresh-token');
    expect(response.clearCookie).toHaveBeenCalledWith(
      'oj_refresh',
      expect.objectContaining({ httpOnly: true, path: '/api/auth', sameSite: 'lax' }),
    );
    expect(response.clearCookie.mock.calls[0][1]).not.toHaveProperty('maxAge');
  });

  it('defaults the refresh cookie to Secure when NODE_ENV is production', async () => {
    const auth: any = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'access-token', refreshToken: 'refresh-token', expiresIn: '7d', mustChangePassword: false,
      }),
    };
    const response: any = { cookie: jest.fn() };
    const config: any = {
      get: jest.fn((key: string, fallback?: string) => key === 'NODE_ENV' ? 'production' : fallback),
    };
    const controller: any = new (AuthController as any)(auth, config);

    await controller.login({ account: 'alice', password: 'Passw0rd1' }, response);

    expect(response.cookie).toHaveBeenCalledWith(
      'oj_refresh',
      'refresh-token',
      expect.objectContaining({ secure: true }),
    );
  });
});
