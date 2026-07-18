import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
  imports: [ConfigModule, PrismaModule],
  providers: [
    CfVerdictMapper,
    CfSubmissionService,
    CfWorkerService,
    CfTaskLeaseService,
    CfAcceptedSyncService,
  ],
  exports: [CfSubmissionService, CfTaskLeaseService, CfAcceptedSyncService],
})
export class CodeforcesModule {}
