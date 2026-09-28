import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerRequest,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { createHash } from 'crypto';
import { REFRESH_COOKIE, REFRESH_RECOVERY_WINDOW_MS, deriveRefreshSuccessor, hashRefreshToken, isValidRefreshAttempt } from '../auth/refresh-token';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  private readonly jwt = new JwtService();

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super(options, storage, reflector);
  }

  protected async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const { req, res } = this.getRequestResponse(props.context);
    const action = this.authEntryPoint(req);
    if (action) {
      // Check the aggregate ceiling before deriving identities or querying sessions.
      // A different identifier/cookie must not bypass the shared-IP abuse budget.
      const name = `${props.throttler.name}-auth-ip`;
      const tracker = `auth-ip:${action}:${req.ip}`;
      const key = this.generateKey(props.context, tracker, name);
      const limit = 300;
      const ttl = 60_000;
      const record = await this.storageService.increment(key, ttl, limit, ttl, name);
      if (record.isBlocked) {
        res.header('Retry-After', record.timeToBlockExpire);
        await this.throwThrottlingException(props.context, { ...record, key, tracker, limit, ttl });
      }
    }
    return super.handleRequest(props);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ipTracker = `ip:${req.ip}`;
    const action = this.authEntryPoint(req);
    if (action === 'login') {
      // Guards precede DTO transformation: mirror trimmed account || username.
      const account = typeof req.body?.account === 'string' ? req.body.account.trim() : req.body?.account;
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : req.body?.username;
      // LoginDto conditionally skips validation of the unused field. Only the
      // effective value chosen by AuthService may determine the tracker.
      const selected = account || username || '';
      if (typeof selected !== 'string') return ipTracker;
      const identifier = selected.toLowerCase();
      if (!identifier || identifier.length > 256) return ipTracker;
      return `login:${createHash('sha256').update(identifier).digest('hex')}`;
    }
    if (action === 'refresh') {
      const token = req.cookies?.[REFRESH_COOKIE];
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return ipTracker;
      // Refresh tokens are opaque, not JWTs. Never trust or store the raw cookie.
      // Do not cache this lookup: deleted sessions revoke refresh identities.
      const session = await this.prisma.userSession.findUnique({
        where: { refreshTokenHash: hashRefreshToken(token) },
        select: { userId: true, expiresAt: true, user: { select: { deletedAt: true } } },
      });
      if (session && session.expiresAt.getTime() > Date.now() && session.user.deletedAt === null) {
        return `refresh-user:${session.userId}`;
      }
      const attempt = req.headers?.['x-refresh-attempt'];
      // A consumed cookie can still identify its account only through an existing
      // exact successor. Never allocate account buckets from attacker-supplied keys.
      if (!session && isValidRefreshAttempt(attempt)) {
        const successor = deriveRefreshSuccessor(token, attempt, this.config.getOrThrow<string>('JWT_ACCESS_SECRET'));
        const recovered = await this.prisma.userSession.findUnique({
          where: { refreshTokenHash: hashRefreshToken(successor) },
          select: { userId: true, expiresAt: true, createdAt: true, user: { select: { deletedAt: true } } },
        });
        const now = Date.now();
        if (recovered && recovered.expiresAt.getTime() > now
          && recovered.createdAt.getTime() >= now - REFRESH_RECOVERY_WINDOW_MS
          && recovered.user.deletedAt === null) {
          return `refresh-user:${recovered.userId}`;
        }
      }
      return ipTracker;
    }
    // The matched route also covers case-insensitive/encoded URL variants.
    const path = req.route?.path ?? req.path ?? '';
    if (/^(?:\/api)?\/auth(?:\/|$)/i.test(path)) return ipTracker;

    const authorization = req.headers?.authorization;
    const bearer = typeof authorization === 'string'
      ? /^Bearer\s+(\S+)$/i.exec(authorization)
      : null;
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!bearer || !secret) return ipTracker;

    try {
      // Global guards run before Passport: req.user is not proof of identity.
      const payload = this.jwt.verify<{ sub?: unknown }>(bearer[1], {
        secret,
        algorithms: ['HS256'],
        ignoreExpiration: false,
      });
      if (typeof payload.sub === 'string' && payload.sub.trim().length > 0 && payload.sub.length <= 256) {
        return `user:${payload.sub}`;
      }
    } catch {
      // Invalid credentials never create a new account bucket.
    }
    return ipTracker;
  }

  private authEntryPoint(req: Record<string, any>): 'login' | 'refresh' | undefined {
    if (req.method !== 'POST') return undefined;
    const path = req.route?.path ?? req.path ?? '';
    const match = /^(?:\/api)?\/auth\/(login|refresh)\/?$/i.exec(path);
    return match?.[1].toLowerCase() as 'login' | 'refresh' | undefined;
  }
}
