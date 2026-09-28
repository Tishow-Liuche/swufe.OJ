import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import { AccountThrottlerGuard } from './account-throttler.guard';
import { PrismaService } from '../prisma/prisma.service';
import request from 'supertest';

const secret = 'account-throttle-test-secret';
const jwt = new JwtService({ secret, signOptions: { expiresIn: 60 } });

@Controller()
class TestController {
  @Get('contest')
  contest() { return { ok: true }; }

  @Get('auth/login')
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  login() { return { ok: true }; }

  @Get('auth/:action')
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  authAction() { return { ok: true }; }
}

describe('AccountThrottlerGuard HTTP integration', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ limit: 2, ttl: 60_000 }])],
      controllers: [TestController],
      providers: [
        { provide: ConfigService, useValue: new ConfigService({ JWT_ACCESS_SECRET: secret }) },
        { provide: PrismaService, useValue: { userSession: { findUnique: jest.fn() } } },
        { provide: APP_GUARD, useClass: AccountThrottlerGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use((req: any, _res: any, next: () => void) => {
      if (req.headers['x-untrusted-user']) req.user = { id: req.headers['x-untrusted-user'] };
      next();
    });
    // Test-only trusted proxy lets requests emulate separate client addresses.
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    await app.init();
  });

  afterEach(async () => { await app.close(); });

  const hit = (token?: string, ip = '192.0.2.1', path = '/api/contest') => {
    const req = request(app.getHttpServer()).get(path).set('X-Forwarded-For', ip);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('gives different verified accounts independent limits on a shared IP', async () => {
    const a = jwt.sign({ sub: 'alice' });
    const b = jwt.sign({ sub: 'bob' });
    await hit(a).expect(200);
    await hit(a).expect(200);
    await hit(b).expect(200);
    await hit(a).expect(429);
    await hit(b).expect(200);
  });

  it('shares one account limit across different IPs', async () => {
    const token = jwt.sign({ sub: 'alice' });
    await hit(token, '192.0.2.1').expect(200);
    await hit(token, '192.0.2.2').expect(200);
    await hit(token, '192.0.2.3').expect(429);
  });

  it.each([
    ['missing', undefined],
    ['forged', jwt.sign({ sub: 'alice' }, { secret: 'wrong-secret' })],
    ['expired', jwt.sign({ sub: 'alice' }, { expiresIn: -1 })],
    ['malformed', 'not-a-token'],
    ['empty subject', jwt.sign({ sub: '' })],
    ['whitespace subject', jwt.sign({ sub: '   ' })],
    ['oversized subject', jwt.sign({ sub: 'x'.repeat(257) })],
    ['missing subject', jwt.sign({ role: 'ADMIN' })],
    ['future token', jwt.sign({ sub: 'alice' }, { notBefore: 60 })],
    ['wrong algorithm', jwt.sign({ sub: 'alice' }, { algorithm: 'HS384' })],
    ['unsigned', `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"alice"}').toString('base64url')}.`],
  ])('keeps %s credentials in the anonymous IP bucket', async (_label, token) => {
    await hit().expect(200);
    await hit(token).expect(200);
    await hit().expect(429);
    await hit(token, '192.0.2.2').expect(200);
  });

  it.each(['login', 'register', 'refresh', 'me'])('keeps auth/%s IP-limited even with different valid tokens', async (action) => {
    await hit(jwt.sign({ sub: 'alice' }), undefined, `/api/auth/${action}`).expect(200);
    await hit(jwt.sign({ sub: 'bob' }), undefined, `/api/auth/${action}`).expect(429);
  });

  it('does not trust a pre-populated user without verified credentials', async () => {
    await hit().set('X-Untrusted-User', 'alice').expect(200);
    await hit().set('X-Untrusted-User', 'bob').expect(200);
    await hit().set('X-Untrusted-User', 'charlie').expect(429);
  });

  it('does not collide account subjects with anonymous IP addresses', async () => {
    await hit().expect(200);
    await hit().expect(200);
    await hit(jwt.sign({ sub: '192.0.2.1' })).expect(200);
  });
});
