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
import { deriveRefreshSuccessor, hashRefreshToken, isValidRefreshAttempt, REFRESH_RECOVERY_WINDOW_MS } from './refresh-token';
import { Prisma } from '@prisma/client';

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
        deletedAt: null,
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

  async refresh(refreshToken: string, attempt?: unknown) {
    this.validateRefreshAttempt(attempt);
    const successor = attempt === undefined ? undefined : this.refreshSuccessor(refreshToken, attempt);
    return this.prisma.$transaction(async (transaction) => {
      const refreshTokenHash = hashRefreshToken(refreshToken);
      const session = await transaction.userSession.findUnique({
        where: { refreshTokenHash },
      });
      if (!session && successor) return this.recoverRefresh(successor, transaction);
      if (!session || session.expiresAt <= new Date()) {
        throw new UnauthorizedException('Token 已过期，请重新登录');
      }

      // Consume once and create the replacement atomically. A failed issue rolls back.
      const consumed = await transaction.userSession.deleteMany({
        where: { id: session.id },
      });
      if (consumed.count !== 1) {
        // Under READ COMMITTED, a concurrent delete waits for the winner to commit.
        // Recover only its existing exact successor; revocation never creates a row.
        if (successor) return this.recoverRefresh(successor, transaction);
        throw new UnauthorizedException('Refresh session already consumed');
      }

      return this.generateTokens(session.userId, transaction, successor);
    });
  }

  private validateRefreshAttempt(attempt: unknown): asserts attempt is string | undefined {
    if (attempt !== undefined && !isValidRefreshAttempt(attempt)) {
      throw new BadRequestException('Invalid refresh attempt');
    }
  }

  private refreshSuccessor(refreshToken: string, attempt: string): string {
    return deriveRefreshSuccessor(refreshToken, attempt, this.config.getOrThrow<string>('JWT_ACCESS_SECRET'));
  }

  private async recoverRefresh(refreshToken: string, database: Prisma.TransactionClient) {
    const session = await database.userSession.findUnique({
      where: { refreshTokenHash: hashRefreshToken(refreshToken) },
    });
    const now = Date.now();
    if (!session || session.expiresAt.getTime() <= now
      || session.createdAt.getTime() < now - REFRESH_RECOVERY_WINDOW_MS) {
      throw new UnauthorizedException('Refresh recovery expired or revoked');
    }
    const tokens = await this.accessTokenDetails(session.userId, database);
    return {
      ...tokens,
      refreshToken,
      // Recovery cannot extend the existing session or cookie lifetime.
      expiresIn: `${Math.max(1, Math.floor((session.expiresAt.getTime() - now) / 1000))}s`,
    };
  }

  async logout(refreshToken: string, attempt?: unknown) {
    this.validateRefreshAttempt(attempt);
    const refreshTokenHash = hashRefreshToken(refreshToken);
    if (attempt === undefined) {
      await this.prisma.userSession.deleteMany({ where: { refreshTokenHash } });
    } else {
      const successorHash = hashRefreshToken(this.refreshSuccessor(refreshToken, attempt));
      await this.prisma.$transaction(async transaction => {
        await transaction.userSession.deleteMany({ where: { refreshTokenHash } });
        // A concurrent rotation may have committed while the first delete waited.
        // A second READ COMMITTED statement sees its successor; one IN query would not.
        await transaction.userSession.deleteMany({ where: { refreshTokenHash: successorHash } });
      });
    }
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

  private async accessTokenDetails(userId: string, database: Prisma.TransactionClient) {
    const user = await database.user.findUnique({
      where: { id: userId },
      select: { authVersion: true, mustChangePassword: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException('账号不存在或已被删除');
    const accessToken = this.jwt.sign({ sub: userId, ver: user.authVersion });
    return { accessToken, mustChangePassword: user.mustChangePassword };
  }

  private async generateTokens(userId: string, database: Prisma.TransactionClient = this.prisma, successor?: string) {
    const tokens = await this.accessTokenDetails(userId, database);
    const refreshToken = successor ?? randomBytes(32).toString('hex');
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES') || '7d';
    const ms = this.parseExpires(expiresIn);

    await database.userSession.create({
      data: {
        userId,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + ms),
      },
    });

    return { ...tokens, refreshToken, expiresIn };
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
