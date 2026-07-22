import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileUploadService } from '../common/file-upload.service';
import { CfAcceptedSyncService } from '../codeforces/cf-accepted-sync.service';
import * as bcrypt from 'bcryptjs';
import { normalizePointDifficulty } from '../problem/point-difficulty';
import {
  assignmentLifecycleLabel,
  statusLabelZh,
} from '../teacher/assignment-progress';
import { AssignmentProgressService } from '../teacher/assignment-progress.service';

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

type PasswordChangeInput = {
  currentPassword?: string;
  password?: string;
};

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private readonly fileUpload: FileUploadService,
    @Optional() private cfAcceptedSync?: CfAcceptedSyncService,
    @Optional() private assignmentProgress?: AssignmentProgressService,
  ) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, email: true, nickname: true,
        avatar: true, phone: true, role: true, school: true, requestedRole: true,
        teacherApplicationStatus: true, mustChangePassword: true, createdAt: true,
      },
    });
    return this.withDisplayAvatar(profile);
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

    const profile = await this.prisma.user.update({
      where: { id: userId }, data: updateData,
      select: {
        id: true, username: true, email: true, phone: true,
        nickname: true, avatar: true, role: true, school: true,
      },
    });
    return this.withDisplayAvatar(profile);
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

  async syncCodeforcesAccepted(userId: string) {
    if (!this.cfAcceptedSync) {
      throw new BadRequestException('Codeforces 同步服务尚未启用');
    }
    return this.cfAcceptedSync.syncUserAccepted(userId);
  }

  async listAcceptedProblems(userId: string) {
    const [localAccepted, externalAccepted] = await Promise.all([
      this.prisma.submission.findMany({
        where: { userId, status: 'ACCEPTED' },
        orderBy: [{ judgedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          problemId: true,
          language: true,
          timeUsed: true,
          memoryUsed: true,
          judgedAt: true,
          createdAt: true,
          problem: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              source: true,
              sourceInfo: { select: { platform: true, remoteProblemId: true, remoteUrl: true } },
            },
          },
        },
      }),
      this.prisma.externalSolvedProblem.findMany({
        where: { userId },
        orderBy: [{ acceptedAt: 'desc' }],
        select: {
          id: true,
          platform: true,
          remoteProblemId: true,
          remoteSubmissionId: true,
          acceptedAt: true,
          timeUsed: true,
          memoryUsed: true,
          problem: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              source: true,
              sourceInfo: { select: { platform: true, remoteProblemId: true, remoteUrl: true } },
            },
          },
        },
      }),
    ]);

    const byProblem = new Map<string, any>();
    const put = (item: any) => {
      const existing = byProblem.get(item.problem.id);
      if (!existing || new Date(item.acceptedAt).getTime() > new Date(existing.acceptedAt).getTime()) {
        byProblem.set(item.problem.id, item);
      }
    };

    for (const submission of localAccepted) {
      put({
        source: 'LOCAL',
        submissionId: submission.id,
        language: submission.language,
        acceptedAt: submission.judgedAt || submission.createdAt,
        timeUsed: submission.timeUsed,
        memoryUsed: submission.memoryUsed,
        problem: submission.problem,
      });
    }

    for (const solved of externalAccepted) {
      put({
        source: solved.platform,
        externalSolvedId: solved.id,
        remoteProblemId: solved.remoteProblemId,
        remoteSubmissionId: solved.remoteSubmissionId,
        acceptedAt: solved.acceptedAt,
        timeUsed: solved.timeUsed,
        memoryUsed: solved.memoryUsed,
        problem: solved.problem,
      });
    }

    const items = [...byProblem.values()].sort(
      (a, b) => new Date(b.acceptedAt).getTime() - new Date(a.acceptedAt).getTime(),
    );
    return { total: items.length, items };
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

  private async withDisplayAvatar<T extends { avatar?: string | null }>(profile: T | null) {
    if (!profile || !profile.avatar || !profile.avatar.startsWith('s3://')) return profile;
    try {
      return { ...profile, avatar: await this.fileUpload.getPresignedUrl(profile.avatar) };
    } catch {
      return { ...profile, avatar: null };
    }
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

    const externalSolved = await this.prisma.externalSolvedProblem.findMany({
      where: { userId },
      select: { problemId: true, platform: true },
    });
    const solvedProblemIds = [
      ...new Set([
        ...solved.map((s) => s.problemId),
        ...externalSolved.map((s: any) => s.problemId),
      ]),
    ];
    const difficultyDist = await this.prisma.problem.findMany({
      where: { id: { in: solvedProblemIds } }, select: { difficulty: true },
    });
    const diffCount: Record<string, number> = {};
    for (const p of difficultyDist) {
      const d = normalizePointDifficulty(p.difficulty);
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
        solvedCount: solvedProblemIds.length, triedCount: tried.length,
        localSolvedCount: solved.length, externalSolvedCount: externalSolved.length,
        activeDays: uniqueDays.size, currentStreak: streak,
      },
      heatmap,
      languageDist: langDist.map((l) => ({ language: l.language, count: l._count })),
      difficultyDist: Object.entries(diffCount).map(([d, c]) => ({ difficulty: d, count: c })),
      recentSubmissions: recent,
    };
  }

  async listMyClasses(userId: string) {
    const memberships = await this.prisma.classMember.findMany({
      where: { userId },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            teacherId: true,
            status: true,
            course: { select: { name: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
    const teacherIds = [...new Set(memberships.map((membership) => membership.class.teacherId))];
    const teachers = teacherIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, username: true, nickname: true },
        })
      : [];
    const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
    return memberships.map((membership) => ({
      id: membership.id,
      status: membership.status,
      reviewNote: membership.reviewNote,
      appliedAt: membership.joinedAt,
      reviewedAt: membership.reviewedAt,
      class: membership.class,
      teacher: teacherById.get(membership.class.teacherId) || null,
    }));
  }

  async getClassAssignments(userId: string, classId: string) {
    const membership = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
      select: { status: true },
    });
    if (!membership || membership.status !== 'APPROVED') {
      throw new ForbiddenException('仅正式班级成员可以查看作业');
    }

    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true },
    });
    if (!cls) throw new NotFoundException('班级不存在');

    const assignments = await this.prisma.assignment.findMany({
      where: { classId },
      include: {
        problems: {
          where: { problem: { status: 'PUBLISHED' } },
          orderBy: { order: 'asc' },
          include: {
            problem: { select: { id: true, title: true, source: true, difficulty: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Mid-join safety: ensure enrollment rows exist for this student.
    if (assignments.length) {
      await this.prisma.assignmentStudent.createMany({
        data: assignments.map((assignment) => ({
          assignmentId: assignment.id,
          userId,
          status: 'NOT_STARTED',
          score: 0,
        })),
        skipDuplicates: true,
      });
    }

    const now = new Date();
    const results = [];
    for (const assignment of assignments) {
      const problems = assignment.problems.map((item) => ({
        ...item.problem,
        order: item.order,
        score: item.score,
      }));

      let progress = {
        solvedCount: 0,
        totalProblems: problems.length,
        requiredCount: problems.length,
        completed: false,
        late: false,
        score: 0,
        maxScore: problems.reduce((sum, item) => sum + item.score, 0),
        status: 'NOT_STARTED' as string,
        statusLabel: statusLabelZh('NOT_STARTED'),
        submittedAt: null as Date | null,
        completedAt: null as Date | null,
        problems: problems.map((problem) => ({
          problemId: problem.id,
          solved: false,
          late: false,
          earnedScore: 0,
        })),
      };

      if (this.assignmentProgress) {
        // Persist authoritative status/score on each student view (idempotent).
        await this.assignmentProgress.recomputeStudent(assignment.id, userId, now);
        const computed = await this.assignmentProgress.calculate(
          {
            id: assignment.id,
            startTime: assignment.startTime,
            endTime: assignment.endTime,
            allowLate: assignment.allowLate,
            latePenalty: assignment.latePenalty,
            passCondition: assignment.passCondition,
            countExternalAc: assignment.countExternalAc,
            problems: assignment.problems.map((item) => ({
              problemId: item.problemId,
              score: item.score,
              order: item.order,
            })),
          },
          userId,
          now,
        );
        const enrollment = await this.prisma.assignmentStudent.findUnique({
          where: { assignmentId_userId: { assignmentId: assignment.id, userId } },
        });
        const status = enrollment?.status === 'SETTLED' ? 'SETTLED' : computed.status;
        progress = {
          solvedCount: computed.solvedCount,
          totalProblems: computed.totalProblems,
          requiredCount: computed.requiredCount,
          completed: computed.completed || status === 'SETTLED',
          late: computed.late,
          score: enrollment?.status === 'SETTLED' ? enrollment.score : computed.score,
          maxScore: computed.maxScore,
          status,
          statusLabel: statusLabelZh(status),
          submittedAt: enrollment?.submittedAt ?? computed.submittedAt,
          completedAt: enrollment?.completedAt ?? computed.completedAt,
          problems: computed.problems.map((item) => ({
            problemId: item.problemId,
            solved: item.solved,
            late: item.late,
            earnedScore: item.earnedScore,
          })),
        };
      }

      const solvedMap = new Map(progress.problems.map((item) => [item.problemId, item]));
      results.push({
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        allowLate: assignment.allowLate,
        latePenalty: assignment.latePenalty,
        passCondition: assignment.passCondition,
        countExternalAc: assignment.countExternalAc,
        createdAt: assignment.createdAt,
        lifecycle: assignmentLifecycleLabel(
          assignment.startTime,
          assignment.endTime,
          now,
          assignment.allowLate,
        ),
        problems: problems.map((problem) => ({
          ...problem,
          solved: solvedMap.get(problem.id)?.solved ?? false,
          late: solvedMap.get(problem.id)?.late ?? false,
          earnedScore: solvedMap.get(problem.id)?.earnedScore ?? 0,
        })),
        progress: {
          solvedCount: progress.solvedCount,
          totalProblems: progress.totalProblems,
          requiredCount: progress.requiredCount,
          completed: progress.completed,
          late: progress.late,
          score: progress.score,
          maxScore: progress.maxScore,
          status: progress.status,
          statusLabel: progress.statusLabel,
          submittedAt: progress.submittedAt,
          completedAt: progress.completedAt,
        },
      });
    }

    return { class: cls, assignments: results };
  }

  async applyToClass(userId: string, joinCodeInput: string) {
    const joinCode = String(joinCodeInput || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(joinCode)) {
      throw new BadRequestException('请输入有效的 8 位班级码');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.role !== 'STUDENT') throw new ForbiddenException('仅学生账号可以申请加入班级');

    const cls = await this.prisma.class.findUnique({
      where: { joinCode },
      select: { id: true, name: true, status: true, joinCodeExpiresAt: true },
    });
    if (!cls || cls.status !== 'APPROVED') throw new NotFoundException('班级码不存在或班级尚未启用');
    if (!cls.joinCodeExpiresAt || cls.joinCodeExpiresAt <= new Date()) {
      throw new BadRequestException('班级码已过期，请联系老师获取新班级码');
    }

    const existing = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId: cls.id, userId } },
    });
    if (existing?.status === 'APPROVED') throw new BadRequestException('你已经是该班级成员');
    if (existing?.status === 'PENDING') throw new BadRequestException('你的入班申请正在等待老师审核');

    const membership = existing
      ? await this.prisma.classMember.update({
          where: { classId_userId: { classId: cls.id, userId } },
          data: { status: 'PENDING', reviewNote: null, reviewedAt: null, joinedAt: new Date() },
        })
      : await this.prisma.classMember.create({
          data: { classId: cls.id, userId, status: 'PENDING' },
        });
    return { id: membership.id, classId: cls.id, className: cls.name, status: membership.status };
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

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const avatar = await this.fileUpload.uploadAvatar(file);
    const profile = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar },
      select: {
        id: true, username: true, email: true, phone: true,
        nickname: true, avatar: true, role: true, school: true,
      },
    });
    return this.withDisplayAvatar(profile);
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

  async changeOwnPassword(userId: string, input: string | PasswordChangeInput) {
    const password = typeof input === 'string' ? input : input?.password;
    const currentPassword = typeof input === 'string' ? undefined : input?.currentPassword;
    this.assertPasswordStrength(password);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, mustChangePassword: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    const requiresCurrentPassword = !user.mustChangePassword;
    if (requiresCurrentPassword) {
      if (!currentPassword) throw new BadRequestException('请输入当前密码');
      const passwordMatches = await bcrypt.compare(currentPassword, user.password);
      if (!passwordMatches) throw new BadRequestException('当前密码不正确');
      if (currentPassword === password) throw new BadRequestException('新密码不能与当前密码相同');
    }

    const hashed = await bcrypt.hash(password!, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, mustChangePassword: false, authVersion: { increment: 1 } },
    });
    if (requiresCurrentPassword) {
      await this.prisma.userSession.deleteMany({ where: { userId } });
    }
    return { success: true };
  }

  async resetPassword(adminId: string, userId: string, password: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId }, select: { role: true } });
    if (!admin || admin.role !== 'ADMIN') throw new ForbiddenException('No permission to reset password');
    this.assertPasswordStrength(password);
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

  private assertPasswordStrength(password?: string) {
    if (!password || password.length < 8) {
      throw new BadRequestException('密码至少需要 8 位');
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException('密码需要同时包含字母和数字');
    }
  }
}
