import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContestService } from '../contest/contest.service';

@Controller('api')
export class PublicController {
  constructor(
    private prisma: PrismaService,
    private contests: ContestService,
  ) {}

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
  getLeaderboard() {
    return this.contests.globalLeaderboard();
  }
}

