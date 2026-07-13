import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api')
export class PublicController {
  constructor(private prisma: PrismaService) {}

  @Get('stats')
  async getStats() {
    const [problemCount, submissionCount, userCount] = await Promise.all([
      this.prisma.problem.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.submission.count(),
      this.prisma.user.count(),
    ]);
    return { problemCount, submissionCount, userCount };
  }

  @Get('leaderboard')
  async getLeaderboard() {
    // 按唯一已解题数排名
    const users = await this.prisma.user.findMany({
      select: { id: true, username: true, nickname: true, role: true },
    });

    const rows: Array<{ userId: string; username: string; nickname: string; role: string; solvedCount: number; submissionCount: number; acceptRate: number }> = [];
    for (const u of users) {
      const [subCount, acceptedCount] = await Promise.all([
        this.prisma.submission.count({ where: { userId: u.id } }),
        this.prisma.submission.count({ where: { userId: u.id, status: 'ACCEPTED' } }),
      ]);

      const solved = await this.prisma.submission.findMany({
        where: { userId: u.id, status: 'ACCEPTED' },
        distinct: ['problemId'],
        select: { problemId: true },
      });

      rows.push({
        userId: u.id,
        username: u.username,
        nickname: u.nickname || u.username,
        role: u.role,
        solvedCount: solved.length,
        submissionCount: subCount,
        acceptRate: subCount > 0 ? Math.round((acceptedCount / subCount) * 100) : 0,
      });
    }

    rows.sort((a, b) => b.solvedCount - a.solvedCount || b.submissionCount - a.submissionCount);
    return rows.map((r, i) => ({ rank: i + 1, ...r }));
  }
}

