import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CfTaskLeaseService } from '../codeforces/cf-task-lease.service';

const LANG: Record<string, string> = {
  cpp: 'GNU G++17',
  c: 'GNU GCC C11',
  python: 'Python 3',
  java: 'Java 11',
};

@Controller('api/cf-submit-helper')
export class CfHelperController {
  constructor(private readonly lease: CfTaskLeaseService) {}

  @Get('lookup')
  async lookup(@Query('problemId') problemId: string) {
    const task = await this.lease.lookup(problemId);
    return {
      ...task,
      langName: LANG[task.language] || task.language,
    };
  }

  @Post(':submissionId/lease')
  acquireLease(
    @Param('submissionId') id: string,
    @Body() body: { token: string; leaseNonce?: string },
  ) {
    return this.lease.acquireLease(id, body.token, body.leaseNonce);
  }

  @Post(':submissionId/report-sid')
  reportSid(
    @Param('submissionId') id: string,
    @Body() body: { token: string; leaseNonce: string; cfSubmissionId: string },
  ) {
    if (!body.token || !body.leaseNonce) {
      return this.lease.bindSidLegacy(id, body.cfSubmissionId);
    }

    return this.lease.bindSid(
      id,
      body.token,
      body.leaseNonce,
      body.cfSubmissionId,
    );
  }
}
