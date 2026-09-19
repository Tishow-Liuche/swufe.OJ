import { Module } from '@nestjs/common';
import { JudgeModule } from '../judge/judge.module';
import { LearningService } from '../learning/learning.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AssignmentProgressService } from '../teacher/assignment-progress.service';
import { JudgeProcessor } from './judge.processor';
import { registerJudgeQueue } from './judge-queue';

@Module({
  imports: [PrismaModule, JudgeModule, registerJudgeQueue()],
  providers: [JudgeProcessor, LearningService, AssignmentProgressService],
})
export class JudgeWorkerModule {}
