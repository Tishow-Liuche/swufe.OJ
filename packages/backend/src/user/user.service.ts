import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

type ProfileUpdateInput = {
  nickname?: string | null;
  avatar?: string | null;
  email?: string;
  phone?: string | null;
};

type ExternalAccountUpdateInput = {
  codeforcesHandle?: string | null;
  luoguHandle?: string | null;
};

type AwardInput = {
  competition?: string;
  year?: number | null;
  season?: string | null;
  region?: string | null;
  awardLevel?: string;
  teamName?: string | null;
  rank?: number | null;
  certificateUrl?: string | null;
};

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, email: true, nickname: true,
        avatar: true, phone: true, role: true, school: true, requestedRole: true,
        teacherApplicationStatus: true, createdAt: true,
      },
    });
  }

  async getSettings(userId: string) {
    const [profile, externalAccounts, awards] = await Promise.all([
      this.getProfile(userId),
      this.prisma.externalAccount.findMany({
        where: { userId, platform: { in: ['CODEFORCES', 'LUOGU'] } },
        select: {
          platform: true,
          remoteUserId: true,
          remoteUsername: true,
          ownershipVerified: true,
          helperConnected: true,
          updatedAt: true,
        },
      }),
      this.listAwards(userId),
    ]);

    return {
      profile,
      externalAccounts: this.formatExternalAccounts(externalAccounts),
      awards,
    };
  }

  async updateProfile(userId: string, data: ProfileUpdateInput) {
    const updateData: ProfileUpdateInput = {};
    if (data.nickname !== undefined) updateData.nickname = this.cleanOptional(data.nickname);
    if (data.avatar !== undefined) updateData.avatar = this.cleanOptional(data.avatar);
    if (data.phone !== undefined) updateData.phone = this.cleanOptional(data.phone);
    if (data.email !== undefined) {
      const email = data.email.trim().toLowerCase();
      if (!email) throw new BadRequestException('邮箱不能为空');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException('邮箱格式不正确');
      }
      const existing = await this.prisma.user.findFirst({
        where: { email, id: { not: userId } },
        select: { id: true },
      });
      if (existing) throw new BadRequestException('该邮箱已被其他账号绑定');
      updateData.email = email;
    }

    return this.prisma.user.update({
      where: { id: userId }, data: updateData,
      select: {
        id: true, username: true, email: true, phone: true,
        nickname: true, avatar: true, role: true, school: true,
      },
    });
  }

  async updateExternalAccounts(userId: string, data: ExternalAccountUpdateInput) {
    const operations: any[] = [];
    this.queueExternalAccountUpdate(operations, userId, 'CODEFORCES', data.codeforcesHandle);
    this.queueExternalAccountUpdate(operations, userId, 'LUOGU', data.luoguHandle);
    await this.prisma.$transaction(operations);

    const accounts = await this.prisma.externalAccount.findMany({
      where: { userId, platform: { in: ['CODEFORCES', 'LUOGU'] } },
      select: {
        platform: true,
        remoteUserId: true,
        remoteUsername: true,
        ownershipVerified: true,
        helperConnected: true,
        updatedAt: true,
      },
    });
    return this.formatExternalAccounts(accounts);
  }

  async listAwards(userId: string) {
    return this.prisma.competitionAward.findMany({
      where: { userId },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAward(userId: string, data: AwardInput) {
    const award: any = this.normalizeAwardInput(data, true);
    return this.prisma.competitionAward.create({
      data: { userId, ...award, status: 'PENDING' },
    });
  }

  async updateAward(userId: string, awardId: string, data: AwardInput) {
    const existing = await this.prisma.competitionAward.findFirst({
      where: { id: awardId, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('奖项认定记录不存在');

    return this.prisma.competitionAward.update({
      where: { id: awardId },
      data: { ...this.normalizeAwardInput(data, false), status: 'PENDING' },
    });
  }

  async deleteAward(userId: string, awardId: string) {
    const existing = await this.prisma.competitionAward.findFirst({
      where: { id: awardId, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('奖项认定记录不存在');
    await this.prisma.competitionAward.delete({ where: { id: awardId } });
    return { success: true };
  }

  private queueExternalAccountUpdate(
    operations: any[],
    userId: string,
    platform: 'CODEFORCES' | 'LUOGU',
    rawHandle?: string | null,
  ) {
    if (rawHandle === undefined) return;
    const handle = this.cleanOptional(rawHandle);
    if (!handle) {
      operations.push(this.prisma.externalAccount.deleteMany({ where: { userId, platform } }));
      return;
    }

    operations.push(
      this.prisma.externalAccount.deleteMany({
        where: { userId, platform, remoteUserId: { not: handle } },
      }),
    );
    operations.push(
      this.prisma.externalAccount.upsert({
        where: { platform_remoteUserId: { platform, remoteUserId: handle } },
        create: {
          userId,
          platform,
          remoteUserId: handle,
          remoteUsername: handle,
          status: 'IDENTITY_ONLY',
        },
        update: {
          userId,
          remoteUsername: handle,
          status: 'IDENTITY_ONLY',
        },
      }),
    );
  }

  private formatExternalAccounts(accounts: Array<{
    platform: string;
    remoteUserId: string;
    remoteUsername: string | null;
    ownershipVerified: boolean;
    helperConnected: boolean;
    updatedAt: Date;
  }>) {
    const find = (platform: string) => accounts.find((a) => a.platform === platform);
    const cf = find('CODEFORCES');
    const luogu = find('LUOGU');
    return {
      codeforcesHandle: cf?.remoteUsername || cf?.remoteUserId || '',
      luoguHandle: luogu?.remoteUsername || luogu?.remoteUserId || '',
      details: accounts,
    };
  }

  private normalizeAwardInput(data: AwardInput, requireAll: boolean) {
    const result: Record<string, string | number | null> = {};
    if (data.competition !== undefined || requireAll) {
      const competition = String(data.competition || '').trim().toUpperCase();
      if (!['ICPC', 'CCPC'].includes(competition)) {
        throw new BadRequestException('比赛类型只能是 ICPC 或 CCPC');
      }
      result.competition = competition;
    }
    if (data.awardLevel !== undefined || requireAll) {
      const awardLevel = String(data.awardLevel || '').trim();
      if (!awardLevel) throw new BadRequestException('奖项不能为空');
      result.awardLevel = awardLevel;
    }
    if (data.year !== undefined) {
      result.year = data.year === null ? null : Number(data.year);
      if (result.year !== null && (!Number.isInteger(result.year) || result.year < 1970 || result.year > 2100)) {
        throw new BadRequestException('年份不正确');
      }
    }
    if (data.rank !== undefined) {
      result.rank = data.rank === null ? null : Number(data.rank);
      if (result.rank !== null && (!Number.isInteger(result.rank) || result.rank <= 0)) {
        throw new BadRequestException('排名必须是正整数');
      }
    }
    for (const key of ['season', 'region', 'teamName', 'certificateUrl'] as const) {
      if (data[key] !== undefined) result[key] = this.cleanOptional(data[key] || '');
    }
    return result;
  }

  private cleanOptional(value: string | null) {
    if (value === null) return null;
    const cleaned = value.trim();
    return cleaned ? cleaned : null;
  }

  async getStats(userId: string) {
    const now = new Date();
    const [totalSubmissions, totalAccepted] = await Promise.all([
      this.prisma.submission.count({ where: { userId } }),
      this.prisma.submission.count({ where: { userId, status: 'ACCEPTED' } }),
    ]);

    const solved = await this.prisma.submission.groupBy({
      by: ['problemId'], where: { userId, status: 'ACCEPTED' },
    });
    const tried = await this.prisma.submission.groupBy({
      by: ['problemId'], where: { userId },
    });

    const allSubDates = await this.prisma.submission.findMany({
      where: { userId }, select: { createdAt: true }, orderBy: { createdAt: 'asc' },
    });
    const uniqueDays = new Set(allSubDates.map((d) => d.createdAt.toISOString().split('T')[0]));
    const streak = this.calcStreak(allSubDates.map((d) => d.createdAt));

    const langDist = await this.prisma.submission.groupBy({
      by: ['language'], where: { userId }, _count: true,
    });

    const solvedProblemIds = solved.map((s) => s.problemId);
    const difficultyDist = await this.prisma.problem.findMany({
      where: { id: { in: solvedProblemIds } }, select: { difficulty: true },
    });
    const diffCount: Record<string, number> = {};
    for (const p of difficultyDist) {
      const d = p.difficulty || 'UNKNOWN';
      diffCount[d] = (diffCount[d] || 0) + 1;
    }

    const recent = await this.prisma.submission.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 20,
      select: {
        id: true, status: true, language: true,
        score: true, timeUsed: true, memoryUsed: true, createdAt: true,
        problem: { select: { id: true, title: true, difficulty: true } },
      },
    });

    // 全年热力图数据
    const heatmap = await this.getHeatmap(userId);

    return {
      overview: {
        totalSubmissions, totalAccepted,
        acceptRate: totalSubmissions > 0 ? Math.round((totalAccepted / totalSubmissions) * 100) : 0,
        solvedCount: solved.length, triedCount: tried.length,
        activeDays: uniqueDays.size, currentStreak: streak,
      },
      heatmap,
      languageDist: langDist.map((l) => ({ language: l.language, count: l._count })),
      difficultyDist: Object.entries(diffCount).map(([d, c]) => ({ difficulty: d, count: c })),
      recentSubmissions: recent,
    };
  }

  /** 全年每日提交热力图数据 */
  private async getHeatmap(userId: string) {
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    const subs = await this.prisma.submission.findMany({
      where: { userId, createdAt: { gte: oneYearAgo } },
      select: { createdAt: true, status: true },
    });

    // 按日期分组
    const countMap: Record<string, { count: number; accepted: number }> = {};
    for (const s of subs) {
      const key = s.createdAt.toISOString().split('T')[0];
      if (!countMap[key]) countMap[key] = { count: 0, accepted: 0 };
      countMap[key].count++;
      if (s.status === 'ACCEPTED') countMap[key].accepted++;
    }

    // 生成 365 天的完整数组
    const result: Array<{ date: string; count: number; accepted: number; level: number }> = [];
    const d = new Date(oneYearAgo);
    while (d <= now) {
      const key = d.toISOString().split('T')[0];
      const data = countMap[key] || { count: 0, accepted: 0 };
      result.push({
        date: key,
        count: data.count,
        accepted: data.accepted,
        level: this.getLevel(data.count),
      });
      d.setDate(d.getDate() + 1);
    }
    return result;
  }

  /** 提交数 → 颜色等级 (0-4) */
  private getLevel(count: number): number {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 9) return 3;
    return 4;
  }

  private calcStreak(dates: Date[]): number {
    if (dates.length === 0) return 0;
    const sorted = [...new Set(dates.map((d) => d.toISOString().split('T')[0]))].sort().reverse();
    let streak = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = new Date(sorted[i]), next = new Date(sorted[i + 1]);
      if (Math.abs((curr.getTime() - next.getTime()) / 86400000 - 1) < 0.1) streak++;
      else break;
    }
    const last = new Date(sorted[0]), today = new Date();
    return (today.getTime() - last.getTime()) / 86400000 > 1.5 ? 0 : streak;
  }

  // ========== 管理员功能 ==========

  async listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true, username: true, email: true, nickname: true,
        role: true, school: true, requestedRole: true,
        teacherApplicationStatus: true, createdAt: true,
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setRole(userId: string, role: string) {
    if (!['STUDENT', 'TEACHER', 'ADMIN'].includes(role)) {
      throw new BadRequestException('无效的角色: ' + role);
    }
    const applicationData = role === 'TEACHER'
      ? { requestedRole: 'TEACHER', teacherApplicationStatus: 'APPROVED' }
      : { requestedRole: 'STUDENT', teacherApplicationStatus: 'NOT_REQUIRED' };
    return this.prisma.user.update({
      where: { id: userId },
      data: { role, ...applicationData },
      select: {
        id: true, username: true, role: true, requestedRole: true,
        teacherApplicationStatus: true,
      },
    });
  }

  async reviewTeacherApplication(userId: string, status: string) {
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new BadRequestException('审核状态只能是 APPROVED 或 REJECTED');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { requestedRole: true },
    });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.requestedRole !== 'TEACHER') {
      throw new BadRequestException('该用户没有提交教师身份申请');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        role: status === 'APPROVED' ? 'TEACHER' : 'STUDENT',
        teacherApplicationStatus: status,
      },
      select: {
        id: true, username: true, role: true, requestedRole: true,
        teacherApplicationStatus: true,
      },
    });
  }

  async changeOwnPassword(userId: string, password: string) {
    if (!password || password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    const hashed = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, mustChangePassword: false, authVersion: { increment: 1 } },
    });
    return { success: true };
  }

  async resetPassword(adminId: string, userId: string, password: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId }, select: { role: true } });
    if (!admin || admin.role !== 'ADMIN') throw new ForbiddenException('No permission to reset password');
    if (!password || password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    const hashed = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, mustChangePassword: true, authVersion: { increment: 1 } },
    });
    return { success: true };
  }

  async listClassApplications() {
    return this.prisma.class.findMany({
      where: { status: 'PENDING' },
      include: {
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewClassApplication(classId: string, status: string, reviewNote?: string) {
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new BadRequestException('Status must be APPROVED or REJECTED');
    }
    return this.prisma.class.update({
      where: { id: classId },
      data: { status, reviewNote: reviewNote || null },
    });
  }
}