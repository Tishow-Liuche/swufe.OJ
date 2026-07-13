import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, email: true, nickname: true,
        avatar: true, role: true, createdAt: true,
      },
    });
  }

  async updateProfile(userId: string, data: { nickname?: string; avatar?: string }) {
    return this.prisma.user.update({
      where: { id: userId }, data,
      select: { id: true, username: true, nickname: true, avatar: true, role: true },
    });
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
}
