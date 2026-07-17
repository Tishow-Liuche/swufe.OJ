import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QojSubmissionService } from './qoj-submission.service';
import { QojTaskLeaseService } from './qoj-task-lease.service';

@Module({
  imports: [PrismaModule],
  providers: [QojSubmissionService, QojTaskLeaseService],
  exports: [QojSubmissionService, QojTaskLeaseService],
})
export class QojModule {}
