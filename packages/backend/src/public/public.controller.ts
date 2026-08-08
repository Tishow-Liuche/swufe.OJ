import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContestService } from '../contest/contest.service';

@Controller('api')
export class PublicController {
  private statsCache?: {
    value: { problemCount: number; submissionCount: number; userCount: number };
    expiresAt: number;
  };
  private statsRequest?: Promise<{ problemCount: number; submissionCount: number; userCount: number }>;

  constructor(
    private prisma: PrismaService,
    private contests: ContestService,
  ) {}

  @Get('stats')
  async getStats() {
    if (this.statsCache && this.statsCache.expiresAt > Date.now()) return this.statsCache.value;
    if (this.statsRequest) return this.statsRequest;

    this.statsRequest = Promise.all([
      this.prisma.problem.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.submission.count(),
      this.prisma.user.count(),
    ]).then(([problemCount, submissionCount, userCount]) => {
      const value = { problemCount, submissionCount, userCount };
      this.statsCache = { value, expiresAt: Date.now() + 60_000 };
      return value;
    }).finally(() => {
      this.statsRequest = undefined;
    });
    return this.statsRequest;
  }

  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }

  @Get('leaderboard')
  getLeaderboard() {
    return this.contests.globalLeaderboard();
  }

  @Get('leaderboard/overall')
  getOverallLeaderboard() {
    return this.contests.overallLeaderboard();
  }
}

