import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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
  }

  async validate(req: Request, payload: { sub: string; ver?: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, username: true, role: true, authVersion: true, mustChangePassword: true,
        deletedAt: true, teacherApplicationStatus: true,
      },
    });
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
