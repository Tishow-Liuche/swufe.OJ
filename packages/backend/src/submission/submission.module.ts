import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SubmissionService } from './submission.service';
import { SubmissionController } from './submission.controller';
import { JudgeProcessor } from './judge.processor';
import { CFJudgeProcessor } from './cf-judge.processor';
import { JudgeModule } from '../judge/judge.module';
import { CodeforcesAdapter } from '../codeforces/cf-adapter.service';

@Module({
  imports: [
    JudgeModule,
    BullModule.registerQueueAsync({
      name: 'judge', imports: [ConfigModule], inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        connection: { host: c.get('REDIS_HOST', 'localhost'), port: c.get('REDIS_PORT', 6379) },
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 200, attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      }),
    }),
    BullModule.registerQueueAsync({
      name: 'cf-judge', imports: [ConfigModule], inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        connection: { host: c.get('REDIS_HOST', 'localhost'), port: c.get('REDIS_PORT', 6379) },
        defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100, attempts: 1 },
      }),
    }),
  ],
  controllers: [SubmissionController],
  providers: [SubmissionService, JudgeProcessor, CFJudgeProcessor, CodeforcesAdapter],
  exports: [SubmissionService],
})
export class SubmissionModule {}
