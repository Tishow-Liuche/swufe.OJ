import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SubmissionService } from './submission.service';
import { SubmissionController } from './submission.controller';
import { JudgeProcessor } from './judge.processor';

@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: 'judge',
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6379),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 200,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      }),
    }),
  ],
  controllers: [SubmissionController],
  providers: [SubmissionService, JudgeProcessor],
  exports: [SubmissionService],
})
export class SubmissionModule {}
