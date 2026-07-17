import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { QojTaskLeaseService } from './qoj-task-lease.service';
import { QOJ_LANGUAGE_LABELS } from './qoj-submission.service';

@Controller('api/qoj-submit-helper')
export class QojHelperController {
  constructor(private readonly lease: QojTaskLeaseService) {}

  @Get('lookup')
  async lookup(@Query('problemId') problemId: string) {
    const task = await this.lease.lookup(problemId);
    return { ...task, langName: QOJ_LANGUAGE_LABELS[task.language] || task.language };
  }

  @Post(':submissionId/lease')
  acquireLease(@Param('submissionId') id: string, @Body() body: { token: string; leaseNonce?: string }) {
    return this.lease.acquireLease(id, body.token, body.leaseNonce);
  }

  @Post(':submissionId/report-id')
  reportId(
    @Param('submissionId') id: string,
    @Body() body: { token: string; leaseNonce: string; remoteSubmissionId: string },
  ) {
    return this.lease.reportRemoteId(id, body.token, body.leaseNonce, body.remoteSubmissionId);
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
