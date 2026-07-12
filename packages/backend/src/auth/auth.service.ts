import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { RegisterDto, LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: dto.username }, { email: dto.email }],
      },
    });
    if (existing) {
      throw new ConflictException('用户名或邮箱已存在');
    }

    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        password,
        nickname: dto.nickname,
      },
    });

    return this.generateTokens(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    return this.generateTokens(user.id);
  }

  async refresh(refreshToken: string) {
    const session = await this.prisma.userSession.findUnique({
      where: { refreshToken },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Token 已过期，请重新登录');
    }

    // Token rotation: delete old, issue new
    await this.prisma.userSession.delete({
      where: { id: session.id },
    });

    return this.generateTokens(session.userId);
  }

  async logout(refreshToken: string) {
    await this.prisma.userSession.deleteMany({
      where: { refreshToken },
    });
    return { message: '已退出登录' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        avatar: true,
        role: true,
        createdAt: true,
      },
    });
    return user;
  }

  private async generateTokens(userId: string) {
    const accessToken = this.jwt.sign({ sub: userId });

    const refreshToken = randomBytes(32).toString('hex');
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES') || '7d';
    const ms = this.parseExpires(expiresIn);

    await this.prisma.userSession.create({
      data: {
        userId,
        refreshToken,
        expiresAt: new Date(Date.now() + ms),
      },
    });

    return { accessToken, refreshToken, expiresIn };
  }

  private parseExpires(expires: string): number {
    const match = expires.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return num * (multipliers[unit] || 86_400_000);
  }
}
