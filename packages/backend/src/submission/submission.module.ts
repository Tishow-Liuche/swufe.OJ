import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SubmissionService } from './submission.service';
import { SubmissionController } from './submission.controller';
import { JudgeProcessor } from './judge.processor';
import { CfHelperController } from './cf-helper.controller';
import { LuoguHelperController } from '../luogu/luogu-helper.controller';
import { QojHelperController } from '../qoj/qoj-helper.controller';
import { JudgeModule } from '../judge/judge.module';
import { HelperModule } from '../helper/helper.module';
import { CodeforcesModule } from '../codeforces/cf.module';
import { LuoguModule } from '../luogu/luogu.module';
import { LearningModule } from '../learning/learning.module';
import { QojModule } from '../qoj/qoj.module';

@Module({
  imports: [
    JudgeModule, HelperModule, CodeforcesModule, LuoguModule, LearningModule, QojModule,
    BullModule.registerQueueAsync({
      name: 'judge', imports: [ConfigModule], inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        connection: { host: c.get('REDIS_HOST', 'localhost'), port: c.get('REDIS_PORT', 6379) },
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 200, attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      }),
    }),
  ],
  controllers: [SubmissionController, CfHelperController, LuoguHelperController, QojHelperController],
  providers: [SubmissionService, JudgeProcessor],
  exports: [SubmissionService],
})
export class SubmissionModule {}
