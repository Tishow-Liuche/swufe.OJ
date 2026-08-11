import {
  BadRequestException,
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
import { hashRefreshToken } from './refresh-token';

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
        OR: [
          { username: { equals: dto.username, mode: 'insensitive' } },
          { email: { equals: dto.email, mode: 'insensitive' } },
          ...(dto.requestedRole === 'STUDENT' && dto.studentId ? [{ studentId: dto.studentId }] : []),
        ],
      },
      select: { username: true, email: true, studentId: true },
    });
    if (existing) {
      if (existing.username.toLowerCase() === dto.username.toLowerCase()) {
        throw new ConflictException('该用户名已被使用');
      }
      if (dto.studentId && existing.studentId === dto.studentId) {
        throw new ConflictException('该学号已绑定其他账号');
      }
      throw new ConflictException('该邮箱已注册');
    }

    const password = await bcrypt.hash(dto.password, 10);
    const teacherRequested = dto.requestedRole === 'TEACHER';
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        password,
        nickname: dto.nickname,
        school: dto.school,
        college: dto.college,
        studentId: dto.requestedRole === 'STUDENT' ? dto.studentId : undefined,
        role: 'STUDENT',
        requestedRole: dto.requestedRole,
        teacherApplicationStatus: teacherRequested ? 'PENDING' : 'NOT_REQUIRED',
      },
    });

    const tokens = await this.generateTokens(user.id);
    return {
      ...tokens,
      registration: {
        role: user.role,
        requestedRole: user.requestedRole,
        teacherApplicationStatus: user.teacherApplicationStatus,
      },
    };
  }

  async login(dto: LoginDto) {
    const account = (dto.account || dto.username || '').trim();
    if (!account) {
      throw new BadRequestException('请输入用户名或邮箱');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: account, mode: 'insensitive' } },
          { email: { equals: account, mode: 'insensitive' } },
        ],
      },
    });
    if (!user) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('账号或密码错误');
    }

    return this.generateTokens(user.id);
  }

  async refresh(refreshToken: string) {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash },
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
    const refreshTokenHash = hashRefreshToken(refreshToken);
    await this.prisma.userSession.deleteMany({
      where: { refreshTokenHash },
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
        school: true,
        studentId: true,
        college: true,
        phone: true,
        mustChangePassword: true,
        requestedRole: true,
        teacherApplicationStatus: true,
        createdAt: true,
      },
    });
    return user;
  }

  private async generateTokens(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { authVersion: true, mustChangePassword: true },
    });
    if (!user) throw new UnauthorizedException('账号不存在或已被删除');
    const accessToken = this.jwt.sign({ sub: userId, ver: user.authVersion });

    const refreshToken = randomBytes(32).toString('hex');
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES') || '7d';
    const ms = this.parseExpires(expiresIn);

    await this.prisma.userSession.create({
      data: {
        userId,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + ms),
      },
    });

    return { accessToken, refreshToken, expiresIn, mustChangePassword: user.mustChangePassword };
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
