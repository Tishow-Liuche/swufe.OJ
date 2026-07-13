import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

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

  async updateProfile(userId: string, data: { nickname?: string; avatar?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true, username: true, nickname: true, avatar: true, role: true,
      },
    });
  }

  /** 用户提交统计概览 */
  async getStats(userId: string) {
    const now = new Date();

    // 总提交数和通过数
    const [totalSubmissions, totalAccepted] = await Promise.all([
      this.prisma.submission.count({ where: { userId } }),
      this.prisma.submission.count({ where: { userId, status: 'ACCEPTED' } }),
    ]);

    // 已解决的题目数（不同题目）
    const solved = await this.prisma.submission.groupBy({
      by: ['problemId'],
      where: { userId, status: 'ACCEPTED' },
    });

    // 尝试过的题目数
    const tried = await this.prisma.submission.groupBy({
      by: ['problemId'],
      where: { userId },
    });

    // 活跃天数
    const activeDays = await this.prisma.submission.groupBy({
      by: ['createdAt'],
      where: { userId },
    });
    const uniqueDays = new Set(activeDays.map((d) => d.createdAt.toISOString().split('T')[0]));

    // 当前连续打卡天数
    const streak = this.calcStreak(activeDays.map((d) => d.createdAt));

    // 语言分布
    const langDist = await this.prisma.submission.groupBy({
      by: ['language'],
      where: { userId },
      _count: true,
    });

    // 难度分布（已解决题目）
    const solvedProblemIds = solved.map((s) => s.problemId);
    const difficultyDist = await this.prisma.problem.findMany({
      where: { id: { in: solvedProblemIds } },
      select: { difficulty: true },
    });
    const diffCount: Record<string, number> = {};
    for (const p of difficultyDist) {
      const d = p.difficulty || 'UNKNOWN';
      diffCount[d] = (diffCount[d] || 0) + 1;
    }

    // 最近 30 天每日提交趋势
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const recentSubs = await this.prisma.submission.findMany({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
    const dailyMap = this.buildDailyMap(recentSubs, thirtyDaysAgo, now);

    // 最近提交列表
    const recent = await this.prisma.submission.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, status: true, language: true,
        score: true, timeUsed: true, memoryUsed: true, createdAt: true,
        problem: { select: { id: true, title: true, difficulty: true } },
      },
    });

    return {
      overview: {
        totalSubmissions,
        totalAccepted,
        acceptRate: totalSubmissions > 0 ? Math.round((totalAccepted / totalSubmissions) * 100) : 0,
        solvedCount: solved.length,
        triedCount: tried.length,
        activeDays: uniqueDays.size,
        currentStreak: streak,
      },
      dailyTrend: dailyMap,
      languageDist: langDist.map((l) => ({ language: l.language, count: l._count })),
      difficultyDist: Object.entries(diffCount).map(([d, c]) => ({ difficulty: d, count: c })),
      recentSubmissions: recent,
    };
  }

  private calcStreak(dates: Date[]): number {
    if (dates.length === 0) return 0;
    const sorted = [...new Set(dates.map((d) => d.toISOString().split('T')[0]))].sort().reverse();
    let streak = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = new Date(sorted[i]);
      const next = new Date(sorted[i + 1]);
      const diff = (curr.getTime() - next.getTime()) / 86400000;
      if (Math.abs(diff - 1) < 0.1) {
        streak++;
      } else {
        break;
      }
    }
    // 如果最后一天不是今天或昨天，streak 中断
    const last = new Date(sorted[0]);
    const today = new Date();
    const diffDays = (today.getTime() - last.getTime()) / 86400000;
    if (diffDays > 1.5) return 0;
    return streak;
  }

  private buildDailyMap(subs: Array<{ createdAt: Date; status: string }>, start: Date, end: Date) {
    const map: Record<string, { accepted: number; wrong: number }> = {};
    const d = new Date(start);
    while (d <= end) {
      const key = d.toISOString().split('T')[0];
      map[key] = { accepted: 0, wrong: 0 };
      d.setDate(d.getDate() + 1);
    }
    for (const s of subs) {
      const key = s.createdAt.toISOString().split('T')[0];
      if (map[key]) {
        if (s.status === 'ACCEPTED') map[key].accepted++;
        else map[key].wrong++;
      }
    }
    return Object.entries(map).map(([date, val]) => ({ date, ...val }));
  }
}
