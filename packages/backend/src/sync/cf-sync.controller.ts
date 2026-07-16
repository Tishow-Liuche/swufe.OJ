import { Body, Controller, Get, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/sync')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
export class CfSyncController {
  private readonly logger = new Logger(CfSyncController.name);
  constructor(private prisma: PrismaService) {}

  /** 快速获取下一个需要同步的 CF 题目 (用 raw SQL 避免加载全部) */
  @Get('cf-next')
  async cfNext() {
    // Raw SQL: find the first problem source whose version has a short placeholder desc
    const result = await this.prisma.$queryRawUnsafe(
      'SELECT ps."remoteProblemId", length(pv.description) as desc_len ' +
      'FROM "ProblemSource" ps ' +
      'JOIN "ProblemVersion" pv ON pv."problemId" = ps."problemId" AND pv."isCurrent" = true ' +
      'WHERE ps.platform = \'CODEFORCES\' ' +
      'AND (length(pv.description) < 400 OR pv.description NOT LIKE \'%<div class="cf-statement"%\') ' +
      'ORDER BY ps."remoteProblemId" ASC LIMIT 1'
    ) as any[];

    if (!result.length) return { done: true, message: 'All CF problems have full statements!' };

    // Count remaining
    const countResult = await this.prisma.$queryRawUnsafe(
      'SELECT COUNT(*) as cnt ' +
      'FROM "ProblemSource" ps ' +
      'JOIN "ProblemVersion" pv ON pv."problemId" = ps."problemId" AND pv."isCurrent" = true ' +
      'WHERE ps.platform = \'CODEFORCES\' ' +
      'AND (length(pv.description) < 400 OR pv.description NOT LIKE \'%<div class="cf-statement"%\')'
    ) as any[];

    return {
      remoteProblemId: result[0].remoteProblemId,
      hasStatement: false,
      totalRemaining: parseInt(countResult[0].cnt),
    };
  }

  @Get('cf-check/:remoteId')
  async cfCheck(@Param('remoteId') remoteId: string) {
    const source = await this.prisma.problemSource.findFirst({
      where: { platform: 'CODEFORCES', remoteProblemId: remoteId },
      include: { problem: { include: { versions: { where: { isCurrent: true } } } } },
    });
    if (!source) return { error: 'Not found' };
    var ver = source.problem.versions[0];
    if (!ver) return { hasStatement: false };
    var has = ver.description && ver.description.length > 400 && ver.description.includes('<div class="cf-statement"');
    return { hasStatement: !!has, descLen: ver.description?.length || 0 };
  }

  @Post('cf-statement')
  async receiveCf(@Body() body: {
    remoteId: string; title: string; timeLimitMs: number; memoryLimitMb: number;
    descriptionHtml: string; inputHtml?: string; outputHtml?: string; noteHtml?: string;
    samples: Array<{ input: string; output: string }>; tags: string[];
    difficulty: number; sourceUrl: string; locale: string;
  }) {
    var { remoteId, descriptionHtml } = body;
    if (!remoteId || !descriptionHtml) return { error: 'remoteId and descriptionHtml required' };

    var source = await this.prisma.problemSource.findFirst({
      where: { platform: 'CODEFORCES', remoteProblemId: remoteId },
      include: { problem: { include: { versions: { where: { isCurrent: true } } } } },
    });
    if (!source) return { error: 'Problem not found: CF ' + remoteId };

    var ver = source.problem.versions[0];
    if (!ver) return { error: 'No version' };

    var samples = body.samples || [];
    var parts = ['<div class="cf-statement">'];
    parts.push(descriptionHtml);
    if (body.inputHtml) parts.push('<h3 class="section-title">Input</h3>' + body.inputHtml);
    if (body.outputHtml) parts.push('<h3 class="section-title">Output</h3>' + body.outputHtml);
    if (samples.length > 0) {
      parts.push('<h3 class="section-title">Samples</h3>');
      samples.forEach(function(s, i) {
        parts.push('<div class="sample-test"><b>Input #' + (i + 1) + '</b>');
        parts.push('<pre>' + esc(s.input) + '</pre>');
        parts.push('<b>Output #' + (i + 1) + '</b>');
        parts.push('<pre>' + esc(s.output) + '</pre></div>');
      });
    }
    if (body.noteHtml) parts.push('<h3 class="section-title">Note</h3>' + body.noteHtml);
    parts.push('</div>');

    var description = parts.join('\n\n');
    var sampleInput = samples.map(function(s) { return s.input; }).join('\n---\n');
    var sampleOutput = samples.map(function(s) { return s.output; }).join('\n---\n');

    await this.prisma.problemVersion.update({
      where: { id: ver.id },
      data: { description, sampleInput: sampleInput || null, sampleOutput: sampleOutput || null,
        inputFormat: body.inputHtml || null, outputFormat: body.outputHtml || null,
        hint: body.noteHtml || null, dataRange: 'Time: ' + body.timeLimitMs + 'ms, Memory: ' + body.memoryLimitMb + 'MB' },
    });
    await this.prisma.problem.update({
      where: { id: source.problemId },
      data: { title: body.title, timeLimit: body.timeLimitMs, memoryLimit: body.memoryLimitMb },
    });
    this.logger.log('CF Statement: ' + remoteId + ' (' + description.length + ' chars)');
    return { updated: true, remoteId: remoteId, chars: description.length };
  }
}

function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
