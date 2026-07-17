import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { configureHttpSecurity } from './common/security-config';
import { AppModule } from './app.module';
import { AuthController } from './auth/auth.controller';
import { UserController } from './user/user.controller';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}

describe('HTTP security baseline', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttpSecurity(app, new ConfigService({ NODE_ENV: 'production', TRUST_PROXY: 'false' }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets clickjacking, MIME-sniffing, CSP, and HSTS response headers', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect('X-Frame-Options', 'SAMEORIGIN')
      .expect('Content-Security-Policy', /default-src 'self'/)
      .expect('Strict-Transport-Security', /max-age=/)
      .expect(200);
  });

  it('installs a global throttler and a stricter five-request window on authentication entry points', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) || [];
    expect(providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provide: APP_GUARD, useClass: ThrottlerGuard }),
    ]));

    for (const handler of [
      AuthController.prototype.login,
      AuthController.prototype.register,
      AuthController.prototype.refresh,
      UserController.prototype.changeOwnPassword,
    ]) {
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(5);
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60_000);
    }
  });
});
