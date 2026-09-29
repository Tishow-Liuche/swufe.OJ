import { Controller, HttpCode, INestApplication, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import request from 'supertest';
import { createHmac } from 'crypto';
import { LoginDto } from '../auth/dto';
import { hashRefreshToken } from '../auth/refresh-token';
import { PrismaService } from '../prisma/prisma.service';
import { AccountThrottlerGuard } from './account-throttler.guard';

@Controller('api/auth')
class AuthTestController {
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login() { return { ok: true }; }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  refresh() { return { ok: true }; }

  @Post('register')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register() { return { ok: true }; }

  @Post('password-recovery/code')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  recover() { return { ok: true }; }
}

describe('AccountThrottlerGuard authentication capacity', () => {
  let app: INestApplication;
  let findUnique: jest.Mock;
  let userLookup: jest.Mock;
  let sessions: Map<string, { userId: string; expiresAt: Date; createdAt?: Date; user: { deletedAt: Date | null } }>;

  beforeEach(async () => {
    sessions = new Map();
    findUnique = jest.fn(async ({ where }) => sessions.get(where.refreshTokenHash) ?? null);
    userLookup = jest.fn();
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ limit: 100, ttl: 60_000 }])],
      controllers: [AuthTestController],
      providers: [
        { provide: ConfigService, useValue: new ConfigService({ JWT_ACCESS_SECRET: 'test-secret' }) },
        { provide: PrismaService, useValue: { userSession: { findUnique }, user: { findFirst: userLookup } } },
        { provide: APP_GUARD, useClass: AccountThrottlerGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    await app.init();
  });

  afterEach(async () => { await app.close(); });

  const login = (body: object, ip = '192.0.2.1') => request(app.getHttpServer())
    .post('/api/auth/login').set('X-Forwarded-For', ip).send(body);
  const refresh = (token?: string, ip = '192.0.2.1') => {
    const req = request(app.getHttpServer()).post('/api/auth/refresh').set('X-Forwarded-For', ip);
    return token ? req.set('Cookie', `oj_refresh=${token}`) : req;
  };
  const addSession = (n: number, userId = `student-${n}`) => {
    const token = n.toString(16).padStart(64, '0');
    sessions.set(hashRefreshToken(token), { userId, expiresAt: new Date(Date.now() + 60_000), user: { deletedAt: null } });
    return token;
  };
  const recoveryAttempt = 'a'.repeat(64);
  const addRecovery = (n: number, userId = `student-${n}`) => {
    const token = (n + 10_000).toString(16).padStart(64, '0');
    // Independent protocol fixture: do not let a helper error mask a service/guard mismatch.
    const successor = createHmac('sha256', 'test-secret')
      .update('swufe:refresh-response-recovery:v1\0').update(JSON.stringify([token, recoveryAttempt])).digest('hex');
    const session = { userId, expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(), user: { deletedAt: null as Date | null } };
    sessions.set(hashRefreshToken(successor), session);
    return { token, successor, session };
  };

  it('allows 100 exact recoverable successors at one classroom IP after their old cookies were consumed', async () => {
    for (let n = 1; n <= 100; n++) {
      await refresh(addRecovery(n).token).set('X-Refresh-Attempt', recoveryAttempt).expect(200);
    }
    expect(findUnique).toHaveBeenCalledTimes(200);
  });

  it('shares the 60-per-account bucket between recovery and current-cookie requests across IPs', async () => {
    const { token, successor } = addRecovery(1, 'alice');
    for (let n = 1; n <= 60; n++) {
      const req = refresh(n % 2 ? token : successor, `192.0.2.${n}`);
      if (n % 2) req.set('X-Refresh-Attempt', recoveryAttempt);
      await req.expect(200);
    }
    await refresh(successor, '192.0.2.100').expect('Retry-After', /\d+/).expect(429);
    await refresh(token, '192.0.2.101').set('X-Refresh-Attempt', recoveryAttempt).expect(429);
    expect(findUnique).toHaveBeenCalledTimes(93);
  });

  it.each(['wrong-key', 'missing-key', 'malformed-key', 'expired', 'outside-window', 'revoked', 'deleted-user', 'expired-old'])
    ('keeps ineligible recovery %s in the shared IP bucket', async condition => {
      const { token, successor, session } = addRecovery(1);
      let attempt: string | undefined = recoveryAttempt;
      if (condition === 'wrong-key') attempt = 'b'.repeat(64);
      if (condition === 'missing-key') attempt = undefined;
      if (condition === 'malformed-key') attempt = 'invalid';
      if (condition === 'expired') session.expiresAt = new Date(0);
      if (condition === 'outside-window') session.createdAt = new Date(Date.now() - 300_001);
      if (condition === 'revoked') sessions.delete(hashRefreshToken(successor));
      if (condition === 'deleted-user') session.user.deletedAt = new Date();
      if (condition === 'expired-old') sessions.set(hashRefreshToken(token), { ...session, expiresAt: new Date(0) });
      for (let n = 0; n < 5; n++) {
        const req = refresh(token);
        if (attempt !== undefined) req.set('X-Refresh-Attempt', attempt);
        await req.expect(200);
      }
      await refresh().expect(429);
    });

  it('allows 100 users with 10 pages each at one classroom IP, including exact successor recovery', async () => {
    for (let n = 1; n <= 100; n++) {
      const { token, successor } = addRecovery(n);
      for (let page = 0; page < 10; page++) {
        const req = refresh(page % 2 ? token : successor);
        if (page % 2) req.set('X-Refresh-Attempt', recoveryAttempt);
        await req.expect('X-RateLimit-Limit', '60').expect(200);
      }
    }
    expect(findUnique).toHaveBeenCalledTimes(1500);
  }, 30_000);

  it('allows 100 distinct login identifiers from one classroom IP without database lookups', async () => {
    for (let n = 0; n < 100; n++) await login({ account: `student-${n}`, password: 'irrelevant' }).expect(200);
    expect(findUnique).not.toHaveBeenCalled();
    expect(userLookup).not.toHaveBeenCalled();
  });

  it('shares the five-request login identifier limit across IPs and case/space/legacy aliases', async () => {
    const bodies = [
      { account: 'Alice' }, { account: ' alice ' }, { username: 'ALICE' },
      { account: '', username: 'Alice' }, { account: '  ', username: ' Alice ' },
    ];
    for (let n = 0; n < bodies.length; n++) await login(bodies[n], `192.0.2.${n + 1}`).expect(200);
    await login({ account: 'aLiCe', username: 'different' }, '192.0.2.20').expect(429);
    expect(userLookup).not.toHaveBeenCalled();
  });

  it('blocks the 301st random identifier on the shared IP before identity work', async () => {
    for (let n = 0; n < 300; n++) await login({ account: `random-${n}` }).expect(200);
    await login({ account: 'random-301' }).expect('Retry-After', /\d+/).expect(429);
    await login({ account: 'random-302' }, '192.0.2.2').expect(200);
    expect(findUnique).not.toHaveBeenCalled();
    expect(userLookup).not.toHaveBeenCalled();
  });

  it.each([123, {}, []])('ignores an unused invalid username when the DTO and service select account (%j)', async (username) => {
    const body = { account: ' Alice ', username, password: 'irrelevant' };
    const dto = plainToInstance(LoginDto, body);
    expect(await validate(dto)).toEqual([]);
    expect((dto.account || dto.username || '').trim()).toBe('Alice');
    for (let n = 1; n <= 5; n++) await login(body, `192.0.2.${n}`).expect(200);
    await login(body, '192.0.2.6').expect(429);
  });

  it.each([0, false])('uses username when the DTO and service ignore a falsy account (%j)', async (account) => {
    const body = { account, username: ' Alice ', password: 'irrelevant' };
    const dto = plainToInstance(LoginDto, body);
    expect(await validate(dto)).toEqual([]);
    expect((dto.account || dto.username || '').trim()).toBe('Alice');
    for (let n = 1; n <= 5; n++) await login(body, `192.0.2.${n}`).expect(200);
    await login(body, '192.0.2.6').expect(429);
  });

  it('keeps malformed or oversized login identifiers in one IP bucket', async () => {
    for (const body of [{}, { account: {} }, { account: ['alice'] }, { account: '' }, { account: 'x'.repeat(257) }]) {
      await login(body).expect(200);
    }
    await login({ username: 123 }).expect(429);
  });

  it('allows 100 valid refresh users at one IP', async () => {
    for (let n = 1; n <= 100; n++) await refresh(addSession(n)).expect(200);
    expect(findUnique).toHaveBeenCalledTimes(100);
    expect(findUnique).toHaveBeenCalledWith({
      where: { refreshTokenHash: hashRefreshToken(addSession(100)) },
      select: { userId: true, expiresAt: true, user: { select: { deletedAt: true } } },
    });
  });

  it('shares refresh limits across IPs and rotated sessions for one account', async () => {
    for (let n = 1; n <= 60; n++) await refresh(addSession(n, 'alice'), `192.0.2.${n}`).expect(200);
    await refresh(addSession(61, 'alice'), '192.0.2.100').expect(429);
    await refresh(addSession(62, 'bob'), '192.0.2.100').expect(200);
    expect(findUnique).toHaveBeenCalledTimes(62);
  });

  it('keeps expired, deleted-user, revoked, missing and malformed cookies in the IP bucket', async () => {
    const expired = addSession(1);
    sessions.get(hashRefreshToken(expired))!.expiresAt = new Date(Date.now() - 1000);
    const deleted = addSession(2);
    sessions.get(hashRefreshToken(deleted))!.user.deletedAt = new Date();
    const revoked = addSession(3);
    sessions.delete(hashRefreshToken(revoked));
    for (const token of [expired, deleted, revoked, undefined, 'not-a-refresh-token']) await refresh(token).expect(200);
    await refresh('another-invalid-token').expect(429);
    expect(findUnique).toHaveBeenCalledTimes(3);
  });

  it('checks the hard 6000-per-IP refresh ceiling before current or successor lookup, separately from login', async () => {
    for (let n = 1; n <= 100; n++) {
      const token = addSession(n);
      for (let attempt = 0; attempt < 60; attempt++) await refresh(token).expect(200);
    }
    await refresh(addSession(101)).expect('Retry-After', /\d+/).expect(429);
    await refresh(addRecovery(102).token).set('X-Refresh-Attempt', recoveryAttempt).expect(429);
    expect(findUnique).toHaveBeenCalledTimes(6000);
    await login({ account: 'alice' }).expect(200);
    await refresh(addSession(103), '192.0.2.2').expect(200);
  }, 60_000);

  it('keeps invalid refresh traffic separate from verified accounts despite supplied identity hints', async () => {
    const jwt = new JwtService({ secret: 'test-secret' });
    for (let n = 0; n < 5; n++) {
      await refresh().set('Authorization', `Bearer ${jwt.sign({ sub: `student-${n}` })}`)
        .send({ userId: `student-${n}`, account: `student-${n}` })
        .expect('X-RateLimit-Limit', '5').expect(200);
    }
    await refresh().expect(429);
    const token = addSession(1);
    for (let n = 0; n < 10; n++) await refresh(token).expect(200);
    await refresh().expect(429);
    expect(findUnique).toHaveBeenCalledTimes(10);
  });

  it('rechecks a previously valid session after revocation instead of caching its identity', async () => {
    const token = addSession(1);
    await refresh(token).expect(200);
    sessions.delete(hashRefreshToken(token));
    for (let n = 0; n < 5; n++) await refresh(token).expect(200);
    await refresh().expect(429);
    expect(findUnique).toHaveBeenCalledTimes(6);
  });

  it('does not treat access JWTs in cookies as refresh credentials', async () => {
    const jwt = new JwtService({ secret: 'test-secret' });
    for (let n = 0; n < 5; n++) await refresh(jwt.sign({ sub: `student-${n}` })).expect(200);
    await refresh(jwt.sign({ sub: 'student-6' })).expect(429);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('preserves register and recovery IP limits', async () => {
    for (let n = 0; n < 5; n++) await request(app.getHttpServer()).post('/api/auth/register').send({ username: `student-${n}` }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/register').expect(429);
    for (let n = 0; n < 3; n++) await request(app.getHttpServer()).post('/api/auth/password-recovery/code').expect(200);
    await request(app.getHttpServer()).post('/api/auth/password-recovery/code').expect(429);
  });
});
