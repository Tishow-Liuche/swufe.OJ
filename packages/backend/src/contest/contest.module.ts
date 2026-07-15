import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubmissionModule } from '../submission/submission.module';
import { ContestController } from './contest.controller';
import { ContestService } from './contest.service';

@Module({
  imports: [PrismaModule, SubmissionModule],
  controllers: [ContestController],
  providers: [ContestService],
  exports: [ContestService],
})
export class ContestModule {}
