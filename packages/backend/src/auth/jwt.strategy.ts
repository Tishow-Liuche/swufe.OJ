import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly userCache = new Map<string, { user: any; expiresAt: number }>();
  private readonly userCacheTtlMs: number;

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      passReqToCallback: true,
    });
    const configuredTtl = Number.parseInt(config.get<string>('AUTH_USER_CACHE_TTL_MS', '5000'), 10);
    this.userCacheTtlMs = Number.isInteger(configuredTtl) && configuredTtl >= 0 ? configuredTtl : 5000;
  }

  async validate(req: Request, payload: { sub: string; ver?: number }) {
    const cacheKey = `${payload.sub}:${payload.ver ?? 0}`;
    const cached = this.userCache.get(cacheKey);
    let user = cached && cached.expiresAt > Date.now() ? cached.user : undefined;
    if (user === undefined) {
      user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true, username: true, role: true, authVersion: true, mustChangePassword: true,
          deletedAt: true, teacherApplicationStatus: true,
        },
      });
      if (this.userCacheTtlMs > 0) {
        if (this.userCache.size >= 10_000) {
          const oldest = this.userCache.keys().next().value;
          if (oldest) this.userCache.delete(oldest);
        }
        this.userCache.set(cacheKey, { user, expiresAt: Date.now() + this.userCacheTtlMs });
      }
    }
    if (!user || user.deletedAt || (payload.ver ?? 0) !== user.authVersion) throw new UnauthorizedException('登录状态已失效，请重新登录');
    if (user.mustChangePassword && !this.isAllowedBeforePasswordChange(req)) {
      throw new ForbiddenException('必须先修改密码');
    }
    return user.teacherApplicationStatus === 'PENDING' ? { ...user, role: 'STUDENT' } : user;
  }

  private isAllowedBeforePasswordChange(req: Request): boolean {
    return (
      (req.method === 'POST' && req.path === '/api/user/password') ||
      (req.method === 'GET' && req.path === '/api/user/profile') ||
      (req.method === 'GET' && req.path === '/api/auth/me')
    );
  }
}
