import { Module } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SubmissionService } from './submission.service';
import { SubmissionController } from './submission.controller';
import { CfHelperController } from './cf-helper.controller';
import { LuoguHelperController } from '../luogu/luogu-helper.controller';
import { QojHelperController } from '../qoj/qoj-helper.controller';
import { JudgeModule } from '../judge/judge.module';
import { HelperModule } from '../helper/helper.module';
import { CodeforcesModule } from '../codeforces/cf.module';
import { LuoguModule } from '../luogu/luogu.module';
import { LearningModule } from '../learning/learning.module';
import { QojModule } from '../qoj/qoj.module';
import { TeacherModule } from '../teacher/teacher.module';
import { registerJudgeQueue } from './judge-queue';
import { ContestCacheService } from '../contest/contest-cache.service';

export { createRedisConnectionOptions } from './judge-queue';

@Module({
  imports: [
    JudgeModule, HelperModule, CodeforcesModule, LuoguModule, LearningModule, QojModule, TeacherModule,
    registerJudgeQueue(),
  ],
  controllers: [SubmissionController, CfHelperController, LuoguHelperController, QojHelperController],
  providers: [
    {
      provide: ContestCacheService,
      inject: [getQueueToken('judge')],
      useFactory: async (queue: Queue) => new ContestCacheService((await queue.client) as any),
    },
    SubmissionService,
  ],
  exports: [SubmissionService, ContestCacheService],
})
export class SubmissionModule {}
