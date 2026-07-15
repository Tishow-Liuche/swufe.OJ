import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { LuoguTaskLeaseService } from './luogu-task-lease.service';
import { LUOGU_LANGUAGE_LABELS } from './luogu-submission.service';

@Controller('api/luogu-submit-helper')
export class LuoguHelperController {
  constructor(private readonly lease: LuoguTaskLeaseService) {}

  @Get('lookup')
  async lookup(@Query('problemId') problemId: string) {
    const task = await this.lease.lookup(problemId);
    return {
      ...task,
      langName: LUOGU_LANGUAGE_LABELS[task.language] || task.language,
    };
  }

  @Post(':submissionId/lease')
  acquireLease(
    @Param('submissionId') id: string,
    @Body() body: { token: string; leaseNonce?: string },
  ) {
    return this.lease.acquireLease(id, body.token, body.leaseNonce);
  }

  @Post(':submissionId/report-id')
  reportId(
    @Param('submissionId') id: string,
    @Body() body: { token: string; leaseNonce: string; remoteSubmissionId: string },
  ) {
    return this.lease.reportRemoteId(
      id,
      body.token,
      body.leaseNonce,
      body.remoteSubmissionId,
    );
  }

  @Post(':submissionId/report-result')
  reportResult(
    @Param('submissionId') id: string,
    @Body() body: {
      token: string;
      leaseNonce: string;
      remoteSubmissionId?: string;
      status: string;
      score?: number;
      timeUsed?: number;
      memoryUsed?: number;
      compileMessage?: string;
      rawStatus?: string;
    },
  ) {
    return this.lease.reportResult(id, body.token, body.leaseNonce, body);
  }
}
