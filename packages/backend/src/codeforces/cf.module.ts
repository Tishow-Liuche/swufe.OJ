import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { createRedisConnectionOptions } from '../submission/judge-queue';
import { CF_ACCEPTED_QUEUE, CfAcceptedSyncJobs, CfAcceptedSyncProcessor } from './cf-accepted-sync-jobs';
import { PrismaModule } from '../prisma/prisma.module';
import { CfVerdictMapper } from './cf-verdict.mapper';
import { CfSubmissionService } from './cf-submission.service';
import { CfWorkerService } from './cf-worker.service';
import { CfTaskLeaseService } from './cf-task-lease.service';
import { CfAcceptedSyncService } from './cf-accepted-sync.service';

/**
 * Codeforces remote-judge module.
 *
 * Three cleanly separated concerns:
 *   1. CfVerdictMapper   — pure, stateless verdict lookup table
 *   2. CfSubmissionService — API layer: creates tasks, returns CF URLs
 *   3. CfWorkerService   — background worker: polls CF API, matches results
 *
 * NOT decorated with @Global().  Import this module explicitly in
 * SubmissionModule so the dependency graph is explicit.
 */
@Module({
  imports: [ConfigModule, PrismaModule, BullModule.registerQueueAsync({
    name: CF_ACCEPTED_QUEUE, imports: [ConfigModule], inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      connection: createRedisConnectionOptions(config),
      defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 15000 }, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 86400, count: 1000 } },
    }),
  })],
  providers: [
    CfVerdictMapper,
    CfSubmissionService,
    CfWorkerService,
    CfTaskLeaseService,
    CfAcceptedSyncService,
    CfAcceptedSyncJobs,
    CfAcceptedSyncProcessor,
  ],
  exports: [CfSubmissionService, CfTaskLeaseService, CfAcceptedSyncService, CfAcceptedSyncJobs],
})
export class CodeforcesModule {}
