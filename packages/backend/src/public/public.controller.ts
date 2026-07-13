import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/stats')
export class PublicController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getStats() {
    const [problemCount, submissionCount, userCount] = await Promise.all([
      this.prisma.problem.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.submission.count(),
      this.prisma.user.count(),
    ]);
    return { problemCount, submissionCount, userCount };
  }
}
