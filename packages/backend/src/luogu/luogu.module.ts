import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LuoguSubmissionService } from './luogu-submission.service';
import { LuoguTaskLeaseService } from './luogu-task-lease.service';

@Module({
  imports: [PrismaModule],
  providers: [LuoguSubmissionService, LuoguTaskLeaseService],
  exports: [LuoguSubmissionService, LuoguTaskLeaseService],
})
export class LuoguModule {}
